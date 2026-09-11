/* 감사 시즌 2026 — 콘텐츠 · 채점 · 분기 검증
   실행:  node tools/validate.js

   1. 구조      장면·판본·진실·분기 조건이 서로 존재하는 라벨을 가리키는가
   2. 모범답안   모범답안이 80점 미만이면 채점기준에 결함이 있다
   3. 판별력    정답 / 오답 / 나열 / 판단 반대가 제대로 갈리는가
   4. 경우의 수  성향이 다른 플레이어를 수백 시즌 돌려 엔딩이 실제로 갈리는지 본다
                 (게임 화면과 똑같은 js/season.js 를 쓴다) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/scenes.js', 'data/truth.js', 'js/engine.js', 'js/season.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { AE, SCENES, TRUTH, EPILOGUE, SEASON, LEXICON, CAST } = ctx;

let bad = 0;
const fail = m => { console.log('  ✕ ' + m); bad++; };
const variantIds = sc => sc.variants ? sc.variants.map(v => v.id) : [null];
const fresh = () => SEASON.create({ seed: 1 });

function gradeModel(it) {
  const part = { maxChars: it.maxChars, rubric: it.rubric };
  if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
  return AE.gradeParts([{ text: it.model.join(' ') }], [part], 'essay');
}

/* ── 1. 구조 ───────────────────────────────────────────── */
console.log('═══ 구조 검증');
const labelsOf = {};   // sceneId → Set(모든 판본의 must 라벨)
SCENES.forEach(sc => {
  ['id', 'day', 'chapter', 'art', 'area', 'standards', 'prompt', 'timeLimit', 'maxChars', 'ref']
    .forEach(k => { if (sc[k] == null) fail(`${sc.id} 필드 누락: ${k}`); });
  if (sc.speaker && !CAST[sc.speaker]) fail(`${sc.id} 등장인물 없음: ${sc.speaker}`);
  labelsOf[sc.id] = new Set();
  variantIds(sc).forEach(vid => {
    try {
      const it = SEASON.resolve(sc, fresh(), vid);
      if (!it.rubric || !it.rubric.must || !it.rubric.must.length) fail(`${sc.id}/${vid} rubric 없음`);
      if (!it.model || !it.model.length) fail(`${sc.id}/${vid} 모범답안 없음`);
      if (it.verdict && !['yes', 'no'].includes(it.verdict.answer)) fail(`${sc.id}/${vid} verdict.answer 오류`);
      it.rubric.must.forEach(m => labelsOf[sc.id].add(m.label));
      if (it.speaker && !CAST[it.speaker]) fail(`${sc.id}/${vid} enter 가 없는 인물을 지정: ${it.speaker}`);
    } catch (e) { fail(`${sc.id}/${vid} 예외: ${e.message}`); }
  });
  if (sc.rubric && typeof sc.rubric === 'object') sc.rubric.must.forEach(m => labelsOf[sc.id].add(m.label));
  (sc.flags || []).forEach(f => f.if.forEach(l => {
    if (!labelsOf[sc.id].has(l)) fail(`${sc.id} flag "${f.set}" 가 없는 라벨 참조: ${l}`);
  }));
  (sc.confront || []).forEach(l => {
    if (!labelsOf[sc.id].has(l)) fail(`${sc.id} confront 가 없는 라벨 참조: ${l}`);
  });
});
TRUTH.forEach(t => {
  ['detect', 'verify'].forEach(key => {
    if (!t[key]) return;
    t[key].need.forEach(ref => {
      const [sid, lab] = ref.split('#');
      if (!labelsOf[sid]) fail(`진실 ${t.id}.${key} — 없는 장면: ${sid}`);
      else if (!labelsOf[sid].has(lab)) fail(`진실 ${t.id}.${key} — ${sid} 에 없는 라벨: ${lab}`);
    });
  });
});
console.log(`  장면 ${SCENES.length} · 진실 ${TRUTH.length} · 사전 ${Object.keys(LEXICON).length}항목`);
console.log(bad ? `  → 문제 ${bad}건` : '  → 이상 없음');

