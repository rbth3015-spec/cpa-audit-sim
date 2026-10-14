/* 감사 시즌 2026 — 콘텐츠 · 채점 · 분기 검증
   실행:  node tools/validate.js

   1. 구조      모든 좌석 × 판본에서 칸 · 화자 · 라벨 · 형식별 필드 · 단서가 제대로 이어지는가
   2. 정답 채점  칸마다 정답(모범답안 · 정답 보기 · 정답 빈칸 · 정답 분류 · 완벽한 미니게임)이 80점 이상인가
   3. 판별력    정답 / 오답 / 부분점수 / 나열 / 판단 반대가 제대로 갈리는가
   4. 경우의 수  성향 × 좌석 × 시즌을 돌려 엔딩이 실제로 갈리는지 본다
   5. 돌발 업무  data/cases.js — 구조 · 정답 · 판단을 뒤집은 답의 판별력
   6. 인물 · 이야기  화자 · 방 · 사실 · 판정 카드 · 장면 도입 · 저장
   7. 문구      대사 · 메신저가 한 줄을 넘지 않는가 (경고만)
   (게임 화면과 똑같은 js/engine.js · js/minis.js · js/season.js 를 쓴다) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js', 'data/haneul.js', 'data/daon.js', 'data/haesol.js',
                 'js/engine.js', 'js/minis.js',
                 'js/story.js', 'js/season.js', 'data/seasons.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
ctx.SEASONS.use(process.env.SEASON || 'seorin');     // SEASON=raon · SEASON=gureum node tools/validate.js
const { AE, EPILOGUE, SEASON, CAST, CASES, MINIS, STORY, DECK } = ctx;
const { SCENES, TRUTH, STORYDATA, COMPANY } = ctx;
console.log(`■ 감사 대상 — ${COMPANY.name} (${ctx.SEASONS.current().id})`);
const SEATS = Object.keys(SEASON.SEATS);
const TYPES = ['write', 'judge', 'choice', 'cloze', 'sort', 'mini'];

let bad = 0, warn = 0;
const fail = m => { console.log('  ✕ ' + m); bad++; };
const vids = sc => sc.variants ? sc.variants.map(v => v.id) : [null];
const fresh = seat => SEASON.create({ seed: 1, seat: seat || 'senior' });
const grade = (p, ans) => AE.gradeAny(p, ans);

/* 형식별 정답 */
function keyAnswer(p) {
  switch (p.type) {
    case 'judge': return { text: p.model, pick: p.verdict && p.verdict.answer };
    case 'choice': return { picked: p.options.map((o, i) => o.ok ? i : -1).filter(i => i >= 0) };
    case 'cloze': return { values: AE.parseCloze(p.text).blanks.map(b => b.ans[0]) };
    case 'sort': return { assign: p.items.map(it => it.cat) };
    case 'mini': return { mini: perfectMini(p.game) };
    default: return { text: p.model };
  }
}
function perfectMini(game) {
  const M = MINIS[game].build(4242, null);
  if (MINIS[game].perfect) return { model: M, state: MINIS[game].perfect(M) };
  if (game === 'count') {
    const TICK = { none: 'none', miss: 'miss', diff: 'diff', dmg: 'flag', cons: 'flag' };
    const tested = {};
    const ex = Object.keys(M.racks).filter(l => M.racks[l].ex);
    ex.forEach((l, i) => { tested[l] = { dir: M.racks[l].ex === 'miss' ? 'floor' : (i % 2 ? 'floor' : 'sheet'), tick: TICK[M.racks[l].ex] }; });
    Object.keys(M.racks).filter(l => !M.racks[l].ex && !M.racks[l].empty).slice(0, 3)
      .forEach((l, i) => { tested[l] = { dir: i ? 'sheet' : 'floor', tick: 'ok' }; });
    return { model: M, state: { tested } };
  }
  if (game === 'jet') return { model: M, state: { on: ['after', 'rare', 'cutoff'] } };
  if (game === 'cutoff') {
    const flag = {};
    M.rows.forEach(r => { if (r.error) flag[r.id] = true; });
    return { model: M, state: { flag } };
  }
  return { model: M, state: {} };
}

/* 단서는 상황 · 자료 원문의 부분 문자열이어야 한다 */
function textOf(it) {
  const parts = [it.situation || ''];
  (it.exhibits || []).forEach(x => {
    if (x.type === 'table') { parts.push((x.head || []).join(' ')); (x.rows || []).forEach(r => parts.push(r.join(' '))); }
    if (x.type === 'kv') (x.items || []).forEach(r => parts.push(r.join(' ')));
    if (x.type === 'memo') parts.push(x.body || '');
  });
  return parts.join('\n');
}

function checkPart(tag, p) {
  if (!TYPES.includes(p.type)) fail(`${tag} 모르는 형식: ${p.type}`);
  if (!CAST[p.who]) fail(`${tag} 묻는 사람 없음: ${p.who}`);
  if (!p.say) fail(`${tag} 대사 없음`);
  if (!p.ask) fail(`${tag} 지시문 없음`);
  if (!p.rubric || !p.rubric.must || !p.rubric.must.length) fail(`${tag} 채점 논점 없음`);
  if (p.type === 'write' || p.type === 'judge') {
    if (!p.model) fail(`${tag} 모범답안 없음`);
    if (p.verdict && !['yes', 'no'].includes(p.verdict.answer)) fail(`${tag} verdict.answer 오류`);
  }
  if (p.type === 'judge' && !(p.verdict && p.verdict.label && p.verdict.label.yes && p.verdict.label.no)) fail(`${tag} judge 인데 판단 문구 없음`);
  if (p.type === 'choice') {
    const ok = p.options.filter(o => o.ok).length;
    if (!p.options.length || p.options.some(o => !o.t)) fail(`${tag} 보기 문구 없음`);
    if (!p.multi && ok !== 1) fail(`${tag} 한 개 고르기인데 정답 ${ok}개`);
    if (p.multi && ok < 2) fail(`${tag} 모두 고르기인데 정답 ${ok}개`);
    if (p.options.length < 4) fail(`${tag} 보기가 ${p.options.length}개 — 4개 이상`);
  }
  if (p.type === 'cloze') {
    const P = AE.parseCloze(p.text);
    if (!P.blanks.length) fail(`${tag} 빈칸 없음`);
    (p.labels || []).forEach(l => (l.need || []).forEach(i => { if (i >= P.blanks.length) fail(`${tag} 라벨 "${l.label}" 이 없는 빈칸 ${i} 참조`); }));
  }
  if (p.type === 'sort') {
    if (!p.cats || p.cats.length < 2) fail(`${tag} 분류가 2개 미만`);
    p.items.forEach(it => { if (!(it.cat >= 0 && it.cat < p.cats.length)) fail(`${tag} 항목 분류 번호 오류: ${it.t}`); });
  }
  if (p.type === 'mini' && !MINIS[p.game]) fail(`${tag} 없는 미니게임: ${p.game}`);
}

