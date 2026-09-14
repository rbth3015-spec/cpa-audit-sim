/* 감사 시즌 2026 — 콘텐츠 · 채점 · 분기 검증
   실행:  node tools/validate.js

   1. 구조      모든 좌석 × 판본에서 칸·화자·라벨이 제대로 이어지는가
   2. 모범답안   칸마다 모범답안이 80점 미만이면 채점기준에 결함이 있다
   3. 판별력    정답 / 오답 / 부분점수 / 나열 / 판단 반대가 제대로 갈리는가
   4. 경우의 수  성향 × 좌석 × 시즌을 돌려 엔딩이 실제로 갈리는지 본다
                 (게임 화면과 똑같은 js/season.js 를 쓴다) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'js/engine.js', 'js/season.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { AE, SCENES, TRUTH, EPILOGUE, SEASON, LEXICON, CAST } = ctx;
const SEATS = Object.keys(SEASON.SEATS);

let bad = 0;
const fail = m => { console.log('  ✕ ' + m); bad++; };
const vids = sc => sc.variants ? sc.variants.map(v => v.id) : [null];
const fresh = seat => SEASON.create({ seed: 1, seat: seat || 'senior' });
const gradePart = (p, text) => AE.gradeParts([{ text }], [p], p.form);

/* ── 1. 구조 ───────────────────────────────────────────── */
console.log('═══ 구조 검증');
const labelsOf = {};
SCENES.forEach(sc => {
  ['id', 'day', 'chapter', 'art', 'area', 'standards', 'prompt', 'ref', 'cost']
    .forEach(k => { if (sc[k] == null) fail(`${sc.id} 필드 누락: ${k}`); });
  labelsOf[sc.id] = new Set();
  // 동적 장면은 상태에 따라 라벨이 바뀌므로 원본 칸의 라벨도 모은다
  if (typeof sc.parts === 'function') vids(sc).forEach(vid => {
    const v = vid ? sc.variants.find(x => x.id === vid) : { id: '-' };
    sc.parts(v, fresh()).forEach(p => p.rubric.must.forEach(m => labelsOf[sc.id].add(m.label)));
  });
  SEATS.forEach(seat => vids(sc).forEach(vid => {
    const tag = `${sc.id}/${vid || '-'}/${seat}`;
    try {
      const it = SEASON.resolve(sc, fresh(seat), vid);
      if (!CAST[it.speaker]) fail(`${tag} 화자 없음: ${it.speaker}`);
      if (seat === 'partner' && it.speaker === 'partner') fail(`${tag} 파트너 자리인데 파트너가 말한다`);
      if (!it.line) fail(`${tag} 장면 대사 없음`);
      if (!it.parts.length) fail(`${tag} 칸이 없음`);
      it.parts.forEach(p => {
        if (!CAST[p.who]) fail(`${tag} ${p.key} 묻는 사람 없음: ${p.who}`);
        if (seat === 'partner' && p.who === 'partner') fail(`${tag} ${p.key} 파트너 자리인데 파트너가 묻는다`);
        if (!p.say) fail(`${tag} ${p.key} 대사 없음`);
        if (!p.ask) fail(`${tag} ${p.key} 지시문 없음`);
        if (!p.model) fail(`${tag} ${p.key} 모범답안 없음`);
        if (!p.rubric.must || !p.rubric.must.length) fail(`${tag} ${p.key} 필수 논점 없음`);
        if (p.verdict && !['yes', 'no'].includes(p.verdict.answer)) fail(`${tag} ${p.key} verdict.answer 오류`);
        p.rubric.must.forEach(m => labelsOf[sc.id].add(m.label));
      });
    } catch (e) { fail(`${tag} 예외: ${e.message}`); }
  }));
  (sc.flags || []).forEach(f => f.if.forEach(l => {
    if (!labelsOf[sc.id].has(l)) fail(`${sc.id} flag "${f.set}" 가 없는 라벨 참조: ${l}`);
  }));
  (sc.confront || []).forEach(l => {
    if (!labelsOf[sc.id].has(l)) fail(`${sc.id} confront 가 없는 라벨 참조: ${l}`);
  });
});
TRUTH.forEach(t => ['detect', 'verify'].forEach(key => {
  if (!t[key]) return;
  t[key].need.forEach(ref => {
    const [sid, lab] = ref.split('#');
    if (!labelsOf[sid]) fail(`진실 ${t.id}.${key} — 없는 장면: ${sid}`);
    else if (!labelsOf[sid].has(lab)) fail(`진실 ${t.id}.${key} — ${sid} 에 없는 라벨: ${lab}`);
  });
}));
let nParts = 0, nWhy = 0;
SCENES.forEach(sc => vids(sc).forEach(vid => {
  const it = SEASON.resolve(sc, fresh(), vid);
  nParts += it.parts.length;
  it.parts.forEach(p => p.rubric.must.forEach(m => { if (m.why) nWhy++; }));
}));
console.log(`  장면 ${SCENES.length} · 좌석 ${SEATS.length} · 칸 ${nParts}(판본 포함) · 개념 카드 ${nWhy} · 진실 ${TRUTH.length}`);
console.log(bad ? `  → 문제 ${bad}건` : '  → 이상 없음');

