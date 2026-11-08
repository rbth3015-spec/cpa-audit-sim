/* 기준서 지식베이스 DB 만들기 (kb_db.js)

     node tools/kb_db.js        자료/kb/ksa.jsonl → 자료/kb/ksa.db

   흐름: 회계감사기준 전문 .docx → tools/kb_build.py → ksa.jsonl → 이 파일 → ksa.db → tools/kb_graph.js (그래프)
   JSONL 은 사람이 비교해 보기 쉬운 중간 산출물이고, 검색 · 채점은 DB 를 읽는다.
   원문이 들어 있어 둘 다 저장소에 없다 (자료/ 는 .gitignore). 스키마는 docs/kb.md
*/
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { openDb, SCHEMA_VERSION, GRAPH_DDL, VECTOR_DDL, LOG_DDL } = require('./kb-core');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '자료', 'kb', 'ksa.jsonl');
const OUT = path.join(ROOT, '자료', 'kb', 'ksa.db');

if (!fs.existsSync(SRC)) {
  console.log('문단 파일이 없습니다: 자료/kb/ksa.jsonl');
  console.log('python -I tools/kb_build.py "<회계감사기준 전문 .docx>" 로 먼저 만드세요');
  process.exit(1);
}

const raw = fs.readFileSync(SRC, 'utf8');
const rows = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
const KINDS = ['요구사항', '적용지침', '보론'];

// 새 파일에 다 쓰고 나서 바꿔 끼운다 — 도중에 멈춰도 이전 DB 는 남는다
const TMP = OUT + '.tmp';
if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
const db = openDb(TMP);

db.exec(`
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE standard (
    no         TEXT PRIMARY KEY,            -- '505'
    title      TEXT NOT NULL,
    paragraphs INTEGER NOT NULL
  );
  CREATE TABLE paragraph (
    id      TEXT PRIMARY KEY,               -- '505-A12'
    std     TEXT NOT NULL REFERENCES standard(no),
    no      TEXT NOT NULL,                  -- '8' · 'A12'
    kind    TEXT NOT NULL CHECK (kind IN ('요구사항', '적용지침', '보론')),
    heading TEXT NOT NULL,
    text    TEXT NOT NULL,
    items   TEXT NOT NULL,                  -- 항목 (a)(b)… 의 JSON 배열
    ord     INTEGER NOT NULL UNIQUE         -- 전문 안의 순서
  );
  CREATE INDEX paragraph_std ON paragraph (std, ord);
  -- 문구 그대로 찾기 — 세 글자 조각 색인이라 조사가 붙어도 걸린다
  CREATE VIRTUAL TABLE paragraph_fts USING fts5 (id UNINDEXED, heading, body, tokenize = 'trigram');
` + GRAPH_DDL + VECTOR_DDL + LOG_DDL);

const titles = new Map(), counts = new Map();
rows.forEach(r => {
  if (!titles.has(r.std)) titles.set(r.std, r.title);
  counts.set(r.std, (counts.get(r.std) || 0) + 1);
  if (KINDS.indexOf(r.kind) < 0) throw new Error('모르는 종류: ' + r.id + ' ' + r.kind);
});

db.exec('BEGIN');
const insStd = db.prepare('INSERT INTO standard (no, title, paragraphs) VALUES (?, ?, ?)');
titles.forEach((title, no) => insStd.run(no, title, counts.get(no)));
const insPar = db.prepare('INSERT INTO paragraph (id, std, no, kind, heading, text, items, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insFts = db.prepare('INSERT INTO paragraph_fts (id, heading, body) VALUES (?, ?, ?)');
rows.forEach((r, i) => {
  insPar.run(r.id, r.std, String(r.no), r.kind, r.heading, r.text, JSON.stringify(r.items || []), i);
  insFts.run(r.id, r.heading, [r.text].concat(r.items || []).join('\n'));
});
const meta = {
  schema: String(SCHEMA_VERSION),
  built_at: new Date().toISOString(),
  source: 'ksa.jsonl',
  source_sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  paragraphs: String(rows.length),
  standards: String(titles.size)
};
const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
Object.keys(meta).forEach(k => insMeta.run(k, meta[k]));
db.exec('COMMIT');

// 이전 DB 의 벡터 · 채점 기록을 옮겨 담는다 — 벡터는 글이 같으면(sha) tools/kb-embed.mjs build 가 다시 계산하지 않는다
if (fs.existsSync(OUT)) {
  try {
    db.exec(`ATTACH DATABASE '${OUT.replace(/'/g, "''")}' AS old`);
    const has = t => db.prepare("SELECT count(*) n FROM old.sqlite_master WHERE name = ?").get(t).n;
    if (has('vector')) db.exec('INSERT INTO vector SELECT * FROM old.vector WHERE par IN (SELECT id FROM paragraph)');
    if (has('grading_log')) db.exec('INSERT INTO grading_log SELECT * FROM old.grading_log');
    db.exec('DETACH DATABASE old');
    console.log(`이전 DB 에서 옮김 — 벡터 ${db.prepare('SELECT count(*) n FROM vector').get().n} · 채점 기록 ${db.prepare('SELECT count(*) n FROM grading_log').get().n}`);
  } catch (e) { console.log('이전 DB 를 읽지 못해 벡터 · 기록은 새로 시작한다 — ' + e.message); }
}
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
db.exec('PRAGMA journal_mode = WAL');   // 채점 서버 · 탐색기가 읽는 동안에도 벡터 · 그래프를 쓸 수 있게
db.exec("INSERT INTO paragraph_fts (paragraph_fts) VALUES ('optimize')");
db.close();

const done = how => console.log(`자료/kb/ksa.db — 기준서 ${titles.size} · 문단 ${rows.length} · 스키마 ${SCHEMA_VERSION} · ${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB${how}`);
try {
  ['', '-wal', '-shm'].forEach(x => { if (fs.existsSync(OUT + x)) fs.unlinkSync(OUT + x); });
  fs.renameSync(TMP, OUT);
  done('');
} catch (e) {
  if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
  // 채점 서버 · 탐색기가 DB 를 열고 있으면 Windows 는 파일을 지우지 못한다 — 파일은 두고 내용을 통째로 덮어쓴다 (SQLite backup)
  (async () => {
    const { DatabaseSync, backup } = require('node:sqlite');
    const src = new DatabaseSync(TMP);
    await backup(src, OUT);
    src.close();
    ['', '-wal', '-shm'].forEach(x => { if (fs.existsSync(TMP + x)) fs.unlinkSync(TMP + x); });
    done(' · 열려 있는 DB 에 덮어씀 (채점 서버를 다시 켜면 새 내용을 읽는다)');
  })().catch(err => { console.log('DB 를 바꾸지 못했다 — 채점 서버를 끄고 다시: ' + err.message); process.exit(1); });
}
