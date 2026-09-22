/* ============================================================
   ㈜서린정밀의 진실 (truth.js)
   ------------------------------------------------------------
   회사에는 실제 왜곡표시가 존재한다. 플레이어는 이것을 볼 수 없다.
   절차를 제대로 밟은 만큼만 발견된다.

   ★ 이 게임의 핵심 장치 ★
     발견한 왜곡표시  → 조서에 올라가고 수정을 요구할 수 있다.
                        그만큼 왜곡표시 집계가 커지고 의견이 무거워진다.
     못 찾은 왜곡표시 → 재무제표에 그대로 남는다. 집계가 작아 보인다.
                        그리고 1년 뒤 감리에서 터진다.
     "왜곡표시 합계가 작다 = 잘했다" 가 아니다. 못 찾았을 뿐일 수 있다.

   ★ 시즌마다 진실이 달라진다 ★
     always : 매 시즌 존재
     p      : 존재할 확률. 존재하지 않는 시즌에 절차를 제대로 밟으면
              "이상 없음 확인" 으로 기록된다 (그것도 감사다)
     금액은 시즌마다 ±12% 흔들린다 (jitter:false 면 고정)

   detect  존재할 때 발견하는 조건
   verify  존재하지 않을 때 "이상 없음"을 확인하는 조건 (없으면 detect 사용)
     mode 'all' 전부 충족 / 'any' 하나만 충족
     조건 표기  '장면id#논점라벨'  (라벨 = 해당 장면 칸의 채점 라벨)

   soft    일반적인 조정사항. 회사가 협조적이면(태도 50 이상) 수정을 받아들인다.
           soft 가 아닌 항목은 분식이므로 회사가 끝까지 거부한다.

   문구 — 조서 · 통지서에 찍히는 글이라 개조식으로 쓴다.
     hidden   실제로 있었던 일      clean  없었을 때
     howFound 찾는 길 (못 찾았을 때 보여 준다)
     lead     조서 '가려진 메모'에 먼저 보이는 한 줄 (정답을 흘리지 않는다)
   ============================================================ */