/* ── 2. 모범답안 자가채점 ─────────────────────────────── */
console.log('\n═══ 모범답안 자가채점 (칸마다 80점 미만이면 채점기준 결함)');
let low = 0;
function reportLow(tag, g) {
  low++;
  const p = g.parts[0];
  console.log(`  ${String(g.percent).padStart(3)}점  ${tag}`);
  const miss = p.res.must.filter(m => !m.hit).map(m => m.label + (m.partial ? '(절반)' : m.negated ? '(부정문)' : ''));
  const trap = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
  if (miss.length) console.log(`         누락: ${miss.join(' / ')}`);
  if (trap.length) console.log(`         오탐: ${trap.join(' / ')}`);
  if (p.verdict && !p.verdict.correct) console.log(`         판단 추출 실패 (given=${p.verdict.given}, expected=${p.verdict.expected})`);
  if (g.flags.length) console.log(`         플래그: ${g.flags.join(' | ')}`);
}
SCENES.forEach(sc => {
  if (sc.dynamic) return;
  vids(sc).forEach(vid => {
    const it = SEASON.resolve(sc, fresh(), vid);
    it.parts.forEach(p => {
      const g = gradePart(p, p.model);
      if (g.percent < 80) reportLow(`${sc.id}${vid ? '/' + vid : ''} ${p.key} ${p.ask}`, g);
    });
  });
});

/* ── 3. 판별력 ────────────────────────────────────────── */
console.log('\n═══ 판별력 (칸 단위)');
function run(label, id, vid, pi, text) {
  const it = SEASON.resolve(SCENES.find(x => x.id === id), fresh(), vid);
  const g = gradePart(it.parts[pi], text);
  const p = g.parts[0];
  const tr = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
  const half = p.res.must.filter(m => m.partial).length;
  const note = [p.verdict && !p.verdict.correct ? '판단오답→근거0' : '', half ? `절반 ${half}` : '',
                p.res.structure && p.res.structure.listing ? '나열판정' : '', tr.length ? '감점: ' + tr.join(', ') : '']
               .filter(Boolean).join(' · ');
  console.log(`  ${String(g.percent).padStart(3)}점  ${label}${note ? '   [' + note + ']' : ''}`);
}
run('s3③ 제3자 조회 — 정답', 's3', null, 2, '제3자가 보관하는 재고이므로 임가공업체에 조회하거나 직접 검사한다.');
run('s3③ 회사 명세서 수용 — 오답', 's3', null, 2, '거래처 명세서만으로 충분하므로 명세서로 갈음한다.');
run('s3② 부분점수 (한정어 누락)', 's3', null, 1, '실사 과정을 관찰하고 재고를 검사한다.');
run('s3① 키워드 나열', 's3', null, 0, '재고실사입회 보관장소 실사시기');
run('s5/BIAS① 편의 있음 — 정답', 's5', 'BIAS', 0, '가정이 모두 한 방향으로 일관되게 바뀌었으므로 경영진의 편의의 징후가 존재한다.');
run('s5/BIAS① 편의 없음 — 판단 반대', 's5', 'BIAS', 0, '시장 변화를 반영한 것이므로 편의의 징후로 보기 어렵다.');
run('s5/CLEAN① 편의 없음 — 정답', 's5', 'CLEAN', 0, '할인율이 우량회사채 수익률과 맞고 방향이 혼재하므로 편의의 징후로 보기 어렵다.');
run('s5/CLEAN① 편의 있음 — 판단 반대', 's5', 'CLEAN', 0, '가정이 변경되었으므로 편의의 징후가 존재한다.');
run('s8① ⓐ 정답', 's8', null, 0, 'ⓐ는 보고기간말 존재하던 상황의 증거이므로 수정을 요하는 사건이며 대손충당금을 추가로 인식한다.');
run('s8① ⓐ 분류 반대', 's8', null, 0, 'ⓐ는 수정을 요하지 않는 사건이므로 주석에 공시한다.');
run('s1① 판단 반대', 's1', null, 0, '조직이 분리되어 있으므로 훼손위협이 발생하지 않는다.');

