/* 기준서 문단 임베딩 — 로컬 모델 (kb-embed.mjs)

     node tools/kb-embed.mjs bench [--n=40]          모델별 속도 (이 PC 기준)
     node tools/kb-embed.mjs build --model=e5-small  색인 단위 전부를 벡터로 — DB 의 vector 표에. 이어서 할 수 있다

   모델과 실행기는 저장소 밖에 둔다 — %LOCALAPPDATA%/audit-sim-kb (KB_RUNTIME 으로 바꿀 수 있다).
   거기서 `npm install @huggingface/transformers@4.3.1` 을 한 번 하면 된다. 모델은 처음 쓸 때 받아 같은 곳에 둔다.
   원문이 밖으로 나가지 않는다 — 임베딩은 이 PC 에서만 계산한다.
*/
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');

export const MODELS = {
  'e5-small': { hf: 'Xenova/multilingual-e5-small', dim: 384, query: 'query: ', passage: 'passage: ' },
  'e5-base':  { hf: 'Xenova/multilingual-e5-base',  dim: 768, query: 'query: ', passage: 'passage: ' }
};
export const RUNTIME = process.env.KB_RUNTIME || path.join(process.env.LOCALAPPDATA || path.join(process.env.HOME || '.', '.cache'), 'audit-sim-kb');

let _tf = null;
async function transformers() {
  if (_tf) return _tf;
  const req = createRequire(path.join(RUNTIME, 'package.json'));
  let entry;
  try { entry = req.resolve('@huggingface/transformers'); }
  catch (e) { throw new Error('임베딩 실행기가 없습니다 — ' + RUNTIME + ' 에서 npm install @huggingface/transformers@4.3.1'); }
  _tf = await import(pathToFileURL(entry).href);
  _tf.env.cacheDir = path.join(RUNTIME, 'models');
  _tf.env.allowLocalModels = false;
  return _tf;
}

const pipes = {};
async function pipe(name) {
  if (!MODELS[name]) throw new Error('모르는 모델: ' + name);
  if (!pipes[name]) {
    const tf = await transformers();
    pipes[name] = tf.pipeline('feature-extraction', MODELS[name].hf, { dtype: 'q8' });
  }
  return pipes[name];
}

/* 글 여러 개를 벡터로 — 평균 풀링 · 정규화. Float32Array 배열 */
export async function embed(name, texts, kind) {
  const p = await pipe(name), pre = MODELS[name][kind === 'query' ? 'query' : 'passage'];
  const out = await p(texts.map(t => pre + t), { pooling: 'mean', normalize: true });
  const dim = MODELS[name].dim, data = out.data;
  return texts.map((_, i) => Float32Array.from(data.subarray(i * dim, (i + 1) * dim)));
}

/* 색인 단위 — BM25 와 같은 단위(문단, 긴 문단은 항목별)를 쓴다. 제목을 앞에 붙인다 */
export function unitsOf(KB) {
  return KB.units.map((u, i) => ({ unit: i, par: KB.docs[u.doc].id, text: (u.head + ' — ' + u.text).slice(0, 1200) }));
}
const sha = t => crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);

async function bench(n) {
  const KB = core.load();
  const units = unitsOf(KB).filter((_, i) => i % Math.floor(KB.units.length / n) === 0).slice(0, n);
  for (const name of Object.keys(MODELS)) {
    let t0 = Date.now();
    await embed(name, ['워밍업'], 'query');
    const load = Date.now() - t0;
    t0 = Date.now();
    for (let i = 0; i < units.length; i += 8) await embed(name, units.slice(i, i + 8).map(u => u.text), 'passage');
    const per = (Date.now() - t0) / units.length;
    t0 = Date.now();
    await embed(name, ['조회서 발송을 경영진이 거부할 때 감사인의 절차'], 'query');
    const q = Date.now() - t0;
    const mem = process.memoryUsage().rss / 1048576;
    console.log(`${name.padEnd(9)} 불러오기 ${(load / 1000).toFixed(1)}초 · 문단당 ${per.toFixed(0)}ms · 전체 ${KB.units.length}개 예상 ${(per * KB.units.length / 60000).toFixed(1)}분 · 질의 ${q}ms · 메모리 ${mem.toFixed(0)}MB`);
  }
}

async function build(name) {
  const KB = core.load();
  KB.db.close();
  const db = core.openDb(core.DB_FILE);
  db.exec(core.VECTOR_DDL);
  const have = new Map(db.prepare('SELECT unit, sha FROM vector WHERE model = ?').all(name).map(r => [r.unit, r.sha]));
  const todo = unitsOf(KB).filter(u => have.get(u.unit) !== sha(u.text));
  console.log(`${name} — 전체 ${KB.units.length} · 이미 있음 ${KB.units.length - todo.length} · 할 것 ${todo.length}`);
  const ins = db.prepare('INSERT OR REPLACE INTO vector (model, unit, par, sha, vec) VALUES (?, ?, ?, ?, ?)');
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += 16) {
    const batch = todo.slice(i, i + 16);
    const vecs = await embed(name, batch.map(u => u.text), 'passage');
    db.exec('BEGIN');
    batch.forEach((u, j) => ins.run(name, u.unit, u.par, sha(u.text), Buffer.from(vecs[j].buffer)));
    db.exec('COMMIT');
    if ((i / 16) % 20 === 0 || i + 16 >= todo.length) {
      const done = Math.min(i + 16, todo.length), sec = (Date.now() - t0) / 1000;
      console.log(`  ${done}/${todo.length} · ${sec.toFixed(0)}초 · 남은 시간 약 ${((todo.length - done) * sec / done / 60).toFixed(1)}분`);
    }
  }
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run('vector_' + name, new Date().toISOString());
  db.close();
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const args = process.argv.slice(2), opt = {};
  args.forEach(a => { const m = /^--(\w+)=(.*)$/.exec(a); if (m) opt[m[1]] = m[2]; });
  const cmd = args.find(a => !a.startsWith('--'));
  if (cmd === 'bench') await bench(+opt.n || 40);
  else if (cmd === 'build') await build(opt.model || 'e5-small');
  else console.log('node tools/kb-embed.mjs bench | build --model=e5-small');
}
