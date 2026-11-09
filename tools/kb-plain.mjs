/* 일상어 질의 세트 만들기 (kb-plain.mjs)

     node tools/kb-plain.mjs          기준서 문단을 골라 Claude 에게 일상어 질문을 하나씩 받는다 (이어서 할 수 있다)
     node tools/kb-plain.mjs --show   만든 질의를 몇 개 보여 주고, 질의에 정답 문단 제목 표현이 얼마나 섞였는지 센다

   왜 — 지금 정답이 달린 질의(기출 문항 · 해설에 인쇄된 문단 번호)는 모두 시험 말투다. 기준서 용어가 이미 들어 있어
   「회신이 오지 않을 때」 처럼 용어를 모르고 묻는 경우는 재지 못한다. 그런 질의를 만들어 정답(뽑은 문단)과 함께 둔다.

   문단 고르기 — 소규모기업 기준(1200) · 목적 · 범위 · 시행일 · 용어의 정의 · 공공부문 절과 80자보다 짧은 문단은 뺀다.
     열쇠의 해시 순으로 요구사항 240 · 적용지침 120. 세트 나누기(개발 · 검증)는 tools/kb-eval.mjs 와 같은 해시
   질문 만들기 — Sonnet 5.5. 핵심 용어 1~2개는 쓰지 않고 풀어 말한다. 감사인 · 회사 같은 흔한 말은 쓴다.
     빼고 쓴 용어를 함께 받아 질의에 정말 없는지 확인한다 — 섞이면 버린다
   결과는 자료/kb/plain_queries.json (기준서 문단에서 만든 글이라 저장소에 넣지 않는다)
*/
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLAIN_FILE = path.join(ROOT, '자료', 'kb', 'plain_queries.json');
const MAKE_MODEL = 'claude-sonnet-5-5';
const BATCH = 10;
const WANT = { '요구사항': 240, '적용지침': 120 };

const hash = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const SKIP_HEAD = /^(시행일|목적|범위|이 감사기준서의 범위|감사인의 목적|용어의 정의|서론|발효일|공공부문에 특유한)/;

export function readPlain() { try { return JSON.parse(fs.readFileSync(PLAIN_FILE, 'utf8')); } catch (e) { return {}; } }

function pick(K) {
  const out = [];
  Object.keys(WANT).forEach(kind => {
    const pool = K.docs.filter(d => d.kind === kind && d.std !== '1200' && !SKIP_HEAD.test(K.plainHeading(d)) &&
      (d.text + d.items.join('')).replace(/\s/g, '').length >= 80);
    pool.sort((a, b) => hash('plain|' + a.id) - hash('plain|' + b.id));
    out.push(...pool.slice(0, WANT[kind]));
  });
  return out;
}

const SYSTEM = [
  '감사를 공부하는 사람이 감사기준서에서 어떤 문단을 찾으려고 검색창에 칠 질문을 만든다. 문단마다 질문 하나.',
  '그 사람은 기준서 용어를 아직 잘 모른다. 문단 제목과 본문의 핵심 용어 1~2개는 쓰지 않고 일상어로 풀어 말한다.',
  '감사인 · 회사 · 재무제표 · 경영진 · 감사 같은 흔한 말은 써도 된다.',
  '문단 글을 베끼지 않는다. 그 문단이 답이 되는 상황이나 궁금한 점을 묻는 한 문장, 15~45자. 물음표는 붙이지 않아도 된다.',
  'avoid 에는 일부러 쓰지 않은 핵심 용어를 기준서 표기 그대로 1~2개. 받은 문단 번호를 빠짐없이 한 번씩 답한다.'
].join('\n');
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object',
    properties: { no: { type: 'string' }, q: { type: 'string' }, avoid: { type: 'array', items: { type: 'string' } } },
    required: ['no', 'q', 'avoid'], additionalProperties: false } } },
  required: ['items'], additionalProperties: false
};

async function make() {
  const K = core.load();
  if (!K) { console.log('지식베이스가 없습니다 — node tools/kb_db.js'); process.exit(1); }
  const { gradeOnce, findClaude, loggedIn } = await import('./claude-run.mjs');
  const bin = findClaude();
  if (!bin || !(await loggedIn(bin, true))) { console.log('Claude Code 로그인이 필요하다 — node tools/serve.mjs --login'); process.exit(1); }
  const cache = readPlain();
  const todo = pick(K).filter(d => !cache[d.id]);
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`질문을 만들 문단 ${todo.length}개 (이미 ${Object.keys(cache).length}개) · ${MAKE_MODEL} · ${BATCH}개씩 ${batches.length}번`);
  let done = 0, drop = 0, fail = 0;
  const t0 = Date.now();
  const n = s => core.norm(s);
  async function one(batch) {
    const user = batch.map((d, k) => `### 문단 ${k + 1}\n[제목] ${K.plainHeading(d)}\n[본문] ${(d.text + ' ' + d.items.join(' ')).replace(/\s+/g, ' ').slice(0, 420)}`).join('\n\n');
    const r = await gradeOnce({ system: SYSTEM, user, schema: SCHEMA, model: MAKE_MODEL }, { max: 2, ms: 240000 });
    if (!r.ok) { fail += batch.length; return; }
    (r.out.items || []).forEach(it => {
      const d = batch[(parseInt(it.no, 10) || 0) - 1];
      if (!d || cache[d.id]) return;
      const q = String(it.q || '').trim(), avoid = (it.avoid || []).map(String).filter(Boolean).slice(0, 3);
      // 빼겠다던 용어가 질의에 남아 있으면 버린다 — 시험 말투 질의와 다를 게 없다
      if (q.length < 8 || avoid.some(a => n(a).length >= 2 && n(q).indexOf(n(a)) >= 0)) { drop++; return; }
      cache[d.id] = { q, avoid, kind: d.kind, model: MAKE_MODEL, at: new Date().toISOString() };
      done++;
    });
    fs.writeFileSync(PLAIN_FILE, JSON.stringify(cache, null, 1));
    console.log(`  ${done}/${todo.length} · 버림 ${drop} · 실패 ${fail} · ${((Date.now() - t0) / 60000).toFixed(1)}분`);
  }
  for (let i = 0; i < batches.length; i += 2) await Promise.all(batches.slice(i, i + 2).map(one));
  console.log(`끝 — 만든 질의 ${Object.keys(cache).length}개 · 이번에 버림 ${drop} · 실패 ${fail}`);
}

function show() {
  const K = core.load(), cache = readPlain(), ids = Object.keys(cache);
  console.log(`일상어 질의 ${ids.length}개`);
  // 질의 글자 두 자 가운데 정답 문단 제목에도 있는 몫 — 높으면 제목을 거의 그대로 물은 것
  let share = 0;
  ids.forEach(id => {
    const g = core.grams(cache[id].q), h = new Set(core.grams(K.plainHeading(K.byId[id])));
    share += g.length ? g.filter(x => h.has(x)).length / g.length : 0;
  });
  console.log(`질의의 글자 두 자 중 정답 문단 제목에도 있는 몫 평균 ${(100 * share / Math.max(ids.length, 1)).toFixed(1)}%`);
  ids.sort((a, b) => hash(a) - hash(b)).slice(0, 12).forEach(id => console.log(`  ${id.padEnd(9)} ${cache[id].q}   (뺀 용어 ${cache[id].avoid.join(' · ')})`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--show')) show();
  else await make();
}
