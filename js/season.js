/* ============================================================
   감사 시즌 — 상태 · 분기 · 정산 로직 (season.js)
   ------------------------------------------------------------
   DOM 을 모른다. 화면(game.js)과 검증(tools/validate.js)이
   같은 로직을 쓴다. 그래서 경우의 수를 사람 없이 시뮬레이션할 수 있다.

   ★ 좌석 (seat)
     같은 감사, 같은 10장면인데 어느 자리에 앉느냐에 따라
     묻는 각도와 압박의 방향이 달라진다. 채점 라벨은 좌석과 무관하게 같다.
     (라벨이 분기·진실 발견의 계약이기 때문이다)

   ★ 한 장면 = 짧은 칸 2~3개 (parts)
     한 문장에 여러 논점을 욱여넣게 하지 않는다.
     칸마다 따로 묻고, 따로 채점하고, 인물이 바로 반응한다.

   상태
     gauge.E  감사증거   답안 수준만큼 쌓인다. 45 미만이면 마지막에 범위제한
     gauge.T  감사시간   장면마다 준다. 0 이면 마감 실패
     gauge.R  신뢰       상급자의 신뢰. 오개념을 쓰면 급락
     rel.company  회사 태도 (좌석에 따라 흔들리는 폭이 다르다)
     flags    분기 표지
     hits     '장면id#논점' 누적 명중 — 진실 발견의 근거 (만점만 인정)
     truths   이번 시즌의 진실
     cards    익힌 논점 / 복습할 논점
   ============================================================ */