/* ── 4. 경우의 수 시뮬레이션 ──────────────────────────── */
function lcg(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
const TRUTH_LABELS = new Set([].concat(...TRUTH.map(t => [].concat(t.detect ? t.detect.need : [], t.verify ? t.verify.need : []))));
const isConfront = (it, m) => (it.sc.confront || []).includes(m.label);

const PERSONAS = {
  hawk:    { pct: () => 88, must: () => true, trap: () => false, verdict: () => true },
  dove:    { pct: () => 64, must: (it, m) => !isConfront(it, m),
             trap: (it, t, st) => !!t.please && !st.pleased && (st.pleased = true), verdict: () => true },
  mixed:   { pct: () => 74, must: (it, m, r) => !isConfront(it, m) || r() < 0.5, trap: () => false, verdict: () => true },
  lazy:    { pct: () => 44, must: (it, m, r) => r() < 0.4, trap: () => false, verdict: (it, p, r) => r() < 0.5 },
  blind:   { pct: () => 70, must: (it, m) => !TRUTH_LABELS.has(it.sc.id + '#' + m.label), trap: () => false, verdict: () => true },
  verbose: { pct: () => 70, must: (it, m, r) => r() < 0.7, trap: () => false, verdict: () => true,
             meta: r => ({ over: 260, timedOut: r() < 0.4 }) },
  hedge:   { pct: () => 82, must: () => true, trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label), verdict: () => true },
  slip:    { pct: () => 86, must: (it, m) => !(it.sc.dynamic === 'opinion' && / 표명$/.test(m.label)),
             trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label), verdict: () => true }
};

function synth(it, P, r) {
  const st = {};
  const parts = it.parts.map(p => ({
    res: {
      must: p.rubric.must.map(m => ({ label: m.label, hit: !!P.must(it, m, r), why: m.why })),
      trap: (p.rubric.trap || []).map(t => ({ label: t.label, hit: !!P.trap(it, Object.assign({}, t), st) }))
    },
    verdict: p.verdict ? { correct: !!P.verdict(it, p, r), given: 'x', expected: p.verdict.answer } : null
  }));
  return { percent: P.pct(), parts };
}

const tally = {}, bump = (k, v) => { tally[k] = tally[k] || {}; tally[k][v] = (tally[k][v] || 0) + 1; };
const seatStat = {};
const samples = {};
let dynLow = 0;
const SEEDS = 25;

Object.entries(PERSONAS).forEach(([name, P]) => SEATS.forEach(seat => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const S = SEASON.create({ seed: seed * 7919, seat });
    const r = lcg(seed * 31 + name.length + seat.length);
    const path = [];
    SCENES.forEach((sc, i) => {
      S.i = i;
      const it = SEASON.resolve(sc, S);
      if (sc.dynamic) it.parts.forEach(p => {       // 이 상태에서 생성된 모범답안도 80점 이상이어야 한다
        const g = gradePart(p, p.model);
        if (g.percent < 80 && dynLow < 6) { dynLow++; reportLow(`${sc.id} ${p.key} ${p.ask} (${name}/${seat} seed ${seed})`, g); }
      });
      if (it.v && it.v.id !== '-') path.push(sc.id + ':' + it.v.id);
      SEASON.apply(S, it, [], synth(it, P, r), P.meta ? P.meta(r) : { over: 0, timedOut: false });
    });
    const E = SEASON.epilogue(S);
    bump('감리 결과', E.audit.title);
    bump('회사의 운명', E.company.id);
    bump('커리어', E.career.id);
    bump('정답 의견', S.decision.kind);
    bump('조합', `${E.audit.id}·${E.company.id}·${E.career.id}`);
    path.forEach(p => bump('판본', p));
    bump(`${name} 감리`, E.audit.title);
    if (name === 'hawk' || name === 'dove') {
      const k = `${name}/${seat}`;
      seatStat[k] = seatStat[k] || { T: 0, C: 0, n: 0, s4: {} };
      seatStat[k].T += S.gauge.T; seatStat[k].C += S.rel.company; seatStat[k].n++;
      const v4 = path.find(x => x.startsWith('s4:'));
      seatStat[k].s4[v4] = (seatStat[k].s4[v4] || 0) + 1;
    }
    if (!samples[name + '/' + seat] && seat === 'senior') samples[name + '/' + seat] = { S, E, path };
  }
}));

