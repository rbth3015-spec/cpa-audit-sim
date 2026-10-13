/* AI 연동 채점 — 모델이 우리 채점표대로 채점하는지, 모델끼리 같은 판정을 내는지 잰다 (aigrade-calib.mjs)
   실행:  node tools/aigrade-calib.mjs                              Opus 5.5 · 문항 6개
          node tools/aigrade-calib.mjs --n 12 --model claude-sonnet-5-5
          node tools/aigrade-calib.mjs --all                        세 모델을 차례로 돌려 서로 비교

   실제로 Claude 를 부른다 — 문항 하나에 네 번. 이 PC 의 Claude Code 로그인이 필요하고 (`node tools/serve.mjs --login`),
   부른 만큼 그 계정의 사용량이 나간다. 시작할 때 몇 번 부르는지 먼저 적는다.

   정답이 정해진 답안으로 잰다. 답안은 채점표에서 기계적으로 만든다 (tools/gradelab.js 와 같은 방식)
     A  모범답안                               → 모든 논점 full · 감점 없음
     B  다른 문항의 모범답안                     → 모든 논점 none
     C  배점이 가장 큰 논점의 인정 표현을 뺀 답안    → 그 논점은 full 이 아니어야 한다
     A' 모범답안을 한 번 더                      → A 와 같은 판정이어야 한다 (같은 모델 안의 흔들림)
   --all 이면 같은 답안에 대해 모델끼리 판정이 같은 비율과 점수 차이도 낸다.
   기준 — A · B · C · A' 가 각각 90% 이상이면 「지침대로」. 못 미치면 js/aigrade.js 의 지침(SYSTEM)을 고치고 GUIDE_V 를 올린다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MODELS, findClaude, loggedIn, gradeOnce } from './claude-run.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const N = Math.max(1, parseInt(val('--n', '6'), 10) || 6);
const models = flag('--all') ? MODELS : [val('--model', MODELS[0])];
if (models.some(m => !MODELS.includes(m))) { console.log('모델은 ' + MODELS.join(' · ') + ' 중에서'); process.exit(1); }

/* 게임 데이터 · 채점 엔진 · 채점 요청 만들기 — 게임과 같은 파일을 그대로 읽는다 */
const store = {};
const ctx = { console, Math, JSON, Date, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js', 'data/haneul.js', 'data/daon.js', 'data/haesol.js',
                 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js', 'js/aigrade.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { AE, SEASON, SEASONS, AIGRADE, CASES } = ctx;

/* 서술 칸을 모아 고르게 N개 뽑는다 (판단 단추 칸은 뺀다 — 판단 점수가 섞여 비교가 흐려진다) */
function collect() {
  const out = [];
  const scan = (label, scenes) => scenes.forEach(sc => {
    const v = (sc.variants || [{ id: null }])[0];
    let it;
    try { it = SEASON.resolve(sc, SEASON.create({ seed: 7 }), v.id); } catch (e) { return; }
    it.parts.forEach(p => {
      if (p.type !== 'write' || p.verdict || typeof p.model !== 'string' || !p.model) return;
      out.push({ p, sit: it.situation, where: `${label} ${sc.id}${p.key}` });
    });
  });
  SEASONS.list().map(b => b.id).forEach(id => { SEASONS.use(id); scan(SEASONS.current().name, ctx.SCENES); });
  SEASONS.use('seorin');
  scan('돌발 업무', CASES);
  return out;
}
const all = collect();
const step = Math.max(1, Math.floor(all.length / N));
const picked = all.filter((_, i) => i % step === 0).slice(0, N);

/* 답안 만들기 */
function dropTop(p) {
  const must = p.rubric.must.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const m of must) {
    const kws = AE.expand([].concat(m.kw || [])).filter(k => k && p.model.includes(k)).sort((a, b) => b.length - a.length);
    if (!kws.length) continue;
    let t = p.model;
    kws.forEach(k => { t = t.split(k).join(''); });
    return { text: t.replace(/\s{2,}/g, ' ').trim(), label: m.label };
  }
  return null;
}
const cases = picked.map((x, i) => {
  const other = all.find((o, k) => o.p !== x.p && o.where.split(' ')[0] !== x.where.split(' ')[0] && k >= (i * 7) % all.length) || all.find(o => o.p !== x.p);
  return { x, A: x.p.model, B: other.p.model, C: dropTop(x.p) };
});

const calls = models.length * cases.reduce((n, c) => n + 3 + (c.C ? 1 : 0), 0);
console.log(`■ AI 연동 채점 일치 점검 — 지침 ${AIGRADE.GUIDE_V} · 모델 ${models.join(' · ')} · 문항 ${cases.length}개 · Claude 호출 ${calls}번`);

const bin = findClaude();
if (!bin) { console.log('  Claude Code 를 찾지 못했다 — 환경변수 CLAUDE_BIN'); process.exit(1); }
if (!(await loggedIn(bin, true))) { console.log('  로그인 전이다 — node tools/serve.mjs --login'); process.exit(1); }

