/* 검색 단계별 측정 (kb-eval.mjs)

     node tools/kb-eval.mjs                 BM25 · 벡터 · 혼합 · 혼합+그래프를 같은 정답으로 비교
     node tools/kb-eval.mjs --tune          개발 세트로 설정을 고른다 (검증 세트는 보지 않는다)
     node tools/kb-eval.mjs --rewrite       바꿔 찾기(질의를 Claude 가 기준서 말로 바꿔 씀)도 잰다 — Claude Code 를 부른다 (캐시)
       --parts=plain,std                    일부 층만 (std · par · parStd · plain · plainSec · points)   --small  벡터는 e5-small 만

   정답은 사람이 이미 달아 둔 것만 쓴다 (tools/kb.js eval 과 같다)
     기준서 단위  기출 · GS 문항에 달린 기준서            결과 문단의 기준서가 정답에 있으면 맞음
     문단 단위    해설 · 강평에 인쇄된 문단 번호           그 문단이 결과에 있으면 맞음
     일상어      tools/kb-plain.mjs 가 문단마다 만든 질문      그 문단(또는 같은 절)이 결과에 있으면 맞음
   세트는 열쇠의 해시로 반씩 나눈다 — 설정은 개발 세트로만 고르고, 표의 숫자는 검증 세트다.
*/
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieve, kb, hasVectors, DEFAULTS, rewriteRoute } from './kb-retrieve.mjs';
import { readPlain } from './kb-plain.mjs';

const require = createRequire(import.meta.url);
const core = require('./kb-core.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');   // 한글 폴더 이름 — URL 경로를 그대로 쓰면 깨진다

const hash = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const isDev = r => hash(r.key) % 2 === 0;