window.TRUTH = [
  {
    id: 'circular_ar', always: true, account: '매출채권',
    title: '㈜한들상사 가공 매출채권', short: '특수관계자 매출채권',
    lead: '거래처 매출채권 중 회수 이력이 없는 잔액',
    amount: 38.0,
    hidden: '대표이사 배우자가 지배하는 ㈜한들상사 기말 매출채권 38억원 — 실거래 없는 가공채권. 회수 이력 없음.',
    howFound: '목록에 없던 특수관계자 거래를 실증절차로 확인했다면 드러났을 사항.',
    detect: { mode: 'any', need: ['s6#미공시 특수관계자·거래에 대한 실증절차'] }
  },
  {
    id: 'circular_flow', always: true, account: '매출',
    title: '순환 자금흐름으로 위장한 가공매출', short: '순환거래 자금흐름',
    lead: '4분기 매출의 대금이 어디서 왔는지',
    amount: 23.0,
    hidden: '회수된 것처럼 보이던 23억원 — ㈜한들상사를 돌아 되돌아온 회사 자금. 매출·매입을 돌려 외형만 부풀림.',
    howFound: '위험평가에서 통제 무력화를 유의적 위험으로 보고 결산 분개를 추출해 둬야, 특수관계자 거래가 드러났을 때 자금 흐름까지 추적 가능. 제보로 뒤늦게 알면 여기까지 못 감.',
    detect: { mode: 'all', need: ['s2#경영진의 내부통제 무력화 위험', 's2#결산 수정분개 포함 분개 테스트', 's6#미공시 특수관계자·거래에 대한 실증절차'] }
  },
  {
    id: 'inventory', p: 0.7, account: '재고자산',
    title: '외주 임가공 보관 재고 과대계상', short: '외주 임가공 재고',
    lead: '회사 창고 밖에 있다는 재고 74억원',
    amount: 34.0,
    hidden: '임가공업체 3곳에 있다던 재고 중 34억원 — 실물 없음. 거래처 명세서 금액을 그대로 장부에 기록.',
    clean: '임가공업체 3곳 재고 실재 확인. 명세서 금액과 일치.',
    howFound: '제3자 보관 재고는 명세서로 갈음 불가. 보관업체에 직접 조회하거나 검사했다면 드러났을 사항.',
    detect: { mode: 'any', need: ['s3#제3자 보관 재고는 제3자에 대한 조회 또는 검사'] }
  },
  {
    id: 'pension', p: 0.65, account: '확정급여채무',
    title: '확정급여채무 과소계상', short: '확정급여채무 가정',
    lead: '계리법인을 바꾼 이유',
    amount: 38.0,
    hidden: '보험수리적 가정 4개를 전부 채무가 줄어드는 쪽으로 변경 — 확정급여채무 38억원 과소계상. 그 목적으로 계리법인도 교체.',
    clean: '가정 변경은 시장금리와 임금 협상 결과 반영. 변경 방향도 제각각. 편의 없음.',
    howFound: '한쪽으로만 바뀐 가정이 편의 신호. 경영진측 전문가(계리법인)의 적격성·역량·객관성을 평가했다면 드러났을 사항.',
    detect: { mode: 'all', need: ['s5#모든 가정이 채무를 줄이는 한 방향으로 변경됨이 가장 강한 신호', 's5#전문가의 적격성·역량·객관성 평가'] },
    verify: { mode: 'all', need: ['s5#전문가의 적격성·역량·객관성 평가', 's5#가정의 합리성 평가 또는 독립적 추정치 개발'] }
  },
  {
    id: 'cutoff', p: 0.75, soft: true, account: '매출',
    title: '4분기 매출 기간귀속 조작', short: '4분기 매출 기간귀속',
    lead: '12월에 날인만 받은 계약',
    amount: 8.4,
    hidden: '납품 전 계약을 12월에 날인만 받아 매출 인식 — 8.4억원을 당기로 당겨옴.',
    clean: '12월 계약 전부 납품·검수 완료. 영업본부장 지시는 실행되지 않음.',
    howFound: '기말 전후 기간귀속 절차를 넓히거나, 회신이 없는 채권을 대체절차로 확인하며 통제 이전 시점을 봤다면 드러났을 사항.',
    detect: { mode: 'any', need: ['s2#기간귀속 절차 확대', 's4#대체적 감사절차 수행', 's4#회신만으로 불충분 → 대체·추가 절차'] }
  },
  {
    id: 'subsequent', always: true, soft: true, jitter: false, account: '대손충당금',
    title: '후속사건 대손충당금 미반영', short: '㈜대양 후속사건',
    lead: '보고기간 후 회생절차에 들어간 거래처',
    amount: 23.0,
    hidden: '㈜대양 회생절차 개시 — 기말 이전부터 누적된 신용 악화의 증거. 기존 충당금 4억원 외 23억원 추가 설정 필요.',
    howFound: '기말에 이미 있던 상황을 확인해 주는 증거 — 수정을 요하는 후속사건으로 분류했어야 함.',
    detect: { mode: 'any', need: ['s8#ⓐ 수정을 요하는 사건'] }
  }
];

