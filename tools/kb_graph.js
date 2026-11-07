/* 지식그래프 만들기 (kb_graph.js)

     node tools/kb_graph.js            자료/kb/ksa.db 의 node · edge 를 새로 채운다

   노드                                       엣지 (출발 → 도착)
     std    기준서 36                            contains     기준서 → 문단
     par    문단 3,054                           guidance     요구사항 → 그 적용지침 (원문의 「(문단 A5 참조)」 양쪽에서)
     con    개념 — 정의 절의 용어 + 채점 사전        refers       문단 → 문단 (본문의 「문단 12」 · 「감사기준서 315 문단 12」)
     item   기출 · GS 문항                        cites_std    문단 → 다른 기준서
     sol    해설 · 강평 파일                       std_refers   기준서 → 기준서 (문단 언급을 모은 것, weight = 횟수)
     iss    요약집 논점                           defines      문단 → 개념 (정의 절)
     scene  게임 장면 · 돌발 업무                   mentions     문단 · 문항 · 논점 · 카드 → 개념 (용어가 그대로 나온 곳)
     pt     게임 논점 (채점표 라벨)                 about        문항 · 장면 · 카드 → 기준서
     card   개념 카드                             cites        해설 → 문단 (인쇄된 문단 번호, weight = 횟수)
                                                has_point    장면 → 논점
                                                grounded_in  논점 → 문단 (검색으로 고른 후보, confidence 0~1)

   엣지마다 source 를 남긴다 — 원문 구조에서 뽑은 것(text) · 해설 인쇄 번호(solution) · 검색으로 고른 것(bm25 · hybrid) 을 구분한다.
   원문 · 기출 · 요약집이 들어 있어 DB 는 저장소에 없다 (자료/). 저장소에는 이 코드만 둔다.
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const core = require('./kb-core');

const ROOT = path.join(__dirname, '..');
const KB = core.load();
if (!KB || KB.source !== 'db') {
  console.log('DB 가 없습니다 — node tools/kb_db.js 를 먼저 실행하세요');
  process.exit(1);
}
KB.db.close();
const db = core.openDb(core.DB_FILE);
db.exec('PRAGMA foreign_keys = ON');
db.exec(core.GRAPH_DDL);

const { docs, byId, norm } = KB;
const nodes = new Map(), edges = new Map();
function node(id, type, label, attrs) {
  if (!nodes.has(id)) nodes.set(id, { id, type, label: String(label).slice(0, 160), attrs: attrs || {} });
  return id;
}
function edge(src, rel, dst, opt) {
  opt = opt || {};
  if (src === dst) return;
  const source = opt.source || 'text';
  const k = src + '\u0001' + rel + '\u0001' + dst + '\u0001' + source;
  const e = edges.get(k);
  if (e) { e.weight += opt.weight || 1; e.confidence = Math.max(e.confidence, opt.confidence == null ? 1 : opt.confidence); return; }
  edges.set(k, { src, rel, dst, weight: opt.weight || 1, source, confidence: opt.confidence == null ? 1 : opt.confidence });
}
const full = d => d.text + '\n' + d.items.join('\n');
const parId = id => 'par:' + id;

/* ── 1. 기준서 · 문단 ───────────────────────────── */
const stds = {};
docs.forEach(d => { (stds[d.std] = stds[d.std] || { title: d.title, n: 0 }).n++; });
Object.keys(stds).forEach(no => node('std:' + no, 'standard', no + ' ' + stds[no].title, { paragraphs: stds[no].n }));
docs.forEach(d => {
  node(parId(d.id), 'paragraph', d.id + ' ' + KB.plainHeading(d), { kind: d.kind, std: d.std });
  edge('std:' + d.std, 'contains', parId(d.id));
});