function sets() {
  const K = kb();
  const itemFile = path.join(ROOT, '자료', 'db', 'items.jsonl');
  const items = fs.existsSync(itemFile) ? fs.readFileSync(itemFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const std = items.map(x => ({ key: x.id, gold: (x.ksa || []).filter(s => /^\d{3,4}$/.test(s)), query: [x.topic, x.ask, (x.points || []).join(' ')].join(' ') }))
    .filter(x => x.gold.length);
  const par = core.citations(K.byId).map(c => ({ key: c.key, id: c.id, query: c.query }));
  const P = readPlain();
  const plain = Object.keys(P).filter(id => K.byId[id]).map(id => ({ key: 'plain|' + id, id, query: P[id].q }));
  return {
    plain: { rows: plain, hit: (r, id) => id === r.id },
    plainSec: { rows: plain, hit: (r, id) => id === r.id || (K.byId[id].std === K.byId[r.id].std && K.byId[id].heading === K.byId[r.id].heading) },
    std: { rows: std, hit: (r, id) => r.gold.indexOf(K.byId[id].std) >= 0 },
    par: { rows: par, hit: (r, id) => id === r.id },
    sec: { rows: par, hit: (r, id) => id === r.id || (K.byId[id].std === K.byId[r.id].std && K.byId[id].heading === K.byId[r.id].heading) }
  };
}

async function measure(set, rows, opt) {
  const ks = [1, 3, 5, 10];
  const res = { n: rows.length, at: {}, mrr: 0, ndcg: 0 };
  ks.forEach(k => { res.at[k] = 0; });
  for (const r of rows) {
    const top = await retrieve(r.query, Object.assign({}, opt, { k: 10, rw: opt.rewrite ? r.rw : null }));
    const rank = top.findIndex(x => set.hit(r, x.id));
    if (rank >= 0) { res.mrr += 1 / (rank + 1); res.ndcg += 1 / Math.log2(rank + 2); }
    ks.forEach(k => { if (rank >= 0 && rank < k) res.at[k]++; });
  }
  res.mrr /= Math.max(rows.length, 1); res.ndcg /= Math.max(rows.length, 1);
  return res;
}
const pct = (a, b) => (100 * a / Math.max(b, 1)).toFixed(1).padStart(5) + '%';
const line = (name, m) => `  ${name.padEnd(22)} ${String(m.n).padStart(4)}건  @1 ${pct(m.at[1], m.n)}  @3 ${pct(m.at[3], m.n)}  @5 ${pct(m.at[5], m.n)}  @10 ${pct(m.at[10], m.n)}  MRR ${m.mrr.toFixed(3)}  nDCG@10 ${m.ndcg.toFixed(3)}`;

const MODES = [
  ['BM25', { mode: 'bm25' }],
  ['벡터 e5-small', { mode: 'dense', model: 'e5-small' }],
  ['벡터 e5-base', { mode: 'dense', model: 'e5-base' }],
  ['혼합 e5-small', { mode: 'hybrid', model: 'e5-small' }],
  ['혼합 e5-base', { mode: 'hybrid', model: 'e5-base' }],
  ['혼합+그래프 e5-small', { mode: 'graph', model: 'e5-small' }],
  ['기본 경로', { mode: 'route' }]
];
const ARGS = process.argv.slice(2);
const PARTS = ((ARGS.find(a => a.startsWith('--parts=')) || '').slice(8) || '').split(',').filter(Boolean);
const wantPart = k => !PARTS.length || PARTS.indexOf(k) >= 0;
const usable = o => (!o.model || hasVectors(o.model)) && !(ARGS.indexOf('--small') >= 0 && o.model === 'e5-base');
// 바꿔 찾기 — 기준서를 모를 때의 층에서만 (기준서를 알면 채점처럼 채점표 용어로 묻는다)
const RW_MODES = [
  ['바꿔 찾기 · BM25', { mode: 'bm25', rewrite: true }],
  ['바꿔 찾기 · 혼합', { mode: 'hybrid', model: 'e5-small', rewrite: true }],
  ['바꿔 찾기 · 혼합+그래프', { mode: 'graph', model: 'e5-small', rewrite: true }],
  ['바꿔 찾기 경로', { mode: rewriteRoute(), rewrite: true }]
];
async function addRewrites(rows) {
  const { rewriteMany } = await import('./kb-rewrite.mjs');
  const rw = await rewriteMany(rows.map(r => r.query));
  rows.forEach((r, i) => { r.rw = rw[i]; });
  return rw.filter(Boolean).length;
}

async function report(json, withRw) {
  const S = sets(), out = {};
  const test = r => !isDev(r);
  const parts = [
    ['■ 기준서 단위 — 기출 · GS 문항의 기준서 (기준서를 모를 때)', 'std', S.std, S.std.rows.filter(test), null],
    ['■ 문단 단위 — 해설에 인쇄된 문단 번호 (기준서를 모를 때)', 'par', S.par, S.par.rows.filter(test), null],
    ['■ 문단 단위 — 기준서를 알 때 (정답 문단의 기준서 안에서)', 'parStd', S.par, S.par.rows.filter(test), r => [kb().byId[r.id].std]]
  ];
  if (S.plain.rows.length) parts.push(
    ['■ 일상어 질의 — 만든 질의의 정답 문단 (기준서를 모를 때 · tools/kb-plain.mjs)', 'plain', S.plain, S.plain.rows.filter(test), null],
    ['■ 일상어 질의 — 정답 문단과 같은 절이면 맞음', 'plainSec', S.plainSec, S.plainSec.rows.filter(test), null]);
  for (const [label, key, set, rows, stdOf] of parts) {
    if (!wantPart(key)) continue;
    console.log(label + ' · 검증 세트');
    out[key] = {};
    const rwHere = withRw && !stdOf;
    if (rwHere) console.log(`  (바꿔 찾기 — ${await addRewrites(rows)}/${rows.length}건 바꿈)`);
    for (const [name, opt] of MODES.concat(rwHere ? RW_MODES : [])) {
      if (!usable(opt)) continue;
      const m = stdOf ? await measureStd(set, rows, opt, stdOf) : await measure(set, rows, opt);
      out[key][name] = m;
      console.log(line(name, m));
    }
  }
  // 채점 질의와 같은 모양 — 게임 논점(물음 + 논점 + 뜻)으로 기준서를 묶지 않고 찾았을 때 장면의 기준서가 나오는가
  const pts = kb().db.prepare("SELECT id, attrs FROM node WHERE type = 'point'").all().map(r => JSON.parse(r.attrs)).filter(p => p.q && p.stds && p.stds.length);
  if (pts.length && wantPart('points')) {
    console.log(`■ 게임 논점 → 장면의 기준서 (논점 ${pts.length}개 · 1위 · 3위 안)`);
    out.points = {};
    for (const [name, opt] of MODES) {
      if (!usable(opt)) continue;
      let a1 = 0, a3 = 0;
      for (const p of pts) {
        const h = await retrieve(p.q, Object.assign({}, opt, { k: 3 }));
        const ok = h.map(x => p.stds.indexOf(kb().byId[x.id].std) >= 0);
        if (ok[0]) a1++;
        if (ok.some(Boolean)) a3++;
      }
      out.points[name] = { n: pts.length, at1: a1, at3: a3 };
      console.log(`  ${name.padEnd(22)} 1위 ${pct(a1, pts.length)}  3위 안 ${pct(a3, pts.length)}`);
    }
  }
  if (json) fs.writeFileSync(json, JSON.stringify({ at: new Date().toISOString(), defaults: DEFAULTS, results: out }, null, 1));
}
async function measureStd(set, rows, opt, stdOf) {
  const ks = [1, 3, 5, 10], res = { n: rows.length, at: {}, mrr: 0, ndcg: 0 };
  ks.forEach(k => { res.at[k] = 0; });
  for (const r of rows) {
    const top = await retrieve(r.query, Object.assign({}, opt, { k: 10, stds: stdOf(r) }));
    const rank = top.findIndex(x => set.hit(r, x.id));
    if (rank >= 0) { res.mrr += 1 / (rank + 1); res.ndcg += 1 / Math.log2(rank + 2); }
    ks.forEach(k => { if (rank >= 0 && rank < k) res.at[k]++; });
  }
  res.mrr /= Math.max(rows.length, 1); res.ndcg /= Math.max(rows.length, 1);
  return res;
}

/* 설정 고르기 — 개발 세트의 문단 단위 MRR + 기준서 단위 MRR 합이 가장 큰 값 */
async function tune() {
  const S = sets();
  const dev = { std: S.std.rows.filter(isDev), par: S.par.rows.filter(isDev) };
  const score = async opt => (await measure(S.std, dev.std, opt)).mrr + (await measure(S.par, dev.par, opt)).mrr;
  const models = ['e5-small', 'e5-base'].filter(hasVectors);
  for (const model of models) {
    let best = null;
    for (const wDense of [0.5, 1, 1.5]) for (const rrf of [30, 60]) {
      const s = await score({ mode: 'hybrid', model, wDense, rrf });
      if (!best || s > best.s) best = { s, wDense, rrf };
    }
    let g = null;
    for (const graphShare of [0.15, 0.35, 0.6]) for (const graphSeeds of [5, 8, 12]) {
      const s = await score({ mode: 'graph', model, wDense: best.wDense, rrf: best.rrf, graphShare, graphSeeds });
      if (!g || s > g.s) g = { s, graphShare, graphSeeds };
    }
    console.log(`${model}  혼합 최적 wDense ${best.wDense} · rrf ${best.rrf} (개발 ${best.s.toFixed(3)})  그래프 최적 share ${g.graphShare} · seeds ${g.graphSeeds} (개발 ${g.s.toFixed(3)})`);
  }
}

if (ARGS.indexOf('--tune') >= 0) await tune();
else await report((ARGS.find(a => a.startsWith('--json=')) || '').slice(7) || null, ARGS.indexOf('--rewrite') >= 0);
