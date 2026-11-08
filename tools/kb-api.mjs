/* 지식베이스 읽기 API — 그래프 탐색기(kb.html)용 (kb-api.mjs)
   채점 서버(tools/serve.mjs)가 /api/kb/* 로 연결한다. 같은 출처 · 이 PC 에서만 — 원문이 밖으로 나가지 않는다.

     GET /api/kb/stats                    규모 · 측정 요약
     GET /api/kb/search?q=…&mode=graph    근거 문단 찾기 (tools/kb-retrieve.mjs)
     GET /api/kb/par?id=505-8             문단 원문
     GET /api/kb/node?id=par:505-8        노드와 이웃 (관계 · 출처 · 신뢰도)
     GET /api/kb/coverage                 기준서별 — 기출 출제 · 해설 인용 · 게임 논점 · 카드
*/
import { retrieve, kb, hasVectors, DEFAULTS } from './kb-retrieve.mjs';

const one = (sql, ...a) => kb().db.prepare(sql).get(...a);
const all = (sql, ...a) => kb().db.prepare(sql).all(...a);

function par(id) {
  const d = kb().byId[id];
  if (!d) return null;
  return { id: d.id, std: d.std, title: d.title, kind: d.kind, heading: kb().plainHeading(d), text: d.text, items: d.items };
}

function node(id) {
  const n = one('SELECT id, type, label, attrs FROM node WHERE id = ?', id);
  if (!n) return null;
  // 논점 → 문단은 검증된 것만 보인다 (검색 후보는 그래프에 남지만 탐색기에는 내지 않는다)
  const nb = (sql) => all(sql, id).filter(r => r.rel !== 'grounded_in' || r.source === 'verified').map(r => ({ id: r.other, label: r.label, type: r.type, rel: r.rel, source: r.source, weight: r.weight, confidence: r.confidence }));
  return {
    node: Object.assign(n, { attrs: JSON.parse(n.attrs) }),
    out: nb('SELECT e.dst other, n.label, n.type, e.rel, e.source, e.weight, e.confidence FROM edge e JOIN node n ON n.id = e.dst WHERE e.src = ? ORDER BY e.rel, e.confidence DESC, e.weight DESC LIMIT 400'),
    in: nb('SELECT e.src other, n.label, n.type, e.rel, e.source, e.weight, e.confidence FROM edge e JOIN node n ON n.id = e.src WHERE e.dst = ? ORDER BY e.rel, e.confidence DESC, e.weight DESC LIMIT 400')
  };
}

function coverage() {
  const rows = all(`
    SELECT s.id, s.label,
      json_extract(s.attrs, '$.paragraphs') AS paragraphs,
      (SELECT count(*) FROM edge e WHERE e.dst = s.id AND e.rel = 'about' AND e.src LIKE 'item:%') AS exam,
      (SELECT count(*) FROM edge e JOIN node p ON p.id = e.dst WHERE e.rel = 'cites' AND json_extract(p.attrs, '$.std') = substr(s.id, 5)) AS cited,
      (SELECT count(DISTINCT e.src) FROM edge e JOIN node p ON p.id = e.dst WHERE e.rel = 'grounded_in' AND e.source = 'verified' AND json_extract(p.attrs, '$.std') = substr(s.id, 5)) AS points,
      (SELECT count(*) FROM edge e WHERE e.dst = s.id AND e.rel = 'about' AND e.src LIKE 'scene:%') AS scenes,
      (SELECT count(*) FROM edge e WHERE e.dst = s.id AND e.rel = 'about' AND e.src LIKE 'card:%') AS cards
    FROM node s WHERE s.type = 'standard' ORDER BY CAST(substr(s.id, 5) AS INTEGER)`);
  return rows;
}

export async function kbApi(url) {
  const u = new URL(url, 'http://x'), p = u.pathname.replace(/^\/api\/kb\/?/, ''), q = k => u.searchParams.get(k) || '';
  try { kb(); } catch (e) { return { code: 503, body: { ok: false, error: '지식베이스 없음 — node tools/kb_db.js' } }; }
  if (p === 'stats') {
    const types = all('SELECT type, count(*) n FROM node GROUP BY type ORDER BY n DESC');
    const rels = all('SELECT rel, count(*) n FROM edge GROUP BY rel ORDER BY n DESC');
    const meta = {};
    all('SELECT key, value FROM meta').forEach(r => { meta[r.key] = r.value; });
    return { code: 200, body: { ok: true, meta, types, rels, vectors: hasVectors(DEFAULTS.model), model: DEFAULTS.model } };
  }
  if (p === 'search') {
    const text = q('q').slice(0, 300);
    if (!text.trim()) return { code: 200, body: { ok: true, hits: [] } };
    const mode = ['route', 'bm25', 'dense', 'hybrid', 'graph'].indexOf(q('mode')) >= 0 ? q('mode') : 'route';
    const stds = (q('std').match(/\d{3,4}/g) || []);
    let hits;
    try { hits = await retrieve(text, { k: Math.min(20, +q('k') || 10), mode, stds: stds.length ? stds : null }); }
    catch (e) { hits = await retrieve(text, { k: Math.min(20, +q('k') || 10), mode: 'bm25', stds: stds.length ? stds : null }); }
    return { code: 200, body: { ok: true, mode, hits: hits.map(h => Object.assign(par(h.id), { score: h.score, why: h.why })) } };
  }
  if (p === 'par') {
    const d = par(q('id'));
    return d ? { code: 200, body: { ok: true, par: d } } : { code: 404, body: { ok: false } };
  }
  if (p === 'node') {
    const n = node(q('id'));
    return n ? { code: 200, body: Object.assign({ ok: true }, n) } : { code: 404, body: { ok: false } };
  }
  if (p === 'coverage') return { code: 200, body: { ok: true, rows: coverage() } };
  return { code: 404, body: { ok: false } };
}
