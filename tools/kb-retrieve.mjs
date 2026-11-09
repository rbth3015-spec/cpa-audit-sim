/* 근거 문단 찾기 — 혼합 검색 + 그래프 확장 (kb-retrieve.mjs)

   1. BM25 (글자 두 자 색인, tools/kb-core.js)        뜻이 같은 낱말을 그대로 쓴 문단
   2. 벡터 (로컬 임베딩, tools/kb-embed.mjs)            표현이 달라도 뜻이 가까운 문단
   3. 순위 합치기 (RRF) — 점수 크기가 다른 두 결과를 순위로 합친다
   4. 그래프 확장 — 위쪽 문단의 적용지침 · 요구사항 · 참조 문단에 점수를 나눠 준다 (지식그래프의 guidance · refers)

   retrieve(질의, { k, mode, model, stds, rw }) → [{ id, score, why[] }]
     mode: route (기본) · bm25 · dense · hybrid · graph (= hybrid + 그래프 확장)
     stds: 기준서 번호 배열 — 주면 그 기준서 안에서만
     rw: 질의를 기준서 말로 바꿔 쓴 검색어 (tools/kb-rewrite.mjs) — 원래 질의 뒤에 붙인다
   rewriteRoute() — 바꿔 찾기의 경로. 벡터가 있으면 혼합 + 그래프, 없으면 BM25 — 일상어 질의 개발 세트에서 고른 것 (docs/kb.md 「일상어 질의」)
   route — 측정으로 고른 경로 (docs/kb.md 「검색 경로」) = BM25. 기준서를 알면 그 안에서
     문단을 찾는 데는 기준서를 알 때도 모를 때도 BM25 가 가장 정확했다 (개발 · 검증 세트 모두).
     혼합은 기준서 고르기에서 BM25 와 비슷했고(기출 문항 MRR 0.787 대 0.774) 문단은 크게 못했다(0.450 대 0.614).
     「혼합으로 기준서를 고른 뒤 그 안에서 BM25」 2단계도 개발 세트에서 BM25 를 넘지 못했다.
   벡터는 질의 표현이 기준서와 다를 때 후보를 넓히는 데 쓴다 — 논점 근거 후보(tools/kb-link.mjs) · 탐색기의 혼합 · 벡터
   그래프 확장은 순위를 올리지 못해 기본 경로에 넣지 않았다. 근거 설명 · 탐색기 · 커버리지에 쓴다
*/
import { createRequire } from 'node:module';
import { embed, MODELS } from './kb-embed.mjs';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');

export const DEFAULTS = { k: 5, mode: 'route', model: 'e5-small', pool: 40, rrf: 60, wBm25: 1, wDense: 1, graphSeeds: 5, graphShare: 0.05 };
const SKIP = '1200';

let KB = null;
export function kb() {
  if (!KB) {
    KB = core.load();
    if (!KB) throw new Error('지식베이스가 없습니다 — node tools/kb_db.js');
  }
  return KB;
}

/* 벡터 행렬 — 모델마다 한 번 읽어 둔다 */
const mats = {};
function matrix(model) {
  if (model in mats) return mats[model];
  const db = kb().db;
  const has = db && db.prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'vector'").get().n;
  // 빌드가 끝까지 끝난 모델만 — 반쯤 만든 벡터로 찾으면 결과가 기운다 (meta 의 vector_<모델> 은 빌드 끝에 적힌다)
  const done = has && db.prepare('SELECT value FROM meta WHERE key = ?').get('vector_' + model);
  const rows = done ? db.prepare('SELECT par, vec FROM vector WHERE model = ? ORDER BY unit').all(model) : [];
  if (rows.length && rows.length !== kb().units.length) return (mats[model] = null);
  if (!rows.length) return (mats[model] = null);
  const dim = MODELS[model].dim, M = new Float32Array(rows.length * dim), par = new Array(rows.length);
  rows.forEach((r, i) => { M.set(new Float32Array(Uint8Array.from(r.vec).buffer), i * dim); par[i] = r.par; });
  return (mats[model] = { M, par, dim, n: rows.length });
}
export function hasVectors(model) { return !!matrix(model || DEFAULTS.model); }

