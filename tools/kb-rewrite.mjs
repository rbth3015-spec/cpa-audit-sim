/* 질의를 기준서 말로 바꿔 쓰기 (kb-rewrite.mjs)

   일상어 질문 → 감사기준서에 실제로 쓰이는 용어 몇 개. 바꾼 말을 원래 질의 뒤에 붙여 BM25 로 찾는다.
   Claude Code 를 한 번 부르므로 이 PC 에서 8~12초 걸린다 — 탐색기의 「기준서 말로 바꿔 찾기」 와 측정(tools/kb-eval.mjs)에서만 쓴다.
   채점 근거(tools/kb-ground.mjs)는 채점표의 기준서 용어로 질의를 만들어 쓰지 않는다.
   같은 질의는 자료/kb/rewrite_cache.json 에 남겨 다시 묻지 않는다
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '자료', 'kb', 'rewrite_cache.json');
export const REWRITE_MODEL = 'claude-haiku-5-5';

const SYSTEM = [
  '감사를 배우는 사람이 감사기준서를 찾으려고 친 질문을 감사기준서 검색어로 바꾼다.',
  '질문마다 그 상황을 다루는 감사기준서에 실제로 쓰이는 용어 2~6개를 공백으로 띄워 적는다. 기준서 번호 · 문단 번호 · 설명은 적지 않는다.',
  '받은 질문 번호를 빠짐없이 한 번씩 답한다.'
].join('\n');
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object',
    properties: { no: { type: 'string' }, terms: { type: 'string' } }, required: ['no', 'terms'], additionalProperties: false } } },
  required: ['items'], additionalProperties: false
};

let cache = null;
const readCache = () => { if (!cache) { try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; } } return cache; };
const clean = s => String(s || '').replace(/\d{3,4}\s*-\s*A?\d+|감사기준서\s*\d{3,4}|KSA\s*\d{3,4}/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/* 여러 질의를 한 번에 — [바꾼 말 | null]. 실패하면 null (원래 질의로만 찾는다) */
export async function rewriteMany(qs, opt = {}) {
  const c = readCache(), out = qs.map(q => (q in c ? c[q] : undefined));
  const todo = qs.map((q, i) => i).filter(i => out[i] === undefined);
  if (!todo.length) return out;
  const { gradeOnce } = await import('./claude-run.mjs');
  const batch = opt.batch || 20;
  for (let s = 0; s < todo.length; s += batch) {
    const part = todo.slice(s, s + batch);
    const user = part.map((i, k) => `${k + 1}. ${qs[i]}`).join('\n');
    const r = await gradeOnce({ system: SYSTEM, user, schema: SCHEMA, model: REWRITE_MODEL }, { max: opt.max || 2, ms: opt.ms || 120000 });
    if (!r.ok) { part.forEach(i => { out[i] = null; }); continue; }
    (r.out.items || []).forEach(it => {
      const i = part[(parseInt(it.no, 10) || 0) - 1];
      if (i === undefined) return;
      out[i] = clean(it.terms) || null;
      if (out[i]) c[qs[i]] = out[i];
    });
    part.forEach(i => { if (out[i] === undefined) out[i] = null; });
    try { fs.writeFileSync(CACHE, JSON.stringify(c)); } catch (e) { /* 캐시는 없어도 된다 */ }
  }
  return out;
}
export async function rewrite(q, opt) { return (await rewriteMany([q], opt))[0]; }
