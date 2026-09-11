/* ============================================================
   감사 시즌 — 상태 · 분기 · 정산 로직 (season.js)
   ------------------------------------------------------------
   DOM 을 모른다. 화면(game.js)과 검증(tools/validate.js)이
   같은 로직을 쓴다. 그래서 경우의 수를 사람 없이 시뮬레이션할 수 있다.

   상태
     gauge.E  감사증거   답안 수준만큼 쌓인다. 45 미만이면 마지막에 범위제한
     gauge.T  감사시간   장면마다 준다. 0 이면 마감 실패
     gauge.R  신뢰       파트너의 신뢰. 오개념을 쓰면 급락
     rel.company  회사 태도
                  강경한 논점(confront)을 짚을수록 떨어진다 → 비협조 · 자료 지연
                  회사 입장을 받아주는 서술(please)을 쓰면 오른다 → 대신 놓친다
     flags    분기 표지
     hits     '장면id#논점' 누적 명중 기록 — 진실 발견의 근거
     truths   이번 시즌의 진실 (존재 여부 · 금액 · 발견 여부)
   ============================================================ */
(function (global) {
  'use strict';

  var MAT = 12;          // 재무제표 전체 중요성 (억원)
  var TIME_SCALE = 0.8;  // 장면 비용 배율 (apply 참고)
  var OPINIONS = ['적정의견', '한정의견', '부적정의견', '의견거절'];
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

  /* 시즌 코드가 같으면 진실도 같다 — 같은 시즌을 다른 선택으로 다시 해볼 수 있다 */
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
    var R = rng(seed);
    var truths = global.TRUTH.map(function (t) {
      var active = t.always ? true : R() < (t.p == null ? 1 : t.p);
      var j = t.jitter === false ? 1 : (0.88 + R() * 0.24);
      return { id: t.id, def: t, active: active, amount: r1(t.amount * j),
               found: false, verified: false, corrected: false };
    });
    var active = {};
    truths.forEach(function (t) { active[t.id] = t.active; });

    return {
      seed: seed, rand: R, i: 0,
      gauge: { E: 50, T: 100, R: 60 },
      rel: { company: 55 },
      flags: {}, hits: {}, truths: truths, active: active,
      log: [], results: [],
      late: false, mis: null, decision: null, opinionOK: false
    };
  }

  /* ---------- 판본 선택 ----------
     when 조건이 달린 판본이 있으면 위에서부터 조건이 맞는 첫 판본.
     (조건 없는 판본은 맨 아래 두어 기본값으로 쓴다)
     조건이 하나도 없으면 무작위. */
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

  /* ---------- 장면 해석 ---------- */
  function resolve(sc, S, forceId) {
    var v = (forceId && sc.variants)
      ? (sc.variants.filter(function (x) { return x.id === forceId; })[0] || sc.variants[0])
      : pickVariant(sc, S);

    var it = {
      sc: sc, v: v, speaker: sc.speaker,
      line: v.line || sc.line,
      note: v.note || null,
      situation: call(sc.situation, v, S),
      exhibits: call(sc.exhibits, v, S) || [],
      rubric: clone(call(sc.rubric, v, S)),
      model: (call(sc.model, v, S) || []).slice(),
      verdict: clone(call(sc.verdict, v, S)) || null,
      prompt: sc.prompt, maxChars: sc.maxChars, timeLimit: sc.timeLimit
    };

    // 앞선 선택이 인물의 대사와 장면의 공기를 바꾼다
    if (sc.enter) {
      var e = sc.enter(S, v) || {};
      if (e.line) it.line = e.line;
      if (e.note) it.note = e.note;
      if (e.speaker) it.speaker = e.speaker;
    }
    if (v.late) S.late = true;

    if (sc.dynamic === 'misstatements') buildMisstatements(it, S);
    if (sc.dynamic === 'opinion') buildOpinion(it, S);
    return it;
  }

  /* ---------- 답안 반영 ---------- */
  function apply(S, it, text, res, meta) {
    meta = meta || {};
    var sc = it.sc, p = res.parts[0], pr = p.res;
    var before = { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company };
    var events = [];

    var newHits = [];
    (pr.must || []).forEach(function (m) {
      if (!m.hit) return;
      var k = sc.id + '#' + m.label;
      if (!S.hits[k]) { S.hits[k] = 1; newHits.push(m.label); }
    });

    var trapHit = (pr.trap || []).filter(function (t) { return t.hit; });
    var pleaseLabels = {};
    (it.rubric.trap || []).forEach(function (t) { if (t.please) pleaseLabels[t.label] = 1; });
    var please = trapHit.filter(function (t) { return pleaseLabels[t.label]; }).length;
    var confront = (sc.confront || []).filter(function (l) {
      return (pr.must || []).some(function (m) { return m.hit && m.label === l; });
    }).length;
    var vWrong = !!(p.verdict && !p.verdict.correct);

    // 감사시간 — 회사가 비협조적이면 자료 제출이 늦어져 더 든다.
    // 장면 비용 합계가 83 이므로 0.8 을 곱해 약 66 으로 맞춘다.
    // 강경하게 끝까지 밀어붙인 플레이(자료 지연 누적)도 아슬아슬하게 살아남는 수준.
    var obstruct = S.rel.company < 35 ? 3 : 0;
    var cost = ((sc.cost || 8) + (it.v.extraCost || 0)) * TIME_SCALE + (meta.over || 0) / 40 +
               (meta.timedOut ? 5 : 0) + obstruct;

    S.gauge.E = clamp(Math.round(S.gauge.E + (res.percent - 55) * 0.45), 0, 100);
    S.gauge.T = clamp(Math.round(S.gauge.T - cost), 0, 100);
    S.gauge.R = clamp(Math.round(S.gauge.R +
                  (res.percent >= 80 ? 5 : res.percent >= 60 ? 1 : -4) -
                  trapHit.length * 8 - (vWrong ? 4 : 0)), 0, 100);
    S.rel.company = clamp(Math.round(S.rel.company -
                  Math.min(15, confront * 5) + please * 6 +
                  (confront === 0 && !please ? 2 : 0)), 0, 100);

    if (obstruct) events.push({ kind: 'warn', text: '회사의 자료 제출이 늦어져 감사시간이 추가로 들었다' });
    if (it.v.extraCost) events.push({ kind: 'warn', text: '뒤늦게 알게 된 사안이라 추가 절차에 시간이 더 들었다' });

    // 분기 표지
    (sc.flags || []).forEach(function (f) {
      if (S.flags[f.set]) return;
      var ok = f.if.every(function (l) { return S.hits[sc.id + '#' + l]; });
      if (ok) {
        S.flags[f.set] = true;
        events.push({ kind: 'flag', text: f.toast || FLAG_TEXT[f.set] || f.set });
      }
    });

    // 진실 발견 · 확인
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
      var right = (pr.must || []).some(function (m) {
        return m.hit && m.label === S.decision.kind + ' 표명';
      });
      // "한정의견 또는 부적정의견" 처럼 여러 의견을 걸쳐 쓰면 맞힌 것이 아니다.
      // ("한정의견이 아니라 부적정의견" 은 부정문 무효화로 함정이 걸리지 않으므로 안전하다)
      var hedged = (pr.trap || []).some(function (t) { return t.hit && t.label.indexOf('오답 의견') === 0; });
      S.opinionOK = right && !hedged;
      if (right && hedged) events.push({ kind: 'warn', text: '여러 의견을 걸쳐 썼다 — 감사의견은 하나다' });
    }

    var delta = { E: S.gauge.E - before.E, T: S.gauge.T - before.T,
                  R: S.gauge.R - before.R, C: S.rel.company - before.C };
    var outcome = { events: events, delta: delta, newHits: newHits, confront: confront, please: please };
    S.log.push({ day: sc.day, chapter: sc.chapter, percent: res.percent, events: events });
    S.results.push({ it: it, text: text, res: res, part: p, outcome: outcome });
    return outcome;
  }

  /* ---------- 왜곡표시 집계 ----------
     발견한 진실만 집계에 오른다. 회사가 협조적이면 soft 항목은 수정해 준다. */
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

    var r = it.rubric;
    if (m.total <= MAT) {
      r.must = r.must.map(function (x) {
        return x.label === '수정되지 않으면 의견 변형'
          ? { kw: ['중요성에 미달', '중요하지 않', '의견에 영향을 미치지', '변형하지', '미달'],
              score: x.score, label: '미수정 합계가 중요성에 미달하여 의견에 영향 없음', negOk: true }
          : x;
      });
      r.trap = (r.trap || []).filter(function (t) { return t.label !== '중요성 초과인데 적정의견'; });
    }
    if (S.rel.company < 35) {
      r.bonus = (r.bonus || []).concat([{ kw: ['압력 위협'], score: 6, label: '감사인 교체 언급 = 압력 위협 인식' }]);
    }
    it.model = it.model.concat([
      m.total > MAT
        ? '이번 시즌: 미수정 합계 ' + m.total.toFixed(1) + '억원은 중요성 ' + MAT + '억원을 초과하므로 수정되지 않으면 의견을 변형하여야 한다.'
        : '이번 시즌: 미수정 합계 ' + m.total.toFixed(1) + '억원은 중요성 ' + MAT + '억원에 미달하므로 그 자체로는 의견에 영향을 미치지 않는다. 다만 질적 요인은 따로 고려한다.'
    ]);
  }

  /* ---------- 의견 결정 ----------
     감사인은 자신이 확인한 사실에 근거해 의견을 낸다.
     못 찾은 것은 여기 반영되지 않는다 — 그 대가는 에필로그에서 치른다. */
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

  function opinionRubric(d) {
    var suf = { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거 입수 여부', negOk: true };
    var com = { kw: ['지배기구와의 커뮤니케이션'], score: 8, label: '지배기구 커뮤니케이션' };
    // negOk: "근거문단에 증거를 입수하지 못한 사유를 기재" 처럼 뒤따르는 부정어가
    //        근거문단 자체를 부정하는 것으로 오판되는 것을 막는다
    var basis = { kw: ['변형의견근거문단'], score: 12, label: '변형의견근거문단 기재', negOk: true };
    var front = { kw: ['의견문단 앞', '의견문단의 바로 앞', '앞에 기재'], score: 8, label: '근거문단은 의견문단 바로 앞' };
    var must;

    if (d.kind === '적정의견') {
      must = [suf,
        { kw: ['중요성에 미달', '중요하지 않', '미달'], score: 14, label: '미수정왜곡표시가 중요성에 미달', negOk: true },
        { kw: ['적정의견'], score: 18, label: '적정의견 표명', notBefore: ['부'] },
        { kw: ['지배기구와의 커뮤니케이션'], score: 10, label: '미수정 사항을 지배기구와 커뮤니케이션' },
        { kw: ['서면진술'], score: 8, label: '미수정 사항이 중요하지 않다는 서면진술' }];
    } else if (d.basis === 'scope') {
      must = [
        { kw: ['감사범위제한'], score: 12, label: '감사범위제한' },
        { kw: ['충분하고 적합한 감사증거'], score: 10, label: '충분하고 적합한 감사증거를 입수하지 못함', negOk: true },
        { kw: ['전반적'], score: 12, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true },
        basis, com,
        { kw: [d.kind], score: 18, label: d.kind + ' 표명' }];
      if (d.kind === '의견거절') {
        must.push({ kw: ['핵심감사사항을 기재하지', '핵심감사사항은 기재하지', 'KAM을 기재하지'], score: 8,
                    label: '의견거절 시 핵심감사사항 미기재', negOk: true });
      }
    } else {
      must = [suf,
        { kw: ['중요'], score: 8, label: '중요성 초과', negOk: true },
        { kw: ['전반적'], score: 14, label: d.pervasive ? '중요하고 전반적' : '중요하나 전반적이지 않음', negOk: true },
        basis, front, com,
        { kw: [d.kind], score: 18, label: d.kind + ' 표명' }];
    }

    var trap = OPINIONS.filter(function (o) { return o !== d.kind; }).map(function (o) {
      var t = { kw: [o], score: -14, label: '오답 의견 — ' + o };
      if (o === '적정의견') t.notBefore = ['부'];
      return t;
    });
    trap.push({ kw: ['강조사항문단으로 갈음', '강조사항으로 기재'], score: -12, label: '강조사항문단으로 갈음' });

    return {
      bonusCap: 14, must: must, trap: trap,
      bonus: [
        { kw: ['계량화', '재무적 영향'], score: 7, label: '재무적 영향의 계량화' },
        { kw: ['핵심감사사항'], score: 7, label: '핵심감사사항과의 관계' },
        { kw: ['강조사항문단'], score: 7, label: '강조사항문단과 구분' },
        { kw: ['서면진술'], score: 7, label: '서면진술' }
      ]
    };
  }

  function opinionModel(d) {
    var t = d.total.toFixed(1);
    if (d.kind === '적정의견') {
      return ['충분하고 적합한 감사증거를 입수하였고, 미수정왜곡표시 ' + t + '억원은 중요성 ' + MAT + '억원에 미달하므로 재무제표에 중요한 왜곡표시가 존재하지 않는다.',
              '따라서 적정의견을 표명한다.',
              '다만 미수정 사항은 지배기구와 커뮤니케이션하고, 미수정왜곡표시가 중요하지 않다는 경영진의 서면진술을 입수한다.'];
    }
    if (d.basis === 'scope') {
      return ['여러 영역에서 충분하고 적합한 감사증거를 입수하지 못하였으므로 이는 감사범위제한에 해당한다.',
              d.kind === '의견거절'
                ? '그 영향이 재무제표 전반에 걸쳐 중요하고 전반적이므로 의견거절을 표명한다.'
                : '그 영향이 중요하나 전반적이지 않으므로 한정의견을 표명한다.',
              '감사보고서에는 의견문단 앞에 변형의견근거문단을 두어 증거를 입수하지 못한 사유를 기재하고' +
                (d.kind === '의견거절' ? ', 의견거절이므로 핵심감사사항은 기재하지 아니한다.' : '한다.'),
              '이 사실을 지배기구와 커뮤니케이션한다.'];
    }
    return ['충분하고 적합한 감사증거는 입수하였으나 미수정왜곡표시 ' + t + '억원이 중요성 ' + MAT + '억원을 초과하므로 중요한 왜곡표시가 존재한다.',
            d.pervasive
              ? '그 영향이 재무제표의 다수 요소에 걸쳐 중요하고 전반적이므로 부적정의견을 표명한다.'
              : '그 영향이 특정 계정에 국한되어 전반적이지 않으므로 한정의견을 표명한다.',
            '감사보고서에는 의견문단의 바로 앞에 변형의견근거문단을 두어 왜곡표시의 내용과 재무적 영향을 계량화하여 기재하고, 변형의 원인이 된 사항은 핵심감사사항으로 기재하지 아니하며, 이를 지배기구와 커뮤니케이션한다.'];
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
    it.rubric = opinionRubric(d);
    it.model = opinionModel(d);
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
      gauge: S.gauge, rel: S.rel, flags: S.flags, opinionOK: S.opinionOK,
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
             rows: rows, found: r1(found), missed: r1(missed), ctx: ctx };
  }

  global.SEASON = {
    create: create, resolve: resolve, apply: apply, epilogue: epilogue,
    misstatements: misstatements, decide: decide, band: band,
    FLAG_TEXT: FLAG_TEXT, MAT: MAT, OPINIONS: OPINIONS
  };
})(typeof window !== 'undefined' ? window : this);
