/* ============================================================
   감사 시즌 — 상태 · 분기 · 정산 로직 (season.js)
   ------------------------------------------------------------
   DOM 을 모른다. 화면(game.js)과 검증(tools/validate.js)이
   같은 로직을 쓴다. 그래서 경우의 수를 사람 없이 시뮬레이션할 수 있다.

   ★ 시점 (view)
     한 팀으로 시즌을 끌고 가되 장면마다 내가 앉는 자리가 바뀐다.
     현장은 어쏘, 취합은 시니어, 결론은 업무수행이사.
     채점 라벨은 시점과 무관하게 같다 (라벨이 분기·진실 발견의 계약이다)

   ★ 한 장면 = 칸 3개 (parts), 칸마다 형식이 다르다
     write   서술형. 판단(verdict)이 있으면 답안 문장에 판단을 써야 한다
     judge   판단은 버튼(A/B)으로 고르고 근거만 쓴다
     choice  객관식. multi 면 모두 고르기
     cloze   기준서 취지 문장의 빈칸 채우기
     sort    항목을 분류하기 (답안 양식 표)
     mini    미니게임 (js/minis.js)
     형식이 달라도 채점 결과는 같은 모양(must/trap)이라 아래 로직은 형식을 모른다.

   상태
     gauge.E  감사증거   답안 수준 + 찾은 단서. 45 미만이면 마지막에 범위제한
     gauge.T  감사시간   화면에는 보고서 기한 D-day 로 보인다. 0 이면 마감 실패
     gauge.R  신뢰       상급자의 신뢰. 오개념을 쓰면 급락
     rel.company  회사 태도 (자리에 따라 흔들리는 폭이 다르다)
     flags    분기 표지
     hits     '장면id#논점' 누적 명중 — 진실 발견의 근거 (만점만 인정)
     truths   이번 시즌의 진실
     cards    익힌 논점 / 복습할 논점
     papers   조서 — 칸마다 문항 · 내 답 · 채점을 직렬화해 둔다 (저장 · 조서 · 엔딩이 쓴다)
   ============================================================ */
