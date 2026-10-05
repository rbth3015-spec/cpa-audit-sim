/* 채점 실험실 (gradelab.js)
   ------------------------------------------------------------
     node tools/gradelab.js            세 회사 + 돌발 업무 전부
     node tools/gradelab.js raon       한 회사만
     node tools/gradelab.js --bad      밴드를 벗어난 칸만
   node tools/gradelab.js --why=s3③  한 칸의 네 답안을 논점별로 펼쳐 본다

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
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js', 'data/haneul.js', 'data/daon.js', 'data/haesol.js',
                 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

const { AE, SEASON, SEASONS, TERM_TREE, CASES } = ctx;
const only = process.argv.slice(2).filter(a => !a.startsWith('--'))[0] || null;
const badOnly = process.argv.includes('--bad');
// --why=s3③ — 그 칸의 네 답안이 논점마다 어떻게 채점됐는지 펼친다
const WHY = ((process.argv.find(a => a.startsWith('--why=')) || '').split('=')[1]) || null;

const BAND = {
  model: [80, 100, '모범답안'],
  blur: [45, 92, '용어 뭉뚱그림'],      // 정답 표현을 상위어로 ("내부통제" → "통제")
  drop: [0, 80, '용어 빠뜨림'],        // 상위어가 없어 정답 표현을 아예 뺀 답 — 그 논점만큼 떨어져야 한다
  aim: [0, 50, '방향만'],
  off: [0, 20, '딴 문항']
};

/* 모범답안을 깎아 세 가지 답안을 만든다
   뭉뚱그림 — 배점이 가장 큰 논점 하나를 골라, 그 논점의 정답 표현을 답안에서 전부 뭉뚱그린다.
     용어 계층(TERM_TREE)에 있으면 상위어로 ("내부통제" → "통제"), 없으면 지운다.
     정답 표현 하나만 지우고 다른 정답 표현이 남으면 여전히 정확한 답이라 뭉뚱그림이 아니다. */
function blur(text, must) {
  const alts = m => [].concat(m.kw || []).filter(k => k && text.includes(k)).sort((a, b) => b.length - a.length);
  const pick = must.filter(m => alts(m).length).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  if (!pick) return { text, how: null };
  let t = text, how = 'drop';
  alts(pick).forEach(k => {
    const up = (TERM_TREE || {})[k];
    if (up && up[0]) how = 'hyper';
    t = t.split(k).join(up && up[0] ? up[0] : '');
  });
  return { text: t.replace(/\s{2,}/g, ' '), how };
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
  const b = blur(model, must);
  // 뭉뚱그릴 용어가 없으면 그 띠는 잴 수 없다 — 건너뛴다
  const ans = { model: model, blur: b.how === 'hyper' ? b.text : '', drop: b.how === 'drop' ? b.text : '',
                aim: aim(model, must), off: otherModel || '' };
  const out = { where, ask: (part.ask || '').slice(0, 30), score: {}, bad: [], text: ans };
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
    if (WHY && where.endsWith(WHY)) {
      console.log(`\n  [${BAND[kind][2]} ${pct}%] ${text}`);
      ((g.res && g.res.must) || []).forEach(r => console.log(`     ${(r.tier || (r.hit ? 'full' : '—')).padEnd(5)} ${r.got}/${r.score}  ${r.label}${r.matched ? '  ← ' + r.matched : ''}${r.note ? '  (' + r.note + ')' : ''}`));
      ((g.res && g.res.trap) || []).filter(r => r.got).forEach(r => console.log(`     함정 ${r.got}  ${r.label}`));
      ((g.res && g.res.flags) || []).forEach(f => console.log('     · ' + f));
    }
    const [lo, hi] = BAND[kind];
    if (pct < lo || pct > hi) out.bad.push(`${BAND[kind][2]} ${pct}% (${lo}~${hi})`);
  }
  return out;
}

/* 회사 하나를 훑는다 — 게임과 같은 길(SEASON.resolve)로 문항을 풀고, 판본마다 따로 잰다 */
function sweep(label, scenes) {
  const parts = [];
  scenes.forEach(sc => {
    const vids = (sc.variants || [{ id: null }]).map(v => v.id);
    vids.forEach(vid => {
      let it;
      try { it = SEASON.resolve(sc, SEASON.create({ seed: 7 }), vid); } catch (e) { return; }
      (it.parts || []).forEach((p, i) => {
        if (p.type && p.type !== 'write' && p.type !== 'judge') return;
        parts.push({ p, sid: sc.id, where: `${sc.id}${vid && vids.length > 1 ? '/' + vid : ''}${'①②③④'[i] || i}` });
      });
    });
  });
  const rows = [];
  parts.forEach((it, i) => {
    // 딴 문항 — 다른 장면의 모범답안 (같은 장면의 다른 판본은 같은 물음이라 빼고 고른다)
    let other = null;
    for (let k = 3; k < parts.length + 3 && !other; k++) { const o = parts[(i + k) % parts.length]; if (o.sid !== it.sid) other = o; }
    const r = run(it.p, other && typeof other.p.model === 'string' ? other.p.model : null, `${label} ${it.where}`);
    if (r) rows.push(r);
  });
  return rows;
}

let rows = [];
(only ? [only] : SEASONS.list().map(b => b.id)).forEach(id => {
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
  const f = k => r.score[k] == null ? '—' : r.score[k] + '%';
  console.log(`      모범 ${f('model')}  뭉뚱 ${f('blur')}  빠뜨림 ${f('drop')}  방향 ${f('aim')}  딴것 ${f('off')}   ← ${r.bad.join(' · ')}`);
});
/* 실패 판정 — 정답을 쓰고도 깎이거나(모범답안 미달), 핵심 없이 점수를 받는(방향만 · 딴 문항이 띠 위) 칸.
   뭉뚱그림 · 빠뜨림 띠는 문항마다 논점 배점이 달라 경고로만 본다. */
const over = r => r.bad.some(b => /^(방향만|딴 문항)/.test(b) && +b.match(/(\d+)%/)[1] > BAND[b.startsWith('방향만') ? 'aim' : 'off'][1]);
const under = r => r.bad.some(b => b.startsWith('모범답안'));
const strict = rows.filter(r => over(r) || under(r));
console.log(`  이 중 고칠 칸 ${strict.length} (모범답안 미달 · 방향만 / 딴 문항에 점수가 새는 칸)`);
process.exitCode = strict.length > rows.length * 0.05 ? 1 : 0;
