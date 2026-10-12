/* AI 연동 채점 — 요청 · 판정 변환 검사 (aigrade-check.js)
   실행:  node tools/aigrade-check.js
   실제로 Claude 를 부르지 않는다. 게임의 서술 · 판단 칸 전부에 대해
     1. 채점 요청이 만들어지는가 (논점 · 감점 · 가점에 id 가 빠짐없이 붙는가)
     2. 「전부 인정」 판정을 넣으면 80점 이상, 「전부 불인정」이면 20점 이하인가
        (점수 셈은 js/engine.js — 판정만 바깥에서 받는다는 계약이 지켜지는지)
     3. 판정이 빠진 논점은 키워드 채점으로 남는가, 엉뚱한 응답은 거절되는가 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const store = {};
const ctx = { console, Math, JSON, Date, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js', 'data/haneul.js', 'data/daon.js', 'data/haesol.js',
                 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js', 'js/aigrade.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { AE, SEASON, SEASONS, AIGRADE, CASES } = ctx;

let bad = 0, n = 0, nVerdict = 0;
const fail = m => { console.log('  ✕ ' + m); bad++; };

function parts(scenes) {
  const out = [];
  scenes.forEach(sc => (sc.variants || [{ id: null }]).forEach(v => {
    let it;
    try { it = SEASON.resolve(sc, SEASON.create({ seed: 7 }), v.id); } catch (e) { return; }
    it.parts.forEach(p => { if (p.type === 'write' || p.type === 'judge') out.push({ p, it, where: sc.id + (v.id ? '/' + v.id : '') + p.key }); });
  }));
  return out;
}
// 가짜 응답 — 받은 id 를 모두 한 가지 판정으로
function canned(req, verdict, trapHit) {
  return {
    must: Object.keys(req.ids.must).map(id => ({ id, verdict, reason: verdict === 'full' ? '' : '핵심 용어 빠짐' })),
    trap: Object.keys(req.ids.trap).map(id => ({ id, hit: !!trapHit })),
    bonus: Object.keys(req.ids.bonus).map(id => ({ id, hit: false })),
    comment: '검사'
  };
}

function sweep(label, scenes) {
  parts(scenes).forEach(({ p, it, where }) => {
    n++;
    const tag = `${label} ${where}`;
    // 답안은 일부러 채점어가 하나도 없는 글 — 판정만으로 점수가 갈려야 한다
    const ans = { text: '감사인은 상황에 맞게 필요한 일을 빠짐없이 챙겨서 한다.', pick: p.verdict ? p.verdict.answer : null };
    const req = AIGRADE.build(p, ans, { situation: it.situation });
    const R = p.rubric;
    if (Object.keys(req.ids.must).length !== R.must.length) fail(`${tag} 논점 id 수가 다르다`);
    if (new Set(Object.values(req.ids.must)).size !== R.must.length) fail(`${tag} 논점 라벨이 겹친다 — 판정을 되돌릴 수 없다`);
    R.must.forEach(m => { if (req.user.indexOf(m.label) < 0) fail(`${tag} 요청에 논점이 없다: ${m.label}`); });
    if (req.user.indexOf(ans.text) < 0) fail(`${tag} 요청에 답안이 없다`);

    const base = AE.gradeAny(p, ans);
    const full = AE.gradeAny(p, ans, { ai: AIGRADE.toVerdicts(canned(req, 'full'), req.ids).ai });
    const none = AE.gradeAny(p, ans, { ai: AIGRADE.toVerdicts(canned(req, 'none', true), req.ids).ai });
    const half = AE.gradeAny(p, ans, { ai: AIGRADE.toVerdicts(canned(req, 'half'), req.ids).ai });
    // 판단 버튼 · 판단 문장 점수는 빼고 서술 본문만 잰다 (tools/gradelab.js 와 같은 자)
    const body = g => (g.res && g.res.max ? Math.round(g.res.total / g.res.max * 100) : g.percent);
    if (body(full) < 80) fail(`${tag} 전부 인정인데 ${body(full)}점`);
    if (!full.res.must.every(m => m.hit)) fail(`${tag} 전부 인정인데 명중이 아닌 논점이 있다`);
    if (body(none) > 20) fail(`${tag} 전부 불인정인데 ${body(none)}점`);
    if (body(half) > 60 || half.res.must.some(m => m.hit)) fail(`${tag} 전부 절반인데 ${body(half)}점 (명중으로 치면 안 된다)`);
    if (body(base) > 30) fail(`${tag} 검사용 답안이 기본 채점에서 ${body(base)}점 — 검사 답안을 바꿀 것`);
    // 판단 문장을 답안에 써야 하는 서술 칸 — 읽어 온 판단 방향이 그대로 쓰인다 (맞으면 판단 점수, 반대면 근거 0점, 없으면 판단 0점)
    if (p.type === 'write' && p.verdict) {
      nVerdict++;
      if (!req.needVerdict || req.user.indexOf('[판단 문장]') < 0) fail(`${tag} 판단 문장을 묻지 않는다`);
      const want = p.verdict.answer, other = want === 'yes' ? 'no' : 'yes';
      const withV = k => { const c = canned(req, 'full'); c.verdict = k; return AE.gradeAny(p, ans, { ai: AIGRADE.toVerdicts(c, req.ids, req.needVerdict).ai }); };
      const right = withV(want), wrong = withV(other), absent = withV('none');
      if (!right.verdict.correct || right.percent < 80) fail(`${tag} 판단이 맞는데 ${right.percent}점`);
      if (wrong.verdict.correct || wrong.total > 0) fail(`${tag} 판단이 반대인데 ${wrong.total}점`);
      if (absent.verdict.correct || absent.verdictGot) fail(`${tag} 판단 문장이 없는데 판단 점수를 받았다`);
    } else if (req.needVerdict) fail(`${tag} 판단 단추 문항인데 판단 문장을 묻는다`);
    // 판정이 하나 빠지면 그 논점만 키워드 채점으로 남는다
    if (R.must.length > 1) {
      const c = canned(req, 'full'); c.must.pop();
      const part = AE.gradeAny(p, ans, { ai: AIGRADE.toVerdicts(c, req.ids).ai });
      const last = part.res.must[part.res.must.length - 1];
      if (last.ext || last.hit) fail(`${tag} 판정이 없는 논점이 인정됐다`);
    }
  });
}

console.log('■ AI 연동 채점 — 요청 · 판정 변환');
SEASONS.list().map(b => b.id).forEach(id => { SEASONS.use(id); sweep(SEASONS.current().name, ctx.SCENES); });
SEASONS.use('seorin');
sweep('돌발 업무', CASES);

// 엉뚱한 응답은 받지 않는다
{
  const p = parts(ctx.SCENES)[0].p, req = AIGRADE.build(p, { text: '답' }, {});
  const rejects = x => { try { AIGRADE.toVerdicts(x, req.ids); return false; } catch (e) { return !!e.label; } };
  if (!rejects(null)) fail('빈 응답을 받았다');
  if (!rejects({ must: [{ id: 'zz', verdict: 'full', reason: '' }], trap: [], bonus: [], comment: '' })) fail('모르는 id 뿐인 응답을 받았다');
  if (!rejects({ must: [{ id: 'm1', verdict: 'great', reason: '' }], trap: [], bonus: [], comment: '' })) fail('모르는 판정 값을 받았다');
  const ok = AIGRADE.toVerdicts({ must: [{ id: 'm1', verdict: 'HALF', reason: '용어 빠짐' }], trap: [], bonus: [], comment: '한 줄' }, req.ids);
  if (ok.ai.must[req.ids.must.m1] !== 'half' || ok.ai.why[req.ids.must.m1] !== '용어 빠짐') fail('대소문자가 다른 판정 값을 못 읽었다');
}
// 꺼져 있으면 아무 칸도 원하지 않는다
if (AIGRADE.on() || AIGRADE.wants(parts(ctx.SCENES)[0].p)) fail('기본값이 켜져 있다');

console.log(`  서술 · 판단 칸 ${n}개 (판단 문장 ${nVerdict}개)` + (bad ? ` · 문제 ${bad}건` : ' · 이상 없음'));
process.exitCode = bad ? 1 : 0;
