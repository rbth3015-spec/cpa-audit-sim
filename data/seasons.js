/* ============================================================
   감사 대상 (seasons.js)
   ------------------------------------------------------------
   회사마다 한 시즌. 회사 · 장면 · 진실 · 이야기 · 회사 쪽 인물이 한 묶음이다.
   돌발 업무(cases.js)와 암기 카드(deck.js)는 회사와 상관없이 공통으로 쓴다.

   이 파일은 데이터 파일이 다 읽힌 뒤에 불린다.
     SEASONS.list()        고를 수 있는 회사들
     SEASONS.use(id)       그 회사로 바꾼다 (window.COMPANY · SCENES · TRUTH · STORYDATA 교체)
     SEASONS.current()     지금 회사
     SEASONS.facts(who)    지금 회사에서 보이는 인물 사실 (co 표시가 다른 회사면 뺀다)

   새 회사를 넣는 법
     data/<회사>.js 에서 window.SEASON_<회사> = { COMPANY, SCENES, TRUTH, STORY, CAST } 로 담고
     index.html 에 <script> 한 줄, 아래 BOOK 에 한 줄 추가한다.
   ============================================================ */
(function (global) {
  'use strict';

  // 첫 회사(㈜도원정밀)는 scenes1·2 · truth · story 가 전역에 올려 둔 것을 그대로 쓴다
  var SEORIN = {
    COMPANY: global.COMPANY, SCENES: global.SCENES, TRUTH: global.TRUTH, STORY: global.STORYDATA,
    CAST: null, CAST_ORDER: (global.CAST_ORDER || {}).client
  };

  var BOOK = [
    { id: 'seorin', name: '㈜도원정밀', market: '코스닥', industry: '이차전지 장비 제조',
      tag: '부정 · 특수관계자', art: 'office', data: SEORIN,
      brief: '4분기 매출이 두 배로 뛰었다. 대표이사의 배우자 회사가 거래처에 있다.' }
  ];
  if (global.SEASON_RAON) {
    BOOK.push({ id: 'raon', name: '㈜신진바이오', market: '코스닥', industry: '신약 개발 · 임상 3상',
      tag: '초도감사 · 계속기업', art: 'lab', data: global.SEASON_RAON,
      brief: '증권선물위원회가 지정한 감사인으로 처음 들어간다. 자금이 6개월치 남았다.' });
  }
  if (global.SEASON_GUREUM) {
    BOOK.push({ id: 'gureum', name: '㈜동인정보기술', market: '코스닥', industry: 'SaaS 구독 · SI',
      tag: 'IT 통제 · 데이터', art: 'server', data: global.SEASON_GUREUM,
      brief: '거래 340만 건을 시스템이 인식한다. 운영 DB 권한이 개발팀에 열려 있다.' });
  }
  if (global.SEASON_HANEUL) {
    BOOK.push({ id: 'haneul', name: '㈜삼한그룹', market: '유가증권', industry: '전자부품 지주 · 연결 6곳',
      tag: '그룹감사 · 부문감사인', art: 'board', data: global.SEASON_HANEUL,
      brief: '연결 종속 여섯 곳. 베트남 부문감사인이 세무자문도 맡고 있다.' });
  }
  if (global.SEASON_DAON) {
    BOOK.push({ id: 'daon', name: '㈜대풍마켓', market: '코스닥', industry: '식자재 유통 · 매장 84곳',
      tag: '내부회계 · IT 통제', art: 'server', data: global.SEASON_DAON,
      brief: '올해 처음 내부회계 감사를 받는다. 경영진 평가는 미비점 없음.' });
  }
  if (global.SEASON_HAESOL) {
    BOOK.push({ id: 'haesol', name: '㈜청림건설', market: '코스닥', industry: '중견 건설 · 주택 · 물류센터',
      tag: '추정치 · 계속기업', art: 'warehouse', data: global.SEASON_HAESOL,
      brief: '진행률로 매출을 잡는다. PF 보증 1,800억원, 미분양이 번지고 있다.' });
  }

  // 인물 사실은 그 회사 이야기에서만 열린다 — 회사 표시(co)를 붙여 두고 지금 회사 것만 센다
  //   법인 팀원 사실 중 회사 이야기에 딸린 것은 cast.js 에 co 를 직접 적는다
  function tagFacts(cast, keys, co) {
    keys.forEach(function (k) {
      ((cast[k] || {}).facts || []).forEach(function (f) { if (!f.open && !f.co) f.co = co; });
    });
  }
  tagFacts(global.CAST, (global.CAST_ORDER || {}).client || [], 'seorin');
  BOOK.forEach(function (b) { if (b.data.CAST) tagFacts(b.data.CAST, Object.keys(b.data.CAST), b.id); });
  // 공통 인물 원본 — 다른 회사가 같은 키(예: raon)를 덮어써도 돌아올 때 되돌린다
  var BASE_CAST = {};
  Object.keys(global.CAST).forEach(function (k) { BASE_CAST[k] = global.CAST[k]; });

  var cur = BOOK[0];

  function list() { return BOOK.slice(); }
  function current() { return cur; }
  function find(id) {
    for (var i = 0; i < BOOK.length; i++) if (BOOK[i].id === id) return BOOK[i];
    return BOOK[0];
  }

  function use(id) {
    var b = find(id);
    cur = b;
    global.COMPANY = b.data.COMPANY;
    global.SCENES = b.data.SCENES;
    global.TRUTH = b.data.TRUTH;
    global.STORYDATA = b.data.STORY;
    // 회사 쪽 인물 — 공통 인물(법인 · 외부)에 이어 붙인다. 앞 회사가 덮어쓴 공통 인물은 먼저 되돌린다
    Object.keys(BASE_CAST).forEach(function (k) { global.CAST[k] = BASE_CAST[k]; });
    if (b.data.CAST) Object.keys(b.data.CAST).forEach(function (k) { global.CAST[k] = b.data.CAST[k]; });
    if (b.data.CAST_ORDER) global.CAST_ORDER.client = b.data.CAST_ORDER;
    if (global.SEASON && global.SEASON.resetCards) global.SEASON.resetCards();
    return b;
  }

  /* 모든 회사를 한 번씩 훑는다 (개념 카드 도감 · 연습 모드 문제은행) */
  function each(fn) {
    var keep = cur.id;
    BOOK.forEach(function (b) { use(b.id); fn(b); });
    use(keep);
  }

  /* 지금 회사에서 보이는 인물 사실 — 다른 회사 이야기에만 나오는 사실은 빼고 */
  function facts(who) {
    var c = global.CAST[who];
    return ((c && c.facts) || []).filter(function (f) { return !f.co || f.co === cur.id; });
  }

  global.SEASONS = { list: list, current: current, use: use, find: find, each: each, facts: facts };
})(window);
