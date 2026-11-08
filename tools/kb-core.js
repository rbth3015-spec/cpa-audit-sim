/* 기준서 지식베이스 — 불러오기 · 색인 · 검색 (kb-core.js)
   tools/kb.js (명령줄) 와 채점 서버가 같이 쓴다.

   읽는 순서: 자료/kb/ksa.db (tools/kb_db.js 가 만든 SQLite) → 없으면 자료/kb/ksa.jsonl
   검색: BM25. 낱말 대신 글자 두 자씩(bigram)으로 색인한다 — 한국어는 조사가 붙어 낱말 경계가 흔들린다.
   채점 사전(data/lexicon.js)으로 질의를 조금 넓힌다 — 약어나 교재 표기로 물어도 기준서 문단이 나오게.
*/
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, '자료', 'kb', 'ksa.db');
const JSONL_FILE = path.join(ROOT, '자료', 'kb', 'ksa.jsonl');
const SCHEMA_VERSION = 2;    // 1 문단 · 전문 색인, 2 그래프(node · edge)

/* 지식그래프 — 노드 id 는 종류를 앞에 붙인다 (std:505 · par:505-A12 · con:감사증거 · item:K26-1-1 · scene:s1 · pt:s1#논점)
   엣지는 (출발, 관계, 도착, 출처) 하나가 한 줄. 출처마다 따로 남겨 어디서 온 연결인지 보이게 한다 */
const GRAPH_DDL = `
  CREATE TABLE IF NOT EXISTS node (
    id    TEXT PRIMARY KEY,
    type  TEXT NOT NULL,
    label TEXT NOT NULL,
    attrs TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS node_type ON node (type);
  CREATE TABLE IF NOT EXISTS edge (
    src        TEXT NOT NULL REFERENCES node(id),
    rel        TEXT NOT NULL,
    dst        TEXT NOT NULL REFERENCES node(id),
    weight     REAL NOT NULL DEFAULT 1,
    source     TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (src, rel, dst, source)
  );
  CREATE INDEX IF NOT EXISTS edge_dst ON edge (dst, rel);
`;

/* 채점 기록 — RAG 채점이 무엇을 근거로 받았고 무엇을 인용했는지 (답안 글은 남기지 않는다) */
const LOG_DDL = `
  CREATE TABLE IF NOT EXISTS grading_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    model       TEXT NOT NULL,
    guide       INTEGER NOT NULL,
    rag         INTEGER NOT NULL,
    question    TEXT NOT NULL,
    retrieved   TEXT NOT NULL,   -- 붙여 준 문단 번호 JSON 배열
    cited       TEXT NOT NULL,   -- 논점별 인용 번호 JSON
    verdicts    TEXT NOT NULL,   -- 논점별 full · half · none JSON
    ok          INTEGER NOT NULL,
    ms_retrieve INTEGER NOT NULL,
    ms_grade    INTEGER NOT NULL
  );
`;

/* 벡터 — 모델마다 색인 단위 하나에 한 줄. vec 는 정규화한 Float32 배열. sha 가 같으면 다시 계산하지 않는다 */
const VECTOR_DDL = `
  CREATE TABLE IF NOT EXISTS vector (
    model TEXT NOT NULL,
    unit  INTEGER NOT NULL,
    par   TEXT NOT NULL REFERENCES paragraph(id),
    sha   TEXT NOT NULL,
    vec   BLOB NOT NULL,
    PRIMARY KEY (model, unit)
  );
`;

const K1 = 1.2, B = 0.75, HEADING_WEIGHT = 2;
const CHUNK_OVER = 500;      // 이보다 긴 문단은 항목별로도 색인한다 — 항목 하나가 맞으면 그 문단이 나오게
const LEX_SHARE = 0.2;       // 사전 확장의 몫 — 질의에서 맞은 표현 무게의 20%를 묶음 전체가 나눠 갖는다. 기준서에 없는 표현(MA · 두문자)이면 전부 넘긴다
const DEFAULT_SKIP = '1200'; // 소규모기업 기준은 본 기준서와 내용이 겹치고 시험 범위가 아니다 — std 로 고를 때만