/* ── 2. 원문 구조 — 참조 ─────────────────────────── */
// 「A3-A6」 · 「12, 13」 · 「A5(a)」 를 번호 목록으로
function refList(s) {
  const out = [];
  String(s).replace(/\([a-z]{1,3}\)|\([ivx]+\)/g, '').split(/,|，|및|와|과|또는|그리고/).forEach(p => {
    const r = /(A?)(\d+)\s*[-–~]\s*A?(\d+)/.exec(p);
    if (r) { for (let i = +r[2]; i <= +r[3] && i - +r[2] < 60; i++) out.push(r[1] + i); return; }
    const n = /(A?)(\d+)/.exec(p);
    if (n) out.push(n[1] + n[2]);
  });
  return out;
}
let refTotal = 0, refHit = 0;
const unresolved = [];
docs.forEach(d => {
  const src = parId(d.id), text = full(d);
  // 요구사항 → 적용지침: 요구사항 글의 「(문단 A5 참조)」
  if (d.kind === '요구사항') {
    text.replace(/\(문단\s*(A[^)]*?)\s*참조\)/g, (_, list) => {
      refList(list).filter(n => n[0] === 'A').forEach(n => {
        refTotal++;
        const t = d.std + '-' + n;
        if (byId[t]) { refHit++; edge(src, 'guidance', parId(t), { source: 'requirement' }); }
        else unresolved.push(d.id + '→' + t);
      });
    });
  }
  // 적용지침 제목의 「(문단 12 참조)」 — 같은 연결을 반대쪽에서
  if (d.kind === '적용지침') {
    const h = /\(문단\s*([^)]*?)\s*참조\)/.exec(d.heading);
    if (h) refList(h[1]).filter(n => n[0] !== 'A').forEach(n => {
      refTotal++;
      const t = d.std + '-' + n;
      if (byId[t]) { refHit++; edge(parId(t), 'guidance', src, { source: 'heading' }); }
      else unresolved.push(d.id + '←' + t);
    });
  }
  // 본문의 문단 언급 — 「감사기준서 315 문단 12」 는 다른 기준서, 그냥 「문단 12」 는 같은 기준서. 「참조」 괄호는 위에서 다뤘다
  const body = text.replace(/\(문단[^)]*참조\)/g, ' ');
  const re = /(?:감사기준서\s*(\d{3,4})\s*(?:의\s*)?)?문단\s*((?:A?\d+(?:\([a-z]{1,3}\))*(?:\([ivx]+\))*\s*(?:[-–~]\s*A?\d+)?\s*(?:,|및|와|과|또는)?\s*)+)/g;
  let m;
  while ((m = re.exec(body))) {
    const std = m[1] || d.std;
    refList(m[2]).forEach(n => {
      refTotal++;
      const t = std + '-' + n;
      if (byId[t]) { refHit++; edge(src, 'refers', parId(t), { source: m[1] && m[1] !== d.std ? 'cross' : 'text' }); }
      else unresolved.push(d.id + '→' + t);
    });
  }
  // 다른 기준서 언급
  const seen = {};
  text.replace(/감사기준서\s*(\d{3,4})/g, (_, no) => {
    if (no === d.std || !stds[no]) return;
    edge(src, 'cites_std', 'std:' + no);
    if (!seen[no]) { seen[no] = 1; edge('std:' + d.std, 'std_refers', 'std:' + no); }
  });
});

