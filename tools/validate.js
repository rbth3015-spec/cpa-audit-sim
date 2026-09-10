/* 회계감사 시뮬레이터 — 채점 엔진 / 콘텐츠 검증
   실행:  node tools/validate.js
   문제를 추가한 뒤에는 반드시 돌려볼 것.
   특히 '모범답안 자가채점'이 80점 미만이면 채점기준에 결함이 있다는 뜻이다. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const s = { console }; s.window = s; vm.createContext(s);
for (const f of ['data/lexicon.js', 'data/cases.js', 'js/engine.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
const { AE, CASES, LEXICON } = s;

const LABELS = ['①', '②', '③', '④', '⑤', '⑥'];
function resolve(c, q, vid) {
  const v = q.variants ? (vid ? q.variants.find(x => x.id === vid) : q.variants[0]) : { id: '-', label: '' };
  let parts, situations = null;
  if (q.pool) {
    const idxs = v.pick || q.pool.map((_, i) => i);
    situations = idxs.map((idx, i) => Object.assign({}, q.pool[idx], { label: LABELS[i] }));
    parts = situations;
  } else {
    parts = q.parts(v);
    parts.forEach((p, i) => { if (!p.label && parts.length > 1) p.label = LABELS[i]; });
  }
  return { v, parts, situations, model: q.model ? q.model(v) : situations.map(x => x.label + ' ' + x.model) };
}

/* ── 1. 구조 검증 ───────────────────────────────── */
let bad = 0, nQ = 0, nPts = 0, nParts = 0;
console.log('═══ 구조 검증');
CASES.forEach(c => {
  ['id', 'no', 'points', 'title', 'chapter', 'standards', 'questions'].forEach(k => {
    if (c[k] == null) { console.log(`  ✕ ${c.id} 필드 누락: ${k}`); bad++; }
  });
  nPts += c.points;
  c.questions.forEach(q => {
    nQ++;
    if (!['judge', 'list', 'essay'].includes(q.form)) { console.log(`  ✕ ${c.id} 물음${q.no} form 오류`); bad++; }
    const vs = q.variants || [{ id: '-' }];
    vs.forEach(v => {
      try {
        const r = resolve(c, q, v.id === '-' ? null : v.id);
        nParts += r.parts.length;
        if (!r.parts.length) { console.log(`  ✕ ${c.id} 물음${q.no} ${v.id} parts 없음`); bad++; }
        r.parts.forEach((p, i) => {
          if (!p.rubric || !p.rubric.must || !p.rubric.must.length) {
            console.log(`  ✕ ${c.id} 물음${q.no} ${v.id} part${i} rubric 없음`); bad++;
          }
          if (q.form === 'judge' && !['O', 'X'].includes(p.ox)) {
            console.log(`  ✕ ${c.id} 물음${q.no} ${v.id} part${i} ox 없음`); bad++;
          }
        });
        if (q.situation) q.situation(v);
        if (q.exhibits) q.exhibits(v);
        if (!r.model || !r.model.length) { console.log(`  ! ${c.id} 물음${q.no} ${v.id} 모범답안 없음`); bad++; }
        (q.followUps || []).forEach((f, k) => { f.when({ percent: 50 }, v); f.parts(v); if (f.model) f.model(v); });
      } catch (e) { console.log(`  ✕ ${c.id} 물음${q.no} ${v.id} 예외: ${e.message}`); bad++; }
    });
  });
});
console.log(`  문제 ${CASES.length} · 물음 ${nQ} · 총 ${nPts}점 · 답안칸 ${nParts} · 사전 ${Object.keys(LEXICON).length}항목`);
console.log(bad ? `  → 문제 ${bad}건` : '  → 이상 없음');

/* ── 2. 모범답안 자가채점 (모든 물음·모든 variant) ── */
console.log('\n═══ 모범답안 자가채점 (80점 미만이면 채점기준 결함)');
let low = 0;
CASES.forEach(c => c.questions.forEach(q => {
  (q.variants || [{ id: '-' }]).forEach(v => {
    const r = resolve(c, q, v.id === '-' ? null : v.id);
    const answers = r.parts.map((p, i) => {
      // 모범답안을 그대로 답안으로 사용
      let t = r.model[i] || r.model.join(' ');
      if (q.form === 'essay') t = r.model.join(' ');
      return { text: String(t).replace(/^[①②③④⑤⑥]\s*/, '').replace(/^[OX]\s*—\s*/, ''), ox: p.ox || null };
    });
    const g = AE.gradeParts(answers, r.parts, q.form);
    const tag = `문${c.no}-물${q.no}${v.id !== '-' ? '/' + v.id : ''}`;
    if (g.percent < 80) {
      low++;
      const miss = [];
      g.parts.forEach(p => p.res.must.filter(m => !m.hit).forEach(m => miss.push((p.label || '') + m.label)));
      console.log(`  ${String(g.percent).padStart(3)}점  ${tag.padEnd(14)} 누락: ${miss.join(' / ') || '-'}`);
    }
  });
}));
console.log(low ? `  → ${low}건 보정 필요` : '  → 전부 80점 이상');