/* node:sqlite 는 아직 실험 단계라 불러올 때마다 경고를 찍는다 — 이 경고만 끈다 */
function openDb(file, opt) {
  const emit = process.emitWarning;
  process.emitWarning = function (w) {
    if (/SQLite/i.test(String((w && w.message) || w))) return;
    return emit.apply(process, arguments);
  };
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = opt ? new DatabaseSync(file, opt) : new DatabaseSync(file);
    db.exec('PRAGMA busy_timeout = 15000');   // 다른 연결이 쓰는 중이면 바로 실패하지 않고 기다린다
    return db;
  } finally { process.emitWarning = emit; }
}

const norm = s => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
function grams(s) {
  const t = norm(s), out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
const plainHeading = d => d.heading.replace(/\(문단.*?참조\)|\(문단[^)]*\)/g, '').trim();

function readDocs() {
  if (fs.existsSync(DB_FILE)) {
    const db = openDb(DB_FILE, { readOnly: true });
    const ver = db.prepare('PRAGMA user_version').get().user_version;
    if (ver >= 1) {
      const titles = {};
      db.prepare('SELECT no, title FROM standard').all().forEach(s => { titles[s.no] = s.title; });
      const docs = db.prepare('SELECT id, std, no, kind, heading, text, items FROM paragraph ORDER BY ord').all()
        .map(r => ({ id: r.id, std: r.std, no: r.no, kind: r.kind, title: titles[r.std], heading: r.heading, text: r.text, items: JSON.parse(r.items) }));
      return { docs, db, source: 'db' };
    }
    db.close();
  }
  if (fs.existsSync(JSONL_FILE)) {
    const docs = fs.readFileSync(JSONL_FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    return { docs, db: null, source: 'jsonl' };
  }
  return null;
}

/* 지식베이스를 한 번 읽어 색인까지 만든다. 없으면 null */
function load() {
  const got = readDocs();
  if (!got) return null;
  const { docs, db, source } = got;
  const byId = {};
  docs.forEach(d => { byId[d.id] = d; });

  // 색인 — 문단 하나를 단위 하나로, 긴 문단은 앞머리 + 항목으로도. 제목은 가중치를 준다
  const units = [];
  docs.forEach((d, i) => {
    const head = plainHeading(d);
    if ((d.text + d.items.join('')).length > CHUNK_OVER && d.items.length >= 2) {
      units.push({ doc: i, text: d.text, head });
      d.items.forEach(t => units.push({ doc: i, text: d.text.slice(0, 60) + ' ' + t, head }));
    } else {
      units.push({ doc: i, text: d.text + ' ' + d.items.join(' '), head });
    }
  });
  const postings = new Map();
  let totalLen = 0;
  units.forEach((u, ui) => {
    const tf = new Map();
    grams(u.text).forEach(g => tf.set(g, (tf.get(g) || 0) + 1));
    grams(u.head).forEach(g => tf.set(g, (tf.get(g) || 0) + HEADING_WEIGHT));
    u.len = 0;
    tf.forEach((n, g) => {
      u.len += n;
      if (!postings.has(g)) postings.set(g, []);
      postings.get(g).push([ui, n]);
    });
    totalLen += u.len;
  });
  const avgLen = totalLen / units.length;
  const CORPUS = norm(docs.map(d => d.text + d.items.join('')).join(' '));
  const idf = g => {
    const n = (postings.get(g) || []).length;
    return Math.log(1 + (units.length - n + 0.5) / (n + 0.5));
  };

  // 채점 사전 — 질의에 나온 표현의 같은 묶음 표현을 질의에 더한다
  const lexicon = (function () {
    try {
      const ctx = { window: {} };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.js'), 'utf8'), ctx);
      return Object.keys(ctx.window.LEXICON).map(k => [k].concat(ctx.window.LEXICON[k]).map(norm).filter(w => w.length >= 2));
    } catch (e) { return []; }
  })();
  function addSynonyms(q, weights) {
    const t = norm(q);
    lexicon.forEach(group => {
      const found = group.filter(w => t.indexOf(w) >= 0);
      if (!found.length) return;
      const rest = [].concat.apply([], group.filter(w => t.indexOf(w) < 0).map(grams));
      if (!rest.length) return;
      const longest = found.reduce((a, b) => b.length > a.length ? b : a, '');
      const known = CORPUS.indexOf(longest) >= 0;
      const share = (known ? LEX_SHARE : 1) * Math.max.apply(null, found.map(w => grams(w).length)) / rest.length;
      rest.forEach(g => weights.set(g, (weights.get(g) || 0) + share));
    });
  }

  /* 문단 검색 — [[점수, 문단], …] 높은 순. opt: k · std(한 기준서만) · plain(사전 확장 없이) */
  function search(q, opt) {
    opt = opt || {};
    const k = opt.k || 5;
    const weights = new Map();
    grams(q).forEach(g => weights.set(g, (weights.get(g) || 0) + 1));
    if (!opt.plain) addSynonyms(q, weights);
    const unitScore = new Float64Array(units.length);
    weights.forEach((w, g) => {
      const list = postings.get(g);
      if (!list) return;
      const i = idf(g);
      list.forEach(([ui, tf]) => {
        unitScore[ui] += w * i * tf * (K1 + 1) / (tf + K1 * (1 - B + B * units[ui].len / avgLen));
      });
    });
    const score = new Float64Array(docs.length);
    units.forEach((u, ui) => { if (unitScore[ui] > score[u.doc]) score[u.doc] = unitScore[ui]; });
    const out = [];
    for (let i = 0; i < docs.length; i++) {
      if (score[i] <= 0) continue;
      if (opt.std ? docs[i].std !== String(opt.std) : docs[i].std === DEFAULT_SKIP) continue;
      out.push([score[i], docs[i]]);
    }
    out.sort((a, b) => b[0] - a[0]);
    return out.slice(0, k);
  }

  /* 문구 그대로 찾기 — DB 의 전문 색인(FTS5 · 세 글자 조각). 세 글자 이상. JSONL 이면 null */
  function phrase(q, opt) {
    if (!db) return null;
    opt = opt || {};
    const text = String(q || '').trim();
    if (text.length < 3) return [];
    return db.prepare(
      `SELECT id, snippet(paragraph_fts, 2, '[', ']', '…', 16) AS snip
         FROM paragraph_fts WHERE paragraph_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all('"' + text.replace(/"/g, '""') + '"', opt.k || 20);
  }

  return {
    source, db, docs, byId, units, search, phrase, plainHeading, norm,
    stats: { paragraphs: docs.length, units: units.length, grams: postings.size, lexicon: lexicon.length }
  };
}

/* 해설 · 강평에 인쇄된 문단 번호 — 인용 앞뒤 글을 질의로, 번호를 정답으로 (검색 측정 · 그래프 공용) */
function citations(byId) {
  const out = [], seen = {};
  const dirs = [path.join(ROOT, '자료', 'ocr'), path.join(ROOT, '자료', 'gs_review')];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => /해설|강평|\d\d-\d/.test(f)).forEach(f => {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const re = /(?<![\d-])([2-7]\d\d)-(A?\d{1,3})(?![\d-])/g;
        let m;
        while ((m = re.exec(line))) {
          const id = m[1] + '-' + m[2];
          if (!byId[id]) continue;
          // 강평은 한 줄이 물음 하나, 해설은 앞뒤 줄이 그 답이다 — 쪽 머리글과 배점은 뺀다
          const near = dir.endsWith('gs_review') ? [line] : [lines[i - 2], lines[i - 1], line, lines[i + 1]];
          const query = near.filter(t => t && !/모의고사|아카데미/.test(t)).join(' ')
            .replace(/[2-7]\d\d-A?\d{1,3}/g, ' ').replace(/^물음\s*\d+\s*\([^)]*\)/, ' ');
          if (norm(query).length < 15) continue;
          const key = f + '|' + id + '|' + i;
          if (seen[key]) continue;
          seen[key] = 1;
          out.push({ key: key, file: f.replace(/\.[a-z]+$/i, ''), id, query });
        }
      });
    });
  });
  return out;
}

module.exports = { load, openDb, norm, grams, citations, SCHEMA_VERSION, GRAPH_DDL, VECTOR_DDL, LOG_DDL, DB_FILE, JSONL_FILE };
