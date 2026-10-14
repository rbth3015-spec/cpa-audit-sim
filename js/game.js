/* ============================================================
   감사 시즌 2026 — 화면 흐름 (game.js)
   ------------------------------------------------------------
   로직은 js/season.js, 채점은 js/engine.js, 형식은 js/formats.js,
   미니게임은 js/minis.js, 조서는 js/binder.js 에 있다. 이 파일은 흐름을 잇는다.

   홈 → 새 시즌 · 이어하기 · 연습 · 조서 보관함
   시즌  장면(칸 3개: 문항 → 채점) → 정산 → (몇몇 장면 뒤) 업무 요청 → 다음 장면 → 감리 결과
   연습  분야 · 형식 · 오답 노트에서 골라 이야기 없이 연속으로 푼다

   저장
     auditSim.v5    지난 시즌 기록 (홈 표)
     auditSim.run   진행 중인 시즌 — 장면이 끝날 때마다
     auditSim.prog  시즌을 넘어 쌓이는 것 — 개념 카드 · 오답 노트 · 도움말 본 기록 · 지난 시즌 조서
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = window.FORMATS.esc;
  var SEASON = window.SEASON, AE = window.AE, FX = window.FX;
  var STORE = 'auditSim.v5', RUN = 'auditSim.run', PROG = 'auditSim.prog', THEME = 'auditSim.theme';

  var S = null, mode = null, cur = null, practice = null;
  var clock = { left: 0, max: 0, timer: null };

  /* ---------- 저장 ---------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 공간 없음 */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function prog() {
    var p = load(PROG, {}) || {};
    p.cards = p.cards || {}; p.wrong = p.wrong || []; p.tips = p.tips || {}; p.fresh = p.fresh || {};
    return p;
  }
  function saveProg(p) { save(PROG, p); }

  /* ---------- 작은 도구 ---------- */
  function letter(p) { return p >= 90 ? 'S' : p >= 80 ? 'A' : p >= 65 ? 'B' : p >= 50 ? 'C' : 'D'; }
  function word(p) { return p >= 80 ? '적정' : p >= 50 ? '미흡' : '부적절'; }
  function mark(p) { return p >= 80 ? 'a' : p >= 50 ? 'b' : 'c'; }
  function markChar(p) { return p >= 80 ? '✓' : p >= 50 ? '△' : '✗'; }
  function pad(n) { return ('0' + n).slice(-2); }
  function mmss(s) { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + pad(s % 60); }
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0'; }
  function cast(w) { return window.CAST[w] || window.CAST.manager; }
  // 사진이 없는 인물은 이니셜 초상 — js/art.js 가 assets/manifest.js 를 보고 정한다
  function av(w, mood, cls) { return window.ART.face(window.CAST[w] ? w : 'manager', mood, cls || 'av'); }
  function sceneImg(art) { return window.ART.sceneSrc(art || 'desk'); }
  var STORY = window.STORY, MESSENGER = window.MESSENGER;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function show(id) {
    ['home', 'play', 'end'].forEach(function (k) { $('#screen-' + k).hidden = k !== id; });
    window.scrollTo(0, 0);
    // 배경음 — 화면에 맞춰 바뀐다 (홈은 조용히)
    FX.music(id === 'play' ? 'scene' : id === 'end' ? 'end' : null);
  }
  function typing(e) { var t = e.target; return t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT'); }
  var TYPE_NAME = SEASON.TYPE_NAME;

  /* ---------- 나의 시점 ----------
     장면마다 시점이 바뀐다 — 그 자리에 앉은 사람이 그 장면의 「나」다.
     세 사람 얼굴은 늘 보이고, 붉은 「나의 시점」 표가 사람 사이를 건너간다. */
  var SEAT_SLOTS = [
    { seat: 'partner', who: 'partner' },
    { seat: 'senior', who: 'manager' },
    { seat: 'staff', who: 'assoc' }
  ];
  var prevSeat = null, lastAt = null;
  function rankBars(seat) { return '<i class="rank">' + new Array(4 - ['partner', 'senior', 'staff'].indexOf(seat)).join('<i></i>') + '</i>'; }
  function seatTiles(seat, from) {
    var moved = from && from !== seat;
    return '<div class="seats' + (moved ? ' moving' : '') + '">' + SEAT_SLOTS.map(function (s) {
      var c = cast(s.who), cls = 'st';
      if (moved) cls += s.seat === from ? ' me from' : s.seat === seat ? ' to' : '';
      else if (s.seat === seat) cls += ' me';
      return '<div class="' + cls + '">' + av(s.who, null, 'st-av') +
        '<b>' + esc(c.name) + '</b><span>' + esc(SEASON.SEATS[s.seat].name) + '</span>' +
        rankBars(s.seat) + '<em class="pov-tag">나의 시점</em></div>';
    }).join('') + '</div>';
  }
  function povName(seat) { return cast(SEASON.povOf(seat)).name; }

  /* 「나의 시점」 표가 옛 사람에게서 새 사람에게로 건너간다 — 배경이 한 번 휙 돌고, 도장처럼 내려앉는다 */
  function seatHop(root, wait, alive) {
    var box = $('.seats.moving', root);
    if (!box) return null;
    var a = $('.st.from', box), b = $('.st.to', box), tok = null, t1 = null, t2 = null;
    function land() {
      if (tok) { tok.remove(); tok = null; }
      a.classList.remove('me');
      b.classList.add('me', 'landed');
    }
    t1 = setTimeout(function () {
      if (!alive()) return;
      var r0 = $('.pov-tag', a).getBoundingClientRect(), r1 = $('.pov-tag', b).getBoundingClientRect();
      tok = document.createElement('span');
      tok.className = 'hop-tok';
      tok.innerHTML = '<i>나의 시점</i>';
      tok.style.left = r0.left + 'px';
      tok.style.top = r0.top + 'px';
      document.body.appendChild(tok);
      a.classList.remove('me');
      root.classList.add('whip');
      FX.play('hop');
      void tok.offsetWidth;
      tok.style.transform = 'translate(' + (r1.left - r0.left) + 'px,' + (r1.top - r0.top) + 'px)';
      t2 = setTimeout(function () { if (!alive()) return; land(); FX.play('stampSm'); }, 560);
    }, wait);
    // 건너뛰면 바로 앉힌다
    return function now() { clearTimeout(t1); clearTimeout(t2); land(); };
  }

  /* ---------- 테마 ---------- */
  function applyTheme(v) {
    if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(load(THEME, 'auto'));

  /* ---------- 토스트 · 슬레이트 ---------- */
  var KIND = { found: '발견', clear: '확인', card: '개념 카드', flag: '진행', warn: '주의', rel: '회사', streak: '연속', bond: '관계' };
  function toast(ev) {
    var box = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast k-' + ev.kind;
    t.innerHTML = '<span class="k">' + esc(KIND[ev.kind] || '알림') + '</span>' + esc(ev.text);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, ev.kind === 'found' ? 4200 : 2800);
  }

  /* ---------- 수집 알림 ----------
     새로 얻은 개념 카드 · 인물 파일의 「알게 된 것」. 작게 떴다가 조서 버튼으로 들어간다 */
  var CARD_STD = null;
  function cardStd() {
    if (!CARD_STD) { CARD_STD = {}; SEASON.cardIndex().forEach(function (c) { CARD_STD[c.label] = c.std || ''; }); }
    return CARD_STD;
  }
  function cardCount() {
    var P = prog(), all = SEASON.cardIndex();
    return { n: all.filter(function (c) { return P.cards[c.label] === 'learned'; }).length, all: all.length };
  }
  function stdMark(std) {
    var m = /(\d{3})/.exec(std || '');
    if (m) return ['KSA', m[1]];
    if (/윤리/.test(std)) return ['윤리', '기준'];
    if (/외부감사|외감/.test(std)) return ['외감', '법'];
    if (/내부회계/.test(std)) return ['내부', '회계'];
    if (/품질/.test(std)) return ['품질', '관리'];
    return ['개념', '카드'];
  }
  // 대화 중에 생긴 수집 알림은 모아 두었다가 대화창이 닫힌 뒤에 띄운다 — 대화창 머리(나의 시점 · 시각)를 가리지 않게
  var held = [];
  function flushHeld() {
    var h = held;
    held = [];
    h.forEach(function (o, i) { setTimeout(function () { collect(o); }, 250 + i * 420); });
  }
  function collect(o) {
    if (MESSENGER && MESSENGER.isOpen()) { held.push(o); return; }
    var box = $('#toasts'), add = o.add || 1, from = Math.max(0, o.n - add), all = Math.max(1, o.all);
    var t = document.createElement('div');
    t.className = 'toast ct k-' + o.kind;
    t.innerHTML = '<span class="ct-g">' + o.glyph + '</span>' +
      '<span class="ct-t"><span class="ct-k">' + esc(o.head) + '</span><b>' + esc(o.title) + '</b></span>' +
      '<span class="ct-n"><span class="ct-k">수집</span><b><span class="v">' + from + '</span><small>/' + o.all + '</small></b></span>' +
      '<i class="ct-bar"><i style="width:' + (from / all * 100).toFixed(1) + '%"></i></i>';
    box.appendChild(t);
    FX.play('card');
    setTimeout(function () {
      FX.roll($('.v', t), from, o.n, 520);
      $('.ct-bar i', t).style.width = (o.n / all * 100).toFixed(1) + '%';
    }, 420);
    setTimeout(function () {
      var btn = $('#hud [data-act="binder"]');
      if (btn && !$('#screen-play').hidden && !$('.chap') && !(MESSENGER && MESSENGER.isOpen())) fileInto($('.ct-g', t), btn);
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 320);
    }, 3000);
  }
  // 카드 그림이 조서 버튼으로 날아 들어가고 버튼이 한 번 튄다
  function fileInto(g, btn) {
    if (!g) return;
    var a = g.getBoundingClientRect(), b = btn.getBoundingClientRect();
    var f = g.cloneNode(true);
    f.className = 'ct-g ct-fly';
    f.style.left = a.left + 'px';
    f.style.top = a.top + 'px';
    document.body.appendChild(f);
    void f.offsetWidth;
    f.style.transform = 'translate(' + (b.left + b.width / 2 - a.left - a.width / 2) + 'px,' + (b.top + b.height / 2 - a.top - a.height / 2) + 'px) scale(.3)';
    f.style.opacity = '.2';
    setTimeout(function () {
      f.remove();
      btn.classList.remove('got'); void btn.offsetWidth; btn.classList.add('got');
      FX.play('tick');
    }, 470);
  }
  function cardToast(labels) {
    var idx = cardStd();
    labels = labels.filter(function (l) { return idx[l] != null; });
    if (!labels.length) return;
    var c = cardCount(), s = stdMark(idx[labels[0]]);
    collect({
      kind: 'card', n: c.n, all: c.all, add: labels.length,
      head: labels.length > 1 ? '개념 카드 +' + labels.length : '개념 카드',
      title: labels[0] + (labels.length > 1 ? ' 외 ' + (labels.length - 1) : ''),
      glyph: '<span class="mcard"><i>' + esc(s[0]) + '</i><b>' + esc(s[1]) + '</b></span>'
    });
  }
  // 인물 파일 — 이번 회사의 인물 목록(조서 G 탭과 같은 사람들)에서 처음부터 열려 있지 않은 사실만 센다
  function factBook() {
    var C = window.CAST || {}, O = window.CAST_ORDER || {}, seen = {}, by = {}, n = 0, all = 0;
    var open = (S && S.story && S.story.facts) || {};
    ['team', 'client', 'outside', 'other'].forEach(function (g) {
      (O[g] || []).forEach(function (k) {
        if (seen[k] || !C[k]) return;
        seen[k] = 1;
        (window.SEASONS ? window.SEASONS.facts(k) : (C[k].facts || [])).forEach(function (f) {
          if (f.open) return;
          by[f.id] = { who: k, t: f.t };
          all++;
          if (open[f.id]) n++;
        });
      });
    });
    return { by: by, n: n, all: all };
  }
  function factToast(ids) {
    var book = factBook();
    var list = ids.map(function (id) { return book.by[id]; }).filter(Boolean);
    if (!list.length) return;
    var whoNames = {};
    list.forEach(function (x) { whoNames[x.who] = 1; });
    collect({
      kind: 'fact', n: book.n, all: book.all, add: list.length,
      head: '인물 파일 · ' + cast(list[0].who).name + (Object.keys(whoNames).length > 1 ? ' 외' : ''),
      title: list[0].t + (list.length > 1 ? ' 외 ' + (list.length - 1) : ''),
      glyph: av(list[0].who, null, 'ct-av')
    });
  }

  function slate(o, then) {
    var d = document.createElement('div');
    d.className = 'slate';
    if (o.img) d.style.backgroundImage = 'url(' + o.img + ')';
    d.innerHTML = '<span class="kick">' + esc(o.kick) + '</span><h2>' + esc(o.title) + '</h2>' +
      (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') +
      (o.seatId ? '<span class="seat">' + av(SEASON.povOf(o.seatId), null, 'sl-av') + '<b>' + esc(povName(o.seatId)) + '</b>' + esc(SEASON.SEATS[o.seatId].name) + '<em>나의 시점</em></span>'
        : o.seat ? '<span class="seat">' + esc(o.seat) + '</span>' : '');
    document.body.appendChild(d);
    FX.play('open');
    var done = false;
    function go() { if (done) return; done = true; d.remove(); if (then) then(); }
    d.addEventListener('click', go);
    setTimeout(go, o.ms || 1500);
  }

  /* 장면 진행 칸 — 끝낸 장면에는 틱마크, 붉은 표시가 앞 칸에서 이번 칸으로 한 칸 옮겨 간다 */
  function chapterTrack(i) {
    var h = '';
    window.SCENES.forEach(function (sc, k) {
      var p = (S.papers || []).filter(function (x) { return x.kind === 'scene' && x.idx === k; })[0];
      h += '<span class="tk' + (k === i ? ' cur' : p ? ' done ' + mark(p.pct) : '') + '"' + (p && k !== i ? ' data-m="' + markChar(p.pct) + '"' : '') + '>' + pad(k + 1) + '</span>';
    });
    return '<div class="ch-track" style="--from:' + Math.max(0, i - 1) + ';--to:' + i + '">' + h + '<i class="tk-m"></i></div>';
  }

  /* 장면 도입의 시각 — 앞 장면의 시각에서 넘김판처럼 넘어간다 (연 · 월 · 일 · 시각 한 토막씩) */
  function flipAt(prev, next) {
    var a = String(prev || '').split(' '), b = String(next || '').split(' ');
    if (!prev || prev === next || a.length !== b.length) return esc(next);
    var k = 0;
    return b.map(function (tok, i) {
      if (tok === a[i]) return esc(tok);
      return '<span class="fl" style="--k:' + (k++) + '"><i>' + esc(a[i]) + '</i><b>' + esc(tok) + '</b></span>';
    }).join(' ');
  }
  function dayOf(s) { var m = /20×(\d)\.\s*(\d+)\.\s*(\d+)\./.exec(s || ''); return m ? new Date(2000 + +m[1], +m[2] - 1, +m[3]) : null; }
  var NATIVE = ['', '하루', '이틀', '사흘', '나흘', '닷새', '엿새', '이레', '여드레', '아흐레', '열흘'];
  function gapText(prev, next) {
    var x = dayOf(prev), y = dayOf(next);
    if (!x || !y) return '';
    var n = Math.round((y - x) / 864e5);
    if (n <= 0) return n === 0 && prev !== next ? '같은 날' : '';
    if (n <= 10) return NATIVE[n] + ' 뒤';
    if (n <= 16) return '보름 뒤';
    if (n <= 24) return '3주 뒤';
    if (n <= 40) return '한 달 뒤';
    return Math.round(n / 30) + '달 뒤';
  }

  /* 장면 도입
     들어올 때  앞 장면 종이가 링에서 넘어가고(turn) → 장 번호가 굴러 바뀌고 → 진행 칸의 표시가 한 칸 옮겨 간다
     시각      앞 장면 시각에서 넘김판처럼 넘어가고 「나흘 뒤」가 붙는다
     자리가 바뀌면  「나」가 옛 자리에서 새 자리로 건너간다
     나갈 때   막이 위로 걷히며 새 장면이 드러난다. 누르거나 Enter 로 넘긴다 */
  function chapter(o, then) {
    var d = document.createElement('div');
    var moved = !!(o.seatFrom && o.seatFrom !== o.seatId);
    var sheet = o.turn ? $('#screen-play .sheet') : null;
    if (sheet && $('#screen-play').hidden) sheet = null;
    var late = sheet ? 420 : 0;                        // 종이가 넘어가는 동안 안쪽 연출을 미룬다
    d.className = 'chap' + (late ? ' late' : '') + (moved ? ' pov' : '');
    // 영상이 있는 장면은 막 뒤에서 움직인다 (화재 현장의 연기 등)
    var bgEl = o.vid ? '<video class="ch-bg" src="' + o.vid + '" poster="' + o.img + '" autoplay muted loop playsinline></video>'
      : '<div class="ch-bg" style="background-image:url(' + o.img + ')"></div>';
    d.innerHTML = '<div class="ch-cam">' + bgEl + '</div>' +
      (o.no ? '<span class="ch-no' + (o.prevNo ? ' two' : '') + '"><span class="roll">' + (o.prevNo ? '<b>' + esc(o.prevNo) + '</b>' : '') + '<b>' + esc(o.no) + '</b></span></span>' : '') +
      (o.track != null ? chapterTrack(o.track) : '') +
      '<div class="ch-in"><div class="ch-kick"><span class="bar"></span>' + esc(o.kick) + '</div><h2>' + esc(o.title) + '</h2>' +
      (o.at || o.place ? '<div class="ch-where">' + (o.at ? '<span class="at">' + flipAt(o.atFrom, o.at) + '</span>' : '') +
        (o.place ? '<b>' + esc(o.place) + '</b>' : '') +
        (o.at && o.atFrom && gapText(o.atFrom, o.at) ? '<em class="gap">' + esc(gapText(o.atFrom, o.at)) + '</em>' : '') + '</div>' : '') +
      '<p class="ch-text"><span class="tx"></span></p>' +
      (o.seatId ? '<div class="ch-seats"><span class="k">' +
        (moved ? '시점 이동 · ' + esc(povName(o.seatFrom)) + ' → ' + esc(povName(o.seatId)) : '나의 시점 · ' + esc(povName(o.seatId))) +
        '</span>' + seatTiles(o.seatId, o.seatFrom) + '</div>' : '') +
      '<div class="ch-foot"><span class="ch-skip">클릭 · Enter</span></div></div>';
    document.body.appendChild(d);
    if (sheet) {
      sheet.classList.remove('enter');
      sheet.classList.add('turn');
      FX.play('turn');
      setTimeout(function () { sheet.classList.remove('turn'); }, 700);
    }
    setTimeout(function () { if (!done) FX.play('chapter'); }, late + (o.prevNo ? 380 : 0));
    var tx = $('.tx', d), text = o.text || '', i = 0, done = false, typed = null, auto = null;
    var seatNow = moved ? seatHop(d, late + 1050, function () { return !done; }) : null;
    function type() {
      if (i >= text.length) { auto = setTimeout(go, moved ? 2100 : 1700); return; }
      tx.textContent = text.slice(0, ++i);
      if (i % 3 === 0) FX.play('type');
      typed = setTimeout(type, 34);
    }
    function go() {
      if (done) return;
      if (i < text.length) {
        clearTimeout(typed); i = text.length; tx.textContent = text;
        d.classList.add('now');
        if (seatNow) { seatNow(); seatNow = null; }
        auto = setTimeout(go, 900);
        return;
      }
      done = true;
      clearTimeout(typed); clearTimeout(auto);
      if (seatNow) seatNow();
      $$('.hop-tok').forEach(function (t) { t.remove(); });
      document.removeEventListener('keydown', onKey, true);
      // 새 장면을 먼저 깔고 막을 걷는다
      window.scrollTo(0, 0);
      if (then) then();
      d.classList.add('out');
      FX.play('open');
      setTimeout(function () { d.remove(); }, 560);
    }
    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); go(); }
    }
    document.addEventListener('keydown', onKey, true);
    d.addEventListener('click', go);
    setTimeout(type, 650 + late);
  }

  /* 메신저가 열리기 전 — 휴대폰 알림이 먼저 두 번 울린다. 누르거나 잠시 뒤 대화가 열린다.
     대면 대화로 시작하면 알림 없이 바로 연다. */
  function ring(beats, go) {
    var chats = beats.filter(function (b) { return b.mode !== 'talk'; });
    if (!chats.length || beats[0].mode === 'talk') return go();
    var d = document.createElement('div'), done = false;
    // 시즌 첫 알림은 아직 빈 조서 위에서 울린다 — 빈 화면 대신 첫 대화의 사진을 어둡게 깐다
    var task = $('#task'), cold = !task || !task.children.length;
    d.className = 'phn' + (cold ? ' cold' : '');
    d.innerHTML = (cold ? '<div class="phn-bg" style="background-image:url(' + window.ART.sceneSrc(chats[0].bg) + ')"></div>' : '') +
      '<div class="rg-phone">' + chats.slice(0, 3).map(function (b, i) {
      var first = (b.msgs || []).filter(function (m) { return m.from && m.from !== b.pov; })[0] || {};
      var who = first.from || b.who || 'manager';
      return '<div class="rg" style="--i:' + i + '">' + av(who, null, 'rg-av') +
        '<div class="rg-t"><b>' + esc(b.room === 'team' ? b.name : cast(who).name) + '</b><time>' + (i ? '방금' : '지금') + '</time>' +
        '<span>' + esc(first.t || '') + '</span></div></div>';
    }).join('') + '</div><span class="rg-k">클릭 · Enter</span>';
    document.body.appendChild(d);
    FX.play('msg');
    setTimeout(function () { if (!done) FX.play('msg'); }, 420);
    var t = setTimeout(open, 2000);
    function open() {
      if (done) return;
      done = true; clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      d.classList.add('out');
      setTimeout(function () { d.remove(); }, 260);
      go();
    }
    function onKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(); } }
    document.addEventListener('keydown', onKey, true);
    d.addEventListener('click', open);
  }

  /* 장면 사이 대화 — 없으면 바로 다음으로 */
  function interlude(at, then) {
    if (MESSENGER && MESSENGER.isOpen()) return;          // 이미 대화 중이면 겹쳐 열지 않는다
    if ($('.phn')) return;                                // 알림이 울리는 중
    if (mode !== 'season' || !S || !STORY || !MESSENGER) return then();
    var beats = STORY.beatsAt(S, at);
    if (!beats.length) return then();
    var before = { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company };
    // 대화를 다 읽고 나서 새로 알게 된 것만 알린다
    var known = {};
    Object.keys((S.story && S.story.facts) || {}).forEach(function (k) { known[k] = 1; });
    function newFacts() {
      var fresh = Object.keys((S.story && S.story.facts) || {}).filter(function (k) { return !known[k]; });
      fresh.forEach(function (k) { known[k] = 1; });
      if (fresh.length) factToast(fresh);
    }
    ring(beats, function () {
      MESSENGER.play(beats, S, {
        onChoice: function (beat, i) {
          var r = STORY.choose(S, beat, i);
          if (r && r.verdict) learnVerdict(r.verdict, beat);
          return r;
        },
        onSeen: newFacts,
        onDone: function () {
          newFacts();
          flushHeld();
          var d = { E: S.gauge.E - before.E, T: S.gauge.T - before.T, R: S.gauge.R - before.R, C: S.rel.company - before.C };
          updateHud(d);
          saveRun(true);
          then();
        }
      });
    });
  }

  /* 메신저에서 내린 윤리 · 독립성 판정도 개념 카드가 된다 */
  function learnVerdict(v, beat) {
    var P = prog();
    if (v.ok) {
      if (P.cards[v.label] !== 'learned') {
        P.cards[v.label] = 'learned'; P.fresh[v.label] = 1;
        setTimeout(function () { cardToast([v.label]); }, 800);     // 판정 도장이 찍힐 때쯤
      }
      S.cards.learned[v.label] = { why: v.why, scene: '메신저' };
      delete S.cards.review[v.label];
    } else {
      if (P.cards[v.label] !== 'learned') P.cards[v.label] = 'review';
      if (!S.cards.learned[v.label]) S.cards.review[v.label] = { why: v.why, scene: '메신저' };
    }
    saveProg(P);
  }

  /* ============================================================
     홈
     ============================================================ */
  // 홈의 등장인물 — 두 줄 (법인 · 회사)
  function homeCast() {
    var order = window.CAST_ORDER || {};
    return [
      ['세종회계법인', (order.team || []).slice(0, 5)],
      [(window.COMPANY || {}).name || '회사', (order.client || []).slice(0, 5)]
    ];
  }
  var TONE_CLS = { bad: 'tone-bad', warn: 'tone-warn', ok: 'tone-ok' };

  function ago(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    var h = Math.round(m / 60);
    return h < 24 ? h + '시간 전' : Math.round(h / 24) + '일 전';
  }

  var homeSeen = false;
  function home() {
    stopClock();
    closeOverlays();
    if (window.SEASONS) window.SEASONS.use(prog().company || window.SEASONS.current().id);
    S = null; mode = null; cur = null; practice = null;
    var P = prog(), run = load(RUN, null), hist = ((load(STORE, {}) || {}).history || []).slice(-3).reverse();
    var cards = SEASON.cardIndex(), learned = cards.filter(function (c) { return P.cards[c.label] === 'learned'; }).length;
    var books = window.SEASONS ? window.SEASONS.list() : [];
    var book = window.SEASONS ? window.SEASONS.current() : { id: '-', name: '' };
    var C = window.COMPANY;
    var themeName = { auto: '화면 자동', light: '화면 밝게', dark: '화면 어둡게' }[load(THEME, 'auto')];
    var intro = !homeSeen;            // 제목 연출은 처음 한 번 — 회사를 바꿀 때마다 메뉴가 다시 떠오르지 않게
    homeSeen = true;

    $('#screen-home').innerHTML =
      '<div class="home' + (intro ? ' intro' : '') + '">' +
        '<div class="hero-media">' + window.ART.title() + '</div><div class="hero-shade"></div>' +
        '<div class="home-top"><span class="k">세종회계법인 · 제6기 정기감사</span><div class="top-b">' +
          (window.AIGRADE ? '<button type="button" data-act="grade">' + esc(window.AIGRADE.label()) + '</button>' : '') +
          '<button type="button" data-act="snd">' + (FX.isOn() ? '소리 켬' : '소리 끔') + '</button>' +
          '<button type="button" data-act="theme">' + themeName + '</button></div></div>' +
        '<div class="home-grid"><div class="home-l">' +
          '<div class="brand"><span class="kick">CPA 2차 회계감사 · 실전 시뮬레이션</span>' +
            '<h1>감사 시즌<em>2026</em></h1><p>' + esc(book.brief || '') + '</p></div>' +
          '<div class="menu">' +
            '<button type="button" class="m primary" data-act="new"><div><b>새 시즌</b><span>장면 ' + window.SCENES.length + ' · ' + esc(window.SCENES[0].chapter) + ' → 감사의견</span></div><kbd>Enter</kbd></button>' +
            (run && run.snap ? '<button type="button" class="m" data-act="continue"><div><b>이어하기</b><span>장면 ' + pad(Math.min(runScenes(run), run.snap.i + 1)) + ' · 시즌 ' + run.snap.seed + ' · ' + ago(run.at) + '</span></div><span class="arrow">→</span></button>' : '') +
            '<button type="button" class="m" data-act="practice"><div><b>연습 모드</b><span>분야 · 형식 골라 풀기' + (P.wrong.length ? ' · 오답 ' + P.wrong.length : '') + '</span></div><span class="arrow">→</span></button>' +
            '<button type="button" class="m" data-act="binder"><div><b>조서 보관함</b><span>개념 카드 ' + learned + ' / ' + cards.length + (P.last ? ' · 지난 시즌 조서' : '') + '</span></div><span class="arrow">→</span></button>' +
          '</div>' +
          '<div class="seedbox"><label for="seed">시즌 코드</label><input id="seed" inputmode="numeric" maxlength="6" placeholder="무작위">' +
            '<button type="button" data-act="seed">이 코드로 시작</button></div>' +
        '</div><div class="home-r">' +
          (books.length > 1 ? '<div class="pick-co">' + books.map(function (b) {
            return '<button type="button" class="co' + (b.id === book.id ? ' on' : '') + '" data-act="co" data-co="' + b.id + '" title="' + esc(b.tag) + '">' +
              '<b>' + esc(b.name.replace('㈜', '')) + '</b></button>';
          }).join('') + '</div>' : '') +
          '<div class="card-d"><div class="cd-h"><b>감사 대상</b><span>' + esc(C.fy) + '</span></div><table>' +
            [['회사', C.name + ' · ' + C.market], ['논점', book.tag || ''], ['경로', routeCount(P, book.id)], ['업종', C.industry], ['매출액', C.revenue], ['자산총계', C.assets], ['중요성', C.materiality + ' · 수행 ' + C.pm]]
              .filter(function (r) { return r[1]; })
              .map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table></div>' +
          homeCast().map(function (row) {
            return '<div class="cast-row"><span class="cr-h">' + esc(row[0]) + '</span><div class="team">' + row[1].map(function (w) {
              var c = cast(w);
              return '<button type="button" class="mem" data-act="person" data-who="' + w + '" title="' + esc(c.tag || '') + '">' +
                window.ART.card(w, 'pc') + '<div><b>' + esc(c.name) + '</b><span>' + esc(c.role).replace('관리검토자', '관리<wbr>검토자') + '</span></div></button>';
            }).join('') + '</div></div>';
          }).join('') +
          '<div class="stats-h"><div><span class="k">시즌</span><b>' + (P.plays || 0) + '<small>회</small></b></div>' +
            '<div><span class="k">최고 평균</span><b>' + (P.best ? P.best : '—') + '</b></div>' +
            '<div><span class="k">카드 수집</span><b>' + learned + '<small>/' + cards.length + '</small></b></div></div>' +
          (hist.length ? '<table class="hist">' + hist.map(function (h) {
            return '<tr><td class="mono">' + h.seed + '</td><td>' + esc((h.co || '').replace('㈜', '')) + '</td>' +
              '<td class="' + (TONE_CLS[h.tone] || '') + '">' + esc(h.end) + '</td>' +
              '<td class="mono">평균 ' + h.avg + '</td></tr>';
          }).join('') + '</table>' : '') +
        '</div></div>' +
      '</div>';
    show('home');
    // 이 PC 의 채점 서버가 있는지는 조금 뒤에 안다 — 알게 되면 단추 글을 맞춘다
    if (window.AIGRADE) window.AIGRADE.probe().then(function () {
      var gb = $('#screen-home [data-act="grade"]');
      if (gb) gb.textContent = window.AIGRADE.label();
    });

    var v = $('#title-v');
    if (v) v.addEventListener('ended', function () {
      v.classList.add('done');
      var k = $('.title-key');
      if (k) k.classList.add('on');
    });

    $('#screen-home').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'new') newSeason();
      else if (act === 'continue') continueSeason();
      else if (act === 'practice') practicePicker();
      else if (act === 'binder') openBinder(null, 'E');
      else if (act === 'person') openBinder(null, 'G', b.getAttribute('data-who'));
      else if (act === 'co') {
        var P2 = prog();
        P2.company = b.getAttribute('data-co');
        saveProg(P2);
        window.SEASONS.use(P2.company);
        FX.play('flip');
        home();
      }
      else if (act === 'seed') {
        var n = parseInt($('#seed').value, 10);
        newSeason(isNaN(n) ? null : n);
      } else if (act === 'snd') { FX.setOn(!FX.isOn()); b.textContent = FX.isOn() ? '소리 켬' : '소리 끔'; }
      else if (act === 'grade') {
        window.AIGRADE.openSettings(function () { b.textContent = window.AIGRADE.label(); });
      }
      else if (act === 'theme') {
        var order = ['auto', 'light', 'dark'], cur0 = load(THEME, 'auto');
        var nxt = order[(order.indexOf(cur0) + 1) % 3];
        save(THEME, nxt); applyTheme(nxt);
        b.textContent = { auto: '화면 자동', light: '화면 밝게', dark: '화면 어둡게' }[nxt];
      }
    };
    $('#seed').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var n = parseInt(this.value, 10); newSeason(isNaN(n) ? null : n); }
    });
  }

  /* ============================================================
     시즌 시작 · 이어하기
     ============================================================ */
  function newSeason(seed) {
    drop(RUN);
    S = SEASON.create(seed != null ? { seed: seed } : {});
    mode = 'season';
    prevSeat = null; lastAt = null;
    var P = prog();
    P.plays = (P.plays || 0) + 1;
    saveProg(P);
    buildShell();
    interlude('pro', enterScene);
  }

  /* 이어하기 줄에 쓰는 장면 수 — 저장된 시즌의 회사 것 */
  function runScenes(run) {
    var b = run && run.company && window.SEASONS ? window.SEASONS.find(run.company) : null;
    return ((b && b.data && b.data.SCENES) || window.SCENES).length;
  }
  /* 갈림길이 있는 회사 — 지금까지 지나 본 경로 수 / 전체 (없는 회사는 빈칸) */
  function routeCount(P, co) {
    var total = 1, any = false;
    window.SCENES.forEach(function (sc) {
      if (!sc.fork) return;
      var names = {};
      (sc.variants || []).forEach(function (v) { if (v.route) names[v.route] = 1; });
      var n = Object.keys(names).length;
      if (n) { total *= n; any = true; }
    });
    if (!any) return '';
    return Object.keys(((P.routes || {})[co]) || {}).length + ' / ' + total;
  }

  function continueSeason() {
    var run = load(RUN, null);
    if (!run || !run.snap) return home();
    if (run.company && window.SEASONS) window.SEASONS.use(run.company);
    S = SEASON.restore(run.snap);
    mode = 'season';
    // 앞 장면의 자리 · 시각을 되살린다 — 이어하기 뒤 첫 장면에도 「3주 뒤」 · 시점 이동이 이어지게
    prevSeat = run.seat || null; lastAt = run.lastAt || null;
    buildShell();
    if (run.after) nextStep();
    else enterScene();
  }

  function saveRun(after) {
    if (mode !== 'season' || !S) return;
    save(RUN, { snap: SEASON.snapshot(S), after: !!after, at: Date.now(),
                company: window.SEASONS ? window.SEASONS.current().id : null, seat: prevSeat, lastAt: lastAt });
  }

  /* ============================================================
     플레이 틀
     ============================================================ */
  function buildShell() {
    $('#screen-play').innerHTML =
      '<div class="shell"><header class="hud" id="hud"></header>' +
      '<main class="sheet"><aside class="rail" id="rail"></aside><section class="paper">' +
        '<div class="banner" id="banner"></div>' +
        '<div class="body" id="body"><section class="case" id="case"></section><section class="task" id="task"></section></div>' +
      '</section></main></div>';
    show('play');
    drawHud();
    $('#hud').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'binder') openBinder(S, cur && cur.kind !== 'practice' ? 'B' : 'E');
      else if (act === 'pause') openPause();
    };
  }

  /* ---------- HUD ---------- */
  function drawHud() {
    var h;
    if (mode === 'practice') {
      h = '<div class="hud-brand"><b>연습 모드</b><span>' + esc(practice.title) + '</span></div>' +
        '<div class="g fixed" data-g="N"><span class="k">진행</span><span class="v">1 / ' + practice.queue.length + '</span></div>' +
        '<div class="g" data-g="A"><span class="k">평균 점수</span><span class="v">—</span><span class="track"><span class="fill"></span></span></div>' +
        '<div class="g fixed g-streak" data-g="X"><span class="k">연속 적정</span><span class="v">0</span><i class="dl"></i></div>' +
        '<div class="clock pause" id="clock"><span class="k">남은 시간</span><span class="v">—</span></div>' +
        '<div class="hud-act"><button type="button" class="hud-b" data-act="binder">조서<span class="badge" hidden></span></button>' +
        '<button type="button" class="hud-b" data-act="pause">일시정지 <kbd>Esc</kbd></button></div>';
    } else {
      h = '<div class="hud-brand"><b>감사 시즌 2026</b><span>' + esc(window.COMPANY.name) + ' · 시즌 ' + S.seed + '</span></div>' +
        '<div class="g fixed" data-g="T" data-hint="장면 · 업무마다 줄어든다. 0일이면 마감 실패"><span class="k">보고서 기한</span><span class="v"></span><i class="dl"></i><span class="track"><span class="fill"></span></span></div>' +
        '<div class="g" data-g="E" data-hint="45 미만으로 끝나면 감사범위제한"><span class="k">감사증거</span><span class="v"></span><i class="dl"></i><span class="track"><span class="fill"></span></span></div>' +
        '<div class="g" data-g="R" data-hint="상급자의 신뢰. 오개념 · 회사 편들기에 떨어진다"><span class="k">신뢰</span><span class="v"></span><i class="dl"></i><span class="track"><span class="fill"></span></span></div>' +
        '<div class="g fixed" data-g="C" data-hint="50 아래로 내려가면 수정 요청을 거부한다"><span class="k">회사 태도</span><span class="v word"></span><i class="dl"></i><span class="pips"><i></i><i></i><i></i><i></i></span></div>' +
        '<div class="g fixed g-streak" data-g="X" data-hint="적정 세 번 연속마다 신뢰 +2"><span class="k">연속 적정</span><span class="v"></span><i class="dl"></i></div>' +
        '<div class="clock pause" id="clock" data-hint="0이 되면 그 상태로 제출 · 10% 감점"><span class="k">남은 시간</span><span class="v">—</span></div>' +
        '<div class="hud-act"><button type="button" class="hud-b" data-act="binder">조서<span class="badge" hidden></span></button>' +
        '<button type="button" class="hud-b" data-act="pause">일시정지 <kbd>Esc</kbd></button></div>';
    }
    $('#hud').innerHTML = h;
    updateHud();
  }

  function flashDelta(key, v, good) {
    var dl = $('#hud [data-g="' + key + '"] .dl');
    if (!dl || !v) return;
    dl.textContent = v;
    dl.className = 'dl show ' + (good ? 'up' : 'down');
    clearTimeout(dl._t);
    dl._t = setTimeout(function () { dl.className = 'dl'; }, 2200);
  }

  function updateHud(delta) {
    var hud = $('#hud');
    if (!hud) return;
    var badge = $('.hud-b .badge', hud), fresh = Object.keys(prog().fresh).length;
    if (badge) { badge.hidden = !fresh; badge.textContent = fresh; }
    if (mode === 'practice') {
      $('[data-g="N"] .v', hud).textContent = Math.min(practice.queue.length, practice.i + 1) + ' / ' + practice.queue.length;
      var parts = [];
      practice.results.forEach(function (r) { if (r) parts = parts.concat(r.pcts); });
      if (cur && cur.grades && !cur.wrapped) cur.grades.forEach(function (g) { if (g) parts.push(g.percent); });
      var avg = parts.length ? Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length) : null;
      $('[data-g="A"] .v', hud).textContent = avg == null ? '—' : avg;
      $('[data-g="A"] .fill', hud).style.width = (avg || 0) + '%';
      $('[data-g="X"] .v', hud).textContent = practice.streak;
      return;
    }
    var g = S.gauge, D = SEASON.dday(S);
    $('[data-g="T"] .v', hud).innerHTML = 'D-' + D;
    var tf = $('[data-g="T"] .fill', hud); tf.style.width = g.T + '%'; tf.classList.toggle('low', g.T < 25);
    $('[data-g="E"] .v', hud).textContent = g.E;
    var ef = $('[data-g="E"] .fill', hud); ef.style.width = g.E + '%'; ef.classList.toggle('low', g.E < 45);
    $('[data-g="R"] .v', hud).textContent = g.R;
    var rf = $('[data-g="R"] .fill', hud); rf.style.width = g.R + '%'; rf.classList.toggle('low', g.R < 30);
    var c = S.rel.company, lv = c >= 65 ? 4 : c >= 40 ? 3 : c >= 25 ? 2 : 1;
    $('[data-g="C"] .v', hud).textContent = SEASON.band(c);
    $$('[data-g="C"] .pips i', hud).forEach(function (i, k) { i.classList.toggle('on', k < lv); });
    $('[data-g="C"] .pips', hud).classList.toggle('hot', lv <= 2);
    $('[data-g="X"] .v', hud).textContent = S.streak || 0;
    if (delta) {
      if (delta.T) flashDelta('T', signed(Math.round(delta.T * SEASON.DAY_RATE)) + '일', delta.T > 0);
      if (delta.E) flashDelta('E', signed(delta.E), delta.E > 0);
      if (delta.R) flashDelta('R', signed(delta.R), delta.R > 0);
      if (delta.C) flashDelta('C', signed(delta.C), delta.C > 0);
    }
  }

  /* ---------- 레일 ---------- */
  function drawRail() {
    var h = '<span class="hole"></span>';
    if (mode === 'practice') {
      practice.queue.forEach(function (u, i) {
        var r = practice.results[i];
        h += '<div class="tab' + (i === practice.i && !r ? ' on' : r ? ' done' : '') + '">' + pad(i + 1) +
          (r ? '<span class="mk ' + mark(r.pct) + '">' + markChar(r.pct) + '</span>' : '') + '</div>';
      });
      h += '<span class="foot">연습</span>';
    } else {
      var keys = SEASON.sideKeys();
      window.SCENES.forEach(function (sc, i) {
        var p = (S.papers || []).filter(function (x) { return x.kind === 'scene' && x.idx === i; })[0];
        var on = i === S.i && cur && cur.kind === 'scene' && !cur.wrapped;
        h += '<div class="tab' + (on ? ' on' : p ? ' done' : '') + '" title="' + esc(p ? p.title : sc.chapter) + '">' + pad(i + 1) +
          (p ? '<span class="mk ' + mark(p.pct) + '">' + markChar(p.pct) + '</span>' : '') + '</div>';
        if (keys[sc.id]) {
          var st = S.sideAt[sc.id];
          var cls = cur && cur.kind === 'side' && S.i === i && !cur.wrapped ? 'on' : st === 'skip' ? 'skip' : st ? 'done' : '';
          h += '<span class="dia ' + cls + '" title="돌발 업무"></span>';
        }
      });
      h += '<span class="foot">C-' + pad(S.i + 1) + '</span>';
    }
    $('#rail').innerHTML = h;
  }

  /* ============================================================
     장면 · 업무 · 연습 단위 시작
     ============================================================ */
  function enterScene() {
    var sc = window.SCENES[S.i];
    var it = SEASON.resolve(sc, S);
    var op = STORY ? STORY.opener(sc, S, it.v) : null;
    var from = prevSeat, atFrom = lastAt;
    prevSeat = it.seat;
    lastAt = (op && op.at) || lastAt;
    startUnit({ kind: 'scene', it: it, idx: S.i }, {
      chapter: true, no: pad(S.i + 1), prevNo: S.i > 0 ? pad(S.i) : '', track: S.i,
      kick: '장면 ' + pad(S.i + 1) + ' / ' + window.SCENES.length, title: it.sc.chapter,
      at: op && op.at, atFrom: atFrom, place: op && op.place, text: op ? op.text : (it.line ? '“' + it.line + '”' : ''),
      sub: it.line ? '“' + it.line + '”' : '', seat: SEASON.SEATS[it.seat].name,
      seatId: it.seat, seatFrom: from, img: sceneImg(it.sc.art), vid: window.ART.video(it.sc.art)
    });
  }

  function startUnit(u, slateOpt) {
    if (cur && cur.ctrl && cur.ctrl.destroy) cur.ctrl.destroy();
    var turn = !!(cur && cur.wrapped);                  // 끝낸 장면이 화면에 있으면 그 종이를 넘긴다
    cur = { kind: u.kind, it: u.it, idx: u.idx, pi: 0, grades: [], answers: [], clues: {}, timedOut: 0, ctrl: null, unit: u,
            seatFrom: slateOpt && slateOpt.seatFrom };
    function go() {
      drawRail();
      drawBanner();
      drawCase();
      renderPart();
      var sh = $('#screen-play .sheet');
      if (sh && slateOpt && slateOpt.chapter) {
        sh.classList.remove('enter'); void sh.offsetWidth; sh.classList.add('enter');
        setTimeout(function () { sh.classList.remove('enter'); }, 1400);
      }
    }
    if (slateOpt && slateOpt.chapter) { slateOpt.turn = turn; chapter(slateOpt, go); }
    else if (slateOpt) slate(slateOpt, go);
    else go();
  }

  function unitLabel() {
    var sc = cur.it.sc;
    if (cur.kind === 'scene') return '장면 ' + pad(cur.idx + 1) + ' / ' + window.SCENES.length;
    if (cur.kind === 'side') return '돌발 업무 · ' + sc.tag;
    return '연습 ' + (practice.i + 1) + ' / ' + practice.queue.length + ' · ' + (cur.unit.tag || '');
  }

  function drawBanner() {
    var it = cur.it, sc = it.sc, sp = cast(it.speaker);
    var b = $('#banner');
    b.style.backgroundImage = 'url(' + sceneImg(sc.art) + ')';
    b.innerHTML = '<div class="b-main"><span class="b-no">' + esc(unitLabel()) + '</span><h1>' + esc(sc.chapter) +
      (it.v && it.v.label ? ' <span style="font:500 15px/1 var(--sans);opacity:.7">· ' + esc(it.v.label) + '</span>' : '') + '</h1>' +
      (it.line ? '<p class="b-quote">“' + esc(it.line) + '”<cite>' + esc(sp.name + ' · ' + sp.role) + '</cite></p>' : '') + '</div>' +
      '<dl class="b-meta"><div><dt>일자</dt><dd>' + esc(sc.day || '—') + '</dd></div>' +
      '<div><dt>근거 기준</dt><dd>' + esc((sc.standards || []).join(' · ')) + '</dd></div></dl>';
  }

  /* ---------- 상황 · 단서 ---------- */
  // 나의 시점 표 — 이 장면의 「나」가 누구인지 사진 · 이름 · 자리로
  function povBar(it, was) {
    var pov = SEASON.povOf(it.seat), pc = cast(pov);
    return '<div class="pov-bar' + (was ? ' moved' : '') + '" title="이 장면은 ' + esc(pc.name) + '의 시점">' +
        '<span class="pv-av">' + av(pov, null, 'av') + '</span>' +
        '<span class="pv-t">' + (was ? '<span class="mr"><s>' + esc(was.name) + '</s><b>' + esc(pc.name) + '</b></span>' : '<b>' + esc(pc.name) + '</b>') +
          '<span>' + esc(SEASON.SEATS[it.seat].name) + '</span>' + rankBars(it.seat) + '</span>' +
        '<em class="pv-tag">나의 시점</em></div>';
  }
  function numeric(v) { return /^[\s\d,.()%△▲\-−+~×/]*(억원|억|원|만원|백만원|건|%|배|개)?$/.test(String(v)) && /\d/.test(String(v)); }

  function drawCase() {
    var it = cur.it, clues = it.clues || [], marked = {};
    function mk(text) {
      var out = esc(text);
      clues.forEach(function (c, i) {
        if (marked[i]) return;
        var e = esc(c), at = out.indexOf(e);
        if (at < 0) return;
        marked[i] = true;
        out = out.slice(0, at) + '<mark class="clue" data-c="' + i + '" data-ev="EV-' + pad(i + 1) + '">' + e + '</mark>' + out.slice(at + e.length);
      });
      return out;
    }
    // 나의 시점 — 시점이 바뀐 장면이면 옛 사람 이름이 빠지고 새 사람이 들어온다
    var was = cur.seatFrom && cur.seatFrom !== it.seat ? cast(SEASON.povOf(cur.seatFrom)) : null;
    var html = povBar(it, was) +
      '<div class="who" id="who"><span class="who-av">' + av(it.speaker) + '</span><div class="who-t"><div class="nm"></div><div class="say"></div></div></div>' +
      (it.note ? '<p class="note">' + esc(it.note) + '</p>' : '') +
      '<div class="lbl" style="margin-top:18px"><span>상황</span>' + (clues.length ? '<span>단서 <b id="clue-n">0</b> / ' + clues.length + '</span>' : '') + '</div>' +
      tipBox('clue', clues.length) +
      '<p class="text">' + mk(it.situation || '') + '</p>';
    (it.exhibits || []).forEach(function (x) {
      if (x.type === 'kv') {
        html += '<div class="exh"><div class="ex-t"><span>' + esc(x.title) + '</span></div><table class="kv">' +
          x.items.map(function (r) { return '<tr><th>' + mk(r[0]) + '</th><td>' + mk(r[1]) + '</td></tr>'; }).join('') + '</table></div>';
      } else if (x.type === 'table') {
        html += '<div class="exh"><div class="ex-t"><span>' + esc(x.title) + '</span></div><table class="tb"><thead><tr>' +
          x.head.map(function (hh) { return '<th>' + esc(hh) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          x.rows.map(function (r) {
            var sum = /^(계|합계|미수정 합계)$/.test(String(r[0]));
            return '<tr' + (sum ? ' class="sum"' : '') + '>' + r.map(function (cell, ci) {
              return '<td' + (ci > 0 && numeric(cell) ? ' class="n"' : '') + '>' + mk(cell) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
      } else if (x.type === 'memo') {
        html += '<div class="exh"><div class="memo"><div class="memo-h">' + esc(x.from) + ' · ' + esc(x.title) + '</div><p>' + mk(x.body) + '</p></div></div>';
      }
    });
    var el = $('#case');
    el.innerHTML = html;
    // 넘기는 연출은 한 번만 — 미니게임(넓은 화면)에서 상황 칸이 다시 나타날 때 또 돌지 않게 가라앉힌다
    if (was) setTimeout(function () {
      var bar = $('.pov-bar.moved', el);
      if (!bar) return;
      bar.classList.remove('moved');
      var mr = $('.mr', bar);
      if (mr) mr.outerHTML = '<b>' + esc(cast(SEASON.povOf(it.seat)).name) + '</b>';
    }, 2200);
    el.onclick = function (e) {
      var m = e.target.closest('mark.clue');
      if (m) return adoptClue(m);
      var x = e.target.closest('[data-tip-x]');
      if (x) dismissTip(x.getAttribute('data-tip-x'));
    };
  }

  function adoptClue(m) {
    var i = +m.getAttribute('data-c');
    if (cur.clues[i] || cur.wrapped) return;
    cur.clues[i] = true;
    m.classList.add('got');
    FX.play('stampSm');
    var n = $('#clue-n');
    flyClue(m, n);
    setTimeout(function () {
      if (n) { n.textContent = Object.keys(cur.clues).length; FX.shake(n.parentNode); }
    }, 420);
    if (cur.ctrl && cur.ctrl.refresh) cur.ctrl.refresh();
    dismissTip('clue');
  }

  /* 채택한 단서가 증거 칸으로 날아간다 */
  function flyClue(from, to) {
    if (!from || !to || !from.getBoundingClientRect) return;
    var a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    var f = document.createElement('span');
    f.className = 'fly-ev';
    f.textContent = from.getAttribute('data-ev') || 'EV';
    f.style.left = (a.left + a.width / 2) + 'px';
    f.style.top = (a.top + a.height / 2) + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(function () {
      f.style.transform = 'translate(' + (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px,' + (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px) scale(.6)';
      f.style.opacity = '0.2';
    });
    setTimeout(function () { f.remove(); }, 480);
  }

  function adoptedClues() {
    if (!cur) return [];
    var list = cur.it.clues || [];
    return Object.keys(cur.clues).map(Number).sort(function (a, b) { return a - b; }).map(function (i) {
      return { code: 'EV-' + pad(i + 1), text: list[i] };
    });
  }

  function speak(who, text, mood) {
    var w = $('#who');
    if (!w) return;
    var c = cast(who);
    $('.who-av', w).innerHTML = av(who, mood);
    $('.nm', w).innerHTML = esc(c.name) + '<span>' + esc(c.role) + '</span>';
    var s = $('.say', w);
    s.textContent = text || '';
    s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  }

  /* ---------- 도움말 ---------- */
  // 형식마다 처음 만났을 때 한 번만
  var TIPS = {
    clue: '빨간 점선 = 단서. 누르면 채택',
    write: 'Ctrl+Enter 제출 · 분량 초과 감점',
    judge: '판단이 틀리면 근거 0점',
    choice: '숫자키로 고르기',
    cloze: 'Tab 다음 칸 · 초성 힌트 절반 점수',
    sort: '숫자키로 분류',
    mini: '시간이 다 되면 그 상태로 채점'
  };
  function tipBox(kind, when) {
    if (when === 0) return '';
    if (prog().tips[kind]) return '';
    return '<div class="tip" data-tip="' + kind + '"><b>TIP</b>' + esc(TIPS[kind]) + '<button type="button" data-tip-x="' + kind + '" aria-label="닫기">✕</button></div>';
  }
  function dismissTip(kind) {
    var P = prog();
    if (!P.tips[kind]) { P.tips[kind] = 1; saveProg(P); }
    $$('[data-tip="' + kind + '"]').forEach(function (t) { t.remove(); });
  }

  /* ============================================================
     문항
     ============================================================ */
  function partsBar() {
    var it = cur.it;
    return '<div class="parts">' + it.parts.map(function (p, i) {
      var g = cur.grades[i];
      var cls = i === cur.pi && !cur.wrapped ? 'on' : g ? 'done' : '';
      return '<span class="pt ' + cls + '"><span class="pt-n">' + esc(p.key) + '</span>' + esc(TYPE_NAME[p.type] || '') +
        (g ? '<span class="gr ' + letter(g.percent) + '">' + letter(g.percent) + '</span>' : '') + '</span>';
    }).join('') + '<span class="meta">' + esc(it.sc.area || '') + '<br>' + esc(it.sc.ref || (it.sc.standards || []).join(' · ')) + '</span></div>';
  }

  function api() {
    return {
      submit: function (ans) { submitPart(ans, false); },
      sound: FX.play,
      clues: adoptedClues,
      spend: function (sec) { if (clock.timer) { clock.left = Math.max(1, clock.left - sec); drawClock(); } }
    };
  }

  function renderPart() {
    var it = cur.it, p = it.parts[cur.pi];
    if (cur.ctrl && cur.ctrl.destroy) cur.ctrl.destroy();
    cur.ctrl = null;
    speak(p.who, p.say);
    var wide = p.type === 'mini';
    $('#body').classList.toggle('wide', wide);
    $('#banner').classList.toggle('slim', wide);
    var c = cast(p.who);
    // 미니게임은 TIP 대신 방법 창이 알려 준다 (같은 말을 두 번 하지 않게)
    $('#task').innerHTML = partsBar() + (wide && window.MINIS[p.game].howto ? '' : tipBox(p.type)) +
      (wide ? povBar(it, null) + '<div class="who sm" style="margin-bottom:12px">' + av(p.who) + '<div><div class="nm">' + esc(c.name) + '<span>' + esc(c.role) + '</span></div><div class="say">' + esc(p.say) + '</div></div></div>' +
        '<p class="ask" style="font-size:18px;margin-bottom:12px">' + esc(p.ask) + '</p>' : '') +
      '<div class="part" id="part"></div><div id="after"></div>';
    $('#task').onclick = function (e) {
      var x = e.target.closest('[data-tip-x]');
      if (x) dismissTip(x.getAttribute('data-tip-x'));
    };
    var host = $('#part');
    if (wide) cur.ctrl = mountMini(host, p);
    else cur.ctrl = window.FORMATS[p.type].mount(host, p, api());
    startClock(p.timeLimit);
    FX.play('flip');
    $('#task').scrollIntoView({ block: 'nearest' });
  }

  function miniSeed() {
    if (mode === 'season' && S) return (S.seed * 7 + S.i * 131 + cur.pi) >>> 0;
    return Math.floor(Math.random() * 1e9);
  }

  function mountMini(host, p) {
    var M = window.MINIS[p.game];
    var model = M.build(miniSeed(), p.data);
    var inner = M.mount(host, model, {
      submit: function () { submitPart(null, false); },
      spend: function (sec) { if (clock.timer) { clock.left = Math.max(1, clock.left - sec); drawClock(); } },
      sound: FX.play
    });
    var tb = $('.mg-bar > b', host);
    if (tb && tb.textContent.indexOf(' — ') > 0) {
      var tp = tb.textContent.split(' — ');
      tb.innerHTML = esc(tp[0]) + '<small>' + esc(tp.slice(1).join(' · ')) + '</small>';
    }
    if (M.howto) {
      // 막대에 [방법] — 언제든 다시 본다. 처음 만난 게임이면 바로 띄운다 (보는 동안 시계는 선다)
      var bar = $('.mg-bar', host), hb = document.createElement('button');
      hb.type = 'button'; hb.className = 'mg-how'; hb.textContent = '방법';
      if (bar) bar.insertBefore(hb, $('.btn', bar));
      hb.addEventListener('click', function () { miniHow(p.game, model, false); });
      if (!prog().tips['mg:' + p.game]) miniHow(p.game, model, true);
    }
    return {
      model: model,
      answer: function () { return { mini: { model: model, state: inner.state() } }; },
      refresh: function () {},
      destroy: inner.destroy
    };
  }

  /* 미니게임 방법 — 처음 만날 때 한 번 (그 뒤엔 막대의 [방법]). 조작만 보여 주고 답은 적지 않는다 */
  function miniHow(game, model, first) {
    var G = window.MINIS[game], H = G.howto(model);
    if ($('.mi-o')) return;
    var el = document.createElement('div');
    el.className = 'overlay mi-o';
    el.innerHTML = '<div class="mi-in" role="dialog" aria-label="' + esc(G.name) + ' 방법">' +
      '<div class="mi-h"><span class="k">미니게임' + (first ? ' · 처음' : ' · 방법') + '</span><h2>' + esc(G.name) + '</h2><p>' + esc(H.goal) + '</p></div>' +
      '<ol class="mi-steps">' + H.steps.map(function (s, i) {
        return '<li><span class="mi-n">' + (i + 1) + '</span>' +
          '<div class="mi-t"><b>' + esc(s.t) + '</b>' + (s.key ? '<kbd>' + esc(s.key) + '</kbd>' : '') + '</div>' +
          '<div class="mi-d">' + (s.d ? '<p>' + esc(s.d) + '</p>' : '') + (s.demo ? '<div class="mi-demo" aria-hidden="true">' + s.demo + '</div>' : '') + '</div></li>';
      }).join('') + '</ol>' +
      '<div class="mi-f">' + (H.warn ? '<span class="mi-w">감점 · ' + esc(H.warn) + '</span>' : '') +
        '<span class="mi-k">시간이 다 되면 그 상태로 채점</span>' +
        '<button type="button" class="btn" data-act="go">' + (first ? '시작' : '계속') + ' <kbd>Enter</kbd></button></div></div>';
    document.body.appendChild(el);
    var go = $('[data-act="go"]', el);
    if (go) go.focus({ preventScroll: true });
    function close() {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      var P = prog();
      if (!P.tips['mg:' + game]) { P.tips['mg:' + game] = 1; saveProg(P); }
      dismissTip('mini');
    }
    // 열려 있는 동안 키는 이 창만 받는다 — 숫자키가 뒤의 게임으로 새지 않게
    function onKey(e) {
      if (!el.isConnected) { document.removeEventListener('keydown', onKey, true); return; }   // 다른 길로 창이 닫혔으면 키를 놓아준다
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-act="go"]')) close();
    });
    FX.play('flip');
  }

  /* ---------- 시계 ---------- */
  function paused() { return !!$('.overlay') || !!$('.slate') || !!$('.chap') || window.BINDER.isOpen(); }
  function startClock(sec) {
    stopClock();
    clock.left = clock.max = sec || 90;
    clock.timer = setInterval(tick, 1000);
    drawClock();
  }
  function tick() {
    if (paused()) return;
    clock.left--;
    drawClock();
    if (clock.left > 0 && clock.left <= 10) FX.play('alarm');
    if (clock.left <= 0) { stopClock(); submitPart(null, true); }
  }
  function stopClock() {
    clearInterval(clock.timer);
    clock.timer = null;
    drawClock();
  }
  function drawClock() {
    var el = $('#clock');
    if (!el) return;
    var run = !!clock.timer;
    $('.v', el).textContent = run ? mmss(clock.left) : '—';
    el.classList.toggle('pause', !run);
    el.classList.toggle('hot', run && clock.left <= 30);
    el.classList.toggle('jit', run && clock.left <= 10);
    document.body.classList.toggle('hurry', run && clock.left <= 15 && !paused());
    // 남은 시간이 줄수록 배경음이 조여 온다
    FX.tension(run && clock.max ? 1 - clock.left / clock.max : 0);
  }

  /* ---------- 제출 · 채점 ---------- */
  function submitPart(ans, timedOut) {
    if (!cur || cur.grades[cur.pi] || cur.wrapped || cur.judging) return;
    var p = cur.it.parts[cur.pi];
    stopClock();
    if (!ans || p.type === 'mini') ans = cur.ctrl ? cur.ctrl.answer() : {};
    // AI 연동 채점 — 서술 · 판단 칸은 논점 판정을 받아 온 뒤에 채점한다 (js/aigrade.js). 못 받으면 기본 채점
    var G = window.AIGRADE;
    var worth = String(ans.text || '').trim() && !(p.type === 'judge' && p.verdict && ans.pick !== p.verdict.answer);   // 빈 답 · 판단이 틀린 답은 물어볼 것이 없다
    if (G && G.wants(p) && worth) return judgeThen(p, ans, timedOut);
    gradePart(p, ans, timedOut, null, null);
  }

  /* 판정을 기다리는 동안 — 답안은 잠기고 시계는 서 있다. [기본 채점으로] 를 누르면 기다리지 않는다 */
  function judgeThen(p, ans, timedOut) {
    var c = cur, pi = cur.pi, done = false;
    c.judging = true;
    $('#task').classList.add('judging');
    $('#after').innerHTML = '<div class="res jd"><span class="jd-k">AI 채점 중</span><i class="jd-bar"></i>' +
      '<button type="button" class="btn ghost sm" data-act="skipai">기본 채점으로</button></div>';
    function end(ext, note) {
      if (done) return;
      done = true;
      if (cur !== c || c.pi !== pi || c.wrapped) return;      // 그사이 다른 화면으로 갔다
      c.judging = false;
      $('#task').classList.remove('judging');
      gradePart(p, ans, timedOut, ext, note);
    }
    $('#after').onclick = function (e) {
      if (e.target.closest('[data-act="skipai"]')) end(null, 'AI 채점 건너뜀 · 기본 채점');
    };
    window.AIGRADE.judge(p, ans, { situation: c.it.situation }).then(function (v) {
      var st = window.AIGRADE.settle(v.ai, AE.gradeAny(p, ans));      // 기본 채점과 맞춰 본다 (고정 규칙 · 차이 표시)
      end({ ai: st.ai }, 'AI 채점 · ' + v.by + ' · 기본 ' + st.basePct + '점' + (v.comment ? ' · ' + v.comment : ''));
    }, function (e) {
      end(null, 'AI 채점 실패 · ' + ((e && e.label) || '오류') + ' · 기본 채점');
    });
  }

  function gradePart(p, ans, timedOut, ext, note) {
    var g = AE.gradeAny(p, ans, ext);
    if (note) g.res.flags.push(note);
    if (timedOut) {
      var pen = Math.round(g.max * 0.1);
      g.total = Math.max(0, g.total - pen);
      g.percent = g.max ? Math.round(g.total / g.max * 100) : 0;
      g.timedOut = true;
      cur.timedOut++;
    }
    if (p.type === 'mini' && window.MINIS[p.game] && window.MINIS[p.game].summary) {
      ans.summary = window.MINIS[p.game].summary(ans.mini.model, ans.mini.state, g);
    } else if (p.type === 'mini') {
      var d = g.res.detail || {};
      var exN = function (from) { return g.res.must.slice(from).filter(function (m) { return m.hit; }).length; };
      ans.summary = p.game === 'count' ? '표본 ' + d.used + ' · 실사표→현품 ' + d.sheet + ' · 현품→실사표 ' + d.floor + ' · 예외 ' + exN(3) + '/5'
        : p.game === 'jet' ? '추출 ' + d.extracted + '건 · 위험 분개 ' + exN(3) + '/5'
        : '귀속 오류 ' + g.res.must.slice(0, 3).filter(function (m) { return m.hit; }).length + '/3 · 정상 오표시 ' + (d.falses || 0) + '건';
    }
    cur.grades[cur.pi] = g;
    cur.answers[cur.pi] = ans;
    if (cur.ctrl && cur.ctrl.destroy) cur.ctrl.destroy();
    dismissTip(p.type);
    noteProgress(p, g);
    streakAfter(g);
    FX.play('stampSm');                 // 제출 — 등급 소리는 채점 연출 끝에 (showResult)
    showResult(p, g, ans);
    if (mode === 'practice') updateHud();
  }

  function streakAfter(g) {
    var holder = mode === 'practice' ? practice : S;
    holder.streak = holder.streak || 0;
    if (g.percent >= 80) {
      holder.streak++;
      holder.best = Math.max(holder.best || 0, holder.streak);
      var box = $('#hud [data-g="X"]');
      if (box) { box.classList.remove('fire'); void box.offsetWidth; box.classList.add('fire'); }
      if (mode === 'season' && holder.streak % 3 === 0) {
        var before = S.gauge.R;
        S.gauge.R = Math.min(100, S.gauge.R + 2);
        toast({ kind: 'streak', text: '연속 적정 ' + holder.streak + ' · 신뢰 +' + (S.gauge.R - before) });
        updateHud({ R: S.gauge.R - before });
        return;
      }
    } else {
      holder.streak = 0;
    }
    updateHud();
  }

  /* 개념 카드 · 오답 노트 — 시즌을 넘어 쌓인다 */
  function noteProgress(p, g) {
    var P = prog(), got = [];
    (g.res.must || []).forEach(function (m) {
      if (!m.why) return;
      if (m.hit) {
        if (P.cards[m.label] !== 'learned') { P.cards[m.label] = 'learned'; P.fresh[m.label] = 1; got.push(m.label); }
      } else if (P.cards[m.label] !== 'learned') {
        P.cards[m.label] = 'review';
      }
    });
    var src = cur.it.sc.id, vid = cur.it.v && cur.it.v.id !== '-' ? cur.it.v.id : null;
    var key = src + '|' + (vid || '') + '|' + p.key;
    var at = -1;
    P.wrong.forEach(function (w, i) { if (w.id === key) at = i; });
    if (g.percent < 60) {
      var item = { id: key, src: src, vid: vid, key: p.key, title: cur.it.sc.chapter, ask: p.ask, pct: g.percent, type: p.type, at: Date.now() };
      if (at >= 0) P.wrong[at] = item; else P.wrong.push(item);
    } else if (at >= 0 && g.percent >= 80) {
      P.wrong.splice(at, 1);
    }
    if (P.wrong.length > 60) P.wrong = P.wrong.slice(-60);
    saveProg(P);
    if (got.length) setTimeout(function () { cardToast(got); }, 650);   // 채점 소리가 끝난 뒤에
  }

  /* 채점표 */
  function checkRows(p, g) {
    var rows = '', r = g.res;
    if (g.verdict && p.verdict && p.verdict.label) {
      var L = p.verdict.label;
      if (g.verdict.correct) {
        rows += '<tr class="ok"><td class="m">✓</td><th>판단 · ' + esc(L[g.verdict.given]) + '</th><td class="p">+' + (g.verdictGot || 0) + '</td></tr>';
      } else {
        rows += '<tr class="no"><td class="m">✗</td><th>판단 · ' + esc(g.verdict.given ? L[g.verdict.given] : '없음') +
          '<small>정답 · ' + esc(L[g.verdict.expected]) + (g.verdict.given ? ' · 근거 0점' : '') + '</small></th><td class="p">0 / ' + (g.verdictMax || 0) + '</td></tr>';
      }
    }
    var zero = g.verdict && !g.verdict.correct && g.verdict.given;
    (r.must || []).forEach(function (m) {
      var cls = m.hit ? 'ok' : m.partial ? 'half' : 'no';
      var got = zero ? 0 : m.got;
      // 부분 점수를 준 이유를 한 줄로 — 다음엔 정확한 용어를 쓰게 만드는 자리다
      var note = (m.partial || m.ext) && !m.hit && m.note ? '<small class="tier">' + esc(m.note) + '</small>' : '';
      var why = !m.hit && m.why ? '<small>' + esc(m.why) + '</small>' : '';
      var hint = !m.hit && !m.why && m.hint ? '<small>' + esc(m.hint) + '</small>' : '';
      rows += '<tr class="' + cls + '"><td class="m">' + (m.hit ? '✓' : m.partial ? '◐' : '✗') + '</td><th>' + esc(m.label) + note + why + hint +
        '</th><td class="p">' + (m.hit ? '+' + got : got + ' / ' + m.score) + '</td></tr>';
    });
    (r.bonus || []).forEach(function (b) {
      if (b.hit) rows += '<tr class="ok"><td class="m">+</td><th>가점 · ' + esc(b.label) + '</th><td class="p">+' + b.got + '</td></tr>';
    });
    (r.trap || []).forEach(function (t) {
      if (t.hit && t.got < 0) rows += '<tr class="no"><td class="m">!</td><th>감점 · ' + esc(t.label) + '</th><td class="p">' + t.got + '</td></tr>';
    });
    (r.flags || []).forEach(function (f) {
      rows += '<tr class="note"><td class="m">·</td><th>' + esc(f) + '</th><td class="p"></td></tr>';
    });
    if (g.timedOut) rows += '<tr class="note"><td class="m">·</td><th>시간 초과 · 자동 제출</th><td class="p">−10%</td></tr>';
    return rows;
  }

  /* 채점 뒤 한마디 — [잘함, 반쯤, 못함]. 표정은 good · (없음) · bad */
  var PEN = {
    down: ['좋아, 그대로 조서에 올려.', '반은 맞았어. 하나 빠졌어.', '그렇게 올리면 깨진다.'],
    up: ['네, 그대로 정리하겠습니다.', '빠진 게 하나 있습니다.', '이사님, 이대로면 감리에서 걸립니다.'],
    assoc: ['아, 그렇게 하면 되겠네요!', '이것만으로 충분할까요?', '정말 그걸로 괜찮을까요…?'],
    partner: ['됐네. 그대로 가지.', '근거가 약해.', '다시 보게.'],
    kyuri: ['정확해요. 그대로 돌릴게요.', '반만 걸러졌어요.', '이 조건이면 다 빠져나가요.'],
    eqr: ['근거 충분합니다.', '한 가지가 빠졌습니다.', '조서에 없습니다. 다시 하십시오.'],
    chair: ['분명하군요. 기록해 두겠습니다.', '조금 더 듣고 싶습니다.', '그 답으로는 부족합니다.'],
    warehouse: ['제대로 세셨네요.', '몇 개는 놓치셨습니다.', '그렇게 세면 안 맞습니다.'],
    nexton: ['Got it. 그대로 전달하죠.', 'Hmm, 조금 더 설명이 필요합니다.', 'That doesn\'t work. 다시 보시죠.'],
    // 회사 쪽 사람 — 원칙대로 하면 싫어하고, 받아 주면 반긴다
    client: {
      cfo: { please: '역시 말이 통하시네요.', hard: '그렇게까지 하셔야 합니까?', mid: '…검토해 보겠습니다.' },
      raon: { please: '좋습니다, 그렇게 가시죠.', hard: '…일정은 책임지시는 겁니까?', mid: '음, 알겠습니다.' },
      ceo: { please: '말이 통하네.', hard: '두고 봅시다.', mid: '그래요.' },
      sales: { please: '허허, 역시!', hard: '거 참 깐깐하시네.', mid: '허허…' }
    }
  };
  function reaction(p, g) {
    var k = g.percent >= 80 ? 0 : g.percent >= 50 ? 1 : 2;
    var mood = k === 0 ? 'good' : k === 2 ? 'bad' : null;
    var C = PEN.client[p.who];
    if (C) {
      var pleased = (g.res.trap || []).some(function (t) {
        return t.hit && (t.please || ((p.rubric && p.rubric.trap) || []).some(function (x) { return x.please && x.label === t.label; }));
      });
      if (pleased) return { t: C.please, mood: 'good' };
      return g.percent >= 80 ? { t: C.hard, mood: 'bad' } : { t: C.mid, mood: 'tense' };
    }
    var list = PEN[p.who] && Array.isArray(PEN[p.who]) ? PEN[p.who] : (cur.it.seat === 'partner' ? PEN.up : PEN.down);
    return { t: list[k], mood: mood };
  }

  function showResult(p, g, ans) {
    var host = $('#part');
    var rv = { model: '', mine: '' };
    if (p.type === 'mini') {
      host.innerHTML = window.MINIS[p.game].review(ans.mini.model, ans.mini.state);
      if (p.model) rv.model = '<div class="model"><span class="k">풀이</span><p>' + esc(p.model) + '</p></div>';
    } else {
      rv = window.FORMATS[p.type].review(host, p, ans, g);
    }
    var L = letter(g.percent), last = cur.pi >= cur.it.parts.length - 1;
    var who = cast(p.who), re = reaction(p, g);
    var wa = $('#who .who-av');                 // 위 말풍선은 표정만 바뀐다 (한마디는 아래 붉은 펜 자리에)
    if (wa) wa.innerHTML = av(p.who, re.mood);
    $('#after').innerHTML =
      '<div class="res"><div class="score ' + L + '"><span class="gl">' + L + '</span><b><span class="tv">' + g.total + '</span> / ' + g.max + '</b><span class="wd">' + word(g.percent) + '</span></div>' +
      '<table class="checks">' + checkRows(p, g) + '</table></div>' + (rv.model || '') +
      '<div class="pen">' + av(p.who, re.mood, 'av pen-av') + '<b>' + esc(who.name) + '</b>' + esc(re.t) + '</div>' +
      '<div class="go"><button type="button" class="btn" data-act="next">' + (last ? (mode === 'practice' ? '연습 정리' : '장면 정산') : '다음 문항') + ' <kbd>Enter</kbd></button>' +
      (rv.mine ? '<button type="button" class="btn ghost tog" data-act="mine" aria-expanded="false">내 답안 ▾</button>' : '') + '</div>' +
      (rv.mine ? '<div class="mine" id="mine" hidden>' + rv.mine + '</div>' : '');
    var bar = $('#task .parts');
    if (bar) bar.outerHTML = partsBar();
    // 채점 연출 — 붉은 펜이 논점을 한 줄씩 체크하고(틱), 점수가 올라간 뒤 등급 도장
    var res = $('#after .res');
    if (res) {
      var trs = $$('.checks tr', res), t = Math.min(1500, trs.length * 120 + 320);
      trs.forEach(function (tr, i) {
        tr.style.setProperty('--i', i);
        if (i < 8) setTimeout(function () { FX.play('tick'); }, i * 120 + 220);
      });
      res.style.setProperty('--t', t + 'ms');
      res.classList.add('grading');
      var tv = $('.tv', res);
      if (tv && g.total > 0) { tv.textContent = '0'; FX.roll(tv, 0, g.total, t); }
      setTimeout(function () { FX.play(g.percent >= 90 ? 'great' : g.percent >= 80 ? 'ok' : g.percent >= 50 ? 'mid' : 'bad'); }, t);
    }
    $('#after').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      e.stopPropagation();
      var act = b.getAttribute('data-act');
      if (act === 'next') nextPart();
      else if (act === 'mine') {
        var box = $('#mine'), open = box.hidden;
        box.hidden = !open;
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        b.textContent = open ? '내 답안 ▴' : '내 답안 ▾';
        if (open) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    setTimeout(function () {
      var r = $('#after .res');
      if (r) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var nb = $('#after [data-act="next"]');
      if (nb) nb.focus({ preventScroll: true });
    }, 60);
  }

  function nextPart() {
    if (!cur || !cur.grades[cur.pi] || cur.wrapped || cur.swapping) return;
    if (cur.pi < cur.it.parts.length - 1) {
      // 종이를 바꿔 끼우듯 — 지금 문항이 위로 빠지고 다음 문항이 아래에서 올라온다
      var t = $('#task'), c = cur;
      c.swapping = true;
      t.classList.remove('swap-in');
      t.classList.add('swap-out');
      setTimeout(function () {
        c.swapping = false;
        if (cur !== c) return;
        t.classList.remove('swap-out');
        cur.pi++; renderPart();
        void t.offsetWidth; t.classList.add('swap-in');
        setTimeout(function () { t.classList.remove('swap-in'); }, 360);
      }, 160);
      return;
    }
    wrapUnit();
  }

  /* ============================================================
     정산
     ============================================================ */
  function buildPaper(res, texts, outcome) {
    var it = cur.it, sc = it.sc;
    var clues = (it.clues || []).map(function (c, i) { return { t: c, got: !!cur.clues[i] }; });
    var mini = null;
    var parts = it.parts.map(function (p, i) {
      var g = cur.grades[i] || { percent: 0, res: { must: [], trap: [] } }, a = cur.answers[i] || {};
      if (p.type === 'mini') mini = (window.MINIS[p.game].name || '미니게임') + ' — ' + (a.summary || '');
      return {
        key: p.key, type: p.type, ask: p.ask, ans: texts[i] || '', keyText: window.FORMATS.keyText(p), pct: g.percent,
        must: (g.res.must || []).map(function (m) { return { l: m.label, h: !!m.hit, p: !!m.partial }; }),
        trap: (g.res.trap || []).filter(function (t) { return t.hit && t.got < 0; }).map(function (t) { return t.label; }),
        guide: p.guide || null
      };
    });
    var no = cur.kind === 'scene' ? 'C-' + pad(cur.idx + 1) : 'X-' + String(sc.id).toUpperCase();
    return {
      id: sc.id, kind: cur.kind, idx: cur.idx, no: no, title: sc.chapter, tag: sc.tag || null, area: sc.area, std: (sc.standards || []).join(' · '),
      ref: sc.ref || '', day: sc.day || '', seat: SEASON.SEATS[it.seat].name, vlabel: it.v && it.v.label ? it.v.label : '',
      sit: it.situation || '', clues: clues, mini: mini, parts: parts, pct: res.percent,
      events: ((outcome && outcome.events) || []).map(function (e) { return e.text; }),
      g: S ? { E: S.gauge.E, T: S.gauge.T, R: S.gauge.R, C: S.rel.company } : null, at: Date.now()
    };
  }

  function wrapUnit() {
    stopClock();
    if (cur.ctrl && cur.ctrl.destroy) cur.ctrl.destroy();
    cur.wrapped = true;
    $('#body').classList.remove('wide');
    $('#banner').classList.remove('slim');
    var it = cur.it;
    var res = SEASON.combine(cur.grades);
    var texts = cur.answers.map(function (a, i) { return window.FORMATS.answerText(it.parts[i], a); });
    var found = Object.keys(cur.clues).length;
    $$('#case mark.clue:not(.got)').forEach(function (m) { m.classList.add('missed'); });

    if (mode === 'practice') return practiceWrap(res);

    var factsWas = Object.keys((S.story && S.story.facts) || {});
    var outcome = cur.kind === 'side'
      ? SEASON.applySide(S, it, texts, res, { timedOut: cur.timedOut, clues: found })
      : SEASON.apply(S, it, texts, res, { timedOut: cur.timedOut, clues: found });
    // 경로 장면이 연 인물 사실 (그 길로 가야만 알게 되는 것) — 대화에서 열린 것처럼 알린다
    var factsNew = Object.keys((S.story && S.story.facts) || {}).filter(function (k) { return factsWas.indexOf(k) < 0; });
    if (factsNew.length) setTimeout(function () { factToast(factsNew); }, 1600);
    if (cur.kind === 'side') S.sideAt[window.SCENES[S.i].id] = it.sc.id;
    var paper = buildPaper(res, texts, outcome);
    S.papers.push(paper);
    saveRun(true);
    drawRail();
    updateHud(outcome.delta);

    var L = letter(res.percent), d = outcome.delta;
    var dDays = Math.round(d.T * SEASON.DAY_RATE);
    var newCards = [], reviewCards = [];
    it.parts.forEach(function (p, i) {
      var g = cur.grades[i];
      ((g && g.res.must) || []).forEach(function (m) {
        if (!m.why) return;
        if (m.hit) newCards.push(m.label); else reviewCards.push(m.label);
      });
    });
    function cell(name, v, suffix) {
      var cls = v === 0 ? '' : (v > 0 ? 'up' : 'down');
      return '<li><span class="k">' + name + '</span><b class="' + cls + '">' + signed(v) + (suffix || '') + '</b></li>';
    }
    $('#task').innerHTML = partsBar() +
      '<div class="wrap"><div class="w-top"><span class="gl ' + L + '">' + L + '</span><div>' +
        '<h2>' + (cur.kind === 'side' ? '업무 처리' : '장면 정산') + ' · ' + word(res.percent) + '</h2>' +
        '<p>평균 ' + res.percent + '점' + ((it.clues || []).length ? ' · 단서 ' + found + ' / ' + it.clues.length : '') +
          (cur.timedOut ? ' · 시간 초과 ' + cur.timedOut : '') + '</p></div>' +
        '<span class="stamp">편철<br>완료</span></div>' +
      '<ul class="deltas">' + cell('보고서 기한', dDays, '일') + cell('감사증거', d.E) + cell('신뢰', d.R) + cell('회사 태도', d.C) + '</ul>' +
      (outcome.events.length ? '<ul class="events">' + outcome.events.map(function (e, i) {
        return '<li class="k-' + e.kind + '" style="animation-delay:' + (0.1 + i * 0.12) + 's">' + esc(e.text) + '</li>';
      }).join('') + '</ul>' : '') +
      (newCards.length || reviewCards.length ? '<div class="got-cards">' +
        newCards.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') +
        reviewCards.map(function (c) { return '<span class="rv">' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="go"><button type="button" class="btn" data-act="next">' + esc(nextStepLabel()) + ' <kbd>Enter</kbd></button>' +
        '<button type="button" class="btn ghost" data-act="binder">조서 보기</button>' +
        '<button type="button" class="btn ghost" data-act="copy">첨삭 요청 복사</button></div>' +
      '<textarea class="outbox" id="outbox" hidden readonly></textarea></div>';
    $('#task').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !this.contains(b)) return;
      var act = b.getAttribute('data-act');
      if (act === 'next') nextStep();
      else if (act === 'binder') openBinder(S, 'B');
      else if (act === 'copy') copyOut(feedback([paper]), b);
    };
    // 정산 한마디는 우리 팀 사람이 한다 (장면 화자가 회사 쪽이면 검토자)
    var closer = cast(it.speaker).group === 'team' ? it.speaker : SEASON.reviewer(S);
    speak(closer, res.percent >= 80 ? '좋습니다. 편철하죠.' : res.percent >= 50 ? '보완할 게 좀 있네요.' : '이대로면 곤란합니다.',
      res.percent >= 80 ? 'good' : res.percent < 50 ? 'bad' : null);
    setTimeout(function () { FX.play('stamp'); }, 350);
    // 개념 카드는 문항마다 수집 알림으로 이미 떴다 — 정산 표에만 남긴다
    outcome.events.filter(function (e) { return e.kind !== 'card'; }).forEach(function (e, i) {
      setTimeout(function () {
        toast(e);
        if (e.kind === 'found') FX.play('reveal');
        else if (e.kind === 'bond') FX.play('bond');
      }, 500 + i * 450);
    });
    $('#task').scrollIntoView({ block: 'nearest' });
  }

  function nextStepLabel() {
    if (S.gauge.T <= 0) return '감리 결과';
    if (cur.kind === 'scene' && SEASON.sideOpen(S)) return '업무 요청 확인';
    var nx = window.SCENES[S.i + 1];
    return nx ? '다음 장면 · ' + nx.chapter : '감리 결과';
  }

  function nextStep() {
    if (S.gauge.T <= 0) {
      drop(RUN);
      return slate({ kick: '보고서 기한', title: '기한 초과', sub: '감사보고서를 제때 내지 못했다.' }, ending);
    }
    // 방금 끝난 장면 뒤의 대화 → (몇몇 장면 뒤) 업무 요청 → 다음 장면
    var sc = window.SCENES[S.i];
    interlude(sc ? sc.id : '-', function () {
      if (S.gauge.T <= 0) {
        drop(RUN);
        return slate({ kick: '보고서 기한', title: '기한 초과', sub: '감사보고서를 제때 내지 못했다.' }, ending);
      }
      if (SEASON.sideOpen(S)) return board();
      advance();
    });
  }

  function advance() {
    S.i++;
    if (S.i >= window.SCENES.length) { drop(RUN); return ending(); }
    saveRun(false);
    enterScene();
  }

  /* ---------- 업무 요청 ---------- */
  function board() {
    var sid = window.SCENES[S.i].id;
    var offers = SEASON.offer(S, 3);
    if (!offers.length) return advance();
    var keys = Object.keys(SEASON.sideKeys()), slot = keys.indexOf(sid);
    var el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = '<div class="board-in" role="dialog" aria-label="업무 요청">' +
      '<div class="bo-h"><span class="ring"></span><div><span class="k">돌발 업무 · ' + (slot + 1) + ' / ' + keys.length + '</span><h2>업무 요청 3건</h2></div>' +
        '<div class="bo-slots">' + keys.map(function (k, i) {
          var st = S.sideAt[k];
          return '<span class="dia ' + (i === slot ? 'on' : st === 'skip' ? 'skip' : st ? 'done' : '') + '"></span>';
        }).join('') + '</div></div>' +
      '<div class="reqs-b">' + offers.map(function (c, i) {
        var who = cast(c.speaker), seat = SEASON.SEATS[c.view] || SEASON.SEATS.senior;
        var days = Math.max(1, Math.round((c.cost || 4) * SEASON.TIME_SCALE * seat.time * SEASON.DAY_RATE));
        var types = {};
        (Array.isArray(c.parts) ? c.parts : []).forEach(function (p) { types[TYPE_NAME[p.type || 'write']] = 1; });
        return '<button type="button" class="req" data-i="' + i + '">' +
          '<span class="req-img" style="background-image:url(' + sceneImg(c.art) + ')"><span class="req-tag">' + esc(c.tag) + '</span>' +
            '<kbd class="req-key">' + (i + 1) + '</kbd><span class="req-fmt">' + esc(Object.keys(types).join(' · ')) + '</span></span>' +
          '<span class="req-b"><span class="req-from">' + av(c.speaker) + esc(who.name + ' · ' + who.role) + '</span>' +
            '<b>' + esc(c.chapter) + '</b><span class="req-brief">' + esc(c.brief) + '</span>' +
            '<span class="req-meta"><span>문항 ' + (c.parts || []).length + '</span><span>기한 −' + days + '일</span><span class="good">잘하면 신뢰 +5</span><span>' + esc(seat.name) + ' 자리</span></span></span>' +
          '</button>';
      }).join('') + '</div>' +
      '<div class="bo-f"><button type="button" class="btn ghost" data-act="skip">넘기기 <kbd>Esc</kbd></button></div></div>';
    document.body.appendChild(el);
    FX.play('alert');
    function pick(i) {
      var c = offers[i];
      if (!c) return;
      close();
      var it = SEASON.resolve(c, S);
      var from2 = prevSeat;
      prevSeat = it.seat;
      startUnit({ kind: 'side', it: it, idx: S.i }, {
        chapter: true, no: '', kick: '돌발 업무 · ' + c.tag, title: c.chapter,
        at: '', place: c.brief || '', text: it.line ? '“' + it.line + '”' : '',
        seat: SEASON.SEATS[it.seat].name, seatId: it.seat, seatFrom: from2, img: sceneImg(c.art)
      });
    }
    function skip() {
      close();
      S.sideAt[sid] = 'skip';
      advance();
    }
    function onKey(e) {
      if (/^[1-3]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); pick(+e.key - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); }
    }
    function close() { document.removeEventListener('keydown', onKey, true); el.remove(); }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i],[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'skip') skip(); else pick(+b.getAttribute('data-i'));
    });
    document.addEventListener('keydown', onKey, true);
  }

  /* ---------- 일시정지 ---------- */
  function openPause() {
    if ($('.overlay') || window.BINDER.isOpen()) return;
    var el = document.createElement('div');
    el.className = 'overlay pause-o';
    el.innerHTML = '<div class="pause-in" role="dialog" aria-label="일시정지"><h2>일시정지</h2>' +
      '<button type="button" class="btn" data-act="resume">계속 <kbd>Esc</kbd></button>' +
      '<button type="button" class="btn ghost" data-act="binder">조서 보기</button>' +
      '<button type="button" class="btn ghost" data-act="snd">' + (FX.isOn() ? '소리 끄기' : '소리 켜기') + '</button>' +
      '<button type="button" class="btn ghost" data-act="home">' + (mode === 'season' ? '홈으로 · 이 장면 처음부터 이어하기' : '연습 그만두기') + '</button></div>';
    document.body.appendChild(el);
    function close() { document.removeEventListener('keydown', onKey, true); el.remove(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', function (e) {
      if (e.target === el) return close();
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'resume') close();
      else if (act === 'binder') { close(); openBinder(S, mode === 'season' ? 'B' : 'E'); }
      else if (act === 'snd') { FX.setOn(!FX.isOn()); b.textContent = FX.isOn() ? '소리 끄기' : '소리 켜기'; }
      else if (act === 'home') { close(); home(); }
    });
  }

  function closeOverlays() {
    if (window.BINDER.isOpen()) window.BINDER.close(true);
    $$('.overlay, .slate, .chap').forEach(function (o) { o.remove(); });
  }

  /* ---------- 조서 ---------- */
  function openBinder(season, tab, who) {
    var P = prog();
    var inSeason = !!(season && mode === 'season');
    window.BINDER.open({
      S: inSeason ? season : null, prog: P, tab: tab, who: who || null,
      save: function (p) { saveProg(p); },
      onRetry: inSeason ? null : function () { startPractice(wrongUnits(), '오답 노트'); },
      onClose: function () { updateHud(); }
    });
    if (Object.keys(P.fresh).length) { P.fresh = {}; saveProg(P); }
  }

  /* ---------- 첨삭 요청 ---------- */
  function feedback(papers) {
    var L = [];
    L.push('아래는 CPA 2차 회계감사 답안 연습 결과입니다. 실제 2차 채점 기준으로 첨삭해 주세요.');
    L.push('요청: ① 빠진 논점 ② 틀리거나 위험한 서술 ③ 답안 표현·구조 교정 ④ 실제 시험이라면 몇 점인지');
    L.push('='.repeat(52));
    papers.forEach(function (x, n) {
      L.push('');
      L.push('[' + (n + 1) + '] ' + (x.kind === 'side' ? '돌발 업무 · ' + (x.tag || '') + ' · ' : '') + x.title + ' (' + (x.area || '') + ')' + (x.vlabel ? ' — ' + x.vlabel : ''));
      L.push('시점: ' + x.seat + ' · 기준서: ' + (x.ref || x.std));
      if (x.sit) { L.push('— 상황 —'); L.push(x.sit); }
      x.parts.forEach(function (p) {
        L.push('');
        L.push(p.key + ' [' + (TYPE_NAME[p.type] || '') + '] ' + p.ask);
        if (p.guide && p.guide.length) L.push('  답안 양식: ' + p.guide.join(' / '));
        L.push('  내 답안: ' + (String(p.ans || '').trim() || '(무응답)').replace(/\n/g, '\n           '));
        L.push('  자동채점: ' + p.pct + '점');
        var hit = p.must.filter(function (m) { return m.h; }).map(function (m) { return m.l; });
        var half = p.must.filter(function (m) { return m.p; }).map(function (m) { return m.l; });
        var mis = p.must.filter(function (m) { return !m.h && !m.p; }).map(function (m) { return m.l; });
        if (hit.length) L.push('    획득: ' + hit.join(' / '));
        if (half.length) L.push('    절반: ' + half.join(' / '));
        if (mis.length) L.push('    누락: ' + mis.join(' / '));
        if (p.trap.length) L.push('    감점: ' + p.trap.join(' / '));
        if (p.keyText) L.push('  모범답안·정답: ' + p.keyText.replace(/\n/g, ' / '));
      });
    });
    L.push('');
    L.push('='.repeat(52));
    L.push('※ 자동채점은 키워드 기반이라 틀릴 수 있습니다. 맞는 표현인데 누락으로 잡혔으면 짚어 주세요.');
    return L.join('\n');
  }

  function copyOut(text, btn) {
    var original = btn.innerHTML;
    function done() { btn.textContent = '복사함'; setTimeout(function () { btn.innerHTML = original; }, 1600); }
    function fallback() {
      var b = $('#outbox');
      if (!b) return;
      b.hidden = false; b.value = text; b.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '아래 칸에서 복사'; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ============================================================
     감리 결과
     ============================================================ */
  var STATE_TXT = { found: '발견 · 수정 거부', fixed: '발견 · 수정', missed: '놓침', cleared: '없음 확인', lucky: '없었음' };
  // 금액이 없는 판단의 문제(중요한 취약점 등)는 고칠 숫자가 없다 — '발견 · 보고'

  function ending() {
    stopClock();
    closeOverlays();
    drop(RUN);
    var E = SEASON.epilogue(S), a = E.audit;
    var papers = S.papers || [];
    var avg = papers.length ? Math.round(papers.reduce(function (s, x) { return s + x.pct; }, 0) / papers.length) : 0;
    var base = letter(avg);
    var grade = a.tone === 'bad' ? 'D' : a.tone === 'warn' ? (base === 'S' || base === 'A' ? 'B' : base) : base;
    var sideN = S.sideDone.length;

    var history = load(STORE, {}) || {};
    history.history = (history.history || []).concat([{ t: Date.now(), seed: S.seed, seat: S.seat, end: a.title, tone: a.tone, avg: avg,
      found: E.found, missed: E.missed, side: sideN, co: window.COMPANY.name }]).slice(-30);
    save(STORE, history);
    var P = prog();
    P.best = Math.max(P.best || 0, avg);
    var route = SEASON.routeOf(S), trail = SEASON.routeTrail(S);
    if (route.length && window.SEASONS) {
      var co = window.SEASONS.current().id;
      P.routes = P.routes || {};
      P.routes[co] = P.routes[co] || {};
      P.routes[co][route.join(' → ')] = 1;
    }
    P.last = { seed: S.seed, papers: papers, truths: S.truths.map(function (t) { return { id: t.id, active: t.active, amount: t.amount, found: t.found, verified: t.verified }; }),
               story: S.story, bond: S.bond };
    saveProg(P);

    var areas = {};
    papers.forEach(function (x) {
      var k = x.kind === 'side' ? (x.tag || x.area) : x.title;
      areas[k] = areas[k] || { s: 0, n: 0 };
      areas[k].s += x.pct; areas[k].n++;
    });
    var bars = Object.keys(areas).map(function (k) { return { k: k, p: Math.round(areas[k].s / areas[k].n) }; })
      .sort(function (x, y) { return x.p - y.p; }).slice(0, 8);

    var dec = S.decision;
    // 진실을 잡아내고(발견 · 수정) 감리에서 지적이 없으면 — 세상이 컬러로 돌아온다
    var happy = a.tone === 'ok' && E.rows.some(function (r) { return r.state === 'found' || r.state === 'fixed'; });
    var bg = window.ART.sceneSrc(happy ? 'dawn' : a.tone === 'bad' ? 'fss' : 'review');
    $('#screen-end').innerHTML =
      '<div class="end' + (happy ? ' happy' : '') + '">' +
      '<div class="end-bg" aria-hidden="true"><i class="eb-m" style="background-image:url(' + bg + ')"></i>' +
        (happy ? '<i class="eb-c" style="background-image:url(' + bg + ')"></i>' : '') + '</div>' +
      '<article class="notice">' +
        '<header class="n-head"><div><span class="k">감사인 감리 결과 통지 · 1년 뒤</span><h1>' + esc(window.COMPANY.name + ' ' + window.COMPANY.fy.replace(/년.*/, '년') + ' 회계연도 감사') + '</h1></div>' +
          '<dl><div><dt>시즌</dt><dd>' + S.seed + '</dd></div><div><dt>정답 의견</dt><dd>' + esc(dec ? dec.kind + (S.opinionOK ? ' · 맞힘' : S.opinionNear ? ' · 수위 착오' : ' · 틀림') : '미표명') + '</dd></div>' +
          '<div><dt>편철 조서</dt><dd>' + papers.length + '장</dd></div></dl></header>' +
        '<section class="n-grade"><span class="big ' + (a.tone === 'bad' ? 'bad' : a.tone === 'warn' ? 'warn' : '') + '">' + grade + '</span>' +
          '<div><h2>' + esc(a.title) + '</h2><p>' + esc(a.text) + '</p></div>' +
          '<span class="stamp' + (a.tone === 'ok' ? ' good' : '') + '">' + (a.tone === 'ok' ? '종결' : a.tone === 'warn' ? '개선<br>요구' : '조치<br>대상') + '</span></section>' +
        '<section class="n-sec"><h3><span>숨어 있던 사실</span><span>발견 ' + E.found + '억 · 놓침 ' + E.missed + '억</span></h3><ul class="redact">' +
          E.rows.map(function (r, i) {
            return '<li style="--d:' + (0.6 + i * 0.35) + 's"><span class="acct">' + esc(r.account) + '</span>' +
              '<span class="rd"><b>' + esc(r.title) + (r.active && !r.nonMonetary ? ' · ' + r.amount.toFixed(1) + '억원' : '') + '</b>' + esc(r.text) +
                (r.state === 'missed' && r.how ? '<small>' + esc(r.how) + '</small>' : '') + '</span>' +
              '<span class="st ' + r.state + '">' + esc(r.nonMonetary && r.state === 'found' ? '발견 · 보고' : STATE_TXT[r.state]) + '</span></li>';
          }).join('') + '</ul></section>' +
        '<section class="n-sec"><h3><span>시즌 기록</span>' + (route.length ? '<span>경로 · ' + esc(route.join(' → ')) + '</span>' : '') + '</h3><div class="n-stats">' +
          '<div><span class="k">평균 점수</span><b>' + avg + '</b></div>' +
          '<div><span class="k">감사증거</span><b>' + S.gauge.E + '</b></div>' +
          '<div><span class="k">신뢰</span><b>' + S.gauge.R + '</b></div>' +
          '<div><span class="k">개념 카드</span><b>' + E.learned + '<small> 익힘</small></b></div>' +
          '<div><span class="k">돌발 업무</span><b>' + sideN + '<small>건</small></b></div></div></section>' +
        '<section class="n-sec"><h3><span>약한 곳부터</span><span>장면 · 업무별 평균</span></h3><div class="bars">' +
          bars.map(function (b) {
            return '<div class="bar-r ' + (b.p < 50 ? 'low' : b.p < 80 ? 'mid' : '') + '"><span>' + esc(b.k) + '</span><span class="tr"><i style="width:' + b.p + '%"></i></span><span class="pc">' + b.p + '</span></div>';
          }).join('') + '</div></section>' +
        (E.ethics && E.ethics.length ? '<section class="n-sec"><h3><span>독립성 · 윤리 점검</span><span>메신저에서 내린 판단 ' +
            E.ethics.filter(function (x) { return x.ok; }).length + ' / ' + E.ethics.length + '</span></h3><ul class="n-eth">' +
          E.ethics.map(function (x) {
            return '<li class="' + (x.ok ? 'ok' : 'no') + '"><span class="m">' + (x.ok ? '✓' : '✗') + '</span><div><b>' + esc(x.label) + '</b>' +
              '<small>내 답 · ' + esc(x.pick) + (x.ok ? '' : ' · ' + esc(x.note || '')) + '</small></div></li>';
          }).join('') + '</ul></section>' : '') +
        (trail.length ? '<section class="n-sec"><h3><span>지나온 길</span><span>이 회사 경로 ' + esc(routeCount(P, window.SEASONS ? window.SEASONS.current().id : '-')) + '</span></h3><ol class="n-route">' +
          trail.map(function (t) {
            return '<li><span class="k">갈림길 ' + t.no + '</span><div class="nr-o">' + t.opts.map(function (o) {
                return '<b class="' + (o.on ? 'on' : '') + '">' + esc(o.to || '') + '</b>';
              }).join('') + '</div>' +
              ((t.played || t.recap) ? '<p>' + (t.played ? '<em>' + esc(t.played) + '</em>' : '') + esc(t.recap || '') + '</p>' : '') + '</li>';
          }).join('') + '</ol></section>' : '') +
        '<section class="n-sec"><h3><span>그 뒤</span></h3><div class="n-epi">' +
          '<div><span class="k">' + esc(window.COMPANY.name) + '</span>' + esc(E.company.text) + '</div>' +
          '<div><span class="k">업무팀</span>' + esc(E.career.text) + '</div></div>' +
          (E.people && E.people.length ? '<div class="n-people">' + E.people.map(function (f, i) {
            var c = cast(f.who);
            return '<div class="np" style="animation-delay:' + (0.2 + i * 0.12) + 's">' + window.ART.card(f.who, 'np-img') +
              '<div><b>' + esc(c.name) + '</b><span>' + esc(c.role) + '</span><p>' + esc(f.t) + '</p></div></div>';
          }).join('') + '</div>' : '') + '</section>' +
        '<section class="n-sign">' + av('fss', null, 'av') + '<div><span class="k">금융감독원 회계감리국</span><b>수석조사역 차무진</b></div>' +
          '<span class="n-seal">감리<br>종결</span></section>' +
        '<footer class="n-foot">' +
          (P.wrong.length ? '<button type="button" class="btn" data-act="retry">오답 다시 풀기 <kbd>' + P.wrong.length + '</kbd></button>' : '') +
          '<button type="button" class="btn ' + (P.wrong.length ? 'ghost' : '') + '" data-act="new">새 시즌</button>' +
          '<button type="button" class="btn ' + (happy ? 'cr-go' : 'ghost') + '" data-act="credits">엔딩 크레딧</button>' +
          '<button type="button" class="btn ghost" data-act="binder">조서 보기</button>' +
          '<button type="button" class="btn ghost" data-act="copy">첨삭 요청 복사 · 전체</button>' +
          '<span class="spacer"></span><button type="button" class="btn ghost" data-act="home">홈</button>' +
          '<textarea class="outbox" id="outbox" hidden readonly></textarea></footer>' +
      '</article></div>';
    show('end');
    FX.play('stamp');
    E.rows.forEach(function (r, i) {
      if (r.state === 'found' || r.state === 'fixed') setTimeout(function () { FX.play('stampSm'); }, 700 + i * 350);
    });
    if (happy) setTimeout(bloom, 1500);
    var seasonRef = S;
    mode = null;
    $('#screen-end').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'credits') credits(happy, E);
      else if (act === 'retry') startPractice(wrongUnits(), '오답 노트');
      else if (act === 'new') newSeason();
      else if (act === 'binder') openBinder(null, 'B');
      else if (act === 'copy') copyOut(feedback(seasonRef.papers || []), b);
      else if (act === 'home') home();
    };
  }

  /* 해피엔딩 — '종결' 도장에서 붉은 잉크가 퍼지고, 그 자리부터 색이 번진다 */
  function bloom() {
    var end = $('#screen-end .end'), st = $('#screen-end .n-grade .stamp');
    if (!end || $('#screen-end').hidden) return;
    var r = st ? st.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    end.style.setProperty('--bx', (x / innerWidth * 100).toFixed(1) + '%');
    end.style.setProperty('--by', (y / innerHeight * 100).toFixed(1) + '%');
    var ink = document.createElement('i');
    ink.className = 'ink-drop';
    ink.style.left = x + 'px';
    ink.style.top = y + 'px';
    document.body.appendChild(ink);
    setTimeout(function () { ink.remove(); }, 1200);
    end.classList.add('bloom');
    FX.play('reveal');
  }

  /* 엔딩 크레딧 — 영화처럼. 해피엔딩이면 컬러로 흐르고, 관계가 깊어진 사람은 웃는 얼굴로 나온다 */
  function credits(color, E) {
    var O = window.CAST_ORDER || {}, seen = {};
    var bond = (E.ctx && E.ctx.bond) || {};
    var groups = [['세종회계법인', O.team], [window.COMPANY.name, O.client], ['그리고', O.outside]];
    function mood(k) {
      if (bond[k] == null) return null;
      return bond[k] >= 60 ? 'good' : bond[k] < 25 ? 'bad' : null;
    }
    var vid = color && window.ART.video('finale');
    var bg = vid ? '<video class="cr-bg" src="' + vid + '" poster="' + window.ART.sceneSrc('dawn') + '" autoplay muted loop playsinline></video>'
      : '<img class="cr-bg" src="' + window.ART.sceneSrc(color ? 'dawn' : 'fss') + '" alt="">';
    var people = groups.map(function (g) {
      var who = (g[1] || []).filter(function (k) { if (seen[k] || !window.CAST[k] || k === 'staff') return false; seen[k] = 1; return true; });
      if (!who.length) return '';
      return '<span class="cr-k">' + esc(g[0]) + '</span>' + who.map(function (k) {
        var c = cast(k);
        return '<div class="cr-p">' + window.ART.face(k, mood(k), 'cr-av') +
          '<div><span>' + esc(c.role) + '</span><b>' + esc(c.name) + '</b></div></div>';
      }).join('');
    }).join('');
    var d = document.createElement('div');
    d.className = 'credits' + (color ? ' color' : '');
    d.innerHTML = bg +
      '<div class="cr-open"><span>' + (color ? '1년 뒤 · 새벽' : '1년 뒤') + '</span><p>' + esc(E.career.text) + '</p></div>' +
      '<div class="cr-roll">' + people +
        '<span class="cr-k">그 뒤</span><p>' + esc(E.company.text) + '</p>' +
        '<span class="cr-k">연출 · 문제</span><p class="cr-small">CPA 2차 회계감사 기출과 회계감사기준의 취지를 바탕으로 새로 썼습니다. 회사 · 인물 · 사건은 허구입니다.</p>' +
        '<div class="cr-last"><img src="' + window.ART.sceneSrc('key') + '" alt=""><h2>감사 시즌<em>2026</em></h2>' +
          '<div class="cr-end">' + (color ? '종결' : '끝') + '</div></div>' +
      '</div><span class="cr-skip">클릭 · Esc</span>';
    document.body.appendChild(d);
    FX.play('chapter');
    setTimeout(function () { d.classList.add('rolling'); }, 3600);   // 여는 한 줄을 읽을 시간
    function close() { document.removeEventListener('keydown', onKey, true); d.remove(); }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    d.addEventListener('click', close);
    // 크레딧 줄 자체가 다 올라갔을 때만 — 안쪽 요소의 애니메이션이 끝난 것까지 받으면 일찍 닫힌다
    $('.cr-roll', d).addEventListener('animationend', function (e) { if (e.target === this) setTimeout(close, 4000); });
  }

  /* ============================================================
     연습 모드
     ============================================================ */
  var SCENE_TAG = { s1: '독립성', s2: '위험평가', s3: '재고실사', s4: '외부조회', s5: '회계추정치', s6: '특수관계자', s7: '기타정보', s8: '후속사건', s9: '왜곡표시', s10: '감사의견',
                    s5b: '단서 추적', s6b: '지배기구 보고' };

  function allSources() {
    var list = [];
    function scenes(sid) {
      window.SCENES.forEach(function (sc) {
        list.push({ sc: sc, sid: sid, tag: sc.tag || SCENE_TAG[sc.id] || sc.chapter, scene: true });
      });
    }
    if (window.SEASONS) window.SEASONS.each(function (b) { scenes(b.id); });
    else scenes(null);
    (window.CASES || []).forEach(function (c) { list.push({ sc: c, tag: c.tag, scene: false }); });
    return list;
  }

  function makeUnit(src, opt) {
    opt = opt || {};
    var back = null;
    if (src.sid && window.SEASONS && window.SEASONS.current().id !== src.sid) {
      back = window.SEASONS.current().id;
      window.SEASONS.use(src.sid);      // 그 회사의 진실 · 인물로 문항을 만든다
    }
    var sc = src.sc;
    var T = SEASON.create({});
    var sceneIdx = window.SCENES.indexOf(sc);
    if (sceneIdx >= 0) T.i = sceneIdx;
    var vid = opt.vid || (sc.variants ? sc.variants[Math.floor(Math.random() * sc.variants.length)].id : null);
    var it = SEASON.resolve(sc, T, vid);
    if (opt.keys) it.parts = it.parts.filter(function (p) { return opt.keys.indexOf(p.key) >= 0; });
    if (opt.type) it.parts = it.parts.filter(function (p) { return p.type === opt.type; });
    if (back) window.SEASONS.use(back);
    if (!it.parts.length) return null;
    return { kind: 'practice', it: it, tag: src.tag };
  }

  function wrongUnits() {
    var P = prog(), groups = {}, order = [];
    P.wrong.forEach(function (w) {
      var k = w.src + '|' + (w.vid || '');
      if (!groups[k]) { groups[k] = { src: w.src, vid: w.vid, keys: [] }; order.push(k); }
      groups[k].keys.push(w.key);
    });
    var srcs = allSources();
    return order.map(function (k) {
      var g = groups[k], s = srcs.filter(function (x) { return x.sc.id === g.src; })[0];
      return s ? makeUnit(s, { vid: g.vid, keys: g.keys }) : null;
    }).filter(Boolean).slice(0, 8);
  }

  var _typeSrc = null;
  function sourcesWithType(ty) {
    if (!_typeSrc) {
      _typeSrc = {};
      allSources().forEach(function (s) {
        var T = SEASON.create({ seed: 3 }), seen = {};
        (s.sc.variants || [null]).forEach(function (v) {
          try { SEASON.resolve(s.sc, T, v && v.id).parts.forEach(function (p) { seen[p.type] = 1; }); } catch (e) { /* 건너뜀 */ }
        });
        Object.keys(seen).forEach(function (k) { (_typeSrc[k] = _typeSrc[k] || []).push(s); });
      });
    }
    return _typeSrc[ty] || [];
  }

  function practicePicker() {
    var tabName = 'tag';
    var el = document.createElement('div');
    el.className = 'overlay';
    document.body.appendChild(el);
    function items() {
      var srcs = allSources(), P = prog();
      if (tabName === 'tag') {
        var by = {}, order = [];
        srcs.forEach(function (s) { if (!by[s.tag]) { by[s.tag] = []; order.push(s.tag); } by[s.tag].push(s); });
        return order.map(function (t) {
          var n = by[t].reduce(function (a, s) { return a + (Array.isArray(s.sc.parts) ? s.sc.parts.length : 3); }, 0);
          return { title: t, sub: '문항 ' + n + '개 · ' + by[t].length + '건', build: function () {
            return shuffle(by[t].slice()).slice(0, 4).map(function (s) { return makeUnit(s); }).filter(Boolean);
          } };
        });
      }
      if (tabName === 'type') {
        return ['write', 'judge', 'choice', 'cloze', 'sort', 'mini'].map(function (ty) {
          var withType = sourcesWithType(ty);
          return { title: TYPE_NAME[ty], sub: withType.length + '건에서 출제', n: withType.length, build: function () {
            return shuffle(withType.slice()).slice(0, 5).map(function (s) { return makeUnit(s, { type: ty }); }).filter(Boolean);
          } };
        }).filter(function (x) { return x.n > 0; });
      }
      return P.wrong.length ? [{ title: '오답 노트', sub: P.wrong.length + '문항', build: wrongUnits }] : [];
    }
    function draw() {
      var list = items(), P = prog();
      el.innerHTML = '<div class="prac-in" role="dialog" aria-label="연습 모드"><div class="prac-h"><h2>연습 모드</h2><div class="ptabs">' +
        [['tag', '분야별'], ['type', '형식별'], ['wrong', '오답 노트 ' + P.wrong.length]].map(function (t) {
          return '<button type="button" class="ptab' + (tabName === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div><button type="button" class="x" data-act="close" aria-label="닫기">✕</button></div>' +
        '<div class="prac-list">' + (list.length ? list.map(function (x, i) {
          return '<button type="button" class="pr-item" data-i="' + i + '"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></button>';
        }).join('') : '<div class="pr-empty">오답 노트 비어 있음</div>') + '</div>' +
        '</div>';
      el._list = list;
    }
    function close() { document.removeEventListener('keydown', onKey, true); el.remove(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', function (e) {
      if (e.target === el) return close();
      var b = e.target.closest('[data-tab],[data-i],[data-act]');
      if (!b) return;
      if (b.hasAttribute('data-tab')) { tabName = b.getAttribute('data-tab'); FX.play('tick'); draw(); return; }
      if (b.getAttribute('data-act') === 'close') return close();
      var x = el._list[+b.getAttribute('data-i')];
      var units = x.build();
      close();
      startPractice(units, x.title);
    });
    draw();
  }

  function startPractice(units, title) {
    units = (units || []).filter(Boolean);
    if (!units.length) { toast({ kind: 'warn', text: '풀 문항 없음' }); return; }
    closeOverlays();
    S = null;
    mode = 'practice';
    practice = { title: title, queue: units, i: 0, results: [], streak: 0 };
    buildShell();
    practiceUnit();
  }

  function practiceUnit() {
    var u = practice.queue[practice.i];
    startUnit(u, { kick: '연습 ' + (practice.i + 1) + ' / ' + practice.queue.length + ' · ' + (u.tag || ''), title: u.it.sc.chapter,
      sub: u.it.line ? '“' + u.it.line + '”' : '', seat: SEASON.SEATS[u.it.seat].name,
      seatId: u.it.seat, img: sceneImg(u.it.sc.art), ms: 1100 });
    updateHud();
  }

  function practiceWrap(res) {
    practice.results[practice.i] = { pct: res.percent, pcts: cur.grades.map(function (g) { return g.percent; }), title: cur.it.sc.chapter, tag: cur.unit.tag };
    drawRail();
    updateHud();
    var last = practice.i >= practice.queue.length - 1;
    var L = letter(res.percent);
    $('#task').innerHTML = partsBar() +
      '<div class="wrap"><div class="w-top"><span class="gl ' + L + '">' + L + '</span><div><h2>' + esc(cur.it.sc.chapter) + ' · ' + word(res.percent) + '</h2>' +
        '<p>평균 ' + res.percent + '점 · 연습 ' + (practice.i + 1) + ' / ' + practice.queue.length + '</p></div></div>' +
      (last ? '<ul class="events">' + practice.results.map(function (r) {
          return '<li class="' + (r.pct >= 80 ? 'k-clear' : r.pct >= 50 ? 'k-warn' : 'k-flag') + '">' + esc(r.title) + ' · ' + r.pct + '점</li>';
        }).join('') + '</ul>' : '') +
      '<div class="go">' + (last
        ? '<button type="button" class="btn" data-act="again">같은 조건으로 다시 <kbd>Enter</kbd></button><button type="button" class="btn ghost" data-act="binder">개념 카드</button><button type="button" class="btn ghost" data-act="home">홈</button>'
        : '<button type="button" class="btn" data-act="next">다음 연습 <kbd>Enter</kbd></button><button type="button" class="btn ghost" data-act="home">그만두기</button>') + '</div></div>';
    $('#task').onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !this.contains(b)) return;
      var act = b.getAttribute('data-act');
      if (act === 'next') { practice.i++; practiceUnit(); }
      else if (act === 'again') {
        var t = practice.title;
        var units = t === '오답 노트' ? wrongUnits() : practice.queue.map(function (u) {
          var s = allSources().filter(function (x) { return x.sc.id === u.it.sc.id; })[0];
          return s ? makeUnit(s, { keys: u.it.parts.map(function (p) { return p.key; }) }) : null;
        });
        startPractice(units, t);
      }
      else if (act === 'binder') openBinder(null, 'E');
      else if (act === 'home') home();
    };
    FX.play('stamp');
  }

  /* ============================================================
     전역 키
     ============================================================ */
  document.addEventListener('keydown', function (e) {
    if (window.BINDER.isOpen()) return;
    var overlay = $('.overlay');
    var playing = !$('#screen-play').hidden;
    if (e.key === 'Escape' && playing && !overlay && !$('.slate')) { e.preventDefault(); openPause(); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !overlay && !$('.slate') && !typing(e)) {
      if (playing) {
        var nb = $('#task [data-act="next"]') || $('#task [data-act="again"]');
        if (nb) { e.preventDefault(); nb.click(); }
      } else if (!$('#screen-home').hidden) {
        e.preventDefault(); newSeason();
      }
    }
  });

  /* ============================================================
     시작 연출 — 스튜디오 표식 → 허구 고지 → 타이틀 (브라우저 창마다 한 번)
     아무 키나 누르거나 누르면 다음으로 넘어간다
     ============================================================ */
  function boot(then) {
    var seen = false;
    try { seen = sessionStorage.getItem('auditSim.boot') === '1'; sessionStorage.setItem('auditSim.boot', '1'); } catch (e) { /* 저장 안 됨 */ }
    if (seen || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return then();
    var d = document.createElement('div');
    d.className = 'boot';
    d.innerHTML =
      '<div class="bt-card bt-logo"><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M14 44 L44 70 L106 10"/></svg>' +
        '<b>TICKMARK</b><span>틱마크 스튜디오</span></div>' +
      '<div class="bt-card bt-note"><p>이 이야기는 허구입니다.</p>' +
        '<small>등장하는 회사 · 인물 · 사건은 실제와 관계가 없으며, 감사 절차와 기준서 논점은 CPA 2차 시험 범위를 따릅니다.</small>' +
        '<small class="bt-hp">헤드폰 사용을 권장합니다</small></div>';
    document.body.appendChild(d);
    var step = 0, t = null;
    function next() {
      clearTimeout(t);
      step++;
      if (step === 1) { d.classList.add('s1'); FX.play('stamp'); t = setTimeout(next, 2300); }
      else if (step === 2) { d.classList.add('s2'); t = setTimeout(next, 3200); }
      else { done(); }
    }
    function done() {
      document.removeEventListener('keydown', onKey, true);
      then();
      d.classList.add('out');
      setTimeout(function () { d.remove(); }, 900);
    }
    function onKey(e) { e.preventDefault(); e.stopPropagation(); next(); }
    document.addEventListener('keydown', onKey, true);
    d.addEventListener('click', next);
    t = setTimeout(next, 500);
  }

  boot(home);
})();