if (!low && !dynLow) console.log('\n  → 모든 칸의 모범답안이 80점 이상 (동적 장면 포함)');
else console.log(`\n  → 모범답안 보정 필요 ${low + dynLow}건`);

console.log(`\n═══ 경우의 수 — 성향 ${Object.keys(PERSONAS).length}종 × 좌석 ${SEATS.length} × 시즌 ${SEEDS}개`);
const show = k => {
  const o = tally[k] || {};
  const tot = Object.values(o).reduce((a, b) => a + b, 0);
  console.log(`  ${k}`);
  Object.entries(o).sort((a, b) => b[1] - a[1]).forEach(([v, n]) =>
    console.log(`     ${String(n).padStart(4)}  ${'█'.repeat(Math.max(1, Math.round(n / tot * 36)))} ${v}`));
};
['감리 결과', '회사의 운명', '커리어', '정답 의견', '판본'].forEach(show);
Object.keys(PERSONAS).forEach(n => show(`${n} 감리`));
console.log(`  서로 다른 엔딩 조합: ${Object.keys(tally['조합']).length}가지`);

console.log('\n═══ 좌석에 따라 체감이 달라지는가 (같은 플레이 방식 기준)');
Object.entries(seatStat).forEach(([k, s]) => {
  const v4 = Object.entries(s.s4).map(([v, n]) => `${v.split(':')[1]} ${n}`).join(' · ');
  console.log(`  ${k.padEnd(16)} 남은 시간 평균 ${String(Math.round(s.T / s.n)).padStart(3)} · 회사 태도 평균 ${String(Math.round(s.C / s.n)).padStart(3)} · 외부조회 판본 ${v4}`);
});

console.log('\n═══ 한 시즌씩 들여다보기 (시니어 자리)');
Object.entries(samples).forEach(([name, x]) => {
  const E = x.E, S = x.S;
  const f = E.rows.filter(r => r.state === 'found' || r.state === 'fixed').map(r => r.title.split(' ')[0]);
  const m = E.rows.filter(r => r.state === 'missed').map(r => r.title.split(' ')[0]);
  console.log(`  [${name}] 시즌 ${S.seed} · 판본 ${x.path.join(' ')}`);
  console.log(`     회사 ${S.rel.company} · 증거 ${S.gauge.E} · 시간 ${S.gauge.T} · 신뢰 ${S.gauge.R} · 카드 익힘 ${E.learned}/복습 ${E.review}`);
  console.log(`     찾음 ${E.found}억 (${f.join(', ') || '-'}) · 놓침 ${E.missed}억 (${m.join(', ') || '-'})`);
  console.log(`     정답 의견 ${S.decision.kind} (${S.opinionOK ? '맞힘' : '틀림'}) → ${E.audit.title} / ${E.company.id} / ${E.career.id}`);
});

console.log('\n═══ 도달 가능성');
const reach = (title, all, seen) => {
  seen = seen || {};
  const missing = all.filter(x => !seen[x]);
  console.log(`  ${title}: ${all.length - missing.length}/${all.length}` + (missing.length ? `  (미도달: ${missing.join(', ')})` : ''));
};
SCENES.filter(sc => sc.variants).forEach(sc =>
  reach(`${sc.id} 판본`, sc.variants.map(v => `${sc.id}:${v.id}`), tally['판본']));
reach('감리 결과', EPILOGUE.audit.map(a => a.title), tally['감리 결과']);
reach('회사의 운명', EPILOGUE.company.map(a => a.id), tally['회사의 운명']);
reach('커리어', EPILOGUE.career.map(a => a.id), tally['커리어']);
reach('정답 의견', SEASON.OPINIONS, tally['정답 의견']);

if (bad) { console.log(`\n구조 오류 ${bad}건`); process.exitCode = 1; }