/* ── 1. 구조 ───────────────────────────────────────────── */
console.log('═══ 구조 검증');
const labelsOf = {};
const typeCount = {};
SCENES.forEach(sc => {
  ['id', 'day', 'chapter', 'art', 'area', 'standards', 'prompt', 'ref', 'cost']
    .forEach(k => { if (sc[k] == null) fail(`${sc.id} 필드 누락: ${k}`); });
  labelsOf[sc.id] = new Set();
  // 동적 장면은 상태에 따라 라벨이 바뀌므로 원본 칸의 라벨도 모은다
  vids(sc).forEach(vid => {
    const v = vid ? sc.variants.find(x => x.id === vid) : { id: '-' };
    const raw = typeof sc.parts === 'function' ? sc.parts(v, fresh()) : (sc.parts || []);
    raw.forEach(p => ((p.rubric && p.rubric.must) || []).forEach(m => labelsOf[sc.id].add(m.label)));
  });
  SEATS.forEach(seat => vids(sc).forEach(vid => {
    const tag = `${sc.id}/${vid || '-'}/${seat}`;
    try {
      const it = SEASON.resolve(sc, fresh(seat), vid);
      if (!CAST[it.speaker]) fail(`${tag} 화자 없음: ${it.speaker}`);
      if (seat === 'partner' && it.speaker === 'partner') fail(`${tag} 파트너 자리인데 파트너가 말한다`);
      if (!it.line) fail(`${tag} 장면 대사 없음`);
      if (!it.parts.length) fail(`${tag} 칸이 없음`);
      const src = textOf(it);
      (it.clues || []).forEach(c => { if (src.indexOf(c) < 0) fail(`${tag} 단서가 원문에 없음: ${c}`); });
      it.parts.forEach(p => {
        checkPart(`${tag} ${p.key}`, p);
        if (seat === 'partner' && p.who === 'partner') fail(`${tag} ${p.key} 파트너 자리인데 파트너가 묻는다`);
        p.rubric.must.forEach(m => labelsOf[sc.id].add(m.label));
        if (seat === (sc.view || 'senior')) typeCount[p.type] = (typeCount[p.type] || 0) + 1;
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
// 발견 조건이 가리키는 라벨 — or 로 적힌 다른 길까지
const needsOf = c => !c ? [] : [].concat(c.need || [], ...(c.or || []).map(needsOf));
TRUTH.forEach(t => ['detect', 'verify'].forEach(key => {
  if (!t[key]) return;
  needsOf(t[key]).forEach(ref => {
    const [sid, lab] = ref.split('#');
    if (!labelsOf[sid]) fail(`진실 ${t.id}.${key} — 없는 장면: ${sid}`);
    else if (!labelsOf[sid].has(lab)) fail(`진실 ${t.id}.${key} — ${sid} 에 없는 라벨: ${lab}`);
  });
}));
const cards = SEASON.cardIndex();
console.log(`  장면 ${SCENES.length} · 형식 ${Object.entries(typeCount).map(([k, n]) => k + ' ' + n).join(' · ')} (판본 포함, 장면 시점 기준)`);
console.log(`  개념 카드 ${cards.length}장 · 진실 ${TRUTH.length} · 미니게임 ${Object.keys(MINIS).join(', ')}`);
console.log(bad ? `  → 문제 ${bad}건` : '  → 이상 없음');

/* ── 2. 정답 자가채점 ─────────────────────────────────── */
console.log('\n═══ 정답 자가채점 (칸마다 80점 미만이면 채점기준 결함)');
let low = 0;
function reportLow(tag, g) {
  low++;
  console.log(`  ${String(g.percent).padStart(3)}점  ${tag}`);
  const miss = g.res.must.filter(m => !m.hit).map(m => m.label + (m.partial ? '(절반)' : m.negated ? '(부정문)' : ''));
  const trap = (g.res.trap || []).filter(t => t.hit).map(t => t.label);
  if (miss.length) console.log(`         누락: ${miss.join(' / ')}`);
  if (trap.length) console.log(`         오탐: ${trap.join(' / ')}`);
  if (g.verdict && !g.verdict.correct) console.log(`         판단 실패 (given=${g.verdict.given}, expected=${g.verdict.expected})`);
  if (g.res.flags && g.res.flags.length) console.log(`         플래그: ${g.res.flags.join(' | ')}`);
}
SCENES.forEach(sc => {
  if (sc.dynamic === 'opinion') return;
  vids(sc).forEach(vid => {
    const it = SEASON.resolve(sc, fresh(sc.view), vid);
    it.parts.forEach(p => {
      const g = grade(p, keyAnswer(p));
      if (g.percent < 80) reportLow(`${sc.id}${vid ? '/' + vid : ''} ${p.key} [${p.type}] ${p.ask}`, g);
    });
  });
});
// 형식별 오답은 낮아야 한다
SCENES.forEach(sc => vids(sc).forEach(vid => {
  if (sc.dynamic) return;
  const it = SEASON.resolve(sc, fresh(sc.view), vid);
  it.parts.forEach(p => {
    let g = null;
    if (p.type === 'choice') g = grade(p, { picked: p.options.map((o, i) => o.ok ? -1 : i).filter(i => i >= 0).slice(0, p.multi ? 3 : 1) });
    if (p.type === 'cloze') g = grade(p, { values: [] });
    if (p.type === 'sort') g = grade(p, { assign: p.items.map(it2 => (it2.cat + 1) % p.cats.length) });
    if (p.type === 'judge') g = grade(p, { text: p.model, pick: p.verdict.answer === 'yes' ? 'no' : 'yes' });
    if (g && g.percent > 30) fail(`${sc.id}${vid ? '/' + vid : ''} ${p.key} [${p.type}] 오답인데 ${g.percent}점`);
  });
}));

/* ── 3. 판별력 ────────────────────────────────────────── */
console.log('\n═══ 판별력 (칸 단위)');
function run(label, id, vid, pi, ans) {
  const sc = SCENES.find(x => x.id === id);
  if (!sc) return;                     // 다른 회사에는 없는 장면
  const it = SEASON.resolve(sc, fresh(sc.view), vid);
  const p = it.parts[pi];
  const g = grade(p, typeof ans === 'string' ? { text: ans } : ans);
  const tr = (g.res.trap || []).filter(t => t.hit).map(t => t.label);
  const half = g.res.must.filter(m => m.partial).length;
  const note = [g.verdict && !g.verdict.correct ? '판단오답' : '', half ? `절반 ${half}` : '',
                g.res.structure && g.res.structure.listing ? '나열판정' : '', tr.length ? '감점: ' + tr.join(', ') : '']
               .filter(Boolean).join(' · ');
  console.log(`  ${String(g.percent).padStart(3)}점  ${label}${note ? '   [' + note + ']' : ''}`);
}
run('s3③ 제3자 조회 — 정답', 's3', null, 2, '제3자가 보관하는 재고이므로 임가공업체에 조회하거나 직접 검사한다.');
run('s3③ 회사 명세서 수용 — 오답', 's3', null, 2, '거래처 명세서만으로 충분하므로 명세서로 갈음한다.');
run('s3① 모두 고르기 — 정답 2 + 함정 1', 's3', null, 0, { picked: [0, 1, 2] });
run('s3① 모두 고르기 — 전부 선택', 's3', null, 0, { picked: [0, 1, 2, 3, 4] });
run('s2② 빈칸 — 오타 허용', 's2', null, 1, { values: ['무력화', '유의적 위험', '실증 절차'] });
run('s2② 빈칸 — 힌트 사용', 's2', null, 1, { values: ['무력화', '유의적 위험', '실증절차'], hints: [0] });
run('s5/BIAS① 편의 있음 — 정답', 's5', 'BIAS', 0, { pick: 'yes', text: '네 가정이 모두 채무를 줄이는 한 방향으로 일관되게 바뀌었다.' });
run('s5/BIAS① 편의 없음 — 판단 반대', 's5', 'BIAS', 0, { pick: 'no', text: '네 가정이 모두 채무를 줄이는 한 방향으로 일관되게 바뀌었다.' });
run('s8① 분류 — ⓐ ⓑ 뒤바꿈', 's8', null, 0, { assign: [1, 0] });
run('s1① 판단 반대', 's1', null, 0, { pick: 'no', text: '조직이 분리되어 있으므로 문제되지 않는다.' });
run('s2③ 분개 테스트 — 조건 전부', 's2', null, 2, { mini: { model: MINIS.jet.build(1), state: { on: ['after', 'weekend', 'self', 'exec', 'round', 'blank', 'rare', 'cutoff', 'big'] } } });
run('s3② 재고 실사 — 표본만 세고 틱 없음', 's3', null, 1, { mini: { model: MINIS.count.build(1), state: { tested: { 'A-1': { dir: 'sheet' }, 'B-1': { dir: 'floor' } } } } });

/* ── 4. 경우의 수 시뮬레이션 ──────────────────────────── */
function lcg(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
const TRUTH_LABELS = new Set([].concat(...TRUTH.map(t => [].concat(needsOf(t.detect), needsOf(t.verify)))));
const isConfront = (it, m) => (it.sc.confront || []).includes(m.label);

/* 메신저 선택 — 성향마다 고르는 방식이 다르다 (윤리 판정: hawk 는 옳은 쪽, dove 는 틀린 쪽) */
const PICK = {
  right: (b) => { const i = b.choice.opts.findIndex(o => o.ok === true); return i >= 0 ? i : 0; },
  wrong: (b) => { const i = b.choice.opts.findIndex(o => o.ok === false); return i >= 0 ? i : b.choice.opts.length - 1; },
  random: (b, r) => Math.floor(r() * b.choice.opts.length),
  skip: () => -1
};
const storyTally = { beat: {}, fate: {}, flag: {} };
function storyAt(S, at, how, r) {
  STORY.beatsAt(S, at).forEach(b => {
    storyTally.beat[b.id] = (storyTally.beat[b.id] || 0) + 1;
    b.msgs.forEach(m => STORY.log(S, b, m));
    if (b.choice) {
      const i = PICK[how](b, r);
      if (i >= 0) STORY.choose(S, b, i);
    }
    STORY.markSeen(S, b);
  });
}

const PERSONAS = {
  hawk:    { pct: () => 88, must: () => true, trap: () => false, verdict: () => true },
  dove:    { pct: () => 64, must: (it, m) => !isConfront(it, m),
             trap: (it, t, st) => !!t.please && !st.pleased && (st.pleased = true), verdict: () => true },
  mixed:   { pct: () => 74, must: (it, m, r) => !isConfront(it, m) || r() < 0.5, trap: () => false, verdict: () => true },
  lazy:    { pct: () => 44, must: (it, m, r) => r() < 0.4, trap: () => false, verdict: (it, p, r) => r() < 0.5 },
  blind:   { pct: () => 70, must: (it, m) => !TRUTH_LABELS.has(it.sc.id + '#' + m.label), trap: () => false, verdict: () => true },
  verbose: { pct: () => 70, must: (it, m, r) => r() < 0.7, trap: () => false, verdict: () => true,
             meta: r => ({ over: 260, timedOut: r() < 0.4 ? 1 : 0 }) },
  hedge:   { pct: () => 82, must: () => true, trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label), verdict: () => true },
  slip:    { pct: () => 86, must: (it, m) => !(it.sc.dynamic === 'opinion' && / 표명$/.test(m.label)),
             trap: (it, t) => it.sc.dynamic === 'opinion' && /^오답 의견/.test(t.label), verdict: () => true }
};

function synth(it, P, r) {
  const st = {};
  const parts = it.parts.map(p => ({
    res: {
      must: p.rubric.must.map(m => ({ label: m.label, hit: !!P.must(it, m, r), why: m.why })),
      trap: (p.rubric.trap || []).map(t => ({ label: t.label, score: t.score, please: t.please, hit: !!P.trap(it, Object.assign({}, t), st) }))
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
    const how = { hawk: 'right', blind: 'right', hedge: 'right', slip: 'right', dove: 'wrong', lazy: 'skip' }[name] || 'random';
    storyAt(S, 'pro', how, r);
    SCENES.forEach((sc, i) => {
      S.i = i;
      const it = SEASON.resolve(sc, S);
      if (sc.dynamic) it.parts.forEach(p => {       // 이 상태에서 생성된 정답도 80점 이상이어야 한다
        const g = grade(p, keyAnswer(p));
        if (g.percent < 80 && dynLow < 6) { dynLow++; reportLow(`${sc.id} ${p.key} ${p.ask} (${name}/${seat} seed ${seed})`, g); }
      });
      if (it.v && it.v.id !== '-') path.push(sc.id + ':' + it.v.id);
      SEASON.apply(S, it, [], synth(it, P, r), P.meta ? P.meta(r) : { over: 0, timedOut: 0 });
      storyAt(S, sc.id, how, r);
    });
    const E = SEASON.epilogue(S);
    (E.people || []).forEach(f => { storyTally.fate[f.who + ': ' + f.t] = 1; });
    Object.keys(S.flags).forEach(f => { storyTally.flag[f] = (storyTally.flag[f] || 0) + 1; });
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

if (!low && !dynLow) console.log('\n  → 모든 칸의 정답이 80점 이상 (동적 장면 포함)');
else console.log(`\n  → 정답 채점 보정 필요 ${low + dynLow}건`);

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
reach('메신저 대화', STORYDATA.BEATS.map(b => b.id), storyTally.beat);
reach('사람들의 1년 뒤', [].concat(...STORYDATA.FATES.map(f => f.list.map(x => f.who + ': ' + x.t))), storyTally.fate);
{
  // 이야기가 세우는 표지는 회사마다 다르다 — 대화 데이터에서 모은다
  const want = new Set();
  STORYDATA.BEATS.forEach(b => (b.choice ? b.choice.opts : []).forEach(o => {
    [].concat((o.fx || {}).flag || []).forEach(f => want.add(f));
  }));
  reach('이야기 표지', [...want], storyTally.flag);
}

// 저장했다가 불러와도 같은 상태인가
{
  const S = SEASON.create({ seed: 31337 });
  S.i = 3; S.gauge.E = 61; S.flags.fraud_alert = true; S.hits['s2#기간귀속 절차 확대'] = 1; S.truths[2].found = true;
  S.papers.push({ id: 's1', parts: [] });
  const R = SEASON.restore(JSON.parse(JSON.stringify(SEASON.snapshot(S))));
  const same = R.i === 3 && R.gauge.E === 61 && R.flags.fraud_alert && R.hits['s2#기간귀속 절차 확대'] &&
               R.truths[2].found && R.truths[2].def === S.truths[2].def && R.papers.length === 1 &&
               R.truths.every((t, i) => t.active === S.truths[i].active && t.amount === S.truths[i].amount);
  if (!same) fail('저장 → 불러오기 후 상태가 다르다');
  else console.log('  저장 · 이어하기: 이상 없음');
}

// 장면이 끼어들기 전의 저장본 — 번호가 아니라 그때의 장면으로 돌아와야 한다
{
  const added = SCENES.filter(sc => sc.since);
  if (added.length) {
    const old = SCENES.filter(sc => !sc.since);
    const S = SEASON.create({ seed: 4321 });
    S.i = old.length - 2;
    S.papers.push({ id: old[1].id, kind: 'scene', idx: 1, parts: [] }, { id: old[S.i - 1].id, kind: 'scene', idx: S.i - 1, parts: [] });
    const snap = JSON.parse(JSON.stringify(SEASON.snapshot(S)));
    snap.v = Math.min(...added.map(sc => sc.since)) - 1;
    const R = SEASON.restore(snap);
    const ok = SCENES[R.i] === old[S.i] && R.papers.every(p => SCENES[p.idx] && SCENES[p.idx].id === p.id);
    if (!ok) fail('예전 저장본 — 끼어든 장면만큼 번호를 옮기지 못했다');
    else console.log(`  예전 저장본: 장면 ${added.map(sc => sc.id).join(' · ')} 이 끼어든 뒤에도 제자리`);
    const R2 = SEASON.restore(JSON.parse(JSON.stringify(SEASON.snapshot(S))));
    if (R2.i !== S.i) fail('지금 저장본의 장면 번호가 밀렸다');
  }
}

/* ── 4½. 갈림길 ───────────────────────────────────────────
   갈림길마다 한 길씩 골라 모든 조합을 끝까지 돌린다.
   어느 길이든 잘하면 '지적 없음'에 닿아야 하고, 잘못 든 길에서도 돌아올 수 있어야 한다. */
{
  const forks = STORYDATA.BEATS.filter(b => b.fork && b.choice);
  if (forks.length) {
    console.log('\n═══ 갈림길 (경로마다 끝까지 · 만회)');
    const flagOf = o => [].concat((o.fx || {}).flag || [])[0];
    const combos = forks.map(b => b.choice.opts.map(flagOf))
      .reduce((acc, list) => [].concat(...acc.map(a => list.map(x => a.concat([x])))), [[]]);
    // picks 갈림길에서 고를 표지들 · opt.pick(대화) 그 대화에서 고를 번호 · opt.persona(장면) 그 장면만 다른 성향으로
    const playRoute = (seed, picks, opt) => {
      opt = opt || {};
      const S = SEASON.create({ seed });
      const r = lcg(seed * 17 + 3);
      const at = a => STORY.beatsAt(S, a).forEach(b => {
        b.msgs.forEach(m => STORY.log(S, b, m));
        if (b.choice) {
          let i = b.fork ? b.choice.opts.findIndex(o => picks.includes(flagOf(o))) : (opt.pick ? opt.pick(b) : null);
          if (i == null) i = PICK.right(b, r);
          if (i >= 0) STORY.choose(S, b, i);
        }
        STORY.markSeen(S, b);
      });
      at('pro');
      const path = {};
      SCENES.forEach((sc, i) => {
        S.i = i;
        if (opt.tweak) opt.tweak(S, sc);
        const it = SEASON.resolve(sc, S);
        if (it.v && it.v.id !== '-') path[sc.id] = it.v.id;
        SEASON.apply(S, it, [], synth(it, (opt.persona && opt.persona(sc)) || PERSONAS.hawk, r), { over: 0, timedOut: 0 });
        at(sc.id);
      });
      return { S, E: SEASON.epilogue(S), path };
    };
    const N = 12, seen = {};
    combos.forEach(picks => {
      let clean = 0, all = 0, minT = 100;
      const names = {};
      for (let k = 1; k <= N; k++) {
        const x = playRoute(k * 104729, picks);
        if (x.E.audit.id === 'clean') clean++;
        if (x.E.missed === 0) all++;
        minT = Math.min(minT, x.S.gauge.T);
        SEASON.routeTrail(x.S).forEach(t => { if (!t.recap) fail(`갈림길 ${t.no} — 고른 길의 한 줄(recap)이 없다`); });
        const nm = SEASON.routeOf(x.S).join(' → ');
        names[nm] = 1; seen[nm] = 1;
      }
      console.log(`  ${Object.keys(names).join(' / ').padEnd(30)} 지적 없음 ${clean}/${N} · 전부 발견 ${all}/${N} · 남은 시간 최저 ${minT}`);
      if (clean < N) fail(`경로 ${picks.join(' + ')} — 다 맞혀도 '지적 없음'이 ${clean}/${N}`);
    });
    console.log(`  서로 다른 경로 ${Object.keys(seen).length}가지`);
    if (Object.keys(seen).length < combos.length) fail('갈림길 조합마다 다른 경로가 나오지 않는다');

    /* 회사마다 — 놓친 사실을 경로 장면에서 되찾는 길, 막힌 길에서 돌아오는 길이 실제로 열리는지 */
    const MISS = { pct: () => 40, must: () => false, trap: () => false, verdict: () => true };
    const LACK = label => ({ pct: () => 80, must: (it, m) => m.label !== label, trap: () => false, verdict: () => true });   // 그 논점만 놓친다
    const found = (x, id) => x.S.truths.some(t => t.id === id && t.found);
    const seedWhere = pred => { for (let k = 1; k < 400; k++) { const sd = k * 7919; if (pred(SEASON.create({ seed: sd }).active)) return sd; } return 7919; };
    const check = (ok, title, detail) => { if (ok) console.log('  ' + title); else fail(title + ' — ' + detail); };
    const RECOVER = {
      seorin() {
        let x = playRoute(7919, ['route_data', 'route_chair'], { persona: sc => sc.id === 's2' ? MISS : null });
        check(!x.S.flags.fraud_alert && x.path.s5b === 'LATE' && found(x, 'circular_flow'),
          '만회 ① 위험평가 놓침 → 뒤늦은 전수 추출 → 순환거래 발견', `판본 ${x.path.s5b}, 순환거래 ${found(x, 'circular_flow')}`);
        x = playRoute(7919, ['route_person', 'route_chair'],
          { pick: b => b.id === 's4_sua' ? b.choice.opts.findIndex(o => flagOf(o) === 'sua_leak') : null });
        check(x.path.s5b === 'BACK' && x.path.s6 === 'HIT' && x.E.audit.id === 'clean',
          '만회 ② 면담 불발 → 서버실로 복귀 → 지적 없음', `판본 ${x.path.s5b}/${x.path.s6}, ${x.E.audit.title}`);
        x = playRoute(7919, ['route_data', 'route_ceo']);
        const y = playRoute(7919, ['route_data', 'route_ceo'], { pick: b => b.id === 's7_chair' ? b.choice.opts.findIndex(o => o.ok === false) : null });
        check(x.S.flags.chair_backing && !y.S.flags.chair_backing,
          '만회 ③ 대표이사 먼저 → 감사위원장에게 바로 가면 지지, 미루면 없음', `바로 감 ${!!x.S.flags.chair_backing}, 미룸 ${!!y.S.flags.chair_backing}`);
        const late = ['route_data', 'route_person'].map(f => playRoute(7919, [f, 'route_chair'], { persona: sc => sc.id === 's5b' ? MISS : null }));
        check(late.every(z => z.path.s6 === 'MISS' && z.S.late),
          '단서 추적을 놓치면 어느 길이든 외부 제보로 뒤늦게 인지', late.map(z => z.path.s6).join(' · '));
      },
      raon() {
        let x = playRoute(7919, ['route_confirm', 'route_clinic'], { persona: sc => sc.id === 'r4' ? MISS : null });
        check(x.path.r3b === 'ASK' && found(x, 'license_early'),
          '만회 ① 기술이전 장면 놓침 → 상대방 조회로 공동연구 확인 → 계약금 조기 인식 발견', `판본 ${x.path.r3b}, 발견 ${found(x, 'license_early')}`);
        x = playRoute(seedWhere(a => a.dev_cap), ['route_record', 'route_clinic'], { persona: sc => sc.id === 'r3' ? MISS : null });
        check(x.path.r5b === 'DATA' && found(x, 'dev_cap'),
          '만회 ② 개발비 장면 놓침 → 데이터룸 승인 문서 → 자산화 시점 발견', `판본 ${x.path.r5b}, 발견 ${found(x, 'dev_cap')}`);
        x = playRoute(seedWhere(a => a.rcps_class), ['route_record', 'route_funding'], { persona: sc => sc.id === 'r5' ? LACK('계약 조건을 직접 확인') : null });
        check(x.path.r5b === 'FUND' && found(x, 'rcps_class'),
          '만회 ③ 우선주 계약서 놓침 → 증자 서류의 상환 조건 → 분류 오류 발견', `판본 ${x.path.r5b}, 발견 ${found(x, 'rcps_class')}`);
        x = playRoute(7919, ['route_record', 'route_clinic'], { pick: b => b.id === 'raon_clin' ? 1 : null });
        check(x.path.r5b === 'WALL' && x.E.audit.id === 'clean',
          '막힌 길 ① 오예린의 믿음을 잃으면 데이터룸이 닫히고 주관사로 → 지적 없음', `판본 ${x.path.r5b}, ${x.E.audit.title}`);
        x = playRoute(7919, ['route_confirm', 'route_funding'], { tweak: (S, sc) => { if (sc.id === 'r3b') S.rel.company = 30; } });
        check(x.path.r3b === 'BLOCK' && x.E.audit.id === 'clean',
          '막힌 길 ② 회사가 비협조적이면 조회가 막히고 연구 기록으로 → 지적 없음', `판본 ${x.path.r3b}, ${x.E.audit.title}`);
      },
      gureum() {
        const ghost = seedWhere(a => a.ghost_bill), prog = seedWhere(a => a.progress);
        const IT = sc => (sc.id === 'g2' || sc.id === 'g3') ? MISS : null;   // 로그 검사 · 데이터 분석을 다 놓친다
        let x = playRoute(ghost, ['route_full', 'route_client'], { persona: IT });
        check(x.path.g2b === 'FULL' && found(x, 'ghost_bill'),
          '만회 ① 로그 · 데이터 분석 놓침 → 전수 재계산의 차이 추적 → 가공 청구 발견', `판본 ${x.path.g2b}, 발견 ${found(x, 'ghost_bill')}`);
        x = playRoute(ghost, ['route_fix', 'route_client'], { persona: IT });
        check(x.path.g2b === 'FIX' && found(x, 'ghost_bill') && !!x.S.story.seen.gur_dev04,
          '만회 ② 로그 · 데이터 분석 놓침 → 개선 통제 테스트의 계정 목록 → 살아 있던 계정 → 가공 청구 발견',
          `판본 ${x.path.g2b}, 발견 ${found(x, 'ghost_bill')}, 서태오 ${!!x.S.story.seen.gur_dev04}`);
        x = playRoute(7919, ['route_full', 'route_site'], { persona: sc => sc.id === 'g6' ? MISS : null });
        check(x.path.g5b === 'SITE' && found(x, 'moru'),
          '만회 ③ 특수관계자 장면 놓침 → 모루 현장의 4대보험 가입 내역 → 하도급비 과다 지급 발견', `판본 ${x.path.g5b}, 발견 ${found(x, 'moru')}`);
        x = playRoute(prog, ['route_fix', 'route_client'], { persona: sc => sc.id === 'g4' ? LACK('투입공수를 근태 등 독립적 기록과 대조') : null });
        check(x.path.g5b === 'CLIENT' && found(x, 'progress'),
          '만회 ④ 투입공수 대조 놓침 → 발주처 출입 기록 → SI 진행률 과대 발견', `판본 ${x.path.g5b}, 발견 ${found(x, 'progress')}`);
        x = playRoute(7919, ['route_fix', 'route_site'], { pick: b => b.id === 'gur_ops' ? 2 : null });
        check(x.path.g2b === 'STALL' && x.E.audit.id === 'clean',
          '막힌 길 ① 서태오를 밀어내면 권한 회수가 미뤄지고 전수 재계산으로 → 지적 없음', `판본 ${x.path.g2b}, ${x.E.audit.title}`);
        x = playRoute(7919, ['route_full', 'route_site'], { pick: b => b.id === 'gur_sipm' ? b.choice.opts.findIndex(o => flagOf(o) === 'sipm_cold') : null });
        check(x.path.g5b === 'SHUT' && x.E.audit.id === 'clean',
          '막힌 길 ② 문경호를 자극하면 모루가 문을 닫고 발주처로 → 지적 없음', `판본 ${x.path.g5b}, ${x.E.audit.title}`);
      }
    };
    const co = process.env.SEASON || 'seorin';
    if (RECOVER[co]) RECOVER[co]();
    else fail(`${co} — 갈림길은 있는데 만회 검사가 없다 (tools/validate.js RECOVER)`);
  }
}

/* ── 5. 돌발 업무 ─────────────────────────────────────── */
console.log('\n═══ 돌발 업무 (data/cases.js)');
{
  let caseBad = 0, caseParts = 0, flips = 0, flipBad = 0;
  const ids = new Set(), tags = {}, ctypes = {};
  const cfail = m => { console.log('  ✕ ' + m); caseBad++; bad++; };
  (CASES || []).forEach(c => {
    if (ids.has(c.id)) cfail(`${c.id} id 중복`);
    ids.add(c.id);
    tags[c.tag] = (tags[c.tag] || 0) + 1;
    ['id', 'tag', 'chapter', 'area', 'brief', 'art', 'view', 'speaker', 'line', 'situation', 'ref']
      .forEach(k => { if (c[k] == null) cfail(`${c.id} 필드 누락: ${k}`); });
    const it = SEASON.resolve(c, fresh(c.view));
    if (!CAST[it.speaker]) cfail(`${c.id} 화자 없음: ${it.speaker}`);
    const src = textOf(it);
    (it.clues || []).forEach(k => { if (src.indexOf(k) < 0) cfail(`${c.id} 단서가 원문에 없음: ${k}`); });
    it.parts.forEach(p => {
      caseParts++;
      ctypes[p.type] = (ctypes[p.type] || 0) + 1;
      const tag = `${c.id}${p.key}`;
      const before = bad;
      checkPart(tag, p);
      caseBad += bad - before;
      if ((p.type === 'write' || p.type === 'judge') && (!p.guide || !p.guide.length)) cfail(`${tag} 답안 양식(guide) 없음`);
      const g = grade(p, keyAnswer(p));
      if (g.percent < 80) { cfail(`${tag} 정답이 ${g.percent}점`); reportLow(`${tag} ${p.ask}`, g); }
      // 판단을 뒤집은 답 — 근거가 같아도 0점에 가까워야 한다
      let gf = null;
      if (p.type === 'judge') gf = grade(p, { text: p.model, pick: p.verdict.answer === 'yes' ? 'no' : 'yes' });
      else if (p.type === 'write' && p.verdict && p.verdict.label) {
        const L = p.verdict.label;
        const right = p.verdict.answer === 'yes' ? L.yes : L.no, wrong = p.verdict.answer === 'yes' ? L.no : L.yes;
        if (p.model.indexOf(right) >= 0) gf = grade(p, { text: p.model.replace(right, wrong) });
      }
      if (gf) { flips++; if (gf.percent > 30) { flipBad++; cfail(`${tag} 판단을 뒤집어도 ${gf.percent}점`); } }
    });
  });
  console.log(`  ${CASES.length}건 · 칸 ${caseParts}개 (${Object.entries(ctypes).map(([k, n]) => k + ' ' + n).join(' · ')})`);
  console.log(`  분야 ${Object.keys(tags).length}개 (${Object.entries(tags).map(([k, n]) => k + ' ' + n).join(' · ')})`);
  console.log(`  판단을 뒤집은 답 ${flips}개 중 30점 넘는 답 ${flipBad}개`);
  console.log(caseBad ? `  → 문제 ${caseBad}건` : '  → 이상 없음');
  const S1 = SEASON.create({ seed: 4242 }), S2 = SEASON.create({ seed: 4242 });
  S1.i = S2.i = 1;
  const o1 = SEASON.offer(S1, 3).map(c => c.id).join(','), o2 = SEASON.offer(S2, 3).map(c => c.id).join(',');
  if (o1 !== o2) fail('같은 시즌 코드인데 요청 카드가 다르다');
  const oTags = SEASON.offer(SEASON.create({ seed: 77 }), 3).map(c => c.tag);
  if (new Set(oTags).size !== oTags.length) fail('요청 카드 분야가 겹친다: ' + oTags.join(', '));
}

/* ── 6. 인물 · 이야기 ─────────────────────────────────── */
console.log('\n═══ 인물 · 이야기 (data/cast.js · data/story.js)');
{
  const before = bad;
  const factIds = new Set();
  Object.entries(CAST).forEach(([k, c]) => {
    ['name', 'role', 'avatar', 'group'].forEach(f => { if (!c[f]) fail(`인물 ${k} 필드 누락: ${f}`); });
    (c.facts || []).forEach(f => { if (factIds.has(f.id)) fail(`인물 사실 id 중복: ${f.id}`); factIds.add(f.id); });
  });
  const ats = new Set(['pro'].concat(SCENES.map(sc => sc.id)));
  const ids = new Set();
  const S0 = SEASON.create({ seed: 5 });
  const who = k => { if (k && k !== 'me' && !CAST[k]) fail(`대화 화자 없음: ${k}`); };
  STORYDATA.BEATS.forEach(b => {
    if (ids.has(b.id)) fail(`대화 id 중복: ${b.id}`);
    ids.add(b.id);
    if (!ats.has(b.at)) fail(`${b.id} at 오류: ${b.at}`);
    if (!(b.room === 'team' || (b.room === 'talk' && b.place) || (/^dm:/.test(b.room) && CAST[b.room.slice(3)]))) fail(`${b.id} 방 오류: ${b.room}`);
    (b.facts || []).forEach(f => { if (!factIds.has(f)) fail(`${b.id} 없는 인물 사실: ${f}`); });
    let rb;
    try { rb = STORY.resolveBeat(b, S0); } catch (e) { fail(`${b.id} 풀기 예외: ${e.message}`); return; }
    if (!rb.msgs.length) fail(`${b.id} 메시지 없음`);
    rb.msgs.forEach(m => who(m.from));
    if (b.fork && !b.choice) fail(`${b.id} 갈림길인데 답장이 없다`);
    if (b.choice) {
      if (b.choice.opts.length < 2 || b.choice.opts.length > 4) fail(`${b.id} 답장 수 ${b.choice.opts.length}`);
      if (b.fork) {
        if (!SCENES.some(sc => sc.fork)) fail(`${b.id} 갈림길인데 경로 장면(fork)이 없다`);
        b.choice.opts.forEach(o => {
          if (!o.to || !o.sub) fail(`${b.id} 갈림길 답장에 가는 곳(to · sub) 없음: ${o.t}`);
          if (!(o.fx && o.fx.flag)) fail(`${b.id} 갈림길 답장에 경로 표지 없음: ${o.t}`);
          if (o.ok === true || o.ok === false) fail(`${b.id} 갈림길에는 옳고 그름을 두지 않는다`);
        });
      }
      const judged = b.choice.opts.some(o => o.ok === true || o.ok === false);
      if (judged && !b.choice.card) fail(`${b.id} 판정이 있는데 개념 카드 없음`);
      if (judged && b.choice.opts.filter(o => o.ok === true).length !== 1) fail(`${b.id} 옳은 답장이 1개가 아님`);
      b.choice.opts.forEach(o => {
        (o.reply || []).forEach(m => who(m.from));
        Object.keys(o.fx || {}).forEach(k => { if (!['bond', 'R', 'E', 'T', 'C', 'flag', 'fact'].includes(k)) fail(`${b.id} 모르는 fx: ${k}`); });
        Object.keys((o.fx || {}).bond || {}).forEach(k => { if (STORYDATA.BONDS[k] == null) fail(`${b.id} 관계 없는 인물: ${k}`); });
        [].concat((o.fx || {}).fact || []).forEach(f => { if (!factIds.has(f)) fail(`${b.id} 없는 인물 사실: ${f}`); });
      });
    }
  });
  SCENES.forEach(sc => { if (!STORYDATA.OPEN[sc.id]) fail(`${sc.id} 장면 도입 없음`); });
  STORYDATA.FATES.forEach(f => { if (!CAST[f.who]) fail(`1년 뒤 — 없는 인물: ${f.who}`); });
  // 판본마다 장면 도입 문구가 나오는가
  SCENES.forEach(sc => vids(sc).forEach(vid => {
    const v = vid ? sc.variants.find(x => x.id === vid) : { id: '-' };
    const o = STORY.opener(sc, S0, v);
    if (!o || !o.text) fail(`${sc.id}/${vid || '-'} 장면 도입 문구 없음`);
  }));
  // 인물 사실 — 이 회사 시즌에서 세는 사실은 이 회사 이야기로 열 수 있어야 한다 (수집이 끝까지 차게)
  {
    const openers = new Set();
    const walk = o => { if (!o || typeof o !== 'object') return; if (o.fx && o.fx.fact) [].concat(o.fx.fact).forEach(f => openers.add(f)); Object.values(o).forEach(walk); };
    STORYDATA.BEATS.forEach(b => { (b.facts || []).forEach(f => openers.add(f)); walk(b.choice); });
    SCENES.forEach(sc => (sc.variants || []).forEach(v => (v.facts || []).forEach(f => {
      if (!factIds.has(f)) fail(`${sc.id}/${v.id} 없는 인물 사실: ${f}`);
      openers.add(f);
    })));
    const seenK = {};
    let nFacts = 0;
    ['team', 'client', 'outside', 'other'].forEach(g => (ctx.CAST_ORDER[g] || []).forEach(k => {
      if (seenK[k] || !CAST[k]) return;
      seenK[k] = 1;
      ctx.SEASONS.facts(k).forEach(f => {
        if (f.open) return;
        nFacts++;
        if (!openers.has(f.id)) fail(`인물 사실 ${k}:${f.id} — 이 회사 이야기로 열 수 없다 (수집이 끝까지 안 찬다)`);
      });
    }));
    console.log(`  인물 파일 수집 대상 ${nFacts}개 — 모두 이야기로 열린다`);
  }
  // 저장 → 불러오기에 이야기 기록이 남는가
  // (회사마다 대화 id 가 다르다 — 처음으로 대화가 있는 시점을 쓴다)
  const S1 = SEASON.create({ seed: 99 });
  const at1 = ['pro'].concat(SCENES.map(sc => sc.id)).find(a => STORY.beatsAt(S1, a).length);
  const b1 = at1 ? STORY.beatsAt(S1, at1) : [];
  b1.forEach(b => { STORY.choose(S1, b, 1); STORY.markSeen(S1, b); });
  const R1 = SEASON.restore(JSON.parse(JSON.stringify(SEASON.snapshot(S1))));
  const lostSeen = b1.filter(b => !R1.story.seen[b.id]).map(b => b.id);
  const bondSame = Object.keys(S1.bond || {}).every(k => R1.bond[k] === S1.bond[k]);
  if (!b1.length) fail('저장 검사 — 대화가 하나도 없다');
  else if (lostSeen.length || !bondSame) fail('저장 → 불러오기 후 이야기 상태가 다르다' + (lostSeen.length ? ' (' + lostSeen.join(', ') + ')' : ''));
  // 암기 카드
  const dids = new Set(), dstd = {};
  DECK.forEach(c => {
    if (dids.has(c.id)) fail(`암기 카드 id 중복: ${c.id}`);
    dids.add(c.id);
    ['std', 'tag', 'q'].forEach(f => { if (!c[f]) fail(`암기 카드 ${c.id} 필드 누락: ${f}`); });
    if (!Array.isArray(c.a) || !c.a.length) fail(`암기 카드 ${c.id} 뒷면 없음`);
    if (c.q.length > 46) warn++;
    dstd[c.std] = (dstd[c.std] || 0) + 1;
  });
  const cardsN = STORY.cards().length;
  console.log(`  인물 ${Object.keys(CAST).length}명 · 대화 ${STORYDATA.BEATS.length}개 · 판정 카드 ${cardsN}장 · 1년 뒤 ${STORYDATA.FATES.length}명`);
  console.log(`  암기 카드 ${DECK.length}장 · 묶음 ${Object.keys(dstd).length}개 (${Object.entries(dstd).slice(0, 6).map(([k, n]) => k + ' ' + n).join(' · ')} …)`);
  console.log(bad > before ? `  → 문제 ${bad - before}건` : '  → 이상 없음');
}

/* ── 6½. 스타일 이름 충돌 ──────────────────────────────
   같은 이름의 @keyframes 가 두 번이면 나중 것이 앞의 것을 덮는다 (엔딩 잉크가 붉은 펜 줄을 90배로 키운 사고).
   화면 전체를 덮는 position: fixed 클래스가 다른 선택자 안에서도 쓰이면 그 요소까지 덮개가 된다 (.ink · .ring 사고). */
console.log('\n═══ 스타일 이름 충돌 (@keyframes · 덮개 클래스)');
{
  const cssDir = path.join(ROOT, 'css');
  const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  const kf = {}, fixedTop = {}, uses = [];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    (src.match(/@keyframes\s+([\w-]+)/g) || []).forEach(m => { const n = m.split(/\s+/)[1]; (kf[n] = kf[n] || []).push(f); });
    // 규칙 단위로 자른다 (@media 안쪽도 같은 모양이라 그대로 본다)
    src.split('}').forEach(chunk => {
      const i = chunk.lastIndexOf('{');
      if (i < 0) return;
      const sel = chunk.slice(0, i).replace(/^[\s\S]*\{/, '').trim(), body = chunk.slice(i + 1);
      if (!sel || sel.startsWith('@') || /^(from|to|\d+%)/.test(sel)) return;
      sel.split(',').map(s => s.trim()).forEach(s => {
        const top = /^\.([a-zA-Z][\w-]*)(?=[\s.:[>+~]|$)/.exec(s);
        if (top && /position:\s*fixed/.test(body) && /^\.[\w-]+(\.[\w-]+|:[\w-]+|::[\w-]+)*$/.test(s)) (fixedTop[top[1]] = fixedTop[top[1]] || new Set()).add(f);
        uses.push({ s, f });
      });
    });
  });
  const dupK = Object.keys(kf).filter(n => kf[n].length > 1);
  dupK.forEach(n => { bad++; console.log(`  ✕ @keyframes ${n} 가 여러 번: ${kf[n].join(' · ')}`); });
  // 선택자의 대상(맨 끝 덩어리)에 그 클래스가 붙은 경우만 — 안쪽 자식을 꾸미는 규칙은 같은 부품이다
  const subject = s => s.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || '';
  let clash = 0;
  Object.keys(fixedTop).forEach(n => {
    const re = new RegExp('\\.' + n + '(?![\\w-])');
    // body · html 상태로 같은 덮개를 바꾸는 규칙(body:has(.phn) .toasts)은 같은 부품이다
    const rootCtx = new RegExp('^(html|body|:root)[^\\s>+~]*\\s+\\.' + n + '(?![\\w-])[^\\s>+~]*$');
    const other = uses.filter(u => re.test(subject(u.s)) && !new RegExp('^\\.' + n + '(?![\\w-])').test(u.s) && !rootCtx.test(u.s));
    if (other.length) { bad++; clash++; console.log(`  ✕ 덮개 클래스 .${n} 가 다른 선택자에도 쓰임: ${other.slice(0, 3).map(u => u.s + ' (' + u.f + ')').join(' · ')}`); }
  });
  if (!dupK.length && !clash) console.log('  → 이상 없음');
}

/* ── 7. 문구 ──────────────────────────────────────────── */
console.log('\n═══ 문구 (대사는 한 줄 · 42자 이내 권장)');
{
  const long = [];
  const chk = (tag, s) => { if (s && s.length > 42) long.push(`${tag} (${s.length}자) ${s}`); };
  SCENES.concat(CASES).forEach(sc => vids(sc).forEach(vid => {
    const it = SEASON.resolve(sc, fresh(sc.view), vid);
    chk(`${sc.id}${vid ? '/' + vid : ''} 첫 대사`, it.line);
    it.parts.forEach(p => chk(`${sc.id}${vid ? '/' + vid : ''}${p.key}`, p.say));
  }));
  const S0 = SEASON.create({ seed: 5 });
  STORYDATA.BEATS.forEach(b => {
    const rb = STORY.resolveBeat(b, S0);
    rb.msgs.forEach(m => { if (m.t && m.t.length > 36) long.push(`메신저 ${b.id} (${m.t.length}자) ${m.t}`); });
    (b.choice ? b.choice.opts : []).forEach(o => { if (o.t.length > 36) long.push(`답장 ${b.id} (${o.t.length}자) ${o.t}`); });
  });
  warn += long.length;
  long.slice(0, 12).forEach(l => console.log('  ! ' + l));
  console.log(long.length ? `  → 긴 대사 ${long.length}건 (경고)` : '  → 이상 없음');
}

if (bad) console.log(`\n문제 ${bad}건`);
/* 채점 띠 — 같은 뜻인데 0점인지, 반대로 퍼주는지 (tools/gradelab.js)
   SEASON 을 지정하지 않은 기본 실행에서만 돌린다. NO_LAB=1 로 끌 수 있다. */
if (!process.env.SEASON && !process.env.NO_LAB) {
  console.log('\n═══ 채점 띠 (모범답안 · 용어 뭉뚱그림 · 방향만 · 딴 문항)');
  const lab = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'gradelab.js')], { encoding: 'utf8' });
  (lab.stdout || '').split('\n').filter(l => /평균|벗어난 칸/.test(l)).forEach(l => console.log('  ' + l.trim()));
  if (lab.status) { bad++; console.log('  ✕ 채점 띠를 벗어난 칸이 너무 많다 — node tools/gradelab.js --bad'); }
  else console.log('  → 이상 없음');

  /* 존칭 — 직급 아래에서 위로 반말, 시점 인물과 안 맞는 부름말 (tools/honorifics.js) */
  console.log('\n═══ 존칭 (누가 누구에게 — 시점 인물 기준)');
  const hon = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'honorifics.js')], { encoding: 'utf8' });
  (hon.stdout || '').split('\n').filter(l => /✕|고칠 것/.test(l)).slice(0, 12).forEach(l => console.log('  ' + l.trim()));
  if (hon.status) { bad++; console.log('  ✕ 존칭이 어긋난 대사 — node tools/honorifics.js'); }
  else console.log('  → 이상 없음');

  /* AI 연동 채점 — 요청 · 판정 변환 (tools/aigrade-check.js, Claude 를 부르지 않는다) */
  console.log('\n═══ AI 연동 채점 (요청 · 판정 변환)');
  const aig = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'aigrade-check.js')], { encoding: 'utf8' });
  (aig.stdout || '').split('\n').filter(l => /✕|칸 \d+개/.test(l)).slice(0, 12).forEach(l => console.log('  ' + l.trim()));
  if (aig.status) { bad++; console.log('  ✕ 판정 변환이 어긋난 칸 — node tools/aigrade-check.js'); }
  else console.log('  → 이상 없음');
}

process.exitCode = bad ? 1 : 0;
