/* 게임 논점 → 근거 문단 (kb-link.mjs)

     node tools/kb-link.mjs              후보를 고르고(검색) 검증된 연결로 data/kb_links.js 를 쓴다
     node tools/kb-link.mjs --verify     후보 가운데 직접 근거를 Claude 가 고른다 (Haiku · 이어서 할 수 있다)
     node tools/kb-link.mjs --measure    연결 품질 — 기준서를 묶지 않고 찾았을 때 장면의 기준서가 나오는가

   1. 후보 — 두 검색을 합친다. 장면 기준서 안 BM25(물음 + 논점) 3개 + 논점만으로 전체 혼합 검색 3개
      검색 1위만으로는 표본 40개 중 16개(40%)만 맞았다. 짧은 논점 이름 · 게임 표현 · 기준서 밖 주제(K-IFRS · 윤리) 때문
   2. 검증 — 후보 문단을 읽고 이 논점의 직접 근거만 고른다. 없으면 고르지 않는다. 8개씩 묶어 묻는다 (자료/kb/link_verify.json 에 쌓는다)
   3. 공개 — 검증에서 고른 문단만 data/kb_links.js 에. 문단 번호와 우리 논점 이름뿐이고 원문은 없다

   그래프에는 후보(source candidate)와 검증(source verified)을 따로 남긴다.
   윤리기준 · 법령만 다루는 논점은 지식베이스 밖이라 후보를 고르지 않는다.
*/
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieve, kb, hasVectors, DEFAULTS } from './kb-retrieve.mjs';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '자료', 'kb', 'link_verify.json');
const VERIFY_MODEL = 'claude-haiku-5-5';

function points() {
  return kb().db.prepare("SELECT id, label, attrs FROM node WHERE type = 'point'").all()
    .map(r => Object.assign({ id: r.id, label: r.label }, JSON.parse(r.attrs))).filter(p => !p.outside);
}

async function candidates(p) {
  const at = p.q.indexOf(p.label), only = at >= 0 ? p.q.slice(at) : p.label;
  const scoped = p.stds && p.stds.length;
  const A = await retrieve(p.q, { k: 3, stds: scoped ? p.stds : null, mode: scoped ? 'bm25' : 'route' });
  const B = await retrieve(only, { k: 3, mode: hasVectors(DEFAULTS.model) ? 'hybrid' : 'bm25' });
  const out = [];
  A.concat(B).forEach(h => { if (out.indexOf(h.id) < 0) out.push(h.id); });
  return out;
}

const readCache = () => { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { return {}; } };

async function link() {
  const list = points(), cache = readCache(), rows = [], verified = [];
  for (const p of list) {
    const c = await candidates(p);
    c.forEach((id, r) => rows.push({ src: p.id, dst: 'par:' + id, source: 'candidate', confidence: +(1 - r / 6).toFixed(3) }));
    const v = cache[p.id];
    if (v && v.cands.join() === c.join()) v.pick.forEach(id => verified.push({ src: p.id, dst: 'par:' + id }));
  }
  const db = core.openDb(core.DB_FILE);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('BEGIN');
  db.prepare("DELETE FROM edge WHERE rel = 'grounded_in' AND source IN ('candidate', 'verified', 'hybrid', 'bm25')").run();
  const ins = db.prepare("INSERT OR IGNORE INTO edge (src, rel, dst, weight, source, confidence) VALUES (?, 'grounded_in', ?, 1, ?, ?)");
  rows.forEach(r => ins.run(r.src, r.dst, r.source, r.confidence));
  verified.forEach(r => ins.run(r.src, r.dst, 'verified', 1));
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('links_built_at', ?)").run(new Date().toISOString());
  db.exec('COMMIT');
  db.close();

  const out = {};
  verified.forEach(r => { const k = r.src.slice(3); (out[k] = out[k] || []).push(r.dst.slice(4)); });
  const keys = Object.keys(out).sort();
  const body = '/* tools/kb-link.mjs 가 만든 파일 — 손으로 고치지 않는다\n   게임 논점(장면#논점) → 근거 문단 번호. 검색 후보 가운데 검증에서 직접 근거로 고른 것만. 기준서 원문은 없다 */\nwindow.KB_LINKS = {\n' +
    keys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(out[k])).join(',\n') + '\n};\n';
  fs.writeFileSync(path.join(ROOT, 'data', 'kb_links.js'), body);
  const checked = list.filter(p => cache[p.id]).length;
  console.log(`논점 ${list.length}개 · 후보 엣지 ${rows.length}개 · 검증한 논점 ${checked}개 · 근거를 고른 논점 ${keys.length}개 (data/kb_links.js)`);
}

