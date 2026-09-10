/* 감사 시즌 2026 — 채점 엔진 / 콘텐츠 검증
   실행:  node tools/validate.js

   장면을 추가·수정한 뒤에는 반드시 돌려볼 것.
   특히 "모범답안 자가채점"이 80점 미만이면 채점기준에 결함이 있다는 뜻이다.
   (모범답안대로 썼는데 감점된다면, 실제로 그 답을 쓴 사람도 억울하게 깎인다) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const s = { console }; s.window = s; vm.createContext(s);
for (const f of ['data/lexicon.js', 'data/scenes.js', 'js/engine.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
const { AE, SCENES, LEXICON, CAST } = s;

const val = (x, v) => (typeof x === 'function' ? x(v) : x);

function resolve(sc, vid) {
  const v = sc.variants ? (vid ? sc.variants.find(x => x.id === vid) : sc.variants[0]) : { id: '-', label: '' };
  return {
    sc, v,
    situation: val(sc.situation, v),
    exhibits: val(sc.exhibits, v) || [],
    rubric: val(sc.rubric, v),
    model: val(sc.model, v),
    verdict: val(sc.verdict, v),
    maxChars: sc.maxChars
  };
}

/* ── 1. 구조 검증 ───────────────────────────────── */
let bad = 0;
console.log('═══ 구조 검증');
const areas = {};
SCENES.forEach(sc => {
  ['id', 'day', 'chapter', 'art', 'area', 'standards', 'prompt', 'timeLimit', 'maxChars', 'ref']
    .forEach(k => { if (sc[k] == null) { console.log(`  ✕ ${sc.id} 필드 누락: ${k}`); bad++; } });
  if (sc.speaker && !CAST[sc.speaker]) { console.log(`  ✕ ${sc.id} 등장인물 없음: ${sc.speaker}`); bad++; }
  areas[sc.area] = (areas[sc.area] || 0) + 1;

  (sc.variants || [{ id: '-' }]).forEach(v => {
    try {
      const it = resolve(sc, v.id === '-' ? null : v.id);
      if (!it.rubric || !it.rubric.must || !it.rubric.must.length) { console.log(`  ✕ ${sc.id}/${v.id} rubric 없음`); bad++; }
      if (!it.model || !it.model.length) { console.log(`  ✕ ${sc.id}/${v.id} 모범답안 없음`); bad++; }
      if (it.verdict && !['yes', 'no'].includes(it.verdict.answer)) { console.log(`  ✕ ${sc.id}/${v.id} verdict.answer 오류`); bad++; }
      // flag 가 가리키는 라벨이 실제 rubric 에 존재하는가
      (sc.flags || []).forEach(f => f.if.forEach(lab => {
        if (!it.rubric.must.some(m => m.label === lab)) {
          console.log(`  ✕ ${sc.id} flag "${f.set}" 가 없는 라벨을 참조: ${lab}`); bad++;
        }
      }));
    } catch (e) { console.log(`  ✕ ${sc.id}/${v.id} 예외: ${e.message}`); bad++; }
  });
});
console.log('  장면', SCENES.length, '· 사전', Object.keys(LEXICON).length, '항목');
console.log('  영역 배분:', Object.entries(areas).map(([k, n]) => `${k} ${n}`).join(' · '));
console.log(bad ? `  → 문제 ${bad}건` : '  → 이상 없음');

/* ── 2. 모범답안 자가채점 ───────────────────────── */
console.log('\n═══ 모범답안 자가채점 (80점 미만이면 채점기준 결함)');
let low = 0;
SCENES.forEach(sc => {
  (sc.variants || [{ id: '-' }]).forEach(v => {
    const it = resolve(sc, v.id === '-' ? null : v.id);
    const part = { maxChars: it.maxChars, rubric: it.rubric };
    if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
    const g = AE.gradeParts([{ text: it.model.join(' ') }], [part], 'essay');
    const p = g.parts[0];
    const tag = `${sc.id}${v.id !== '-' ? '/' + v.id : ''} ${sc.chapter}`;
    if (g.percent < 80) {
      low++;
      const miss = p.res.must.filter(m => !m.hit).map(m => m.label);
      const trap = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
      console.log(`  ${String(g.percent).padStart(3)}점  ${tag}`);
      if (miss.length) console.log(`         누락: ${miss.join(' / ')}`);
      if (trap.length) console.log(`         오탐: ${trap.join(' / ')}`);
      if (p.verdict && !p.verdict.correct) console.log(`         판단 추출 실패 (given=${p.verdict.given})`);
    }
  });
});
console.log(low ? `  → ${low}건 보정 필요` : '  → 전부 80점 이상');

