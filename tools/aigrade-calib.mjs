/* AI 연동 채점 — 모델이 우리 채점표대로 채점하는지, 모델끼리 같은 판정을 내는지 잰다 (aigrade-calib.mjs)
   실행:  node tools/aigrade-calib.mjs                              Opus 5.5 · 문항 6개
          node tools/aigrade-calib.mjs --spot [--model …]            손으로 쓴 답안으로 지침이 가르는 자리만
          node tools/aigrade-calib.mjs --n 12 --model claude-sonnet-5-5
          node tools/aigrade-calib.mjs --all                        세 모델을 차례로 돌려 서로 비교
          node tools/aigrade-calib.mjs --rag [--model …]             근거 문단(RAG)을 붙여 같은 답안을 채점 — 끈 결과와 견준다

   실제로 Claude 를 부른다 — 문항 하나에 네 번. 이 PC 의 Claude Code 로그인이 필요하고 (`node tools/serve.mjs --login`),
   부른 만큼 그 계정의 사용량이 나간다. 시작할 때 몇 번 부르는지 먼저 적는다.

   정답이 정해진 답안으로 잰다. 답안은 채점표에서 기계적으로 만든다 (tools/gradelab.js 와 같은 방식)
     A  모범답안                               → 모든 논점 full · 감점 없음
     B  다른 문항의 모범답안                     → 모든 논점 none
     C  배점이 가장 큰 논점의 인정 표현을 뺀 답안    → 그 논점은 full 이 아니어야 한다
     A' 모범답안을 한 번 더                      → A 와 같은 판정이어야 한다 (같은 모델 안의 흔들림)
     D  모범답안의 행위 낱말을 같은 뜻 다른 말로 바꾼 답안 (커뮤니케이션 → 논의) → 그 논점은 none 이 아니어야 하고 full 이 많아야 한다
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
/* --rag — 게임의 채점 서버와 같은 모듈로 근거 문단을 붙인다 */
const RAG = flag('--rag') ? await import('./kb-ground.mjs') : null;

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
      out.push({ p, sit: it.situation, stds: (it.sc || it).standards, where: `${label} ${sc.id}${p.key}` });
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
/* 키워드 채점이 놓치는 표현 — 같은 행위를 가리키는 다른 말로 바꾼다 */
const SWAPS = [['커뮤니케이션', '논의'], ['질문', '문의'], ['입수', '확보']];
function swapWord(p) {
  for (const [from, to] of SWAPS) {
    if (!p.model.includes(from)) continue;
    const m = p.rubric.must.find(x => [].concat(x.kw || []).some(k => k.includes(from)));
    if (m && !AE.expand([].concat(m.kw || [])).some(k => k.includes(to))) {
      return { text: p.model.split(from).join(to), label: m.label, from, to };
    }
  }
  return null;
}
const swapRows = all.filter(x => swapWord(x.p)).slice(0, Math.max(3, Math.ceil(N / 2)));
const cases = picked.map((x, i) => {
  // 회사마다 같은 틀의 장면(의견형성 등)이 있다 — 논점이 겹치는 문항은 '다른 문항' 이 아니다
  const apart = o => !o.p.rubric.must.some(m => x.p.rubric.must.some(y => y.label === m.label));
  const other = all.find((o, k) => o.p !== x.p && apart(o) && o.where.split(' ')[0] !== x.where.split(' ')[0] && k >= (i * 7) % all.length) || all.find(o => o.p !== x.p && apart(o));
  return { x, A: x.p.model, B: other.p.model, C: dropTop(x.p) };
});

const calls = models.length * (cases.reduce((n, c) => n + 3 + (c.C ? 1 : 0), 0) + swapRows.length);
if (!flag('--spot')) console.log(`■ AI 연동 채점 일치 점검 — ${RAG ? '근거 문단 붙임(RAG) · ' : ''}지침 ${AIGRADE.GUIDE_V} · 모델 ${models.join(' · ')} · 문항 ${cases.length}개 · Claude 호출 ${calls}번`);

const bin = findClaude();
if (!bin) { console.log('  Claude Code 를 찾지 못했다 — 환경변수 CLAUDE_BIN'); process.exit(1); }
if (!(await loggedIn(bin, true))) { console.log('  로그인 전이다 — node tools/serve.mjs --login'); process.exit(1); }