const SYSTEM = [
  '당신은 회계감사기준(감사기준서) 전문가다. 감사 학습 게임의 채점 논점 여러 개가 주어지고, 논점마다 감사기준서 문단 후보가 붙어 있다.',
  '논점마다 그 논점을 판단하거나 서술할 때 직접 근거가 되는 문단만 고른다. 주제가 비슷할 뿐 그 논점의 근거가 아니면 고르지 않는다.',
  '논점이 감사기준서가 아닌 다른 기준(K-IFRS 회계처리, 윤리기준, 법령)의 내용이거나, 장면 속 사실을 적은 것이면 빈 배열.',
  '논점마다 0~2개. 그 논점의 후보에 없는 번호를 만들지 않는다. 받은 논점 번호를 빠짐없이 한 번씩 답한다. reason 은 30자 이내 명사형 한국어.'
].join('\n');
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object',
    properties: { no: { type: 'string' }, pick: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } },
    required: ['no', 'pick', 'reason'], additionalProperties: false } } },
  required: ['items'], additionalProperties: false
};
const BATCH = 8;

async function verify() {
  const { gradeOnce, findClaude, loggedIn } = await import('./claude-run.mjs');
  const bin = findClaude();
  if (!bin || !(await loggedIn(bin, true))) { console.log('Claude Code 로그인이 필요하다 — node tools/serve.mjs --login'); process.exit(1); }
  const list = points(), cache = readCache(), by = kb().byId;
  const jobs = [];
  for (const p of list) {
    const c = await candidates(p);
    if (cache[p.id] && cache[p.id].cands.join() === c.join()) continue;
    jobs.push({ p, c });
  }
  const batches = [];
  for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));
  console.log(`검증할 논점 ${jobs.length}개 (이미 ${list.length - jobs.length}개) · ${VERIFY_MODEL} · ${BATCH}개씩 Claude 호출 ${batches.length}번`);
  let done = 0, fail = 0;
  const t0 = Date.now();
  const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache));
  const para = id => { const d = by[id]; return `  [${id}] 감사기준서 ${d.std} · ${kb().plainHeading(d)}\n  ${(d.text + ' ' + d.items.join(' ')).replace(/\s+/g, ' ').slice(0, 360)}`; };
  async function one(batch) {
    const user = batch.map((j, k) => {
      const cut = j.p.q.indexOf(j.p.label);
      const ask = cut > 0 ? j.p.q.slice(0, cut).trim() : '';
      const why = cut >= 0 ? j.p.q.slice(cut + j.p.label.length).trim() : '';
      return [`### 논점 ${k + 1}`, '[물음] ' + (ask || '(없음)'), '[논점] ' + j.p.label + (why ? ' — ' + why : ''), '[후보 문단]'].concat(j.c.map(para)).join('\n');
    }).join('\n\n');
    const r = await gradeOnce({ system: SYSTEM, user, schema: SCHEMA, model: VERIFY_MODEL }, { max: 2, ms: 180000 });
    if (!r.ok) { fail += batch.length; return; }
    (r.out.items || []).forEach(it => {
      const j = batch[(parseInt(it.no, 10) || 0) - 1];
      if (!j) return;
      const pick = (it.pick || []).map(String).filter((x, i, a) => j.c.indexOf(x) >= 0 && a.indexOf(x) === i).slice(0, 2);
      cache[j.p.id] = { cands: j.c, pick, reason: String(it.reason || '').slice(0, 60), model: VERIFY_MODEL, at: new Date().toISOString() };
      done++;
    });
    save();
    console.log(`  ${done}/${jobs.length} · 실패 ${fail} · ${((Date.now() - t0) / 60000).toFixed(1)}분`);
  }
  for (let i = 0; i < batches.length; i += 2) await Promise.all(batches.slice(i, i + 2).map(one));
  console.log(`검증 끝 — ${done}개 · 실패 ${fail}개`);
}

async function measure() {
  const list = points().filter(p => p.stds && p.stds.length);
  const modes = [['BM25', { mode: 'bm25' }], ['벡터', { mode: 'dense' }], ['혼합', { mode: 'hybrid' }], ['혼합+그래프', { mode: 'graph' }]];
  console.log(`■ 논점 → 근거 문단 · 장면 기준서 일치 (논점 ${list.length}개, 기준서 묶지 않음)`);
  for (const [name, o] of modes) {
    if (o.mode !== 'bm25' && !hasVectors(DEFAULTS.model)) continue;
    let at1 = 0, at3 = 0;
    for (const p of list) {
      const hits = await retrieve(p.q, Object.assign({ k: 3 }, o));
      const ok = hits.map(h => p.stds.indexOf(kb().byId[h.id].std) >= 0);
      if (ok[0]) at1++;
      if (ok.some(Boolean)) at3++;
    }
    console.log(`  ${name.padEnd(10)} 1위 ${(100 * at1 / list.length).toFixed(1)}% · 3위 안 ${(100 * at3 / list.length).toFixed(1)}%`);
  }
}

if (process.argv.includes('--measure')) await measure();
else if (process.argv.includes('--verify')) { await verify(); await link(); }
else await link();
