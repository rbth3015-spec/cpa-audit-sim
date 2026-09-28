/* ============================================================
   감사 시즌 2026 — 이야기 로직 (story.js)
   ------------------------------------------------------------
   DOM 을 모른다. 메신저 화면(js/messenger.js)과 검증(tools/validate.js)이 같이 쓴다.
   데이터는 data/story.js (STORYDATA) · data/cast.js (CAST).

   S.story  { seen{대화id}, picks{대화id: 고른 번호}, facts{사실id}, chat[기록], vars{장면id: 판본} }
   S.bond   { manager, assoc, sua, chair }  사람과의 관계 0~100

   관계는 메신저 선택만이 아니라 장면에서 한 일로도 움직인다 (afterScene)
     이수아   숨은 왜곡표시를 찾으면 오르고, 회사 편을 들면 내려간다
     윤서경   지배기구 커뮤니케이션을 짚으면 오른다 → 후속사건 뒤 50 이상이면 '감사위원회 지지'
     유가온   장면 점수에 따라 조금씩
   ============================================================ */
(function (global) {
  'use strict';

  function D() { return global.STORYDATA || { BONDS: {}, BAND: {}, BEATS: [], OPEN: {}, FATES: [], ETHICS_BAD: {} }; }
  function C(k) { return (global.CAST || {})[k]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

  function init(S) {
    if (!S.story) S.story = {};
    ['seen', 'picks', 'facts', 'vars'].forEach(function (k) { if (!S.story[k]) S.story[k] = {}; });
    if (!S.story.chat) S.story.chat = [];
    if (!S.bond) S.bond = clone(D().BONDS) || {};
    Object.keys(D().BONDS).forEach(function (k) { if (S.bond[k] == null) S.bond[k] = D().BONDS[k]; });
    return S;
  }

  function bandOf(key, v) {
    var b = D().BAND[key];
    if (!b) return '';
    for (var i = 0; i < b.length; i++) if (v >= b[i][0]) return b[i][1];
    return b[b.length - 1][1];
  }

  function roomName(room, place) {
    if (room === 'team') return String((global.COMPANY || {}).name || '').replace('㈜', '') + ' 감사팀';
    if (room === 'talk') return place || '대면';
    if (/^dm:/.test(room)) { var c = C(room.slice(3)); return c ? c.name : room; }
    return room;
  }
  function roomWho(room) { return /^dm:/.test(room) ? room.slice(3) : null; }

  /* 대화 하나를 지금 상태로 풀어 둔다 (메시지 · 선택지의 조건을 평가) */
  function resolveBeat(b, S) {
    var raw = typeof b.msgs === 'function' ? b.msgs(S) : (b.msgs || []);
    var msgs = raw.filter(function (m) { return m && (!m.when || m.when(S)); })
      .map(function (m) { return { from: m.from || null, sys: m.sys || null, t: m.t || '', mood: m.mood || null }; });
    var ch = b.choice && (!b.choice.when || b.choice.when(S)) ? b.choice : null;
    var opts = ch ? ch.opts.map(function (o, k) {
      return { k: k, t: o.t, ok: o.ok, note: o.note || null, fx: o.fx || {},
               reply: (o.reply || []).map(function (m) { return { from: m.from || null, sys: m.sys || null, t: m.t || '', mood: m.mood || null }; }) };
    }) : [];
    // 판정이 걸린 답장은 시즌마다 순서를 섞는다 — "첫 번째가 정답"으로 외우지 못하게
    if (ch && ch.card) shuffle(opts, hash((S.seed || 0) + ':' + b.id));
    return {
      id: b.id, at: b.at, room: b.room, pov: b.pov || null, name: roomName(b.room, b.place), mode: b.room === 'talk' ? 'talk' : 'chat',
      who: roomWho(b.room), place: b.place || null, time: b.time || '', bg: b.bg || 'desk', facts: b.facts || [],
      msgs: msgs,
      choice: ch ? { card: ch.card || null, opts: opts } : null
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function shuffle(a, seed) {
    var x = seed || 1;
    for (var i = a.length - 1; i > 0; i--) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      var j = x % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 그 시점에 볼 대화 — 아직 안 본 것 중 조건이 맞는 것을 위에서부터 최대 2개, 보여 주는 순서는 시각순 */
  function when(t) {
    var m = /(\d+)\.\s*(\d+)\.[^0-9]*(\d+):(\d+)/.exec(t || '');
    if (!m) return 0;
    var mo = +m[1];
    return (((mo >= 9 ? mo - 12 : mo) * 31 + (+m[2])) * 24 + (+m[3])) * 60 + (+m[4]);   // 11·12월은 전년도
  }
  function beatsAt(S, at) {
    init(S);
    return D().BEATS.filter(function (b) {
      return b.at === at && !S.story.seen[b.id] && (!b.when || b.when(S));
    }).slice(0, 2).sort(function (a, b) { return when(a.time) - when(b.time); })
      .map(function (b) { return resolveBeat(b, S); });
  }

  function log(S, beat, m) {
    init(S);
    var e = { b: beat.id, room: beat.room, name: beat.name, time: beat.time, from: m.from || null, sys: m.sys || null, t: m.t };
    if (m.me) e.me = 1;                            // 그 대화의 시점 인물이 한 말
    S.story.chat.push(e);
    if (S.story.chat.length > 400) S.story.chat = S.story.chat.slice(-400);
  }

  /* 대화를 다 봤다 — 사실을 열고 기록을 남긴다 */
  function markSeen(S, beat) {
    init(S);
    if (S.story.seen[beat.id]) return [];
    S.story.seen[beat.id] = 1;
    var opened = [];
    arr(beat.facts).forEach(function (f) { if (!S.story.facts[f]) { S.story.facts[f] = 1; opened.push(f); } });
    return opened;
  }

  /* fx 적용 — 게이지 · 회사 태도 · 관계 · 표지 · 사실. 바뀐 만큼을 돌려준다 */
  function applyFx(S, fx) {
    init(S);
    fx = fx || {};
    var d = { R: 0, E: 0, T: 0, C: 0 }, bonds = [], events = [];
    ['R', 'E', 'T'].forEach(function (k) {
      if (!fx[k]) return;
      var b = S.gauge[k];
      S.gauge[k] = clamp(Math.round(b + fx[k]), 0, 100);
      d[k] = S.gauge[k] - b;
    });
    if (fx.C) {
      var c0 = S.rel.company;
      S.rel.company = clamp(Math.round(c0 + fx.C), 0, 100);
      d.C = S.rel.company - c0;
    }
    Object.keys(fx.bond || {}).forEach(function (k) {
      var e = bump(S, k, fx.bond[k]);
      if (e.d) bonds.push(e);
      if (e.event) events.push(e.event);
    });
    arr(fx.flag).forEach(function (f) { S.flags[f] = true; });
    arr(fx.fact).forEach(function (f) { S.story.facts[f] = 1; });
    return { delta: d, bonds: bonds, events: events };
  }

  function bump(S, k, n) {
    var v0 = S.bond[k] == null ? 50 : S.bond[k];
    var v1 = clamp(Math.round(v0 + n), 0, 100);
    S.bond[k] = v1;
    var b0 = bandOf(k, v0), b1 = bandOf(k, v1), name = (C(k) || {}).name || k;
    return { who: k, d: v1 - v0, from: b0, to: b1,
             event: b0 !== b1 ? { kind: 'bond', who: k, text: name + ' · ' + b0 + ' → ' + b1 } : null };
  }

  /* 선택 — 판정(윤리 · 독립성)이 있으면 함께 돌려준다 */
  function choose(S, beat, i) {
    init(S);
    var o = beat.choice && beat.choice.opts[i];
    if (!o) return null;
    S.story.picks[beat.id] = o.k != null ? o.k : i;     // 원래 번호로 적는다 (화면 순서는 섞였을 수 있다)
    var r = applyFx(S, o.fx);
    var card = beat.choice.card;
    var verdict = (o.ok === true || o.ok === false) && card
      ? { ok: o.ok, label: card.label, why: card.why, note: o.note || null } : null;
    return { opt: o, verdict: verdict, delta: r.delta, bonds: r.bonds, events: r.events, reply: o.reply || [] };
  }

  /* 장면이 끝난 뒤 — 한 일에 따라 사람들의 태도가 움직인다. season.apply 가 부른다 */
  function afterScene(S, it, o) {
    init(S);
    var sc = it.sc, ev = [];
    if (it.v && it.v.id && it.v.id !== '-') S.story.vars[sc.id] = it.v.id;
    // 돌발 업무는 관계에 영향 없음 — 지금 회사의 장면만, 그 회사 이야기에 있는 사람만
    if (!(global.SCENES || []).some(function (x) { return x.id === sc.id; })) return ev;
    function add(k, n) { if (!n || D().BONDS[k] == null) return; var e = bump(S, k, n); if (e.event) ev.push(e.event); }
    var found = (o.events || []).filter(function (e) { return e.kind === 'found'; }).length;
    add('sua', found * 8 - (o.please || 0) * 6 + Math.min(4, (o.confront || 0) * 2));
    var gov = (o.newHits || []).filter(function (l) { return l.indexOf('지배기구') >= 0; }).length;
    add('chair', Math.min(2, gov) * 6);
    add('manager', o.percent >= 80 ? 2 : o.percent < 50 ? -3 : 0);
    if (S.seat === 'senior') add('assoc', o.percent >= 80 ? 2 : 0);
    if (sc.id === 's8' && S.bond.chair >= 50 && !S.flags.chair_backing) {
      S.flags.chair_backing = true;
      ev.push({ kind: 'flag', text: '감사위원회 · 감사인 지지' });
    }
    return ev;
  }

  function opener(sc, S, v) {
    var o = D().OPEN[sc.id];
    if (!o) return null;
    return { at: o.at, place: o.place, text: typeof o.text === 'function' ? o.text(S, v || { id: '-' }) : o.text };
  }

  /* 1년 뒤 사람들 — ctx 는 SEASON.epilogue 의 ctx (flags · bond · 금액) */
  function fates(ctx) {
    return D().FATES.map(function (f) {
      for (var i = 0; i < f.list.length; i++) {
        if (f.list[i].when(ctx)) return { who: f.who, t: f.list[i].t };
      }
      return null;
    }).filter(Boolean);
  }

  /* 이번 시즌에 내린 윤리 · 독립성 판정 */
  function ethics(S) {
    init(S);
    var out = [];
    D().BEATS.forEach(function (b) {
      var i = S.story.picks[b.id];
      if (i == null || !b.choice || !b.choice.card) return;
      var o = b.choice.opts[i];
      if (o.ok !== true && o.ok !== false) return;
      out.push({ id: b.id, ok: o.ok, label: b.choice.card.label, note: o.note || null, pick: o.t });
    });
    return out;
  }
  function ethicsBad(S) {
    var bad = D().ETHICS_BAD;
    return Object.keys(bad).filter(function (f) { return S.flags && S.flags[f]; }).map(function (f) { return bad[f]; });
  }

  /* 개념 카드 도감에 들어갈 판정 카드 */
  function cards() {
    var out = [];
    D().BEATS.forEach(function (b) {
      if (b.choice && b.choice.card) out.push({ label: b.choice.card.label, why: b.choice.card.why, std: '윤리기준', where: '메신저', src: 'story' });
    });
    return out;
  }

  /* 인물 파일 — 만난 사람과 열린 사실 */
  function people(S) {
    init(S);
    var met = {};
    S.story.chat.forEach(function (m) { if (m.from) met[m.from] = 1; });
    return met;
  }

  global.STORY = {
    init: init, beatsAt: beatsAt, resolveBeat: resolveBeat, markSeen: markSeen, choose: choose, log: log,
    afterScene: afterScene, applyFx: applyFx, bandOf: bandOf, roomName: roomName, opener: opener,
    fates: fates, ethics: ethics, ethicsBad: ethicsBad, cards: cards, people: people
  };
})(typeof window !== 'undefined' ? window : this);