const cite = { asks: 0, paras: 0, must: 0, cited: 0, given: 0, kept: 0, ms: 0 };
async function ask(model, p, sit, text, stds) {
  const ans = { text };
  const req = AIGRADE.build(p, ans, { situation: sit, standards: stds });
  const gr = RAG && req.ground ? await RAG.ground(req.ground) : null;
  const r = await gradeOnce({ system: req.system, user: req.user + (gr ? gr.block : ''), schema: req.schema, model }, { max: 1, ms: 90000 });
  if (!r.ok) return { err: r.error + (r.detail ? ' ' + r.detail : '') };
  if (gr) {
    const k = RAG.keepCites(r.out, gr.ids);
    cite.asks++; cite.paras += gr.ids.length; cite.ms += gr.ms; cite.given += k.given; cite.kept += k.kept;
    (r.out.must || []).forEach(m => { cite.must++; if (m.cite && m.cite.length) cite.cited++; });
  }
  let v;
  try { v = AIGRADE.toVerdicts(r.out, req.ids, req.needVerdict, gr ? gr.ids : null); } catch (e) { return { err: '형식' }; }
  const g = AE.gradeAny(p, ans, { ai: v.ai });
  return { must: p.rubric.must.map(m => v.ai.must[m.label] || '-'),
           trap: (p.rubric.trap || []).some(t => v.ai.trap[t.label] === true), pct: g.percent };
}

/* 손으로 쓴 답안 — 지침이 가르는 자리를 바로 본다. want 는 허용하는 판정 */
const SPOT = [
  { at: ['seorin', 's9', null, 2], label: '미수정왜곡표시를 지배기구와 커뮤니케이션', why: '내용 · 같은 행위 다른 말', want: ['full'],
    ans: '미수정왜곡표시를 감사위원회와 논의하고 그 영향을 알린다.' },
  { at: ['seorin', 's9', null, 2], label: '미수정왜곡표시를 지배기구와 커뮤니케이션', why: '뭉뚱그림', want: ['half'],
    ans: '미수정 사항은 윗선에 보고한다.' },
  { at: ['seorin', 's9', null, 2], label: '경영진 서면진술 입수', why: '채점어', want: ['full'],
    ans: '경영진으로부터 미수정왜곡표시의 영향이 중요하지 않다는 서면진술을 입수한다.' },
  { at: ['seorin', 's2', null, 0], label: '유의적 위험으로 식별', why: '용어', want: ['full'],
    ans: '이 거래는 유의적 위험으로 식별한다.' },
  { at: ['seorin', 's2', null, 0], label: '유의적 위험으로 식별', why: '용어 · 풀어 씀', want: ['half'],
    ans: '이 거래는 감사에서 특별히 신경 써서 봐야 할 위험으로 본다.' },
  { at: ['seorin', 's7', null, 1], label: '경영진이 거부하면 지배기구에 커뮤니케이션', why: '맥락 없음', want: ['half'],
    ans: '지배기구와 커뮤니케이션한다.' },
  { at: ['raon', 'r4', null, 1], label: '계약 조건을 직접 읽고 수행의무 식별', why: '묻지 않은 사항', want: ['none'],
    ans: '대표이사의 실적 압박이 커서 부정의 동기가 있다.' },
  { at: ['raon', 'r4', null, 1], label: '의무 이행 시점의 증거 확인', why: '반대 취지', want: ['none'],
    ans: '계약금은 반환 의무가 없으므로 공동연구 이행 여부는 확인할 필요가 없다.' },
  { at: ['raon', 'r5', 'BAD', 1], label: '계약 조건을 직접 확인', why: '내용 · 다른 말', want: ['full'],
    ans: '투자자에게 상환 요구권이 있는지 약정 내용을 직접 열람해 확인한다.' },
  { at: ['raon', 'r5', 'BAD', 1], label: '부채와 자본의 구분 판단', why: '채점어 없음', want: ['half'],
    ans: '회사가 돈을 돌려줘야 할 의무가 있으면 빚으로 본다.' },
  { at: ['daon', 'd4', null, 1], label: '부정 의심 — 경영진 · 지배기구 커뮤니케이션', why: '내용 · 같은 행위 다른 말', want: ['full'],
    ans: '반품을 이용한 부정이 의심되므로 경영진과 감사위원회에 알리고 협의한다.' },
  { at: ['raon', 'r7', 'DUE', 2], label: '반영되지 않으면 의견 변형', why: '판단 병기', want: ['none'],
    ans: '지배기구와 커뮤니케이션하고, 반영되지 않으면 한정의견 또는 적정의견을 표명한다.' }
];
if (flag('--spot')) {
  for (const model of models) {
    let ok = 0;
    console.log(`\n  ${model} · 지침 ${AIGRADE.GUIDE_V}`);
    for (const c of SPOT) {
      SEASONS.use(c.at[0]);
      const sc = ctx.SCENES.find(x => x.id === c.at[1]);
      const it = SEASON.resolve(sc, SEASON.create({ seed: 7 }), c.at[2] || (sc.variants ? sc.variants[0].id : undefined));
      const p = it.parts[c.at[3]];
      const at = p.rubric.must.findIndex(m => m.label === c.label);
      if (at < 0) { console.log(`   ✕ 논점 없음 ${c.at[1]} ${c.label}`); continue; }
      const r = await ask(model, p, it.situation, c.ans, (it.sc || it).standards);
      const v = r.err ? '오류' : r.must[at], hit = c.want.includes(v);
      if (hit) ok++;
      console.log(`   ${hit ? '○' : '✕'} ${v.padEnd(4)} (기대 ${c.want.join('·')}) ${c.why} | ${c.ans.slice(0, 34)}`);
    }
    console.log(`   ${ok} / ${SPOT.length}`);
  }
  process.exit(0);
}