/* ── 2. 모범답안 자가채점 ─────────────────────────────── */
console.log('\n═══ 모범답안 자가채점 (80점 미만이면 채점기준 결함)');
let low = 0;
function reportLow(tag, g) {
  low++;
  const p = g.parts[0];
  console.log(`  ${String(g.percent).padStart(3)}점  ${tag}`);
  const miss = p.res.must.filter(m => !m.hit).map(m => m.label);
  const trap = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
  if (miss.length) console.log(`         누락: ${miss.join(' / ')}`);
  if (trap.length) console.log(`         오탐: ${trap.join(' / ')}`);
  if (p.verdict && !p.verdict.correct) console.log(`         판단 추출 실패 (given=${p.verdict.given}, expected=${p.verdict.expected})`);
}
SCENES.forEach(sc => {
  if (sc.dynamic) return;                    // 집계·의견 장면은 아래 시뮬레이션 안에서 검사
  variantIds(sc).forEach(vid => {
    const it = SEASON.resolve(sc, fresh(), vid);
    const g = gradeModel(it);
    if (g.percent < 80) reportLow(`${sc.id}${vid ? '/' + vid : ''} ${sc.chapter}`, g);
  });
});

/* ── 3. 판별력 ────────────────────────────────────────── */
function run(label, id, vid, text) {
  const it = SEASON.resolve(SCENES.find(x => x.id === id), fresh(), vid);
  const part = { maxChars: it.maxChars, rubric: it.rubric };
  if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
  const g = AE.gradeParts([{ text }], [part], 'essay');
  const p = g.parts[0];
  const tr = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
  const vd = p.verdict ? (p.verdict.correct ? '' : ' [판단오답→근거0]') : '';
  console.log(`  ${String(g.percent).padStart(3)}점  ${label}${vd}${tr.length ? '  [감점: ' + tr.join(', ') + ']' : ''}`);
}
console.log('\n═══ 판별력');
run('s3 재고실사 정답', 's3', null, '재고자산이 중요하므로 재고실사에 입회하여 경영진의 실사 지시와 절차를 평가하고 시험적 검사를 수행한다. 보관장소가 분산되어 있으므로 물류센터도 입회 대상으로 결정하고, 실사 시기가 기말과 다른 물량은 그 사이 변동이 적절히 기록되었는지 절차를 추가한다. 제3자가 보관하는 외주 임가공 물량은 제3자에 대한 조회 또는 직접 검사를 수행한다.');
run('s3 회사 계획 수용(오답)', 's3', null, '회사의 실사 계획대로 본사 창고만 입회하고, 외주 임가공 물량은 거래처가 발행한 잔액명세서를 수령하여 갈음한다.');
run('s3 키워드 나열', 's3', null, '재고실사입회 보관장소 실사시기 제3자 조회 시험적검사 경영진의 실사 지시');
run('s5/BIAS 편의 있음 — 정답', 's5', 'BIAS', '네 가지 가정이 모두 채무를 줄이는 한 방향으로 일관되게 변경되었으므로 경영진의 편의의 징후가 존재한다. 신생 법인으로 교체한 것도 편의의 징후이다. 보험계리법인은 경영진측 전문가이므로 적격성·역량·객관성을 평가하고 가정의 합리성을 검증하며 필요하면 독립적 추정치를 개발한다.');
run('s5/BIAS 편의 없음 — 판단 반대', 's5', 'BIAS', '가정 변경은 시장 변화에 따른 것이므로 경영진 편의의 징후로 보기 어렵다. 경영진측 전문가의 적격성을 평가한다.');
run('s5/CLEAN 편의 없음 — 정답', 's5', 'CLEAN', '할인율은 기말 우량회사채 수익률과 부합하고 임금상승률과 사망률은 채무를 늘리는 방향이어서 방향이 혼재하므로 편의의 징후로 보기 어렵다. 다만 경영진측 전문가의 적격성·역량·객관성을 평가하고 가정의 합리성을 검토하며 소급적 검토를 수행한다.');
run('s5/CLEAN 편의 있음 — 판단 반대', 's5', 'CLEAN', '가정이 변경되었으므로 편의의 징후가 존재한다. 경영진측 전문가의 적격성을 평가한다.');
run('s7 기타정보 정답', 's7', null, 'ⓐ는 재무제표와의 불일치이고 ⓑ는 감사 지식과의 불일치이다. ⓒ는 대조할 기준이 없으므로 불일치가 아니다. 불일치는 경영진과 논의하여 수정을 요구하고, 거부하면 지배기구와 커뮤니케이션한다. 감사인은 기타정보에 확신을 표명하지 않는다.');
run('s8 분류 반대(오답)', 's8', null, 'ⓐ와 ⓑ 모두 수정을 요하는 사건이므로 재무제표를 수정하도록 요구한다.');
run('s1 판단 반대(오답)', 's1', null, '컨설팅본부와 감사본부는 조직이 분리되어 있으므로 독립성 훼손위협은 발생하지 않는다.');