/* ------------------------------------------------------------
   모듈형 에필로그
   세 축에서 조건이 맞는 첫 조각이 하나씩 선택되어 조립된다.
   축 순서가 곧 우선순위다. 조합 수 = 6 × 5 × 5
------------------------------------------------------------- */
window.EPILOGUE = {

  /* 축 1 — 감리 결과 */
  audit: [
    { id: 'timeout', tone: 'bad', title: '마감 실패',
      when: function (s) { return s.gauge.T <= 0; },
      text: '보고서 기한을 넘겼다. 회사는 감사인 교체를 통보했고, 법인은 이 건을 손실로 처리했다.' },

    { id: 'wrong', tone: 'bad', title: '부적절한 의견',
      when: function (s) { return !s.opinionOK; },
      text: function (s) {
        return '확인한 사실에 비추어도 표명한 의견이 틀렸다는 판정. ' +
          (s.misTotal > 0 ? '미수정왜곡표시 ' + s.misTotal.toFixed(1) + '억원을 조서에 적어 두고도' : '조서에 근거를 다 모아 두고도') +
          ' 결론을 잘못 냈다. 못 찾은 것보다 무거운 잘못이다.';
      } },

    { id: 'blown', tone: 'bad', title: '분식 발각',
      when: function (s) { return s.missedAmount >= 60; },
      text: function (s) {
        return '1년 뒤 ㈜서린정밀의 분식이 터졌다. 감사에서 걸러내지 못한 왜곡표시 ' + s.missedAmount.toFixed(1) +
          '억원. 확인한 범위에서 의견은 맞았지만, 확인하지 못한 것이 너무 많았다.';
      } },

    { id: 'partial', tone: 'warn', title: '일부 미발견 지적',
      when: function (s) { return s.missedAmount > 0; },
      text: function (s) {
        return '감사의견은 적정했다. 다만 ' + s.missedAmount.toFixed(1) +
          '억원의 왜곡표시를 찾지 못했다는 지적과 함께 절차 설계 개선 요구가 내려왔다.';
      } },

    // 메신저에서 내린 독립성 판단이 1년 뒤 조서와 함께 걸린다 (data/story.js ETHICS_BAD)
    { id: 'indep', tone: 'warn', title: '독립성 위반 지적',
      when: function (s) { return s.ethicsBad && s.ethicsBad.length > 0; },
      text: function (s) {
        return '왜곡표시와 의견은 문제없었다. 다만 감리가 업무팀의 독립성을 짚었다 — ' + s.ethicsBad.join(' · ') + '.';
      } },

    { id: 'thin', tone: 'warn', title: '증거 부족 경고',
      when: function (s) { return s.gauge.E < 60; },
      text: '왜곡표시는 다 찾았고 의견도 맞았다. 감리 의견은 한 줄 — "결론은 맞지만 증거가 결론을 받쳐 주지 못함."' },

    { id: 'clean', tone: 'ok', title: '지적 없음',
      when: function () { return true; },
      text: '감리 표본으로 뽑혔다. 논점마다 근거와 결론이 조서에 남아 있었고, 지적 없이 종결됐다.' }
  ],

  /* 축 2 — 회사의 운명 */
  company: [
    { id: 'collapse', when: function (s) { return s.missedAmount >= 90; },
      text: '㈜서린정밀은 재무제표를 재작성한 뒤 상장폐지 실질심사에 넘어갔다. 대표이사는 구속됐다.' },
    { id: 'restate', when: function (s) { return s.missedAmount >= 40; },
      text: '㈜서린정밀은 과거 재무제표를 재작성하고 관리종목으로 지정됐다. 주가는 반 토막.' },
    { id: 'penalty', when: function (s) { return s.missedAmount > 0; },
      text: '㈜서린정밀은 증권선물위원회에서 과징금을 받았다. 상장은 유지.' },
    { id: 'reform', when: function (s) { return s.foundAmount >= 100; },
      text: '감사에서 드러난 사실로 이사회가 움직였다. 대표이사는 물러났고 지배구조가 통째로 바뀌었다.' },
    { id: 'ok', when: function () { return true; },
      text: '㈜서린정밀은 지적 사항을 반영해 재무제표를 확정했고, 이후 별일 없이 사업을 이어갔다.' }
  ],

  /* 축 3 — 당신의 커리어 */
  career: [
    // 회사와 가까워서 놓친 경우는 "신뢰 하락"보다 원인이 분명하므로 먼저 판정한다
    { id: 'captured', when: function (s) { return (s.rel.company >= 70 || (s.flags && s.flags.cfo_dinner)) && s.missedAmount > 0; },
      text: '회사와의 사이는 더없이 좋았다. 그래서 물어야 할 것을 묻지 않았다는 지적이 내부 심리에서 나왔고, 한동안 상장사 건에서 빠졌다.' },
    { id: 'benched', when: function (s) { return s.gauge.R < 25; },
      text: '정한별 이사는 다음 시즌 업무팀에서 당신을 뺐다. 사유는 한 줄 — "판단을 믿기 어렵다."' },
    { id: 'vindicated', when: function (s) { return s.rel.company < 25 && s.missedAmount === 0; },
      text: '회사는 당신을 두고 "감사인이 아니라 검사"라고 했다. 결과는 당신이 옳았고, 법인은 어려운 건에 당신을 먼저 넣기 시작했다.' },
    { id: 'promoted', when: function (s) { return s.gauge.R >= 70 && s.foundAmount >= 60; },
      text: '정한별 이사가 내년 시즌 인차지로 당신을 올렸다. "무력화 건 올릴 때 알아봤다."' },
    { id: 'steady', when: function () { return true; },
      text: '다음 시즌에도 같은 팀. 무난한 한 해였다.' }
  ]
};