const R = {};      // R[model][i] = { A, B, C, A2 }
for (const model of models) {
  R[model] = [];
  console.log(`\n  ${model}`);
  for (const [i, c] of cases.entries()) {
    const p = c.x.p, row = {};
    row.A = await ask(model, p, c.x.sit, c.A, c.x.stds);
    if (row.A.err === 'login') { console.log('  로그인이 풀렸다 — node tools/serve.mjs --login'); process.exit(1); }
    row.B = await ask(model, p, c.x.sit, c.B, c.x.stds);
    row.C = c.C ? await ask(model, p, c.x.sit, c.C.text, c.x.stds) : null;
    row.A2 = await ask(model, p, c.x.sit, c.A, c.x.stds);
    R[model][i] = row;
    const show = k => !row[k] ? '—' : row[k].err ? '오류(' + row[k].err.slice(0, 24) + ')' : row[k].must.map(v => v[0]).join('') + ' ' + row[k].pct + '점';
    console.log(`   ${c.x.where.padEnd(22)} A ${show('A')} · B ${show('B')} · C ${show('C')} · A' ${show('A2')}`);
  }
  R[model].swap = [];
  for (const x of swapRows) {
    const d = swapWord(x.p), r = await ask(model, x.p, x.sit, d.text, x.stds);
    const at = x.p.rubric.must.findIndex(m => m.label === d.label);
    R[model].swap.push({ v: r.err ? 'err' : r.must[at] });
    console.log(`   ${x.where.padEnd(22)} D ${d.from} → ${d.to} : ${r.err ? '오류' : r.must[at]}`);
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

for (const model of models) {
  const rows = R[model].swap || [];
  const full = rows.filter(r => r.v === 'full').length, none = rows.filter(r => r.v === 'none' || r.v === 'err').length;
  console.log(`  ${model.padEnd(20)} D 같은 뜻 다른 말 — full ${full}/${rows.length} · none ${none}/${rows.length}`);
  if (rows.length && (none || pct(full, rows.length) < 80)) weak.push(model + ' D');
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
if (RAG && cite.asks) console.log(`\n  근거 문단 — 요청 ${cite.asks}번 · 평균 ${(cite.paras / cite.asks).toFixed(1)}개 · 근거를 인용한 논점 ${(100 * cite.cited / Math.max(cite.must, 1)).toFixed(0)}% · 받지 않은 번호 인용 ${cite.given - cite.kept}건(걸러냄) · 검색 평균 ${(cite.ms / cite.asks).toFixed(0)}ms`);
console.log(weak.length ? `\n  기준(90%)에 못 미침: ${[...new Set(weak)].join(' · ')} — js/aigrade.js 의 지침을 손보고 GUIDE_V 를 올릴 것`
                        : '\n  지침대로 채점한다 (모든 항목 90% 이상)');