/* ── 4. 경우의 수 시뮬레이션 ──────────────────────────── */
function lcg(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
const TRUTH_LABELS = new Set([].concat(...TRUTH.map(t => [].concat(t.detect ? t.detect.need : [], t.verify ? t.verify.need : []))));

const PERSONAS = {
  // 모든 논점을 짚는다. 회사와의 관계는 신경 쓰지 않는다
  hawk:   { pct: () => 88, must: () => true, trap: () => false, verdict: () => true },
  // 회사를 압박하는 논점은 피하고, 회사 입장을 받아주는 서술을 섞는다
  dove:   { pct: () => 64, must: (it, m) => !(it.sc.confront || []).includes(m.label),
            trap: (it, t, st) => !!t.please && !st.pleased && (st.pleased = true), verdict: () => true },
  // 절반쯤 맞힌다. 압박 논점은 반반
  mixed:  { pct: () => 74, must: (it, m, r) => !(it.sc.confront || []).includes(m.label) || r() < 0.5,
            trap: () => false, verdict: () => true },
  // 대충 쓴다
  lazy:   { pct: () => 44, must: (it, m, r) => r() < 0.4, trap: () => false, verdict: (it, r) => r() < 0.5 },
  // 무난하게 쓰지만 숨은 것을 파고들지 않는다 — 진실 발견에 필요한 논점만 비껴간다
  blind:  { pct: () => 70, must: (it, m) => !TRUTH_LABELS.has(it.sc.id + '#' + m.label),
            trap: () => false, verdict: () => true },
  // 길게 쓰고 시간을 넘긴다
  verbose: { pct: () => 70, must: (it, m, r) => r() < 0.7, trap: () => false, verdict: () => true,
             meta: r => ({ over: 260, timedOut: r() < 0.4 }) },
  // 정답 의견을 쓰되 다른 의견도 걸쳐 쓴다 ("한정의견 또는 부적정의견") — 맞힌 것이 아니어야 한다
  hedge:  { pct: () => 82, must: () => true,
            trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label),
            verdict: () => true },
  // 다 찾아놓고 마지막 의견을 틀린다
  slip:   { pct: () => 86, must: (it, m) => !(it.sc.dynamic === 'opinion' && / 표명$/.test(m.label)),
            trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label) && !t._used && (t._used = true),
            verdict: () => true }
};

function synth(it, P, r) {
  const st = {};
  const must = it.rubric.must.map(m => ({ label: m.label, hit: !!P.must(it, m, r) }));
  const trapDefs = (it.rubric.trap || []).map(t => Object.assign({}, t));
  const trap = trapDefs.map(t => ({ label: t.label, hit: !!P.trap(it, t, st) }));
  const verdict = it.verdict ? { correct: !!P.verdict(it, r), given: 'x', expected: it.verdict.answer } : null;
  return { percent: P.pct(), parts: [{ res: { must, trap }, verdict }] };
}

const tally = {}, bump = (k, v) => { tally[k] = tally[k] || {}; tally[k][v] = (tally[k][v] || 0) + 1; };
const samples = {};
let dynLow = 0;
const SEEDS = 60;

