/* 회계감사기준 문단 검색 (kb.js)
   문단 지식베이스는 저장소에 없다 — 자료/kb/ksa.jsonl (tools/kb_build.py 로 만든다. 저작권 때문에 .gitignore)

     node tools/kb.js find 조회서 발송 거부 [--k=5] [--std=505] [--plain]    문단 검색
     node tools/kb.js show 505-8                                           한 문단 전부
     node tools/kb.js eval [--miss]                                        검색 품질 측정
     node tools/kb.js check                                                문단 번호 무결성 점검

   검색: BM25. 낱말 대신 글자 두 자씩(bigram)으로 색인한다 — 한국어는 조사가 붙어 낱말 경계가 흔들린다.
   채점 사전(data/lexicon.js)으로 질의를 조금 넓힌다 — 약어나 교재 표기로 물어도 기준서 문단이 나오게. --plain 은 넓히지 않는다.
   측정: 정답을 사람이 새로 만들지 않는다. 기출 · GS 문항에 달린 기준서(자료/db/items.jsonl)와
         해설에 인쇄된 문단 번호(자료/ocr, 자료/gs_review)를 그대로 정답으로 쓴다.
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, '자료', 'kb', 'ksa.jsonl');

if (!fs.existsSync(FILE)) {
  console.log('지식베이스가 없습니다: 자료/kb/ksa.jsonl');
  console.log('python -I tools/kb_build.py "<회계감사기준 전문 .docx>" 로 만드세요');
  process.exit(0);
}

const K1 = 1.2, B = 0.75, HEADING_WEIGHT = 2;
const CHUNK_OVER = 500;      // 이보다 긴 문단은 항목별로도 색인한다 — 항목 하나가 맞으면 그 문단이 나오게
const LEX_SHARE = 0.2;       // 사전 확장의 몫 — 질의에서 맞은 표현 무게의 20%를 묶음 전체가 나눠 갖는다. 기준서에 없는 표현(MA · 두문자)이면 전부 넘긴다
const DEFAULT_SKIP = '1200'; // 소규모기업 기준은 본 기준서와 내용이 겹치고 시험 범위가 아니다 — --std=1200 으로만

const norm = s => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
function grams(s) {
  const t = norm(s), out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

const docs = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const byId = {};
docs.forEach(d => { byId[d.id] = d; });

const plainHeading = d => d.heading.replace(/\(문단.*?참조\)|\(문단[^)]*\)/g, '').trim();

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

const args = process.argv.slice(2);
const opts = {};
const words = args.filter(a => {
  const m = /^--(\w+)(?:=(.*))?$/.exec(a);
  if (m) { opts[m[1]] = m[2] === undefined ? true : m[2]; return false; }
  return true;
});

/* ── 측정 ─────────────────────────────────── */
// 해설에 인쇄된 문단 번호 — 인용 앞뒤 글을 질의로, 번호를 정답으로
function citations() {
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
          out.push({ key: key, id, query });
        }
      });
    });
  });
  return out;
}

function metric(rows, hit, ks, onMiss) {
  const res = {};
  ks.forEach(k => { res[k] = 0; });
  let rr = 0;
  rows.forEach(r => {
    const top = search(r.query, { k: Math.max.apply(null, ks.concat(50)), plain: r.plain });
    const rank = top.findIndex(([, d]) => hit(r, d));
    if (onMiss && (rank < 0 || rank >= 5)) onMiss(r, top);
    if (rank >= 0) rr += 1 / (rank + 1);
    ks.forEach(k => { if (rank >= 0 && rank < k) res[k]++; });
  });
  return { res, mrr: rr / Math.max(rows.length, 1), n: rows.length };
}
const pct = (a, b) => (100 * a / Math.max(b, 1)).toFixed(1).padStart(5) + '%';

// 설정은 개발 세트로만 골랐다 — 검증 세트의 숫자가 실제 성능이다
const hash = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const isDev = r => hash(r.key) % 2 === 0;

