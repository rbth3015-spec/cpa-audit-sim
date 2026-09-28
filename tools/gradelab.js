/* 채점 실험실 (gradelab.js)
   ------------------------------------------------------------
     node tools/gradelab.js            세 회사 + 돌발 업무 전부
     node tools/gradelab.js raon       한 회사만
     node tools/gradelab.js --bad      밴드를 벗어난 칸만

   모범답안 하나에서 네 가지 답안을 자동으로 만들어 점수가 어느 띠에 떨어지는지 본다.
     ① 모범답안 그대로            80 ~ 100   정확히 쓴 답
     ② 용어를 뭉뚱그린 답          45 ~  85   "내부통제" 를 "통제" 라고 쓴 답
     ③ 방향만 맞는 답             15 ~  50   핵심 용어는 없고 흐름만 맞는 답
     ④ 다른 문항의 모범답안         0 ~  20   핀트가 어긋난 답
   ②③ 띠가 비어 있으면 "같은 뜻인데 0점" 이 나는 것이고,
   너무 높으면 점수를 퍼주는 것이다. 둘 다 여기서 잡는다.
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js',
                 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

const { AE, SEASON, SEASONS, TERM_TREE, CASES } = ctx;
const only = process.argv.slice(2).filter(a => !a.startsWith('--'))[0] || null;
const badOnly = process.argv.includes('--bad');

const BAND = {
  model: [80, 100, '모범답안'],
  blur: [45, 85, '용어 뭉뚱그림'],
  aim: [15, 50, '방향만'],
  off: [0, 20, '딴 문항']
};

/* 모범답안을 깎아 세 가지 답안을 만든다 */
function blur(text, must) {
  let t = text;
  // 채점표가 실제로 보는 용어만 뭉뚱그린다 — 안 보는 용어를 바꾸면 점수가 안 변해 의미가 없다
  const watched = new Set();
  must.forEach(m => [].concat(m.kw || []).forEach(k => watched.add(k)));
  for (const exact of Object.keys(TERM_TREE || {})) {
    if (watched.has(exact) && t.includes(exact)) t = t.split(exact).join(TERM_TREE[exact][0]);
  }
  if (t === text) {                       // 계층에 없는 용어면 필수어 하나를 지운다
    const kw = (must[0] && [].concat(must[0].kw)[0]) || '';
    if (kw && t.includes(kw)) t = t.split(kw).join('');
  }
  return t;
}
function aim(text, must) {
  let t = text;
  // 채점어를 통째로 지우면 조사 하나 차이로 살아남는다 — 낱말 단위로 지운다
  must.forEach(m => [].concat(m.kw || []).concat(m.half || []).forEach(k => {
    String(k || '').split(/[\s·]+/).forEach(w => {
      const bare = w.replace(/(의|을|를|이|가|은|는|에|와|과|로|으로)$/, '');
      [w, bare].forEach(x => { if (x && x.length >= 2 && t.includes(x)) t = t.split(x).join(''); });
    });
  }));
  return t.replace(/\s{2,}/g, ' ').trim();
}

/* 한 칸을 네 가지 답안으로 채점한다 */
function run(part, otherModel, where) {
  const model = typeof part.model === 'string' ? part.model : null;
  const must = (part.rubric && part.rubric.must) || [];
  if (!model || !must.length) return null;
  const blurred = blur(model, must);
  // 뭉뚱그릴 용어가 없으면 그 띠는 잴 수 없다 — 건너뛴다
  const ans = { model: model, blur: blurred === model ? '' : blurred, aim: aim(model, must), off: otherModel || '' };
  const out = { where, ask: (part.ask || '').slice(0, 30), score: {}, bad: [] };
  for (const kind of Object.keys(BAND)) {
    const text = ans[kind];
    if (!text) continue;
    const g = AE.gradeAny(Object.assign({}, part, { type: part.type === 'judge' ? 'judge' : 'write' }),
                          part.type === 'judge'
                            ? { text, pick: part.verdict ? part.verdict.answer : null }
                            : { text });
    // 판단 버튼 점수는 빼고 '쓴 내용' 만 잰다 — O·X 는 찍어서도 맞출 수 있다
    const pct = g.res && g.res.max ? Math.round(g.res.total / g.res.max * 100) : g.percent;
    out.score[kind] = pct;
    const [lo, hi] = BAND[kind];
    if (pct < lo || pct > hi) out.bad.push(`${BAND[kind][2]} ${pct}% (${lo}~${hi})`);
  }
  return out;
}

/* 회사 하나를 훑는다 */
function sweep(label, scenes) {
  const parts = [];
  scenes.forEach(sc => {
    const list = typeof sc.parts === 'function' ? sc.parts({ id: '-' }, SEASON.create({ seed: 7 })) : (sc.parts || []);
    list.forEach((p, i) => {
      if (p.type && p.type !== 'write' && p.type !== 'judge') return;
      parts.push({ p, where: `${sc.id}${'①②③④'[i] || i}` });
    });
  });
  const rows = [];
  parts.forEach((it, i) => {
    const other = parts[(i + 3) % parts.length];
    const r = run(it.p, other && typeof other.p.model === 'string' ? other.p.model : null, `${label} ${it.where}`);
    if (r) rows.push(r);
  });
  return rows;
}

let rows = [];
(only ? [only] : ['seorin', 'raon', 'gureum']).forEach(id => {
  SEASONS.use(id);
  rows = rows.concat(sweep(SEASONS.current().name, ctx.SCENES));
});
if (!only) { SEASONS.use('seorin'); rows = rows.concat(sweep('돌발 업무', CASES)); }

/* 보고 */
const kinds = Object.keys(BAND);
const avg = k => {
  const v = rows.map(r => r.score[k]).filter(x => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
};
console.log(`\n■ 채점 실험실 — 서술·판단 칸 ${rows.length}개\n`);
kinds.forEach(k => {
  const [lo, hi, name] = BAND[k];
  const v = rows.map(r => r.score[k]).filter(x => x != null);
  const out = v.filter(x => x < lo || x > hi).length;
  const bar = '█'.repeat(Math.round(avg(k) / 4));
  console.log(`  ${name.padEnd(8)} 평균 ${String(avg(k)).padStart(3)}%  ${bar}  밴드 ${lo}~${hi} 벗어남 ${out}개`);
});

const bad = rows.filter(r => r.bad.length);
console.log(`\n  밴드를 벗어난 칸 ${bad.length} / ${rows.length}`);
(badOnly ? bad : bad.slice(0, 25)).forEach(r => {
  console.log(`   ${r.where.padEnd(18)} ${r.ask}`);
  console.log(`      모범 ${r.score.model}%  뭉뚱 ${r.score.blur}%  방향 ${r.score.aim}%  딴것 ${r.score.off}%   ← ${r.bad.join(' · ')}`);
});
/* 실패 판정은 결정적인 두 띠로만 — '방향만' 이 너무 높거나 '딴 문항' 에 점수가 가면 퍼주는 것이다.
   모범답안·뭉뚱그림 띠는 문항 쪽 사정(모범답안이 채점어를 덜 담음)이라 경고로만 본다. */
const strict = rows.filter(r => r.bad.some(b => b.startsWith('방향만') || b.startsWith('딴 문항')));
console.log(`  이 중 퍼주기로 볼 칸 ${strict.length} (방향만 · 딴 문항 띠)`);
process.exitCode = strict.length > rows.length * 0.15 ? 1 : 0;