async function ask(model, p, sit, text) {
  const ans = { text };
  const req = AIGRADE.build(p, ans, { situation: sit });
  const r = await gradeOnce({ system: req.system, user: req.user, schema: req.schema, model }, { max: 1, ms: 90000 });
  if (!r.ok) return { err: r.error + (r.detail ? ' ' + r.detail : '') };
  let v;
  try { v = AIGRADE.toVerdicts(r.out, req.ids, req.needVerdict); } catch (e) { return { err: '형식' }; }
  const g = AE.gradeAny(p, ans, { ai: v.ai });
  return { must: p.rubric.must.map(m => v.ai.must[m.label] || '-'),
           trap: (p.rubric.trap || []).some(t => v.ai.trap[t.label] === true), pct: g.percent };
}

const R = {};      // R[model][i] = { A, B, C, A2 }
for (const model of models) {
  R[model] = [];
  console.log(`\n  ${model}`);
  for (const [i, c] of cases.entries()) {
    const p = c.x.p, row = {};
    row.A = await ask(model, p, c.x.sit, c.A);
    if (row.A.err === 'login') { console.log('  로그인이 풀렸다 — node tools/serve.mjs --login'); process.exit(1); }
    row.B = await ask(model, p, c.x.sit, c.B);
    row.C = c.C ? await ask(model, p, c.x.sit, c.C.text) : null;
    row.A2 = await ask(model, p, c.x.sit, c.A);
    R[model][i] = row;
    const show = k => !row[k] ? '—' : row[k].err ? '오류(' + row[k].err.slice(0, 24) + ')' : row[k].must.map(v => v[0]).join('') + ' ' + row[k].pct + '점';
    console.log(`   ${c.x.where.padEnd(22)} A ${show('A')} · B ${show('B')} · C ${show('C')} · A' ${show('A2')}`);
  }
}

/* 집계 */
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
console.log('\n  모델                 A 전부 인정   감점 없음   B 전부 불인정   C 뺀 논점 감지   A=A\' 같은 판정   오류');
let weak = [];
for (const model of models) {
  let aF = 0, aN = 0, aClean = 0, aRows = 0, bN = 0, bT = 0, cOk = 0, cT = 0, same = 0, sameT = 0, errs = 0;
  R[model].forEach((row, i) => {
    ['A', 'B', 'C', 'A2'].forEach(k => { if (row[k] && row[k].err) errs++; });
    if (row.A && !row.A.err) { aRows++; aN += row.A.must.length; aF += row.A.must.filter(v => v === 'full').length; if (!row.A.trap) aClean++; }
    if (row.B && !row.B.err) { bT += row.B.must.length; bN += row.B.must.filter(v => v === 'none').length; }
    if (row.C && !row.C.err) {
      cT++;
      const at = cases[i].x.p.rubric.must.findIndex(m => m.label === cases[i].C.label);
      if (row.C.must[at] !== 'full') cOk++;
    }
    if (row.A && row.A2 && !row.A.err && !row.A2.err) { sameT++; if (row.A.must.join() === row.A2.must.join()) same++; }
  });
  const m = { a: pct(aF, aN), clean: pct(aClean, aRows), b: pct(bN, bT), c: pct(cOk, cT), s: pct(same, sameT) };
  console.log(`  ${model.padEnd(20)} ${String(m.a).padStart(6)}%   ${String(m.clean).padStart(6)}%   ${String(m.b).padStart(9)}%   ${String(m.c).padStart(10)}%   ${String(m.s).padStart(10)}%   ${String(errs).padStart(3)}`);
  if (errs || m.a < 90 || m.b < 90 || m.c < 90 || m.s < 90) weak.push(model);
}

if (models.length > 1) {
  // 같은 답안에 대해 모든 모델이 같은 판정을 낸 논점의 비율, 그리고 점수 차이
  let agree = 0, total = 0, spread = 0, spreadN = 0;
  cases.forEach((c, i) => ['A', 'B', 'C'].forEach(k => {
    const rows = models.map(m => R[m][i][k]).filter(r => r && !r.err);
    if (rows.length < models.length) return;
    rows[0].must.forEach((_, j) => { total++; if (rows.every(r => r.must[j] === rows[0].must[j])) agree++; });
    const ps = rows.map(r => r.pct);
    spread += Math.max(...ps) - Math.min(...ps); spreadN++;
  }));
  console.log(`\n  모델끼리 같은 판정 ${pct(agree, total)}% (논점 ${total}개) · 같은 답안의 점수 차이 평균 ${spreadN ? (spread / spreadN).toFixed(1) : '—'}점`);
  if (pct(agree, total) < 90) weak.push('모델 사이');
}
console.log(weak.length ? `\n  기준(90%)에 못 미침: ${[...new Set(weak)].join(' · ')} — js/aigrade.js 의 지침을 손보고 GUIDE_V 를 올릴 것`
                        : '\n  지침대로 채점한다 (모든 항목 90% 이상)');