/* ── 3. 판별력 시나리오 ─────────────────────────── */
console.log('\n═══ 판별력');
function run(label, cid, qno, vid, answers) {
  const c = CASES.find(x => x.id === cid), q = c.questions.find(x => x.no === qno);
  const r = resolve(c, q, vid);
  const g = AE.gradeParts(answers, r.parts, q.form);
  const trap = [];
  g.parts.forEach(p => (p.res.trap || []).filter(t => t.hit).forEach(t => trap.push(t.label)));
  console.log(`  ${String(g.percent).padStart(3)}점  ${label}${trap.length ? '   [감점: ' + trap.join(', ') + ']' : ''}`);
  return g.percent;
}

const A = t => [{ text: t, ox: null }];
run('505-A 수험생 정답', 'p04', 1, 'A', A('조회서를 재발송하고 대체적 감사절차를 수행한다. 기말 후 현금회수 내역을 은행거래내역과 대조하고 계약서·거래명세서·운송증빙과 대사한다. 미회신 사유의 타당성을 평가하고 부정위험 징후인지 고려하며, 충분하고 적합한 감사증거를 입수하지 못하면 감사범위제한에 해당하여 한정의견 또는 의견거절을 표명한다.'));
run('505-A 키워드 나열', 'p04', 1, 'A', A('대체적감사절차 현금회수 거래명세서 미회신사유 부정 감사범위제한 한정의견 의견거절'));
run('505-A 부정문 오답', 'p04', 1, 'A', A('금액이 크지 않으므로 대체적 감사절차를 수행할 필요가 없다. 회사가 제시한 자료로 충분하므로 설명을 수용하고 종결한다.'));
run('505-B 과잉대응(오답)', 'p04', 1, 'B', A('대체적 감사절차를 수행하였으나 증거가 부족하므로 감사범위제한에 해당하여 한정의견을 표명한다.'));
run('505-B 올바른 답안', 'p04', 1, 'B', A('미회신 잔액은 수행중요성에 미달하고 기말 후 전액 현금회수가 확인된다. 이를 대체적 감사절차로 수행하면 충분하고 적합한 감사증거를 입수한 것이므로 감사범위제한에 해당하지 않는다.'));
run('505-A 오타 포함', 'p04', 1, 'A', A('대체적 감사절차를 수행한다. 기말 후 현금회수를 확인하고 거래명세써와 대사하며 미회신 사유의 타당성을 평가한다. 부정위험을 고려하고 증거가 부족하면 감사범위제한으로 보아 한정의견을 검토한다.'));

console.log('');
run('judge 전부 정답', 'p05', 2, 'A', [
  { ox: 'O', text: '중요한 불확실성이 주석에 적절히 공시되었으므로 의견을 변형하지 아니하고 감사보고서에 별도의 단락을 두어 기재하기 때문이다.' },
  { ox: 'X', text: '중요한 불확실성이 공시되지 않은 것은 중요한 왜곡표시이므로 한정의견 또는 부적정의견을 표명하기 때문이다.' }]);
run('judge 판단 반대', 'p05', 2, 'A', [
  { ox: 'X', text: '중요한 불확실성이 주석에 적절히 공시되었으므로 의견을 변형하지 아니하고 별도의 단락을 두어 기재하기 때문이다.' },
  { ox: 'O', text: '중요한 불확실성이 공시되지 않은 것은 중요한 왜곡표시이므로 한정의견 또는 부적정의견을 표명하기 때문이다.' }]);
run('judge 무응답', 'p05', 2, 'A', [{ ox: null, text: '' }, { ox: null, text: '' }]);

console.log('');
run('list 정답', 'p03', 1, null, [
  { text: '변화', ox: null }, { text: '주관성', ox: null },
  { text: '불확실성', ox: null }, { text: '경영진의 편의', ox: null }]);
run('list 부분정답', 'p03', 1, null, [
  { text: '변화', ox: null }, { text: '복잡성', ox: null },
  { text: '불확실성', ox: null }, { text: '', ox: null }]);

console.log('');
run('독립성 judge 정답(교재표기)', 'p01', 1, 'A', [
  { ox: 'O', text: '자기검토위협. 감사인이 직접 설계·구축한 내부회계관리제도를 스스로 평가하게 되기 때문이다.' },
  { ox: 'O', text: '이기적 위협. 특정 의뢰인에 대한 보수 의존도가 높아 거래관계 상실을 우려하기 때문이다.' },
  { ox: 'O', text: '이기적 위협 및 변호위협. 성공보수는 결과에 연동되고 조세불복은 의뢰인 입장을 대변하기 때문이다.' }]);
run('독립성 judge 구용어(자기이익/협박)', 'p01', 1, 'A', [
  { ox: 'O', text: '자기검토위협. 자신이 구축한 시스템을 스스로 검토하게 되기 때문이다.' },
  { ox: 'O', text: '자기이익위협. 보수 의존도가 높아 재무적 이해관계가 발생하기 때문이다.' },
  { ox: 'O', text: '자기이익위협과 옹호위협. 성공보수 조건이고 의뢰인을 대변하기 때문이다.' }]);