/* 그래프 이웃 — 문단 사이의 guidance · refers 를 양쪽으로 */
let adj = null;
function neighbors() {
  if (adj) return adj;
  adj = new Map();
  const db = kb().db;
  const has = db && db.prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'edge'").get().n;
  if (!has) return adj;
  db.prepare("SELECT DISTINCT src, rel, dst FROM edge WHERE rel IN ('guidance', 'refers') AND src LIKE 'par:%' AND dst LIKE 'par:%'").all().forEach(e => {
    const a = e.src.slice(4), b = e.dst.slice(4);
    (adj.get(a) || adj.set(a, []).get(a)).push({ id: b, rel: e.rel });
    (adj.get(b) || adj.set(b, []).get(b)).push({ id: a, rel: e.rel + '←' });
  });
  return adj;
}

const allowed = (id, stds) => {
  const d = kb().byId[id];
  return d && (stds && stds.length ? stds.indexOf(d.std) >= 0 : d.std !== SKIP);
};

function bm25List(q, stds, pool) {
  if (stds && stds.length) {
    let out = [];
    stds.forEach(s => { out = out.concat(kb().search(q, { k: pool, std: s })); });
    return out.sort((a, b) => b[0] - a[0]).slice(0, pool).map(([s, d]) => d.id);
  }
  return kb().search(q, { k: pool }).map(([s, d]) => d.id);
}

const qcache = new Map();
async function queryVec(q, model) {
  const key = model + '\u0001' + q;
  if (!qcache.has(key)) qcache.set(key, (await embed(model, [q], 'query'))[0]);
  return qcache.get(key);
}

async function denseList(q, model, stds, pool) {
  const m = matrix(model);
  if (!m) return null;
  const v = await queryVec(q, model), best = new Map();
  for (let i = 0; i < m.n; i++) {
    let s = 0;
    const o = i * m.dim;
    for (let j = 0; j < m.dim; j++) s += m.M[o + j] * v[j];
    const id = m.par[i];
    if (!(best.get(id) >= s)) best.set(id, s);
  }
  return [...best.entries()].filter(([id]) => allowed(id, stds)).sort((a, b) => b[1] - a[1]).slice(0, pool).map(([id]) => id);
}

/* 바꿔 찾기 — 바꾼 말 + 원래 질의로 혼합 + 그래프 확장. 일상어 개발 세트 MRR: BM25 0.386 · 혼합 0.422 · 혼합+그래프 0.453 */
export const rewriteRoute = () => (hasVectors(DEFAULTS.model) ? 'graph' : 'bm25');

export async function retrieve(q, opt) {
  const o = Object.assign({}, DEFAULTS, opt || {});
  if (o.mode === 'route') o.mode = 'bm25';   // 측정으로 고른 경로 — 위 설명
  const score = new Map(), why = new Map();
  const add = (id, s, tag) => { score.set(id, (score.get(id) || 0) + s); (why.get(id) || why.set(id, []).get(id)).push(tag); };

  // rw — 기준서 말로 바꿔 쓴 검색어 (tools/kb-rewrite.mjs). 원래 질의 뒤에 붙여 BM25 · 벡터 모두 그 글로 찾는다
  if (o.rw) q = q + ' ' + o.rw;
  const lex = o.mode !== 'dense' ? bm25List(q, o.stds, o.pool) : [];
  lex.forEach((id, r) => add(id, o.wBm25 / (o.rrf + r + 1), 'bm25#' + (r + 1)));
  if (o.mode !== 'bm25') {
    // rerank — 벡터는 BM25 후보의 순서만 고친다 (새 문단을 끌어오지 않는다)
    let d = await denseList(q, o.model, o.stds, o.rerank ? 4000 : o.pool);
    if (d && o.rerank) { const inLex = new Set(lex); d = d.filter(id => inLex.has(id)); }
    if (d) d.forEach((id, r) => add(id, o.wDense / (o.rrf + r + 1), 'dense#' + (r + 1)));
    else if (o.mode === 'dense') return [];
  }
  if (o.mode === 'graph') {
    const seeds = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.graphSeeds);
    const nb = neighbors();
    seeds.forEach(([id, s]) => {
      (nb.get(id) || []).forEach(n => {
        if (!allowed(n.id, o.stds)) return;
        add(n.id, s * o.graphShare, 'graph:' + n.rel + ':' + id);
      });
    });
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.k)
    .map(([id, s]) => ({ id, score: +s.toFixed(5), why: why.get(id) }));
}