/* ── 3. 개념 — 정의 절의 용어 + 채점 사전 ─────────────── */
const concepts = new Map();   // 정규화 이름 → { id, term, forms:Set, defs:[] }
function concept(term, from) {
  const k = norm(term);
  if (k.length < 2) return null;
  if (!concepts.has(k)) concepts.set(k, { id: 'con:' + term, term, forms: new Set([term]), defs: [], from: new Set() });
  const c = concepts.get(k);
  c.from.add(from);
  return c;
}
function defTerm(item) {
  const raw = String(item).trim();
  if (/^\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)|^[가-하]\.\s/.test(raw)) return null;   // 하위 항목은 정의가 아니다
  let t = raw.replace(/^(\([a-z]{1,2}\)|·|-)\s*/, '');
  let head;
  const q = /^[“"]([^”"]{2,50})[”"]\s*(?:라는 용어는|이라는 용어는|는|은)/.exec(t);
  const ran = /사용(?:되는|하는)\s+(\S{2,25}?)(?:이)?란\s/.exec(t);
  // 「용어- 정의」 · 「용어 – 정의」 · 「용어 –정의」 — 줄표 앞이 짧은 명사구일 때만
  const dash = /^([^.。]{2,50}?)\s*[–-]\s*(?=[가-힣(“"A-Za-z])/.exec(t);
  if (q) head = q[1];
  else if (ran) head = ran[1];
  else if (dash && /[가-힣)]$/.test(dash[1].trim())) head = dash[1];
  else return null;
  const aliases = [];
  head = head.replace(/\((?:또는|이하)\s*([^)]+)\)/g, (_, a) => { aliases.push(a.replace(/[“”"'‘’]|이라 한다|라 한다/g, '').trim()); return ' '; });
  head = head.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  if (head.length < 2 || head.length > 50 || /다$|다\.$/.test(head)) return null;
  return { term: head, aliases: aliases.filter(a => a.length >= 2 && a.length <= 30) };
}
// 「X의 정의」 제목의 적용지침 — 그 개념을 풀어 설명하는 문단
docs.forEach(d => {
  const h = /^(.+?)의 정의(?:\s|$|\()/.exec(d.heading);
  if (!h || /^용어/.test(h[1])) return;
  const c = concept(h[1].trim(), 'definition');
  if (c.defs.indexOf(d.id) < 0) c.defs.push(d.id);
});
docs.filter(d => /^용어의 정의/.test(d.heading)).forEach(d => {
  (d.items.length ? d.items : [d.text]).forEach(item => {
    const t = defTerm(item);
    if (!t) return;
    const c = concept(t.term, 'definition');
    t.aliases.forEach(a => c.forms.add(a));
    // 「(적절한 경우 지배기구를 포함)」 같은 괄호를 뺀 모양도 같은 개념
    const bare = t.term.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (bare.length >= 2 && bare !== t.term) c.forms.add(bare);
    if (c.defs.indexOf(d.id) < 0) c.defs.push(d.id);
  });
});
const defConcepts = [...concepts.values()].length;

// 게임 데이터 — validate.js 와 같은 순서로 읽는다
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js', 'data/haneul.js', 'data/daon.js', 'data/haesol.js',
 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

const CORPUS_N = docs.map(d => norm(d.heading + full(d)));
const inCorpus = s => { const k = norm(s); return k.length >= 3 && CORPUS_N.some(t => t.indexOf(k) >= 0); };
Object.keys(ctx.LEXICON).forEach(key => {
  const forms = [key].concat(ctx.LEXICON[key]).filter(f => /[가-힣]/.test(f) && inCorpus(f));
  if (!forms.length) return;
  // 이미 정의 절에 있는 개념이면 그 개념의 다른 표기로 붙인다
  const hit = forms.map(f => concepts.get(norm(f))).find(Boolean);
  const c = hit || concept(forms[0], 'lexicon');
  c.from.add('lexicon');
  forms.forEach(f => c.forms.add(f));
});

// 개념이 나온 곳 — 정규화한 글에 표기가 그대로 들어 있으면. 세 글자 미만 표기는 뜻이 넓어 쓰지 않는다
const conList = [...concepts.values()];
const surfaces = c => [...c.forms].map(norm).filter(f => f.length >= 3);
const mentionDf = new Map();
conList.forEach(c => {
  const forms = surfaces(c);
  if (!forms.length) return;
  let df = 0;
  docs.forEach((d, i) => {
    if (forms.some(f => CORPUS_N[i].indexOf(f) >= 0)) { df++; edge(parId(d.id), 'mentions', c.id); }
  });
  mentionDf.set(c.id, df);
});
conList.forEach(c => {
  node(c.id, 'concept', c.term, { forms: [...c.forms], from: [...c.from], df: mentionDf.get(c.id) || 0 });
  c.defs.forEach(id => edge(parId(id), 'defines', c.id));
});
function mentionsIn(src, text) {
  const t = norm(text);
  conList.forEach(c => { if (surfaces(c).some(f => t.indexOf(f) >= 0)) edge(src, 'mentions', c.id); });
}
const stdNums = s => (String(s || '').match(/\b\d{3,4}\b/g) || []).filter(n => stds[n]);

/* ── 4. 기출 · GS 문항, 해설 인용, 요약집 논점 (로컬 자료) ─── */
const jsonl = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const items = jsonl(path.join(ROOT, '자료', 'db', 'items.jsonl'));
items.forEach(it => {
  const id = node('item:' + it.id, 'exam_item', it.src + ' · ' + it.topic, { set: it.set, area: it.area, form: it.form });
  (it.ksa || []).forEach(k => { if (stds[k]) edge(id, 'about', 'std:' + k); });
  mentionsIn(id, [it.topic, it.ask, (it.points || []).join(' ')].join(' '));
});
const cited = core.citations(byId);
cited.forEach(c => {
  const id = node('sol:' + c.file, 'solution', c.file, {});
  edge(id, 'cites', parId(c.id), { source: 'solution' });
});
const issues = jsonl(path.join(ROOT, '자료', 'db', 'issues.jsonl'));
issues.forEach(x => {
  const id = node('iss:' + x.id, 'issue', x.issue, { freq: x.freq, kind: x.kind, chapter: x.chapter });
  mentionsIn(id, x.issue);
});

/* ── 5. 게임 — 장면 · 돌발 · 논점 · 개념 카드 ─────────────── */
const points = [];   // 근거 문단을 고를 논점
function pointsOf(p) {
  const out = [];
  const add = (label, why) => { if (label) out.push({ label: String(label), why: why || '' }); };
  if (p.rubric && p.rubric.must) p.rubric.must.forEach(m => add(m.label, m.why));
  if (p.type === 'sort' && Array.isArray(p.items)) p.items.forEach(x => add(x.label, x.why));
  if (p.type === 'choice') {
    if (p.label) add(p.label, p.why);
    (p.options || []).filter(o => o.ok).forEach(o => add(o.label, o.why));
  }
  if (p.type === 'cloze' && Array.isArray(p.labels)) p.labels.forEach(x => add(x.label, x.why));
  return out;
}
function addScene(sc, company) {
  const sid = 'scene:' + sc.id;
  const vids = (sc.variants || [{ id: null }]).map(v => v.id);
  const stdList = new Set(stdNums((sc.standards || []).join(' ') + ' ' + (sc.ref || '')));
  node(sid, 'scene', (company ? company + ' ' : '') + sc.id + ' ' + (sc.chapter || ''), { company: company || '돌발', standards: [...stdList] });
  stdList.forEach(n => edge(sid, 'about', 'std:' + n));
  vids.forEach(vid => {
    let it;
    try { it = ctx.SEASON.resolve(sc, ctx.SEASON.create({ seed: 7 }), vid); } catch (e) { return; }
    (it.parts || []).forEach(p => {
      pointsOf(p).forEach(pt => {
        const id = node('pt:' + sc.id + '#' + pt.label, 'point', pt.label, { scene: sc.id, type: p.type });
        edge(sid, 'has_point', id);
        mentionsIn(id, pt.label + ' ' + pt.why);
        if (!points.some(x => x.id === id)) points.push({ id, sid: sc.id, stds: [...stdList], query: [p.ask || '', pt.label, pt.why].join(' ') });
      });
    });
  });
}
ctx.SEASONS.list().forEach(b => {
  ctx.SEASONS.use(b.id);
  (ctx.SCENES || []).forEach(sc => addScene(sc, ctx.SEASONS.current().name));
});
ctx.SEASONS.use('seorin');
(ctx.CASES || []).forEach(sc => addScene(sc, null));
(ctx.DECK || []).forEach(c => {
  const id = node('card:' + c.id, 'card', c.q, { tag: c.tag });
  stdNums(c.std).forEach(n => edge(id, 'about', 'std:' + n));
  mentionsIn(id, c.q + ' ' + (c.a || []).join(' '));
});

/* 논점 → 근거 문단 후보 — 장면의 기준서 안에서 먼저, 없으면 전체에서. 1위 점수 대비 비율을 confidence 로 둔다 */
points.forEach(p => {
  let cand = [];
  p.stds.forEach(n => { cand = cand.concat(KB.search(p.query, { k: 3, std: n })); });
  if (!cand.length) cand = KB.search(p.query, { k: 3 });
  cand.sort((a, b) => b[0] - a[0]);
  const top = cand.slice(0, 3), best = top.length ? top[0][0] : 1;
  top.forEach(([score, d]) => edge(p.id, 'grounded_in', parId(d.id), { source: 'bm25', weight: +score.toFixed(2), confidence: +(score / best).toFixed(3) }));
});

/* ── 쓰기 ───────────────────────────────────── */
db.exec('BEGIN');
db.exec('DELETE FROM edge; DELETE FROM node;');
const insN = db.prepare('INSERT INTO node (id, type, label, attrs) VALUES (?, ?, ?, ?)');
nodes.forEach(n => insN.run(n.id, n.type, n.label, JSON.stringify(n.attrs)));
const insE = db.prepare('INSERT INTO edge (src, rel, dst, weight, source, confidence) VALUES (?, ?, ?, ?, ?, ?)');
let dangling = 0;
edges.forEach(e => {
  if (!nodes.has(e.src) || !nodes.has(e.dst)) { dangling++; return; }
  insE.run(e.src, e.rel, e.dst, e.weight, e.source, e.confidence);
});
db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('graph_built_at', ?)").run(new Date().toISOString());
db.exec('COMMIT');
db.exec(`PRAGMA user_version = ${core.SCHEMA_VERSION}`);

/* ── 보고 ───────────────────────────────────── */
const q = sql => db.prepare(sql).all();
console.log('■ 노드');
q('SELECT type, count(*) n FROM node GROUP BY type ORDER BY n DESC').forEach(r => console.log(`  ${r.type.padEnd(11)} ${String(r.n).padStart(6)}`));
console.log('■ 엣지');
q('SELECT rel, source, count(*) n FROM edge GROUP BY rel, source ORDER BY rel, n DESC').forEach(r => console.log(`  ${r.rel.padEnd(12)} ${r.source.padEnd(12)} ${String(r.n).padStart(6)}`));
const nN = q('SELECT count(*) n FROM node')[0].n, nE = q('SELECT count(*) n FROM edge')[0].n;
console.log(`■ 합계 — 노드 ${nN} · 엣지 ${nE}`);
console.log(`■ 점검 — 원문 참조 ${refTotal}건 중 문단을 찾은 것 ${refHit}건 (${(100 * refHit / Math.max(refTotal, 1)).toFixed(1)}%) · 못 찾음 예: ${unresolved.slice(0, 4).join(' ')}`);
console.log(`         개념 ${conList.length}개 (정의 절 ${defConcepts} · 사전에서 더함 ${conList.length - defConcepts}) · 외래키 위반 ${q('PRAGMA foreign_key_check').length} · 버린 엣지 ${dangling}`);
const lonePar = q("SELECT count(*) n FROM node WHERE type = 'paragraph' AND id NOT IN (SELECT src FROM edge WHERE rel <> 'contains' UNION SELECT dst FROM edge WHERE rel <> 'contains')")[0].n;
console.log(`         기준서 안에만 매달린 문단(다른 연결 없음) ${lonePar} · 근거 후보가 없는 논점 ${points.filter(p => !q("SELECT 1 FROM edge WHERE src = '" + p.id.replace(/'/g, "''") + "' AND rel = 'grounded_in' LIMIT 1").length).length} / ${points.length}`);
db.close();
