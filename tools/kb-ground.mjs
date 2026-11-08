/* 채점 근거 — 물음에 맞는 기준서 문단을 찾아 채점 요청에 붙인다 (kb-ground.mjs)
   채점 서버(tools/serve.mjs)와 측정 도구(tools/aigrade-calib.mjs --rag)가 같이 쓴다.

   질의는 수험생 답안이 아니라 물음 · 논점으로 만든다 — 같은 문항이면 늘 같은 근거가 붙어 채점이 흔들리지 않는다.
   원문은 이 PC 에서만 읽는다. 채점을 맡는 Claude 에는 요청 글의 일부로 함께 간다 (저장소 · 배포본에는 들어가지 않는다).
*/
import { createRequire } from 'node:module';
import { retrieve, kb, hasVectors, DEFAULTS } from './kb-retrieve.mjs';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');

const K = 5, CHARS = 520, TOTAL = 3200;
const cache = new Map();

export function available() {
  try { return !!kb(); } catch (e) { return false; }
}

/* spec { q, stds[] } → { ids, block, paragraphs, ms, mode } */
export async function ground(spec) {
  const q = String((spec && spec.q) || '').slice(0, 1500);
  const stds = ((spec && spec.stds) || []).map(String).filter(s => /^\d{3,4}$/.test(s));
  const key = q + '\u0001' + stds.join(',');
  if (cache.has(key)) return Object.assign({}, cache.get(key), { ms: 0, cached: true });
  const t0 = Date.now();
  let mode = 'route';
  const find = async (o) => {
    try { return await retrieve(q, Object.assign({ k: K, mode }, o)); }
    catch (e) { mode = 'bm25'; return retrieve(q, Object.assign({ k: K, mode }, o)); }   // 임베딩 실행기가 없으면 BM25 만
  };
  let hits = await find({ stds: stds.length ? stds : null });
  if (!hits.length && stds.length) hits = await find({});   // 장면의 기준서에 없으면 전체에서
  if (mode === 'route') mode = stds.length && hits.length ? 'bm25 · 장면 기준서 안' : (hasVectors(DEFAULTS.model) ? '혼합' : 'bm25');
  const by = kb().byId, paragraphs = [], parts = [];
  let used = 0;
  hits.forEach(h => {
    const d = by[h.id];
    let body = (d.text + (d.items.length ? ' ' + d.items.join(' ') : '')).replace(/\s+/g, ' ');
    if (body.length > CHARS) body = body.slice(0, CHARS) + '…';
    if (used + body.length > TOTAL) return;
    used += body.length;
    const head = kb().plainHeading(d);
    paragraphs.push({ id: d.id, std: d.std, heading: head });
    parts.push(`[${d.id}] 감사기준서 ${d.std} · ${head}\n${body}`);
  });
  const out = {
    ids: paragraphs.map(p => p.id), paragraphs, mode,
    block: paragraphs.length ? '\n\n[근거 문단] 회계감사기준 원문 발췌 — 판정 참고용. 채점 기준은 위 채점표다.\n' + parts.join('\n\n') : '',
    ms: Date.now() - t0
  };
  cache.set(key, out);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return out;
}

/* 받은 판정에서 근거 번호를 거른다 — 붙여 준 문단 번호만 남긴다 */
export function keepCites(out, ids) {
  let given = 0, kept = 0;
  ((out && out.must) || []).forEach(m => {
    const list = Array.isArray(m.cite) ? m.cite : [];
    given += list.length;
    m.cite = list.map(String).filter((c, i, a) => ids.indexOf(c) >= 0 && a.indexOf(c) === i).slice(0, 2);
    kept += m.cite.length;
  });
  return { given, kept };
}

/* 채점 기록 — 답안 글은 남기지 않는다. 무엇을 근거로 줬고 무엇을 인용했는지만 */
let logDb = null;
export function logGrade(e) {
  try {
    if (!logDb) {
      logDb = core.openDb(core.DB_FILE);
      logDb.exec(core.LOG_DDL);
    }
    logDb.prepare(`INSERT INTO grading_log (at, model, guide, rag, question, retrieved, cited, verdicts, ok, ms_retrieve, ms_grade)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      new Date().toISOString(), e.model || '', e.guide || 0, e.rag ? 1 : 0, String(e.question || '').slice(0, 300),
      JSON.stringify(e.retrieved || []), JSON.stringify(e.cited || {}), JSON.stringify(e.verdicts || {}),
      e.ok ? 1 : 0, e.msRetrieve || 0, e.msGrade || 0);
  } catch (err) { /* 기록은 실패해도 채점은 계속 */ }
}