(function (global) {
  'use strict';

  var MAT = 12;          // 재무제표 전체 중요성 (억원) — 회사가 matNum 을 주면 그것을 쓴다
  var TIME_SCALE = 0.8;  // 장면 비용 배율
  var DAY_RATE = 0.6;    // 감사시간 1 = 기한 0.6일
  var OPINIONS = ['적정의견', '한정의견', '부적정의견', '의견거절'];
  var KEYS = ['①', '②', '③', '④', '⑤'];
  var DEFAULT_TIME = { write: 100, judge: 90, choice: 50, cloze: 60, sort: 60, mini: 150 };
  var TYPE_NAME = { write: '서술', judge: '판단', choice: '객관식', cloze: '빈칸', sort: '분류', mini: '미니게임' };

  var SEATS = {
    staff:   { id: 'staff', name: '어쏘', role: '현장 절차 · 보고', trust: '시니어의 신뢰', time: 0.9, company: 0.7 },
    senior:  { id: 'senior', name: '시니어', role: '업무 배분 · 판단 취합', trust: '파트너의 신뢰', time: 1.0, company: 1.0 },
    partner: { id: 'partner', name: '업무수행이사', role: '결론 · 회사와 지배기구 상대', trust: '품질관리실의 신뢰', time: 1.15, company: 1.35 }
  };
  /* 자리마다 그 자리에 앉은 사람 — 그 장면은 이 사람의 시점이다 */
  var SEAT_WHO = { partner: 'partner', senior: 'manager', staff: 'assoc' };
  function povOf(seat) { return SEAT_WHO[seat] || SEAT_WHO.senior; }

  var FLAG_TEXT = {
    fraud_alert: '분개 데이터 전수 추출 시작',
    inv_ok: '물류센터 입회 일정 확정'
  };

  /* 돌발 업무 — 이 장면들이 끝나면 업무 요청이 들어온다 (data/cases.js) */
  var SIDE_AFTER = { s2: 1, s4: 1, s6: 1, s8: 1 };
  var BASE_MIS = [
    { title: '대손충당금 과소 (일반채권)', amount: 5.1, account: '대손충당금' },
    { title: '미지급비용 누락', amount: 3.7, account: '미지급비용' }
  ];

  /* 회사마다 다른 값 (data/seasons.js 가 window.COMPANY 를 바꾼다) */
  function mat() { var C = global.COMPANY; return (C && C.matNum) || MAT; }
  function matText() { var C = global.COMPANY; return (C && C.materiality) || (MAT + '억원'); }
  function baseMis() { var C = global.COMPANY; return (C && C.baseMis) || BASE_MIS; }
  function sideKeys() { var C = global.COMPANY; return (C && C.sideAfter) || SIDE_AFTER; }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function call(x, v, S) { return typeof x === 'function' ? x(v, S) : x; }

  /* 좌석별로 다른 문구를 고른다. 문자열이면 그대로. */
  function bySeat(x, seat) {
    if (x == null) return null;
    if (typeof x === 'string') return x;
    return x[seat] || x.senior || x[Object.keys(x)[0]];
  }

  /* 칸마다 나에게 묻는 사람
       어쏘   → 시니어(유가온)가 지시하고 묻는다
       시니어 → 어쏘(한결)가 보고하고, 내가 판단한다
       파트너 → 시니어(유가온)가 보고를 올린다 */
  function asker(S) { return S.seat === 'senior' ? 'assoc' : 'manager'; }
  function reviewer(S) { return S.seat === 'senior' ? 'partner' : 'manager'; }
  /* 좌석과 맞지 않는 화자를 바로잡는다 — 내가 파트너면 파트너가 나에게 말할 수 없다 */
  function seatWho(w, S) {
    if (S.seat === 'partner' && w === 'partner') return 'manager';
    if (S.seat === 'senior' && w === 'manager') return 'assoc';
    if (S.seat === 'staff' && w === 'assoc') return 'manager';
    return w;
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function band(c) { return c >= 65 ? '협조적' : c >= 40 ? '중립' : c >= 25 ? '경계' : '적대'; }
  function dday(S) { return Math.max(0, Math.round(S.gauge.T * DAY_RATE)); }

  /* 그 장면에서 내가 앉는 자리. 장면 데이터의 view 가 없으면 시니어 */
  function viewOf(i) {
    var sc = global.SCENES && global.SCENES[i];
    return (sc && SEATS[sc.view]) ? sc.view : 'senior';
  }

  /* ---------- 시즌 생성 ---------- */
  function create(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? (opts.seed >>> 0) : (Math.floor(Math.random() * 90000) + 10000);
    // seat 를 주면 시즌 내내 그 자리로 고정된다 (검증에서 좌석별 대사를 전수로 보기 위한 것)
    var fixed = SEATS[opts.seat] ? opts.seat : null;
    var seat = fixed || viewOf(0);
    var R = rng(seed);
    var truths = global.TRUTH.map(function (t) {
      var active = t.always ? true : R() < (t.p == null ? 1 : t.p);
      var j = t.jitter === false ? 1 : (0.88 + R() * 0.24);
      return { id: t.id, def: t, active: active, amount: r1(t.amount * j),
               found: false, verified: false, corrected: false };
    });
    var active = {};
    truths.forEach(function (t) { active[t.id] = t.active; });

    var S = {
      seed: seed, seat: seat, fixedSeat: fixed, rand: R, i: 0,
      gauge: { E: 50, T: 100, R: 60 },
      rel: { company: 55 },
      flags: {}, hits: {}, truths: truths, active: active,
      cards: { learned: {}, review: {} },
      log: [], results: [], papers: [], sideSeen: {}, sideDone: [], sideAt: {},
      streak: 0, best: 0,
      late: false, mis: null, decision: null, opinionOK: false
    };
    // 사람과의 관계 · 메신저 기록 (js/story.js)
    if (global.STORY) global.STORY.init(S);
    else { S.story = { seen: {}, picks: {}, facts: {}, chat: [], vars: {} }; S.bond = {}; }
    return S;
  }

  /* ---------- 판본 선택 ---------- */
  function pickVariant(sc, S) {
    if (!sc.variants) return { id: '-', label: '' };
    var conditional = sc.variants.some(function (v) { return typeof v.when === 'function'; });
    if (conditional) {
      for (var i = 0; i < sc.variants.length; i++) {
        var v = sc.variants[i];
        if (!v.when || v.when(S)) return v;
      }
      return sc.variants[sc.variants.length - 1];
    }
    return sc.variants[Math.floor(S.rand() * sc.variants.length)];
  }

  /* ---------- 칸 정리 ----------
     형식별 필드를 넘기고, 서술형이 아닌 칸에도 rubric(라벨 목록)을 만들어 둔다.
     apply 의 회사 태도(please) · 검증의 라벨 계약 · 개념 카드 목록이 rubric 을 읽기 때문이다. */
  function synthChoice(q) {
    var must = [], trap = [];
    if (!q.multi) {
      var ok = q.options.filter(function (o) { return o.ok; })[0] || {};
      must.push({ label: q.label || ok.label || ok.t, score: q.score || 20, why: q.why || ok.why });
    } else {
      q.options.forEach(function (o) { if (o.ok) must.push({ label: o.label || o.t, score: o.score || 10, why: o.why }); });
    }
    q.options.forEach(function (o) {
      if (!o.ok) trap.push({ label: o.label || ('오답 — ' + o.t), score: -(o.pen || 0), please: !!o.please });
    });
    return { must: must, bonus: [], trap: trap };
  }
  function synthCloze(q) {
    var P = global.AE ? global.AE.parseCloze(q.text) : { blanks: [] };
    var groups = q.labels && q.labels.length ? q.labels : P.blanks.map(function (b, i) {
      return { label: b.ans[0], need: [i], score: 10 };
    });
    return { must: groups.map(function (g) { return { label: g.label, score: g.score || 10, why: g.why, need: g.need }; }),
             bonus: [], trap: [] };
  }
  function synthSort(q) {
    var must = [], trap = [];
    q.items.forEach(function (it) {
      must.push({ label: it.label || (it.t + ' — ' + q.cats[it.cat]), score: it.score || 10, why: it.why });
      Object.keys(it.wrong || {}).forEach(function (k) {
        var w = it.wrong[k];
        if (!trap.some(function (t) { return t.label === w.label; }))
          trap.push({ label: w.label, score: -(w.pen || 0), please: !!w.please });
      });
    });
    return { must: must, bonus: [], trap: trap };
  }

  function normParts(list, S, v) {
    return (list || []).map(function (p, i) {
      var type = p.type || 'write';
      var q = {
        key: p.key || KEYS[i] || String(i + 1),
        type: type,
        who: seatWho(bySeat(p.who, S.seat) || asker(S), S),
        say: bySeat(p.say, S.seat) || '',
        ask: bySeat(p.ask, S.seat) || '',
        // 답안 양식 — 답안에 들어갈 칸을 순서대로 보여준다 (정답을 알려주지는 않는다)
        guide: Array.isArray(p.guide) ? p.guide.slice() : (p.guide ? bySeat(p.guide, S.seat) : null),
        maxChars: p.maxChars || 90,
        timeLimit: p.timeLimit || DEFAULT_TIME[type] || 90,
        form: p.form || 'short',
        verdict: clone(call(p.verdict, v, S)) || null,
        verdictScore: p.verdictScore,
        model: bySeat(call(p.model, v, S), S.seat) || '',
        src: p.src || null
      };
      if (type === 'choice') {
        q.options = clone(call(p.options, v, S)) || [];
        q.multi = !!p.multi; q.fixed = !!p.fixed;
        q.label = p.label; q.score = p.score; q.why = p.why;
        q.rubric = synthChoice(q);
      } else if (type === 'cloze') {
        q.text = call(p.text, v, S);
        q.labels = clone(p.labels) || null;
        q.rubric = synthCloze(q);
      } else if (type === 'sort') {
        q.cats = (p.cats || []).slice();
        q.items = clone(call(p.items, v, S)) || [];
        q.rubric = synthSort(q);
      } else if (type === 'mini') {
        q.game = p.game;
        q.data = p.data || null;
        var M = global.MINIS && global.MINIS[p.game];
        q.rubric = { must: M ? M.labels(q.data) : [], bonus: [], trap: M && M.traps ? M.traps(q.data) : [] };
      } else {
        var r = clone(call(p.rubric, v, S)) || { must: [] };
        if (r.bonusCap == null) r.bonusCap = 6;
        q.rubric = r;
      }
      return q;
    });
  }

  /* ---------- 장면 해석 ---------- */
  function resolve(sc, S, forceId) {
    S.seat = S.fixedSeat || (SEATS[sc.view] ? sc.view : 'senior');   // 장면마다 시점이 바뀐다
    var v = (forceId && sc.variants)
      ? (sc.variants.filter(function (x) { return x.id === forceId; })[0] || sc.variants[0])
      : pickVariant(sc, S);

    var it = {
      sc: sc, v: v, seat: S.seat,
      speaker: bySeat(sc.speaker, S.seat) || sc.speaker,
      line: bySeat(v.line, S.seat) || bySeat(sc.line, S.seat) || '',
      note: bySeat(v.note, S.seat) || null,
      situation: call(sc.situation, v, S),
      exhibits: call(sc.exhibits, v, S) || [],
      clues: (v.clues || call(sc.clues, v, S) || []).slice(),
      parts: normParts(call(sc.parts, v, S), S, v),
      prompt: sc.prompt
    };

    if (sc.enter) {
      var e = sc.enter(S, v) || {};
      if (e.line) it.line = bySeat(e.line, S.seat);
      if (e.note) it.note = bySeat(e.note, S.seat);
      if (e.speaker) it.speaker = e.speaker;
    }
    it.speaker = seatWho(it.speaker, S);
    if (v.late) S.late = true;

    if (sc.dynamic === 'misstatements') buildMisstatements(it, S);
    if (sc.dynamic === 'opinion') buildOpinion(it, S);
    return it;
  }

  /* 칸 채점 결과(여러 형식)를 한 장면 결과로 모은다 — percent 는 칸 평균 */
  function combine(grades) {
    var n = grades.length || 1;
    var pct = Math.round(grades.reduce(function (a, g) { return a + (g ? g.percent : 0); }, 0) / n);
    return { parts: grades, percent: pct };
  }

  /* ---------- 답안 반영 ---------- */
  function apply(S, it, texts, res, meta) {
    meta = meta || {};
    var sc = it.sc, seat = SEATS[S.seat];
    var before = { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company };
    var events = [];

    // 칸을 모두 합쳐서 본다
    var allMust = [], allTrap = [], vWrong = false;
    (res.parts || []).forEach(function (p) {
      if (!p) return;
      (p.res.must || []).forEach(function (m) { allMust.push(m); });
      (p.res.trap || []).forEach(function (t) { allTrap.push(t); });
      if (p.verdict && !p.verdict.correct) vWrong = true;
    });

    var newHits = [];
    allMust.forEach(function (m) {
      if (!m.hit) return;                       // 부분점수는 분기 근거로 쓰지 않는다
      var k = sc.id + '#' + m.label;
      if (!S.hits[k]) { S.hits[k] = 1; newHits.push(m.label); }
    });

    var gained = collectCards(S, allMust, sc.chapter);
    if (gained) events.push({ kind: 'card', text: '개념 카드 +' + gained });

    var trapHit = allTrap.filter(function (t) { return t.hit; });
    var pleaseLabels = {};
    (it.parts || []).forEach(function (p) {
      ((p.rubric && p.rubric.trap) || []).forEach(function (t) { if (t.please) pleaseLabels[t.label] = 1; });
    });
    var please = trapHit.filter(function (t) { return t.please || pleaseLabels[t.label]; }).length;
    var penal = trapHit.filter(function (t) { return (t.score || 0) < 0 || t.got < 0 || pleaseLabels[t.label]; }).length;
    var confront = (sc.confront || []).filter(function (l) {
      return allMust.some(function (m) { return m.hit && m.label === l; });
    }).length;

    // 감사시간 — 좌석과 회사 태도에 따라 다르게 든다
    var obstruct = S.rel.company < 35 ? 3 : 0;
    var cost = ((sc.cost || 8) + (it.v.extraCost || 0)) * TIME_SCALE * seat.time +
               (meta.over || 0) / 40 + (meta.timedOut ? 5 * meta.timedOut : 0) + obstruct;

    var clueBonus = Math.min(4, meta.clues || 0);
    S.gauge.E = clamp(Math.round(S.gauge.E + (res.percent - 55) * 0.45 + clueBonus), 0, 100);
    S.gauge.T = clamp(Math.round(S.gauge.T - cost), 0, 100);
    S.gauge.R = clamp(Math.round(S.gauge.R +
                  (res.percent >= 80 ? 5 : res.percent >= 60 ? 1 : -4) -
                  penal * 8 - (vWrong ? 4 : 0)), 0, 100);
    S.rel.company = clamp(Math.round(S.rel.company +
                  (-Math.min(15, confront * 5) + please * 6) * seat.company +
                  (confront === 0 && !please ? 2 : 0)), 0, 100);

    if (obstruct) events.push({ kind: 'warn', text: '자료 제출 지연 · 기한 추가 소모' });
    if (it.v.extraCost) events.push({ kind: 'warn', text: '뒤늦은 인지 · 추가 절차 소요' });

    (sc.flags || []).forEach(function (f) {
      if (S.flags[f.set]) return;
      if (f.if.every(function (l) { return S.hits[sc.id + '#' + l]; })) {
        S.flags[f.set] = true;
        events.push({ kind: 'flag', text: f.toast || FLAG_TEXT[f.set] || f.set });
      }
    });

    S.truths.forEach(function (t) {
      if (t.found || t.verified) return;
      var c = t.active ? t.def.detect : (t.def.verify || t.def.detect);
      if (!c) return;
      var ok = c.mode === 'any'
        ? c.need.some(function (k) { return S.hits[k]; })
        : c.need.every(function (k) { return S.hits[k]; });
      if (!ok) return;
      if (t.active) {
        t.found = true;
        S.gauge.E = clamp(S.gauge.E + 6, 0, 100);
        events.push({ kind: 'found', id: t.id, text: '발견 · ' + t.def.title + ' ' + t.amount.toFixed(1) + '억원' });
      } else {
        t.verified = true;
        events.push({ kind: 'clear', id: t.id, text: '이상 없음 확인 · ' + (t.def.short || t.def.title) });
      }
    });

    // 한 일에 따라 사람들의 태도가 움직인다 (js/story.js)
    if (global.STORY) {
      global.STORY.afterScene(S, it, { events: events, please: please, confront: confront,
                                       percent: res.percent, newHits: newHits })
        .forEach(function (e) { events.push(e); });
    }

    var b0 = band(before.C), b1 = band(S.rel.company);
    if (b0 !== b1) events.push({ kind: 'rel', text: '회사 태도 · ' + b0 + ' → ' + b1 });

    if (sc.dynamic === 'opinion' && S.decision) {
      var right = allMust.some(function (m) { return m.hit && m.label === S.decision.kind + ' 표명'; });
      // 여러 의견을 걸쳐 쓰면 맞힌 것이 아니다. 감사의견은 하나다.
      var hedged = allTrap.some(function (t) { return t.hit && t.label.indexOf('오답 의견') === 0; });
      S.opinionOK = right && !hedged;
    }

    var delta = { E: S.gauge.E - before.E, T: S.gauge.T - before.T,
                  R: S.gauge.R - before.R, C: S.rel.company - before.C };
    var outcome = { events: events, delta: delta, newHits: newHits,
                    confront: confront, please: please, cards: gained, clues: clueBonus };
    S.log.push({ id: sc.id, day: sc.day, chapter: sc.chapter, percent: res.percent, events: events });
    S.results.push({ it: it, texts: texts, res: res,
                     agg: { must: allMust, trap: allTrap, verdictWrong: vWrong }, outcome: outcome });
    return outcome;
  }

  /* 개념 카드 — 제대로 짚으면 익힌 카드, 놓치면 복습 카드. 새로 익힌 장수를 돌려준다 */
  function collectCards(S, allMust, where) {
    var gained = 0;
    allMust.forEach(function (m) {
      if (!m.why) return;
      if (m.hit) {
        if (!S.cards.learned[m.label]) { S.cards.learned[m.label] = { why: m.why, scene: where }; gained++; }
        delete S.cards.review[m.label];
      } else if (!S.cards.learned[m.label]) {
        S.cards.review[m.label] = { why: m.why, scene: where };
      }
    });
    return gained;
  }

  /* ---------- 돌발 업무 ----------
     SIDE_AFTER 에 적힌 장면이 끝나면 업무 요청 세 장이 들어온다. 하나를 고르거나 넘긴다.
     숨은 진실과는 상관없고 신뢰 · 감사시간 · 개념 카드에만 영향을 준다.
     요청 카드는 시즌 코드로 정해진다 — 같은 코드면 같은 요청이 들어온다. */
  function sideOpen(S) {
    var sc = global.SCENES[S.i];
    return !!(sc && sideKeys()[sc.id] && !S.sideSeen[sc.id] && (global.CASES || []).length);
  }

  function offer(S, n) {
    var sc = global.SCENES[S.i];
    if (sc) S.sideSeen[sc.id] = true;
    var R = rng((S.seed * 131 + S.i * 7919) >>> 0);
    var pool = (global.CASES || []).filter(function (c) { return S.sideDone.indexOf(c.id) < 0; });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(R() * (i + 1)), t = pool[i];
      pool[i] = pool[j]; pool[j] = t;
    }
    // 분야가 겹치지 않게 먼저 고르고, 모자라면 나머지에서 채운다
    var out = [], tags = {};
    pool.forEach(function (c) { if (out.length < n && !tags[c.tag]) { out.push(c); tags[c.tag] = 1; } });
    pool.forEach(function (c) { if (out.length < n && out.indexOf(c) < 0) out.push(c); });
    return out;
  }

  function applySide(S, it, texts, res, meta) {
    meta = meta || {};
    var c = it.sc, seat = SEATS[S.seat];
    var before = { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company };
    var events = [], allMust = [], allTrap = [], vWrong = false;
    (res.parts || []).forEach(function (p) {
      if (!p) return;
      (p.res.must || []).forEach(function (m) { allMust.push(m); });
      (p.res.trap || []).forEach(function (t) { allTrap.push(t); });
      if (p.verdict && !p.verdict.correct) vWrong = true;
    });

    var gained = collectCards(S, allMust, c.chapter);
    if (gained) events.push({ kind: 'card', text: '개념 카드 +' + gained });

    var traps = allTrap.filter(function (t) { return t.hit && ((t.score || 0) < 0 || t.got < 0 || t.please); }).length;
    var pct = res.percent;
    var cost = (c.cost || 4) * TIME_SCALE * seat.time + (meta.over || 0) / 40 + (meta.timedOut ? 3 * meta.timedOut : 0);
    S.gauge.T = clamp(Math.round(S.gauge.T - cost), 0, 100);
    S.gauge.R = clamp(Math.round(S.gauge.R + (pct >= 80 ? 5 : pct >= 60 ? 2 : -3) - traps * 6 - (vWrong ? 3 : 0)), 0, 100);
    S.gauge.E = clamp(Math.round(S.gauge.E + (pct >= 80 ? 2 : 0) + Math.min(2, meta.clues || 0)), 0, 100);
    events.push(pct >= 80 ? { kind: 'clear', text: '요청 처리 완료 · 신뢰 상승' }
              : pct >= 60 ? { kind: 'flag', text: '요청 처리 · 일부 누락' }
              : { kind: 'warn', text: '요청 처리 미흡 · 신뢰 하락' });

    var delta = { E: S.gauge.E - before.E, T: S.gauge.T - before.T,
                  R: S.gauge.R - before.R, C: S.rel.company - before.C };
    var outcome = { events: events, delta: delta, cards: gained, side: true };
    S.sideDone.push(c.id);
    S.log.push({ id: c.id, side: true, day: '돌발 업무', chapter: c.chapter, percent: pct, events: events });
    S.results.push({ it: it, texts: texts, res: res,
                     agg: { must: allMust, trap: allTrap, verdictWrong: vWrong }, outcome: outcome });
    return outcome;
  }

  /* ---------- 왜곡표시 집계 ---------- */
  function misstatements(S) {
    // 회사가 협조적이거나, 감사위원회가 감사인 편에 서면 일반 조정사항은 고친다
    var chair = !!S.flags.chair_backing && S.rel.company < 50;
    var coop = S.rel.company >= 50 || chair;
    var items = baseMis().map(function (b) {
      return { title: b.title, amount: b.amount, account: b.account, soft: true, corrected: coop, kind: 'base' };
    });
    S.truths.forEach(function (t) {
      if (!(t.active && t.found)) return;
      var soft = !!t.def.soft;
      t.corrected = soft && coop;
      items.push({ title: t.def.title, amount: t.amount, account: t.def.account,
                   soft: soft, corrected: t.corrected, kind: 'truth', id: t.id });
    });
    var open = items.filter(function (i) { return !i.corrected; });
    var total = r1(open.reduce(function (a, b) { return a + b.amount; }, 0));
    var over = open.filter(function (i) { return i.amount >= mat(); }).length;
    return { items: items, total: total, over: over, coop: coop, byChair: chair };
  }

  function eachMust(parts, fn) {
    parts.forEach(function (p) { (p.rubric.must || []).forEach(function (m, i) { fn(m, p, i); }); });
  }

  function buildMisstatements(it, S) {
    var m = misstatements(S);
    S.mis = m;
    var rows = m.items.map(function (i) {
      return [i.title, i.amount.toFixed(1), i.corrected ? '수정함' : '거부'];
    });
    rows.push(['미수정 합계', m.total.toFixed(1), '']);
    it.exhibits = [
      { type: 'table', title: '왜곡표시 집계 (단위: 억원, 세전이익 기준)',
        head: ['항목', '금액', '경영진 대응'], rows: rows },
      { type: 'kv', title: '중요성', items: [
        ['재무제표 전체 중요성', matText()], ['수행중요성', (global.COMPANY || {}).pm || '—'],
        ['명백하게 사소한 금액', (global.COMPANY || {}).trivial || '—'], ['미수정 합계', m.total.toFixed(1) + '억원']] }
    ];
    var nTruth = m.items.filter(function (i) { return i.kind === 'truth'; }).length;
    it.situation = '감사 중 식별된 왜곡표시를 집계하였다. ' +
      (m.byChair ? '감사위원회의 권고로 경영진은 일반적인 조정사항은 받아들였으나 '
        : m.coop ? '경영진은 일반적인 조정사항은 받아들였으나 ' : '경영진은 ') +
      (nTruth ? '감사인이 식별한 주요 왜곡표시의 수정은 거부하였다.' : '나머지 사항의 수정을 거부하였다.') +
      (S.late ? ' 특수관계자 거래는 감사 종료 직전에야 확인되어 추가 절차를 할 시간이 부족하였다.' : '');
    it.clues = ['수정은 거부'];
    if (nTruth) it.clues = ['주요 왜곡표시의 수정은 거부'];
    else it.clues = ['나머지 사항의 수정을 거부'];

    // 합계가 중요성에 미달하면 "의견 변형" 을 물을 수 없다 — 그 칸의 논점을 바꾼다
    if (m.total <= mat()) {
      eachMust(it.parts, function (mu, p, i) {
        if (mu.label !== '수정되지 않으면 의견 변형') return;
        p.rubric.must[i] = { kw: ['중요성에 미달', '중요하지 않', '의견에 영향을 미치지', '변형하지', '미달'],
          score: mu.score, label: '미수정 합계가 중요성에 미달하여 의견에 영향 없음', negOk: true,
          why: mu.why };
        p.model = '미수정왜곡표시를 개별적으로 또 합산하여 중요성과 비교하고 질적 요인도 고려한다. 합계가 중요성에 미달하므로 그 자체로는 감사의견에 영향을 미치지 아니한다.';
        p.rubric.trap = (p.rubric.trap || []).filter(function (t) { return t.label !== '중요성 초과인데 적정의견'; });
      });
    }
    if (S.rel.company < 35 && it.parts.length) {
      var last = it.parts[it.parts.length - 1];
      if (last.type === 'write') {
        last.rubric.bonus = (last.rubric.bonus || [])
          .concat([{ kw: ['압력 위협'], score: 6, label: '감사인 교체 언급 = 압력 위협 인식' }]);
      }
    }
  }

  /* ---------- 의견 결정 ---------- */
  function decide(S) {
    var m = S.mis || misstatements(S);
    var E = S.gauge.E;
    var pervasive = m.total >= 60 || m.over >= 3;
    var kind, basis;
    if (E < 45) {
      basis = 'scope';
      kind = (E < 35 || pervasive) ? '의견거절' : '한정의견';
      pervasive = kind === '의견거절';
    } else if (m.total > mat()) {
      basis = 'mis';
      kind = pervasive ? '부적정의견' : '한정의견';
    } else {
      basis = 'none';
      kind = '적정의견';
    }
    return { kind: kind, basis: basis, pervasive: pervasive, total: m.total, over: m.over, E: E };
  }

  var WHY_OPINION = '감사의견 — 증거 부족(범위제한)이면 한정의견·의견거절, 중요한 왜곡표시면 한정의견·부적정의견. 영향이 전반적이면 의견거절·부적정의견';
  var WHY_PERVASIVE = '전반성 — 특정 계정에 국한되지 않거나, 국한되더라도 재무제표에서 비중이 큰 경우';

  function opinionParts(d, S) {
    var t = d.total.toFixed(1);
    var who = reviewer(S);
    var p1 = {
      key: '①', type: 'choice', who: who, timeLimit: 45, fixed: true,
      say: { staff: '결론부터. 의견은?', senior: '자네 결론은 뭔가?', partner: '이사님, 의견 주시면 보고서 나갑니다.' },
      ask: '위 판단 자료를 바탕으로 표명할 감사의견을 고르시오.',
      label: d.kind + ' 표명', score: 24, why: WHY_OPINION,
      options: OPINIONS.map(function (o) {
        return o === d.kind ? { t: o, ok: true } : { t: o, label: '오답 의견 — ' + o };
      }),
      model: d.kind + '을 표명한다.'
    };

    var p2 = { key: '②', who: who, maxChars: 110, timeLimit: 100,
      say: { staff: '왜 그 의견인지 써 봐.', senior: '근거는? 이사님께 올릴 수 있게.', partner: '근거는 어떻게 정리할까요?' },
      ask: '그 감사의견을 표명하는 근거를 2줄 이내로 서술하시오.',
      guide: ['감사증거 — 충분·적합 여부', '중요성 — 미수정 합계와 비교', '전반성 — 적정의견이면 생략'],
      rubric: { bonusCap: 6, must: [], bonus: [
        { kw: ['계량화', '재무적 영향'], score: 6, label: '재무적 영향의 계량화' }], trap: [] },
      model: '' };

    if (d.kind === '적정의견') {
      p2.rubric.must = [
        { kw: ['충분하고 적합한 감사증거'], score: 12, label: '충분하고 적합한 감사증거 입수', negOk: true },
        { kw: ['중요성에 미달', '중요하지 않', '미달'], score: 16, label: '미수정왜곡표시가 중요성에 미달', negOk: true,
          why: '미수정왜곡표시 평가 — 합계가 중요성 미달이면 중요하지 않음. 단, 손익 반전·약정 위반 등 질적 요인 고려' }];
      p2.model = '충분하고 적합한 감사증거를 입수하였고 미수정왜곡표시 ' + t + '억원은 중요성 ' + mat() + '억원에 미달한다.';
    } else if (d.basis === 'scope') {
      p2.rubric.must = [
        { kw: ['감사범위제한'], score: 14, label: '감사범위제한',
          why: '감사범위제한 — 증거를 입수하지 못한 상황. 왜곡표시(부적정)와 구분 → 한정의견·의견거절' },
        { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거를 입수하지 못함', negOk: true },
        { kw: ['전반적'], score: 14, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true,
          why: WHY_PERVASIVE }];
      p2.model = '충분하고 적합한 감사증거를 입수하지 못하였으므로 감사범위제한에 해당하고, 그 영향이 ' +
        (d.pervasive ? '중요하고 전반적이다.' : '중요하나 전반적이지는 않다.');
    } else {
      p2.rubric.must = [
        { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거 입수', negOk: true },
        { kw: ['중요'], score: 10, label: '중요성 초과', negOk: true },
        { kw: ['전반적'], score: 16, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true,
          why: WHY_PERVASIVE }];
      p2.model = '충분하고 적합한 감사증거는 입수하였으나 미수정왜곡표시 ' + t + '억원이 중요성 ' + mat() + '억원을 초과하고, 그 영향이 ' +
        (d.pervasive ? '재무제표의 다수 요소에 걸쳐 전반적이다.' : '특정 계정에 국한되어 전반적이지는 않다.');
    }

    // 상장사 보고서는 업무품질관리검토를 거쳐야 나간다 — 마지막 칸은 품질관리실 오세진이 묻는다
    var extra = (global.COMPANY || {}).opinionBonus || [];
    var p3 = { key: '③', who: 'eqr', maxChars: 110, timeLimit: 100,
      say: '발행 전에 제가 봅니다. 뭘 챙겼습니까?',
      ask: '감사보고서를 작성·발행할 때 함께 해야 할 일을 두 가지 이상 서술하시오.',
      guide: ['보고서 문단 — 변형의견일 때 위치', '커뮤니케이션 · 서면진술'],
      rubric: { bonusCap: 8, must: [], bonus: [
        { kw: ['핵심감사사항'], score: 8, label: '핵심감사사항과의 관계' },
        { kw: ['강조사항문단'], score: 8, label: '강조사항문단과 구분' }].concat(extra),
        trap: [{ kw: ['강조사항문단으로 갈음', '강조사항으로 기재'], score: -12, label: '강조사항문단으로 갈음' }] },
      model: '' };

    if (d.kind === '적정의견') {
      p3.rubric.must = [
        { kw: ['지배기구와의 커뮤니케이션'], score: 14, label: '미수정 사항을 지배기구와 커뮤니케이션' },
        { kw: ['서면진술'], score: 10, label: '미수정 사항이 중요하지 않다는 서면진술' }];
      p3.model = '미수정 사항은 지배기구와 커뮤니케이션하고, 미수정왜곡표시가 중요하지 않다는 경영진의 서면진술을 입수한다.';
    } else {
      p3.rubric.must = [
        { kw: ['변형의견근거문단'], score: 14, label: '변형의견근거문단 기재', negOk: true,
          why: '변형의견근거문단 — 의견문단 바로 앞. 사유·재무적 영향 기재. 의견 변형 사유는 핵심감사사항으로 기재하지 않음' },
        { kw: ['의견문단 앞', '의견문단의 바로 앞', '의견문단 바로 앞', '바로 앞에', '앞에 기재'], score: 10, label: '근거문단은 의견문단 바로 앞' },
        { kw: ['지배기구와의 커뮤니케이션'], score: 10, label: '지배기구 커뮤니케이션' }];
      p3.model = '의견문단 바로 앞에 변형의견근거문단을 두어 사유와 재무적 영향을 기재하고, 그 사항은 핵심감사사항으로 적지 아니하며 지배기구와 커뮤니케이션한다.';
      if (d.kind === '의견거절') {
        p3.rubric.must.push({ kw: ['핵심감사사항을 기재하지', '핵심감사사항은 기재하지', 'KAM을 기재하지'],
          score: 10, label: '의견거절 시 핵심감사사항 미기재', negOk: true });
        p3.model += ' 의견거절이므로 핵심감사사항은 기재하지 아니한다.';
      }
    }
    return [p1, p2, p3];
  }

  function buildOpinion(it, S) {
    if (!S.mis) S.mis = misstatements(S);
    var d = decide(S);
    S.decision = d;
    it.situation = '감사 종료 단계이다. 미수정왜곡표시 합계는 ' + d.total.toFixed(1) +
      '억원이고 재무제표 전체 중요성은 ' + mat() + '억원이다. 감사증거 확보 수준은 ' + S.gauge.E + '점이다.' +
      (d.basis === 'scope' ? ' 여러 영역에서 충분하고 적합한 감사증거를 확보하지 못했다.' : '');
    it.exhibits = [{ type: 'kv', title: '판단 자료', items: [
      ['미수정왜곡표시 합계', d.total.toFixed(1) + '억원'],
      ['중요성을 넘는 개별 항목', S.mis.over + '건'],
      ['재무제표 전체 중요성', matText()],
      ['감사증거', S.gauge.E + ' / 100'],
      ['핵심감사사항', '3건 (상장회사)']] }];
    it.clues = ['미수정왜곡표시 합계는 ' + d.total.toFixed(1) + '억원', '감사증거 확보 수준은 ' + S.gauge.E + '점'];
    it.parts = normParts(opinionParts(d, S), S, it.v);
  }

  /* ---------- 저장 · 이어하기 ----------
     장면이 끝날 때마다 저장한다. 함수가 든 객체(it, def, rand)는 빼고 id 로 다시 잇는다. */
  var KEEP = ['i', 'gauge', 'rel', 'flags', 'hits', 'cards', 'log', 'sideSeen', 'sideDone', 'sideAt',
              'late', 'mis', 'decision', 'opinionOK', 'papers', 'streak', 'best', 'story', 'bond'];
  function snapshot(S) {
    var o = { v: 6, seed: S.seed, at: Date.now() };
    KEEP.forEach(function (k) { o[k] = clone(S[k]); });
    o.truths = S.truths.map(function (t) {
      return { id: t.id, active: t.active, amount: t.amount, found: t.found, verified: t.verified, corrected: t.corrected };
    });
    return o;
  }
  function restore(o) {
    var S = create({ seed: o.seed });
    KEEP.forEach(function (k) { if (o[k] !== undefined) S[k] = clone(o[k]); });
    var by = {};
    (o.truths || []).forEach(function (t) { by[t.id] = t; });
    S.truths.forEach(function (t) {
      var x = by[t.id];
      if (!x) return;
      t.active = x.active; t.amount = x.amount; t.found = x.found; t.verified = x.verified; t.corrected = x.corrected;
    });
    S.active = {};
    S.truths.forEach(function (t) { S.active[t.id] = t.active; });
    if (global.STORY) global.STORY.init(S);   // 예전 저장본에는 이야기 기록이 없다
    return S;
  }

  /* ---------- 개념 카드 도감 ----------
     장면(모든 판본) · 의견 네 갈래 · 돌발 업무 · 미니게임에서 why 가 달린 논점을 모은다. */
  var _cards = null;
  function resetCards() { _cards = null; }
  function cardIndex() {
    if (_cards) return _cards;
    var seen = {}, list = [];
    function add(m, std, where, src) {
      if (!m || !m.why || seen[m.label]) return;
      seen[m.label] = 1;
      list.push({ label: m.label, why: m.why, std: std || '기타', where: where, src: src });
    }
    function scan(parts, std, where, src) {
      (parts || []).forEach(function (p) { ((p.rubric && p.rubric.must) || []).forEach(function (m) { add(m, std, where, src); }); });
    }
    function scanSeason() {
    (global.SCENES || []).forEach(function (sc) {
      if (sc.dynamic === 'opinion') return;
      (sc.variants || [null]).forEach(function (v) {
        var S0 = create({ seed: 7 });
        try { scan(resolve(sc, S0, v && v.id).parts, (sc.standards || [])[0], sc.chapter, sc.id); } catch (e) { /* 건너뜀 */ }
      });
    });
    var S1 = create({ seed: 7 });
    S1.seat = 'partner';
    [{ kind: '적정의견', basis: 'none', pervasive: false, total: 5, over: 0 },
     { kind: '한정의견', basis: 'mis', pervasive: false, total: 20, over: 1 },
     { kind: '부적정의견', basis: 'mis', pervasive: true, total: 70, over: 3 },
     { kind: '의견거절', basis: 'scope', pervasive: true, total: 0, over: 0 }].forEach(function (d) {
      scan(normParts(opinionParts(d, S1), S1, { id: '-' }), 'KSA 705', '의견형성', 's10');
    });
    (global.CASES || []).forEach(function (c) {
      var S0 = create({ seed: 7 });
      try { scan(resolve(c, S0).parts, (c.standards || [])[0], c.chapter, c.id); } catch (e) { /* 건너뜀 */ }
    });
    // 메신저에서 내린 윤리 · 독립성 판정
    if (global.STORY) global.STORY.cards().forEach(function (c) { add(c, c.std, c.where, c.src); });
    }
    // 회사가 여럿이면 도감은 모든 회사를 합쳐서 센다
    if (global.SEASONS) global.SEASONS.each(scanSeason);
    else scanSeason();
    _cards = list;
    return list;
  }

  /* ---------- 정산 ---------- */
  function epilogue(S) {
    var found = 0, missed = 0;
    var rows = S.truths.map(function (t) {
      if (t.active) { if (t.found) found += t.amount; else missed += t.amount; }
      var state = t.active
        ? (t.found ? (t.corrected ? 'fixed' : 'found') : 'missed')
        : (t.verified ? 'cleared' : 'lucky');
      return { id: t.id, title: t.def.title, account: t.def.account, amount: t.amount,
               active: t.active, state: state,
               text: t.active ? t.def.hidden : (t.def.clean || '문제 없음.'),
               how: t.def.howFound };
    });
    var ethicsBad = global.STORY ? global.STORY.ethicsBad(S) : [];
    var ctx = {
      gauge: S.gauge, rel: S.rel, flags: S.flags, opinionOK: S.opinionOK, seat: S.seat,
      misTotal: S.mis ? S.mis.total : 0,
      foundAmount: r1(found), missedAmount: r1(missed), decision: S.decision,
      bond: S.bond || {}, ethicsBad: ethicsBad
    };
    function axis(list) {
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        if (f.when(ctx)) {
          return { id: f.id, tone: f.tone, title: f.title,
                   text: typeof f.text === 'function' ? f.text(ctx) : f.text };
        }
      }
      return null;
    }
    var EP = global.EPILOGUE;
    return { audit: axis(EP.audit), company: axis(EP.company), career: axis(EP.career),
             people: global.STORY ? global.STORY.fates(ctx) : [],
             ethics: global.STORY ? global.STORY.ethics(S) : [],
             rows: rows, found: r1(found), missed: r1(missed), ctx: ctx,
             learned: Object.keys(S.cards.learned).length,
             review: Object.keys(S.cards.review).length };
  }

  global.SEASON = {
    create: create, resolve: resolve, apply: apply, combine: combine, epilogue: epilogue,
    sideOpen: sideOpen, offer: offer, applySide: applySide,
    misstatements: misstatements, decide: decide, band: band, dday: dday, asker: asker, reviewer: reviewer,
    seatWho: seatWho, bySeat: bySeat, viewOf: viewOf, rng: rng, povOf: povOf, SEAT_WHO: SEAT_WHO,
    snapshot: snapshot, restore: restore, cardIndex: cardIndex, resetCards: resetCards,
    SEATS: SEATS, FLAG_TEXT: FLAG_TEXT, MAT: MAT, OPINIONS: OPINIONS, KEYS: KEYS,
    SIDE_AFTER: SIDE_AFTER, sideKeys: sideKeys, mat: mat,
    TIME_SCALE: TIME_SCALE, DAY_RATE: DAY_RATE, TYPE_NAME: TYPE_NAME
  };
})(typeof window !== 'undefined' ? window : this);