/* ── 3. 판별력 ──────────────────────────────────── */
console.log('\n═══ 판별력');
function run(label, id, vid, text) {
  const sc = SCENES.find(x => x.id === id);
  const it = resolve(sc, vid);
  const part = { maxChars: it.maxChars, rubric: it.rubric };
  if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
  const g = AE.gradeParts([{ text }], [part], 'essay');
  const p = g.parts[0];
  const tr = (p.res.trap || []).filter(t => t.hit).map(t => t.label);
  const vd = p.verdict ? (p.verdict.correct ? '' : ' [판단오답→근거0]') : '';
  console.log(`  ${String(g.percent).padStart(3)}점  ${label}${vd}${tr.length ? '  [감점: ' + tr.join(', ') + ']' : ''}`);
  return g.percent;
}

run('s3 재고실사 정답', 's3', null,
  '재고자산이 중요하므로 재고실사에 입회하여 경영진의 실사 지시와 절차를 평가하고 시험적 검사를 수행한다. 보관장소가 분산되어 있으므로 본사 외 물류센터도 입회 대상으로 결정하고, 실사 시기가 기말과 다른 물량은 그 사이 재고 변동이 적절히 기록되었는지 절차를 추가한다. 제3자가 보관하는 외주 임가공 물량은 제3자에 대한 조회 또는 직접 검사를 수행한다.');
run('s3 회사 계획 수용(오답)', 's3', null,
  '회사의 실사 계획대로 본사 창고만 입회하고, 외주 임가공 물량은 거래처가 발행한 잔액명세서를 수령하여 갈음한다.');
run('s3 키워드 나열', 's3', null,
  '재고실사입회 보관장소 실사시기 제3자 조회 시험적검사 경영진의 실사 지시');

run('s5 추정치 정답', 's5', null,
  '네 가지 가정이 모두 확정급여채무를 줄이는 한 방향으로 일관되게 변경된 점은 경영진의 편의가 존재한다는 가장 강한 신호이다. 비용 절감을 이유로 신생 법인으로 전문가를 교체한 점도 편의의 징후이다. 보험계리법인은 경영진측 전문가이므로 적격성·역량·객관성을 평가하고, 가정의 합리성을 검증하며 필요시 독립적 추정치를 개발한다.');
run('s5 권위 수용(오답)', 's5', null,
  '외부 전문기관이 산정한 결과이므로 신뢰할 수 있다. 경영진의 판단을 존중하여 별도의 추가 절차는 수행하지 않는다.');

run('s7 기타정보 정답', 's7', null,
  'ⓐ는 재무제표와의 불일치이고 ⓑ는 감사 지식과의 불일치이다. ⓒ는 대조할 기준이 없으므로 불일치가 아니다. 불일치는 경영진과 논의하여 수정을 요구하고, 거부하면 지배기구와 커뮤니케이션한다. 감사인은 기타정보에 확신을 표명하지 않는다.');
run('s7 전부 불일치(오답)', 's7', null,
  '세 가지 모두 불일치에 해당하므로 감사인은 기타정보에 대해 확신을 표명한다.');

run('s8 후속사건 정답', 's8', null,
  'ⓐ는 보고기간말 현재 존재하던 신용악화에 대한 추가 증거이므로 수정을 요하는 사건이며, 대손충당금을 추가 인식하도록 요구한다. ⓑ는 재무제표일 후 발생한 상황이므로 수정을 요하지 않는 사건이며, 중요하므로 주석에 공시하도록 요구한다.');
run('s8 분류 반대(오답)', 's8', null,
  'ⓐ와 ⓑ 모두 수정을 요하는 사건이므로 재무제표를 수정하도록 요구한다.');

run('s1 판단 정답', 's1', null,
  '회계모듈 구축은 그 산출물이 감사대상 재무정보의 기반이 되므로 자기검토위협이 발생한다. 감사인이 직접 설계한 결과를 스스로 평가하게 되기 때문이다. 재무정보체제 구축은 안전장치와 무관하게 금지된 용역인지 먼저 검토하고, 해소할 수 없으면 수임을 거절하며 지배기구와 커뮤니케이션한다.');
run('s1 판단 반대(오답)', 's1', null,
  '컨설팅본부와 감사본부는 조직이 분리되어 있으므로 독립성 훼손위협은 발생하지 않는다. 따라서 수임에 문제가 없다.');