function evaluate() {
  const ks = [1, 3, 5, 10];
  const print = (name, m) => console.log(`  ${name.padEnd(18)} ${String(m.n).padStart(4)}건  ` +
    ks.map(k => `@${k} ${pct(m.res[k], m.n)}`).join('  ') + `  MRR ${m.mrr.toFixed(3)}`);
  const report = (rows, hit, extra) => {
    print('개발 세트', metric(rows.filter(isDev), hit, ks));
    print('검증 세트', metric(rows.filter(r => !isDev(r)), hit, ks));
    print('검증 · 사전 없이', metric(rows.filter(r => !isDev(r)).map(r => Object.assign({ plain: true }, r)), hit, ks));
    if (extra) print(extra[0] + ' (검증)', metric(rows.filter(r => !isDev(r)), extra[1], ks));
  };

  const itemFile = path.join(ROOT, '자료', 'db', 'items.jsonl');
  const items = fs.existsSync(itemFile) ? fs.readFileSync(itemFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const withStd = items.map(x => ({
    key: x.id,
    gold: (x.ksa || []).filter(s => /^\d{3,4}$/.test(s)),
    query: [x.topic, x.ask, (x.points || []).join(' ')].join(' ')
  })).filter(x => x.gold.length);
  console.log('■ 기준서 단위 — 기출 · GS 문항에 달린 기준서가 결과에 있는가');
  report(withStd, (r, d) => r.gold.indexOf(d.std) >= 0);

  const cited = citations();
  console.log('■ 문단 단위 — 해설에 인쇄된 문단 번호가 결과에 있는가');
  report(cited, (r, d) => d.id === r.id, ['같은 절까지', (r, d) => d.id === r.id || (d.std === byId[r.id].std && d.heading === byId[r.id].heading)]);

  if (opts.miss) {
    console.log('■ 문단 단위 — 5위 안에 못 든 인용');
    metric(cited, (r, d) => d.id === r.id, ks, (r, top) => console.log(`  ${r.id.padEnd(9)} ← ${top.slice(0, 2).map(([, d]) => d.id).join(' ')} | ${norm(r.query).slice(0, 60)}`));
  }
  console.log(`■ 색인 — 문단 ${docs.length} · 단위 ${units.length} · 두 글자 ${postings.size} · 사전 묶음 ${lexicon.length}`);
}

/* ── 번호 무결성 ─────────────────────────── */
// 요구사항 N 이 '(문단 A5 참조)' 로 가리킨 적용지침 A5 의 제목이 '(문단 N 참조)' 로 되돌아 가리키는가.
// Word 자동 번호를 되살린 것이라 어긋나면 기준서 전체가 밀린다. 한 요구사항이 여러 절을 가리키는 경우가 있어 100% 는 아니다
function nums(t) {
  const out = [];
  String(t).replace(/\([a-z]+\)/g, '').split(/[,，]/).forEach(p => {
    const r = /A?(\d+)\s*[-–~]\s*A?(\d+)/.exec(p);
    if (r) { for (let i = +r[1]; i <= +r[2] && i - +r[1] < 200; i++) out.push(i); return; }
    const n = /A?(\d+)/.exec(p);
    if (n) out.push(+n[1]);
  });
  return out;
}
function check() {
  let total = 0, ok = 0;
  const off = {};
  docs.filter(d => /^\d+$/.test(d.no)).forEach(d => {
    const whole = d.text + ' ' + d.items.join(' ');
    const re = /\(문단\s*(A[\dA\s,，\-–~]+?)\s*참조\)/g;
    let m;
    while ((m = re.exec(whole))) {
      nums(m[1]).forEach(a => {
        const app = byId[d.std + '-A' + a];
        const h = app && /\(문단\s*([\d\s,，\-–~()a-z]+?)\s*참조\)/.exec(app.heading);
        if (!h) return;
        total++;
        if (nums(h[1]).indexOf(+d.no) >= 0) ok++;
        else (off[d.std] = off[d.std] || []).push(`${d.no}→A${a}(제목은 ${h[1].trim()})`);
      });
    }
  });
  console.log(`상호 인용 ${total}건 · 일치 ${ok}건 (${pct(ok, total).trim()})`);
  Object.keys(off).forEach(std => console.log(`  ${std.padEnd(5)} ${String(off[std].length).padStart(3)}건  ${off[std].slice(0, 3).join(' ')}`));
}

/* ── 명령 ─────────────────────────────────── */
const cmd = words.shift();

if (cmd === 'find') {
  search(words.join(' '), { k: +opts.k || 5, std: opts.std, plain: opts.plain }).forEach(([s, d]) => {
    console.log(`${d.id.padEnd(10)} ${s.toFixed(1).padStart(6)}  [${plainHeading(d).slice(0, 20)}] ${d.text.slice(0, 70)}`);
  });
} else if (cmd === 'show') {
  const d = byId[words[0]];
  if (!d) console.log('없는 문단:', words[0]);
  else {
    console.log(`■ ${d.id}  감사기준서 ${d.std} ${d.title}  (${d.kind})`);
    console.log(`  ${d.heading}`);
    console.log(d.text);
    d.items.forEach(t => console.log('  ' + t));
  }
} else if (cmd === 'eval') {
  evaluate();
} else if (cmd === 'check') {
  check();
} else {
  console.log('node tools/kb.js find <질의> | show <문단> | eval | check');
}