(function (global) {
  'use strict';

  var MAT = 12;          // 재무제표 전체 중요성 (억원)
  var TIME_SCALE = 0.7;  // 장면 비용 배율 (조건부 장면까지 들어갈 여지를 둔다)
  var OPINIONS = ['적정의견', '한정의견', '부적정의견', '의견거절'];
  var KEYS = ['①', '②', '③', '④', '⑤'];

  var SEATS = {
    staff: { id: 'staff', name: '어쏘', role: '현장에서 절차를 직접 수행하고 보고한다',
             trust: '시니어의 신뢰', time: 0.9, company: 0.7,
             hint: '시간은 넉넉하지만 회사와 직접 부딪칠 일은 적다' },
    senior: { id: 'senior', name: '시니어', role: '팀을 배분하고 판단을 취합해 위에 올린다',
              trust: '파트너의 신뢰', time: 1.0, company: 1.0,
              hint: '균형 잡힌 자리. 무엇을 올릴지 스스로 정한다' },
    partner: { id: 'partner', name: '업무수행이사', role: '결론을 내고 회사와 지배기구를 상대한다',
               trust: '법인 품질관리의 신뢰', time: 1.15, company: 1.35,
               hint: '시간이 빠듯하고, 회사 태도가 크게 흔들린다' }
  };

  var FLAG_TEXT = {
    fraud_alert: '분개 데이터 전수 추출 진행',
    inv_ok: '물류센터 입회 일정 확보'
  };
  var BASE_MIS = [
    { title: '대손충당금 과소 (일반채권)', amount: 5.1, account: '대손충당금' },
    { title: '미지급비용 누락', amount: 3.7, account: '미지급비용' }
  ];

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
       파트너 → 시니어(유가온)가 보고를 올린다
     reviewer : 결론을 검토하는 사람. 시니어 자리에서는 파트너가 직접 묻는다 */
  function asker(S) { return S.seat === 'senior' ? 'assoc' : 'manager'; }
  function reviewer(S) { return S.seat === 'senior' ? 'partner' : 'manager'; }
  /* 좌석과 맞지 않는 화자를 바로잡는다 — 내가 파트너면 파트너가 나에게 말할 수 없다 */
  function seatWho(w, S) {
    if (S.seat === 'partner' && w === 'partner') return 'manager';
    if (S.seat === 'senior' && w === 'manager') return 'assoc';
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

  /* ---------- 시즌 생성 ---------- */
  function create(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? (opts.seed >>> 0) : (Math.floor(Math.random() * 90000) + 10000);
    var seat = SEATS[opts.seat] ? opts.seat : 'senior';
    var R = rng(seed);

    // 회사 사정 — 시즌마다 다르다. 장면 구성과 일부 진실의 존재 여부를 가른다.
    // 이건 숨은 진실이 아니라 재무제표에 드러나 있는 상태다 (플레이어가 숫자로 본다).
    var stress = R() < 0.5;

    var truths = global.TRUTH.map(function (t) {
      var active = t.always ? true : R() < (t.p == null ? 1 : t.p);
      if (t.needs === 'stress' && !stress) active = false;
      var j = t.jitter === false ? 1 : (0.88 + R() * 0.24);
      return { id: t.id, def: t, active: active, amount: r1(t.amount * j),
               found: false, verified: false, corrected: false };
    });
    var active = {};
    truths.forEach(function (t) { active[t.id] = t.active; });

    return {
      seed: seed, seat: seat, rand: R, i: 0, stress: stress,
      gauge: { E: 50, T: 100, R: 60 },
      rel: { company: 55 },
      flags: {}, hits: {}, truths: truths, active: active,
      cards: { learned: {}, review: {} },
      played: {}, log: [], results: [],
      late: false, mis: null, decision: null, opinionOK: false
    };
  }

  /* ---------- 시즌의 장면 구성 ----------
     장면에 when(S) 이 있으면 조건이 맞는 시즌에만 등장한다.
     · 회사 사정에 달린 것    계속기업 평가 — 유동성 압박이 있는 시즌에만
     · 내 절차에 달린 것      부정 혐의 대응 — 가공거래를 실제로 찾아냈을 때만
     when 은 한 번 참이 되면 계속 참이어야 한다(단조). 이미 지나온 장면은
     조건과 무관하게 목록에 남는다. */
  function sceneList(S) {
    return global.SCENES.filter(function (sc) {
      return S.played[sc.id] || !sc.when || sc.when(S);
    });
  }

  function nextScene(S) {
    var list = sceneList(S);
    for (var i = 0; i < list.length; i++) {
      if (!S.played[list[i].id]) return list[i];
    }
    return null;
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

  /* ---------- 칸 정리 ---------- */
  function normParts(list, S, v) {
    return (list || []).map(function (p, i) {
      var r = clone(call(p.rubric, v, S)) || { must: [] };
      if (r.bonusCap == null) r.bonusCap = 6;
      return {
        key: p.key || KEYS[i] || String(i + 1),
        who: seatWho(bySeat(p.who, S.seat) || asker(S), S),
        say: bySeat(p.say, S.seat) || '',
        ask: bySeat(p.ask, S.seat) || '',
        maxChars: p.maxChars || 90,
        timeLimit: p.timeLimit || 90,
        form: p.form || 'short',
        rubric: r,
        verdict: clone(call(p.verdict, v, S)) || null,
        model: bySeat(p.model, S.seat) || ''
      };
    });
  }

  /* ---------- 장면 해석 ---------- */
  function resolve(sc, S, forceId) {
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

  /* ---------- 답안 반영 ---------- */
  function apply(S, it, texts, res, meta) {
    meta = meta || {};
    var sc = it.sc, seat = SEATS[S.seat];
    var before = { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company };
    var events = [];

    // 칸을 모두 합쳐서 본다
    var allMust = [], allTrap = [], vWrong = false;
    (res.parts || []).forEach(function (p) {
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

    // 개념 카드 — 제대로 짚으면 익힌 카드, 놓치면 복습 카드
    var gained = 0;
    allMust.forEach(function (m) {
      if (!m.why) return;
      if (m.hit) {
        if (!S.cards.learned[m.label]) { S.cards.learned[m.label] = { why: m.why, scene: sc.chapter }; gained++; }
        delete S.cards.review[m.label];
      } else if (!S.cards.learned[m.label]) {
        S.cards.review[m.label] = { why: m.why, scene: sc.chapter };
      }
    });
    if (gained) events.push({ kind: 'card', text: '개념 카드 ' + gained + '장을 익혔다' });

    var trapHit = allTrap.filter(function (t) { return t.hit; });
    var pleaseLabels = {};
    (it.parts || []).forEach(function (p) {
      ((p.rubric && p.rubric.trap) || []).forEach(function (t) { if (t.please) pleaseLabels[t.label] = 1; });
    });
    var please = trapHit.filter(function (t) { return pleaseLabels[t.label]; }).length;
    var confront = (sc.confront || []).filter(function (l) {
      return allMust.some(function (m) { return m.hit && m.label === l; });
    }).length;

    // 감사시간 — 좌석과 회사 태도에 따라 다르게 든다
    var obstruct = S.rel.company < 35 ? 3 : 0;
    var cost = ((sc.cost || 8) + (it.v.extraCost || 0)) * TIME_SCALE * seat.time +
               (meta.over || 0) / 40 + (meta.timedOut ? 5 : 0) + obstruct;

    S.gauge.E = clamp(Math.round(S.gauge.E + (res.percent - 55) * 0.45), 0, 100);
    S.gauge.T = clamp(Math.round(S.gauge.T - cost), 0, 100);
    S.gauge.R = clamp(Math.round(S.gauge.R +
                  (res.percent >= 80 ? 5 : res.percent >= 60 ? 1 : -4) -
                  trapHit.length * 8 - (vWrong ? 4 : 0)), 0, 100);
    S.rel.company = clamp(Math.round(S.rel.company +
                  (-Math.min(15, confront * 5) + please * 6) * seat.company +
                  (confront === 0 && !please ? 2 : 0)), 0, 100);

    if (obstruct) events.push({ kind: 'warn', text: '회사의 자료 제출이 늦어져 감사시간이 추가로 들었다' });
    if (it.v.extraCost) events.push({ kind: 'warn', text: '뒤늦게 알게 된 사안이라 추가 절차에 시간이 더 들었다' });

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
        // 발견은 증거를 보태 주지만, 증거 수준을 결정하는 것은 어디까지나 절차의 질이다
        S.gauge.E = clamp(S.gauge.E + 3, 0, 100);
        events.push({ kind: 'found', id: t.id,
          text: '발견 — ' + t.def.title + ' ' + t.amount.toFixed(1) + '억원' });
      } else {
        t.verified = true;
        events.push({ kind: 'clear', id: t.id,
          text: '확인 완료 — ' + (t.def.short || t.def.title) + ' 이상 없음' });
      }
    });

    var b0 = band(before.C), b1 = band(S.rel.company);
    if (b0 !== b1) events.push({ kind: 'rel', text: '회사의 태도가 바뀌었다 — ' + b0 + ' → ' + b1 });

    if (sc.dynamic === 'opinion' && S.decision) {
      var right = allMust.some(function (m) { return m.hit && m.label === S.decision.kind + ' 표명'; });
      // 여러 의견을 걸쳐 쓰면 맞힌 것이 아니다. 감사의견은 하나다.
      var hedged = allTrap.some(function (t) { return t.hit && t.label.indexOf('오답 의견') === 0; });
      S.opinionOK = right && !hedged;
      if (right && hedged) events.push({ kind: 'warn', text: '여러 의견을 걸쳐 썼다 — 감사의견은 하나다' });
    }

    S.played[sc.id] = 1;

    var delta = { E: S.gauge.E - before.E, T: S.gauge.T - before.T,
                  R: S.gauge.R - before.R, C: S.rel.company - before.C };
    var outcome = { events: events, delta: delta, newHits: newHits,
                    confront: confront, please: please, cards: gained };
    S.log.push({ day: sc.day, chapter: sc.chapter, percent: res.percent, events: events });
    S.results.push({ it: it, texts: texts, res: res,
                     agg: { must: allMust, trap: allTrap, verdictWrong: vWrong }, outcome: outcome });
    return outcome;
  }

  /* ---------- 왜곡표시 집계 ---------- */
  function misstatements(S) {
    var coop = S.rel.company >= 50;
    var items = BASE_MIS.map(function (b) {
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
    var over = open.filter(function (i) { return i.amount >= MAT; }).length;
    return { items: items, total: total, over: over, coop: coop };
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
        ['재무제표 전체 중요성', MAT + '억원'], ['수행중요성', '8억 4천만원'],
        ['명백히 사소한 금액', '6,000만원'], ['미수정 합계', m.total.toFixed(1) + '억원']] }
    ];
    var nTruth = m.items.filter(function (i) { return i.kind === 'truth'; }).length;
    it.situation = '감사 중 식별된 왜곡표시를 집계하였다. ' +
      (m.coop ? '경영진은 일반적인 조정사항은 받아들였으나 ' : '경영진은 ') +
      (nTruth ? '감사인이 식별한 주요 왜곡표시의 수정은 거부하였다.' : '나머지 사항의 수정을 거부하였다.') +
      (S.late ? ' 특히 특수관계자 거래는 감사 종료 직전에야 확인되어 추가 절차를 할 시간이 부족하였다.' : '');

    // 합계가 중요성에 미달하면 "의견 변형" 을 물을 수 없다 — 그 칸의 논점을 바꾼다
    if (m.total <= MAT) {
      eachMust(it.parts, function (mu, p, i) {
        if (mu.label !== '수정되지 않으면 의견 변형') return;
        p.rubric.must[i] = { kw: ['중요성에 미달', '중요하지 않', '의견에 영향을 미치지', '변형하지', '미달'],
          score: mu.score, label: '미수정 합계가 중요성에 미달하여 의견에 영향 없음', negOk: true,
          why: mu.why };
        p.model = '미수정 합계가 중요성에 미달하므로 그 자체로는 의견에 영향을 미치지 아니한다.';
        p.rubric.trap = (p.rubric.trap || []).filter(function (t) { return t.label !== '중요성 초과인데 적정의견'; });
      });
    }
    if (S.rel.company < 35 && it.parts.length) {
      var last = it.parts[it.parts.length - 1];
      last.rubric.bonus = (last.rubric.bonus || [])
        .concat([{ kw: ['압력 위협'], score: 6, label: '감사인 교체 언급 = 압력 위협 인식' }]);
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
    } else if (m.total > MAT) {
      basis = 'mis';
      kind = pervasive ? '부적정의견' : '한정의견';
    } else {
      basis = 'none';
      kind = '적정의견';
    }
    return { kind: kind, basis: basis, pervasive: pervasive, total: m.total, over: m.over, E: E };
  }

  function opinionParts(d, S) {
    var t = d.total.toFixed(1);
    var who = reviewer(S);
    var p1 = {
      key: '①', who: who, maxChars: 60, timeLimit: 70,
      say: { staff: '파트너 보고 초안이야. 결론부터 한 줄로 써봐.',
             senior: '자, 마지막이네. 자네 결론은 뭔가?',
             partner: '이사님, 결론만 주시면 보고서 나갑니다.' },
      ask: '표명할 감사의견 (한 줄)',
      rubric: {
        bonusCap: 0,
        must: [{ kw: [d.kind], score: 24, label: d.kind + ' 표명',
                 notBefore: d.kind === '적정의견' ? ['부'] : undefined,
                 why: '의견은 ① 충분하고 적합한 감사증거를 입수했는가 ② 왜곡표시가 중요한가 ③ 그 영향이 전반적인가, 세 가지로 갈린다. 증거를 못 얻었으면 범위제한(한정·의견거절), 왜곡표시가 있으면 한정·부적정이다.' }],
        trap: OPINIONS.filter(function (o) { return o !== d.kind; }).map(function (o) {
          var x = { kw: [o], score: -14, label: '오답 의견 — ' + o };
          if (o === '적정의견') x.notBefore = ['부'];
          return x;
        })
      },
      model: d.kind + '을 표명한다.'
    };

    var p2 = { key: '②', who: who, maxChars: 110, timeLimit: 100,
      say: { staff: '왜 그렇게 결론냈는지도 적어야 해.',
             senior: '근거는? 내가 이사님께 설명할 수 있게.',
             partner: '근거를 어떻게 정리할까요?' },
      ask: '그 의견의 근거 (중요성 · 전반성 · 증거)',
      rubric: { bonusCap: 6, must: [], bonus: [
        { kw: ['계량화', '재무적 영향'], score: 6, label: '재무적 영향의 계량화' }], trap: [] },
      model: '' };

    if (d.kind === '적정의견') {
      p2.rubric.must = [
        { kw: ['충분하고 적합한 감사증거'], score: 12, label: '충분하고 적합한 감사증거 입수', negOk: true },
        { kw: ['중요성에 미달', '중요하지 않', '미달'], score: 16, label: '미수정왜곡표시가 중요성에 미달', negOk: true,
          why: '미수정왜곡표시 합계가 중요성에 미달하면 재무제표에 중요한 왜곡표시가 없다고 본다. 다만 금액이 작아도 질적 요인(손익 방향 전환, 약정 준수)으로 중요해질 수 있다.' }];
      p2.model = '충분하고 적합한 감사증거를 입수하였고 미수정왜곡표시 ' + t + '억원은 중요성 ' + MAT + '억원에 미달한다.';
    } else if (d.basis === 'scope') {
      p2.rubric.must = [
        { kw: ['감사범위제한'], score: 14, label: '감사범위제한',
          why: '증거를 입수하지 못한 것은 왜곡표시가 아니라 범위제한이다. 왜곡표시(부적정)와 범위제한(의견거절)을 섞으면 안 된다.' },
        { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거를 입수하지 못함', negOk: true },
        { kw: ['전반적'], score: 14, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true,
          why: '전반적이란 특정 계정에 국한되지 않거나, 국한되더라도 재무제표의 상당한 부분을 차지하는 경우다. 전반적이면 의견거절, 아니면 한정의견이다.' }];
      p2.model = '충분하고 적합한 감사증거를 입수하지 못하였으므로 감사범위제한에 해당하고, 그 영향이 ' +
        (d.pervasive ? '중요하고 전반적이다.' : '중요하나 전반적이지는 않다.');
    } else {
      p2.rubric.must = [
        { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거 입수', negOk: true },
        { kw: ['중요'], score: 10, label: '중요성 초과', negOk: true },
        { kw: ['전반적'], score: 16, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true,
          why: '전반적이란 특정 계정에 국한되지 않거나, 국한되더라도 재무제표의 상당한 부분을 차지하는 경우다. 전반적이면 부적정의견, 아니면 한정의견이다.' }];
      p2.model = '충분하고 적합한 감사증거는 입수하였으나 미수정왜곡표시 ' + t + '억원이 중요성 ' + MAT + '억원을 초과하고, 그 영향이 ' +
        (d.pervasive ? '재무제표의 다수 요소에 걸쳐 전반적이다.' : '특정 계정에 국한되어 전반적이지는 않다.');
    }

    var p3 = { key: '③', who: who, maxChars: 110, timeLimit: 100,
      say: { staff: '보고서에 어떻게 들어가는지도 알아야지.',
             senior: '보고서 문단은 어떻게 쓰나?',
             partner: '보고서 형식은 어떻게 잡을까요?' },
      ask: '감사보고서 작성 시 유의사항',
      rubric: { bonusCap: 8, must: [], bonus: [
        { kw: ['핵심감사사항'], score: 8, label: '핵심감사사항과의 관계' },
        { kw: ['강조사항문단'], score: 8, label: '강조사항문단과 구분' }],
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
          why: '변형의견을 낼 때는 의견문단 바로 앞에 근거문단을 두어 사유와 재무적 영향을 기재한다. 변형의 원인이 된 사항은 핵심감사사항으로 적지 않는다.' },
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
      '억원이고 재무제표 전체 중요성은 ' + MAT + '억원이다. 감사증거 확보 수준은 ' + S.gauge.E + '점이다.' +
      (d.basis === 'scope' ? ' 여러 영역에서 충분하고 적합한 감사증거를 확보하지 못했다.' : '');
    it.exhibits = [{ type: 'kv', title: '판단 자료', items: [
      ['미수정왜곡표시 합계', d.total.toFixed(1) + '억원'],
      ['중요성을 넘는 개별 항목', S.mis.over + '건'],
      ['재무제표 전체 중요성', MAT + '억원'],
      ['감사증거', S.gauge.E + ' / 100'],
      ['핵심감사사항', '3건 (상장회사)']] }];
    it.parts = normParts(opinionParts(d, S), S, it.v);
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
               text: t.active ? t.def.hidden : (t.def.clean || '문제는 없었다.'),
               how: t.def.howFound };
    });
    var ctx = {
      gauge: S.gauge, rel: S.rel, flags: S.flags, opinionOK: S.opinionOK, seat: S.seat,
      misTotal: S.mis ? S.mis.total : 0,
      foundAmount: r1(found), missedAmount: r1(missed), decision: S.decision
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
             rows: rows, found: r1(found), missed: r1(missed), ctx: ctx,
             learned: Object.keys(S.cards.learned).length,
             review: Object.keys(S.cards.review).length };
  }

  global.SEASON = {
    create: create, resolve: resolve, apply: apply, epilogue: epilogue,
    sceneList: sceneList, nextScene: nextScene,
    misstatements: misstatements, decide: decide, band: band, asker: asker, reviewer: reviewer,
    seatWho: seatWho, bySeat: bySeat,
    SEATS: SEATS, FLAG_TEXT: FLAG_TEXT, MAT: MAT, OPINIONS: OPINIONS, KEYS: KEYS
  };
})(typeof window !== 'undefined' ? window : this);