Object.entries(PERSONAS).forEach(([name, P]) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const S = SEASON.create({ seed: seed * 7919 });
    const r = lcg(seed * 31 + name.length);
    const path = [];
    SCENES.forEach((sc, i) => {
      S.i = i;
      const it = SEASON.resolve(sc, S);
      if (sc.dynamic) {                    // 이 상태에서 생성된 모범답안도 80점 이상이어야 한다
        const g = gradeModel(it);
        if (g.percent < 80 && dynLow < 6) { dynLow++; reportLow(`${sc.id} ${sc.chapter} (${name} seed ${seed})`, g); }
      }
      if (it.v && it.v.id !== '-') path.push(sc.id + ':' + it.v.id);
      SEASON.apply(S, it, '', synth(it, P, r), P.meta ? P.meta(r) : { over: 0, timedOut: false });
    });
    const E = SEASON.epilogue(S);
    bump('감리 결과', E.audit.title);
    bump('회사의 운명', E.company.id);
    bump('커리어', E.career.id);
    bump('정답 의견', S.decision.kind);
    bump('조합', `${E.audit.id}·${E.company.id}·${E.career.id}`);
    path.forEach(p => bump('판본', p));
    bump(`${name} 감리`, E.audit.title);
    if (!samples[name]) samples[name] = { seed: S.seed, path, E, S };
  }
});

console.log(dynLow ? '' : '  → 동적 장면(집계·의견) 모범답안도 전부 80점 이상');
console.log(low + dynLow ? `  → 모범답안 보정 필요 ${low + dynLow}건` : '');

console.log(`\n═══ 경우의 수 — 성향 ${Object.keys(PERSONAS).length}종 × 시즌 ${SEEDS}개`);
const show = k => {
  const o = tally[k] || {};
  const tot = Object.values(o).reduce((a, b) => a + b, 0);
  console.log(`  ${k}`);
  Object.entries(o).sort((a, b) => b[1] - a[1]).forEach(([v, n]) =>
    console.log(`     ${String(n).padStart(4)}  ${'█'.repeat(Math.max(1, Math.round(n / tot * 40)))} ${v}`));
};
['감리 결과', '회사의 운명', '커리어', '정답 의견', '판본'].forEach(show);
Object.keys(PERSONAS).forEach(n => show(`${n} 감리`));
console.log(`  서로 다른 엔딩 조합: ${Object.keys(tally['조합']).length}가지`);

console.log('\n═══ 한 시즌씩 들여다보기');
Object.entries(samples).forEach(([name, x]) => {
  const E = x.E, S = x.S;
  const f = E.rows.filter(r => r.state === 'found' || r.state === 'fixed').map(r => r.title.split(' ')[0]);
  const m = E.rows.filter(r => r.state === 'missed').map(r => r.title.split(' ')[0]);
  console.log(`  [${name}] 시즌 ${x.seed} · 판본 ${x.path.join(' ')}`);
  console.log(`     회사 태도 ${S.rel.company} · 증거 ${S.gauge.E} · 시간 ${S.gauge.T} · 신뢰 ${S.gauge.R}`);
  console.log(`     찾음 ${E.found}억 (${f.join(', ') || '-'}) · 놓침 ${E.missed}억 (${m.join(', ') || '-'})`);
  console.log(`     정답 의견 ${S.decision.kind} (${S.opinionOK ? '맞힘' : '틀림'}) → ${E.audit.title} / ${E.company.id} / ${E.career.id}`);
});

/* 도달 불가 판본·엔딩 */
console.log('\n═══ 도달 가능성');
const reach = (title, all, seen) => {
  const missing = all.filter(x => !seen[x]);
  console.log(`  ${title}: ${all.length - missing.length}/${all.length}` + (missing.length ? `  (미도달: ${missing.join(', ')})` : ''));
};
const seenV = tally['판본'] || {};
SCENES.filter(sc => sc.variants).forEach(sc =>
  reach(`${sc.id} 판본`, sc.variants.map(v => `${sc.id}:${v.id}`), seenV));
reach('감리 결과', EPILOGUE.audit.map(a => a.title), tally['감리 결과']);
reach('회사의 운명', EPILOGUE.company.map(a => a.id), tally['회사의 운명']);
reach('커리어', EPILOGUE.career.map(a => a.id), tally['커리어']);
reach('정답 의견', SEASON.OPINIONS, tally['정답 의견']);

if (bad) { console.log(`\n구조 오류 ${bad}건`); process.exitCode = 1; }
