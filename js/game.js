/* ============================================================
   감사 시즌 2026 — 화면 (game.js)
   ------------------------------------------------------------
   로직은 js/season.js 에 있다. 이 파일은 그리기만 한다.
   마크업은 index.html 의 디자인 시스템(Modernist) 클래스를 쓴다.

   화면  01 타이틀 · 02 플레이 · 03 판정 · 04 엔딩 · 05 전환 연출
   흐름  장면 → 칸 ①(묻고 · 쓰고 · 바로 채점 · 반응) → 칸 ② → 칸 ③ → 장면 정산
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'auditSim.v5';
  var S = null, cur = null, timer = null, toastT = null, wipeT = null;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function mmss(s) { s = Math.max(0, s | 0); return ('0' + (s / 60 | 0)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function sign(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); }
  function one(a) { return a[Math.floor(Math.random() * a.length)]; }
  function letter(p) { return p >= 90 ? 'S' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : 'D'; }
  function still() { return !!(calm && calm.matches); }
  function bring(el) { if (el) el.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }); }
  function seatOf() { return window.SEASON.SEATS[S.seat]; }
  function pad2(n) { return ('0' + n).slice(-2); }
  function clock(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function dotDate(s) { return String(s || '').replace(/년\s*/, '. ').replace(/월\s*/, '. ').replace(/일/, '.'); }

  function show(id) {
    ['home', 'play', 'end'].forEach(function (k) { $('#screen-' + k).hidden = (k !== id); });
    $('#btn-dossier').hidden = (id !== 'play');
    $('#hud-seat').hidden = (id !== 'play');
    if (id !== 'play') $('#dossier').hidden = true;
    window.scrollTo(0, 0);
  }

  /* ---------- 테마 (AUTO · LIGHT · DARK) ---------- */
  var THEMES = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var b = $('#btn-theme');
    if (b) b.textContent = t.toUpperCase();
  }

  /* ---------- 인물 반응 ----------
     칸을 제출하면 묻던 사람이 바로 반응한다.
     재무담당임원은 점수가 아니라 "압박했는가 · 편들었는가"에 반응한다. */
  var REACT = {
    managerDown: { good: ['좋아, 그거야.', '그렇지. 조서에 그대로 적어.'],
                   mid: ['반은 맞았어. 하나 빠졌어.', '방향은 맞는데 한 끗 모자라.'],
                   bad: ['음… 그건 아니야. 다시 봐.', '그렇게 올리면 이사님한테 깨져.'] },
    managerUp:   { good: ['네, 그 방향으로 정리하겠습니다.', '알겠습니다. 바로 반영하겠습니다.'],
                   mid: ['네… 다만 한 가지가 빠진 것 같습니다.', '그렇게 올리겠습니다. 근거가 조금 약할 수는 있습니다.'],
                   bad: ['이사님, 그렇게 가면 감리에서 문제 될 수 있습니다.', '…정말 그렇게 정리할까요?'] },
    assoc:       { good: ['아, 그렇게 하면 되겠네요. 바로 진행하겠습니다!', '네, 알겠습니다!'],
                   mid: ['일단 그렇게 해볼게요. 그런데 이것만으로 충분할까요?', '네… 뭔가 하나 빠진 것 같긴 한데요.'],
                   bad: ['…정말 그걸로 괜찮을까요?', '그렇게 하면 나중에 문제 되지 않을까요?'] },
    partner:     { good: ['그렇지. 조서에 그대로 남기게.', '좋네.'],
                   mid: ['핵심은 짚었는데 빠진 게 있어.', '절반이네.'],
                   bad: ['그걸로는 감리 못 넘기네.', '다시 보게.'] },
    cfo:         { press: ['…그렇게까지 하셔야 합니까.', '알겠습니다. 협조는… 하겠습니다.', '감사인께서 참 깐깐하시네요.'],
                   please: ['역시 말이 통하시네요.', '감사합니다. 그렇게 정리하시죠.'],
                   neutral: ['검토해 보겠습니다.', '네, 알겠습니다.'] }
  };

  function reactionFor(part, g) {
    var pr = g.parts[0].res, pct = g.percent;
    if (part.who === 'cfo') {
      var conf = (cur.it.sc.confront || []).some(function (l) {
        return pr.must.some(function (m) { return m.hit && m.label === l; });
      });
      var please = (pr.trap || []).some(function (t) {
        return t.hit && (part.rubric.trap || []).some(function (d) { return d.label === t.label && d.please; });
      });
      return one(please ? REACT.cfo.please : conf ? REACT.cfo.press : REACT.cfo.neutral);
    }
    var key = part.who === 'manager' ? (S.seat === 'partner' ? 'managerUp' : 'managerDown') : part.who;
    var set = REACT[key] || REACT.managerDown;
    return one(pct >= 80 ? set.good : pct >= 50 ? set.mid : set.bad);
  }

  /* ============================================================
     조각
     ============================================================ */

  function tags(list) {
    return '<div class="as-tags">' + list.map(function (t) {
      return '<span class="as-tag' + (t.red ? ' as-tag--red' : '') + (t.live ? ' as-tag--live' : '') +
        '">' + esc(t.text) + '</span>';
    }).join('') + '</div>';
  }

  /* 무대 마킹 — 사진에 그리지 않고 HTML/CSS 로 올린다.
     장면 데이터에 sc.marks 를 두면 그려진다 (비율 좌표, 게임 상태와 무관하게 정적).
       { x:5, y:12, w:14, ratio:'3/4', tone:'red'|'warn', label:'D 열 · 비움', foot:'EV-0312' } */
  function marks(sc) {
    if (!sc.marks || !sc.marks.length) return '';
    return sc.marks.map(function (m) {
      return '<div class="as-mark' + (m.tone === 'warn' ? ' as-mark--warn' : '') + '" style="left:' +
        (m.x || 5) + '%;top:' + (m.y || 10) + '%;width:' + (m.w || 15) + '%;aspect-ratio:' +
        (m.ratio || '3/4') + '">' +
        (m.label ? '<span class="as-mark__t">' + esc(m.label) + '</span>' : '') +
        (m.foot ? '<span class="as-mark__f">' + esc(m.foot) + '</span>' : '') + '</div>';
    }).join('');
  }

  function dialog(who, text) {
    var c = window.CAST[who] || window.CAST.manager;
    return '<div class="as-dialog">' +
      '<div class="as-dialog__avatar">' + window.ART.avatar(c.avatar) + '</div>' +
      '<div class="as-dialog__body">' +
      '<div class="as-dialog__who">' +
      '<span class="as-badge' + (who === 'cfo' ? ' as-badge--red' : '') + '">' + esc(c.role) + '</span>' +
      '<span class="as-dialog__name">' + esc(c.name) + '</span>' +
      (who === 'cfo' ? '<span class="as-badge as-badge--out">피감사회사</span>'
                     : '<span class="as-dialog__role">' + esc(S.co.firm) + '</span>') +
      '</div><p class="as-dialog__line">“' + esc(text) + '”</p></div></div>';
  }

  /* 칸마다 묻는 사람이 다르다 — 문항 위에 붙는 좁은 대사 띠 */
  function ask(who, text) {
    var c = window.CAST[who] || window.CAST.manager;
    return '<div class="as-ask">' +
      '<span class="as-ask__avatar">' + window.ART.avatar(c.avatar) + '</span>' +
      '<span class="as-ask__body"><b>' + esc(c.name) + '</b>' +
      '<em>' + esc(c.role) + '</em>' +
      '<span>“' + esc(text) + '”</span></span></div>';
  }

  function figs(items, title) {
    return '<div class="as-sec">' + esc(title || '숫자 요약') + '</div><dl class="as-figs">' +
      items.map(function (i) {
        return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>';
      }).join('') + '</dl>';
  }

  /* 회계 관행 — 조서의 표는 일반 표와 다르게 읽힌다.
       합계 행     아래를 이중선으로 닫는다
       음수        빼기표가 아니라 괄호로 적는다
       감사 틱마크  마지막 열. 「✓」 는 끝난 것, 나머지는 끝나지 않은 것이라 붉다 */
  var SUM_ROW = /^(계|합계|소계|총계|누계)$/;
  var TICK_OK = /^(✓|○|확인|완료|일치|적절)$/;
  var TICK_BAD = /^(미실사|미인도|미확인|미회수|반품|거부|불일치|미흡|결함|해당|미제출|불응)$/;

  function cellHtml(c, last) {
    var t = String(c == null ? '' : c).trim();
    if (last && (TICK_OK.test(t) || TICK_BAD.test(t))) {
      return '<span class="as-tick' + (TICK_BAD.test(t) ? ' as-tick--bad' : '') + '">' + esc(t) + '</span>';
    }
    var neg = /^[-−▲△]\s?([\d,][\d,.]*)$/.exec(t);
    if (neg) return '<span class="as-neg">(' + esc(neg[1]) + ')</span>';
    return esc(t);
  }

  /* 조서 머리 — HUD 가 말하지 않는 것을 적는다.
     누가 쓰고 누가 검토하는가, 그리고 이 종이의 조서 색인번호. */
  function wpHead(sc, it) {
    var me = seatOf(), rev = window.CAST[S.seat === 'partner' ? 'manager' : 'partner'] || {};
    var idx = 'C-' + (Math.floor((sc.ord || 10) / 10)) + '-' + (S.seed % 9 + 1);
    return '<div class="as-wp">' +
      '<div><span class="as-k">감사조서 · WORKING PAPER</span>' +
      '<div class="as-wp__co"><b>' + esc(S.co.name) + '</b>' +
      '<span>' + esc(it.prompt) + '</span></div></div>' +
      '<dl class="as-wp__meta">' +
      '<div><dt class="as-k">작성</dt><dd>' + esc(me.name) + '</dd></div>' +
      '<div><dt class="as-k">검토</dt><dd class="as-wp__rev">' + esc(rev.name || '—') + '</dd></div>' +
      '<div><dt class="as-k">색인</dt><dd class="as-wp__idx">' + idx + '</dd></div>' +
      '</dl></div>';
  }

  /* 검토 의견 — 상급자가 붉은 펜으로 조서에 적은 것처럼 */
  function react(who, text) {
    var c = window.CAST[who] || window.CAST.manager;
    return '<div class="as-react">' +
      '<div class="as-react__k"><span class="as-k">검토<br>의견</span></div>' +
      '<div class="as-react__b"><b>' + esc(c.name) + '</b><em>' + esc(c.role) + '</em>' +
      '<span>' + esc(text) + '</span></div></div>';
  }

  function docCell(x, no) {
    var head = '<div class="as-doc__head"><span class="as-doc__no">자료 ' + no + '</span>' +
      '<span class="as-doc__t">' + esc(x.title) + '</span></div>';
    if (x.type === 'table') {
      return '<div class="as-doc">' + head + '<div class="as-scroll"><table class="as-table"><thead><tr>' +
        x.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        x.rows.map(function (r) {
          var sum = SUM_ROW.test(String(r[0]).trim());
          return '<tr' + (sum ? ' class="as-table__sum"' : '') + '>' + r.map(function (c, k) {
            return '<td>' + cellHtml(c, k === r.length - 1) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    /* 시스템 화면 — 사진 대신. 셀 톤 세 가지로 「있다 / 흐리다 / 비었다」를 말한다 */
    if (x.type === 'screen') {
      var row = x.mode === 'row';
      return '<div class="as-doc">' + head +
        '<div class="as-screen' + (row ? ' as-screen--row' : '') + '">' +
        '<div class="as-screen__bar"><span class="as-screen__sys">' + esc(x.sys) + '</span>' +
        (x.sub ? '<span class="as-screen__sub">' + esc(x.sub) + '</span>' : '') +
        '<span class="as-screen__t"><i></i>' + esc(x.time || '') + '</span></div>' +
        '<div class="as-screen__grid" style="grid-template-columns:repeat(' + (row ? 1 : (x.cols || 4)) +
        ',minmax(0,1fr));grid-template-rows:repeat(' + (x.rows || 1) + ',minmax(0,1fr))">' +
        (x.cells || []).map(function (c) {
          return '<div class="as-screen__c as-screen__c--' + (c[1] || 'dim') + '"' +
            (row ? '' : ' style="grid-column:' + c[2] + ';grid-row:' + c[3] + '"') +
            '>' + esc(c[0]) + '</div>';
        }).join('') + '</div></div>' +
        (x.note ? '<div class="as-screen__cap"><span>' + esc(x.note) + '</span>' +
          (x.ref ? '<em>' + esc(x.ref) + '</em>' : '') + '</div>' : '') +
        '</div>';
    }
    if (x.type === 'kv') {
      return '<div class="as-doc">' + head + '<dl class="as-figs">' +
        x.items.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') +
        '</dl></div>';
    }
    if (x.type === 'memo') {
      return '<div class="as-doc">' + head + '<div class="as-memo">' +
        '<div class="as-memo__from">' + esc(x.from) + '</div><p>' + esc(x.body) + '</p></div></div>';
    }
    return '';
  }

  /* ---------- HUD ---------- */
  var GAUGE_KEYS = ['E', 'T', 'R', 'C'];

  /* 채움색 규칙 — 빨강은 위험에만.
     감사증거 40 미만이면 범위제한이 강제되고, 신뢰 40 미만이면 판단을 의심받는다.
     신뢰만 급락 연출(깜빡임)을 붙인다. */
  function gaugeTone(k, v) {
    if (k === 'E') return v < 40 ? 'bad' : '';
    if (k === 'T') return v < 30 ? 'bad' : v < 45 ? 'warn' : '';
    if (k === 'R') return v < 40 ? 'crash' : v < 55 ? 'warn' : '';
    return v < 35 ? 'bad' : v < 42 ? 'warn' : v >= 65 ? 'good' : '';
  }

  function gaugeCell(k, label, v, d) {
    var tone = gaugeTone(k, v);
    var delta = d == null ? '' :
      '<span class="as-gauge__delta ' + (d <= -30 ? 'crash' : d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' +
      sign(d) + (d <= -30 ? ' 급락' : '') + '</span>';
    return '<div class="as-gauge">' +
      '<div class="as-gauge__row"><span class="as-gauge__lab">' + esc(label) + '</span>' +
      '<span class="as-gauge__val">' + Math.round(v) + '</span>' + delta + '</div>' +
      '<div class="as-gauge__track" role="progressbar" aria-label="' + esc(label) +
      '" aria-valuenow="' + Math.round(v) + '" aria-valuemin="0" aria-valuemax="100">' +
      '<span class="as-gauge__fill ' + tone + '" style="width:' + Math.max(0, Math.min(100, v)) + '%"></span>' +
      '</div></div>';
  }

  function renderHud(delta) {
    // 장면 구성은 시즌마다 다르다. 진행도는 지금까지 확정된 목록 기준으로 그린다.
    var list = window.SEASON.sceneList(S);
    var sc = (cur && cur.it.sc) || list[Math.min(S.i, list.length - 1)];
    var g = S.gauge, c = S.rel.company, n = list.length;
    var chips = '';
    for (var i = 0; i < n; i++) {
      chips += '<i class="' + (i < S.i ? 'done' : i === S.i ? 'now' : '') + '"></i>';
    }
    var d = delta || {};
    $('#hud').innerHTML =
      '<div class="as-hud__top">' +
      '<div class="as-hud__pair"><span class="as-k">기준일</span>' +
      '<span class="as-hud__date">' + esc(sc.day) + '</span></div>' +
      '<div class="as-hud__sep"></div>' +
      '<div class="as-hud__pair"><span class="as-k">장면</span>' +
      '<span class="as-hud__scene">' + esc(sc.chapter) + '</span></div>' +
      '<div class="as-hud__prog"><div class="as-prog" aria-hidden="true">' + chips + '</div>' +
      '<span class="as-hud__n">' + (S.i + 1) + ' <span>/ ' + n + '</span></span></div>' +
      '</div>' +
      '<div class="as-gauges">' +
      gaugeCell('E', '감사증거', g.E, d.E) +
      gaugeCell('T', '감사시간', g.T, d.T) +
      gaugeCell('R', seatOf().trust, g.R, d.R) +
      gaugeCell('C', '회사 태도 · ' + window.SEASON.band(c), c, d.C) +
      '</div>';
    $('#hud-seat').textContent = seatOf().name;
  }

  /* ---------- 조서 ---------- */
  function cards(obj, cls) {
    return '<div class="as-cards">' + Object.keys(obj).map(function (l) {
      return '<div class="as-card ' + (cls || '') + '"><b>' + esc(l) + '</b><p>' + esc(obj[l].why) + '</p></div>';
    }).join('') + '</div>';
  }

  function events(list) {
    if (!list || !list.length) return '';
    return '<div class="as-events">' + list.map(function (e) {
      return '<div class="as-event as-event--' + e.kind + '">' + esc(e.text) + '</div>';
    }).join('') + '</div>';
  }

  // 조서에는 플레이어가 "알고 있는 것"만 보인다. 숨은 진실은 드러나지 않는다.
  function renderDossier() {
    var el = $('#dossier');
    if (!el || !S) return;
    var found = S.truths.filter(function (t) { return t.active && t.found; });
    var cleared = S.truths.filter(function (t) { return t.verified; });
    var flags = Object.keys(S.flags).map(function (k) { return window.SEASON.FLAG_TEXT[k] || k; });
    var c = S.rel.company;
    var nL = Object.keys(S.cards.learned).length, nR = Object.keys(S.cards.review).length;

    el.innerHTML =
      '<div class="as-dossier__head"><b>감사조서</b>' +
      '<span>시즌 ' + S.seed + ' · ' + esc(seatOf().name) + '</span>' +
      '<button id="btn-dclose" class="as-ghostbtn" type="button">닫기</button></div>' +

      '<div class="as-dsec"><div class="as-sec">회사의 태도</div>' +
      '<p>' + window.SEASON.band(c) + ' <span class="as-dim">(' + c + ')</span>' +
      (c < 35 ? ' — 자료 제출이 늦어지고 있다' : c >= 65 ? ' — 협조적이다. 너무 편한 건 아닌지' : '') + '</p></div>' +

      '<div class="as-dsec"><div class="as-sec">발견한 사항</div>' + (found.length
        ? '<ul>' + found.map(function (t) {
            return '<li>' + esc(t.def.title) + ' <b>' + t.amount.toFixed(1) + '억원</b></li>';
          }).join('') + '</ul>'
        : '<p class="as-dim">아직 없다</p>') + '</div>' +

      (cleared.length ? '<div class="as-dsec"><div class="as-sec">확인 완료 · 이상 없음</div><ul>' +
        cleared.map(function (t) { return '<li>' + esc(t.def.short || t.def.title) + '</li>'; }).join('') +
        '</ul></div>' : '') +

      (flags.length ? '<div class="as-dsec"><div class="as-sec">진행 중</div><ul>' +
        flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +

      '<div class="as-dsec"><div class="as-sec">개념 카드 · 익힘 ' + nL + '</div>' +
        (nL ? cards(S.cards.learned) : '<p class="as-dim">논점을 제대로 짚으면 여기 쌓인다</p>') + '</div>' +
      (nR ? '<div class="as-dsec"><div class="as-sec">복습 카드 ' + nR + '</div>' +
        cards(S.cards.review, 'as-card--review') + '</div>' : '') +

      '<div class="as-dsec"><div class="as-sec">기록</div>' + (S.log.length
        ? '<ol class="as-timeline">' + S.log.map(function (l) {
            return '<li><div class="as-timeline__h"><span>' + esc(l.day) + '</span>' +
              '<b>' + esc(l.chapter) + '</b><em>' + l.percent + '</em></div>' +
              events(l.events) + '</li>';
          }).join('') + '</ol>'
        : '<p class="as-dim">시즌이 막 시작되었다</p>') + '</div>';

    var x = $('#btn-dclose');
    if (x) x.onclick = function () { el.hidden = true; };
  }

  /* ============================================================
     화면 02 — 플레이
     ============================================================ */
  function start(seed, seat, company) {
    var o = {};
    if (seed != null) o.seed = seed;
    o.seat = seat || (load().seat) || 'senior';
    o.company = company || (load().company) || window.COMPANY_DEFAULT;
    S = window.SEASON.create(o);
    step();
  }

  function step(delta) {
    var sc = window.SEASON.nextScene(S);
    if (!sc) return ending();
    var it = window.SEASON.resolve(sc, S);
    cur = { it: it, results: [], texts: [], left: [], over: 0, timedOut: false };

    var ex = (it.exhibits || []).slice();
    var side = null;
    for (var i = 0; i < ex.length; i++) {
      if (ex[i].type === 'kv') { side = ex.splice(i, 1)[0]; break; }
    }

    $('#play-body').innerHTML =
      '<div class="as-frame">' +
      '<div class="as-hud" id="hud"></div>' +
      wpHead(sc, it) +

      '<div class="as-stage"><div class="as-stage__box">' +
      '<div class="as-art">' + window.ART.scene(sc.art) + '</div>' +
      '<div class="as-stage__veil"></div>' +
      tags([{ text: 'SCENE ' + ('0' + (S.i + 1)).slice(-2) + ' · ' + sc.area }].concat(
        it.v && it.v.label ? [{ text: it.v.label, red: true, live: true }] : [])) +
      marks(sc) +
      dialog(it.speaker, it.line) +
      '</div></div>' +

      (it.note ? '<div class="as-note"><span class="as-k">여파</span><span>' + esc(it.note) + '</span></div>' : '') +

      '<div class="as-brief">' +
      '<div class="as-brief__main"><div class="as-sec">상황</div>' +
      (it.situation ? '<p class="as-p">' + esc(it.situation) + '</p>' : '<p class="as-p as-dim">—</p>') +
      '</div><div class="as-brief__side">' +
      (side ? figs(side.items, side.title)
            : figs([['피감사회사', S.co.name], ['영역', sc.area],
                    ['기준서', (sc.standards || []).join(' · ')],
                    ['수행중요성', S.co.pm + '억원']], '이 장면')) +
      '</div></div>' +

      (ex.length ? '<div class="as-docs">' + ex.map(function (x, k) {
        return docCell(x, window.SEASON.KEYS[k] || (k + 1));
      }).join('') + '</div>' : '') +

      '<div id="parts"></div></div>';

    renderHud(delta);
    renderDossier();
    show('play');
    renderPart(0);
  }

  /* ---------- 칸 ---------- */
  function renderTimer(pi, left, total, done) {
    var box = $('#tmr-' + pi);
    if (!box) return;
    var warn = !done && left <= 20;
    box.className = 'as-timer' + (warn ? ' as-timer--warn' : '') + (done ? ' as-timer--done' : '');
    box.innerHTML = window.ART.timer(total ? left / total : 0, warn) +
      '<div><span class="as-k">남은 시간</span>' +
      '<span class="as-timer__num">' + mmss(left) + '</span></div>' +
      (warn ? '<span class="as-timer__warn">시간 초과 시<br>자동 제출</span>' : '');
  }

  function renderCount(pi, p, n) {
    var el = $('#cc-' + pi), bar = $('#bar-' + pi);
    if (!el) return;
    var tone = n > p.maxChars * 1.15 ? 'over' : n > p.maxChars ? 'warn' : '';
    el.className = 'as-answer__cnt ' + tone;
    el.innerHTML = '<b>' + n + '</b> / ' + p.maxChars + '자';
    bar.className = tone;
    bar.style.width = Math.min(100, n / p.maxChars * 100) + '%';
  }

  function renderPart(pi) {
    var p = cur.it.parts[pi];
    var box = document.createElement('div');
    box.className = 'as-task';
    box.id = 'part-' + pi;
    box.innerHTML =
      ask(p.who, p.say) +

      '<div class="as-task__head">' +
      '<span class="as-task__no">문항 ' + esc(p.key) + '</span>' +
      // 칸 점수는 100점으로 환산해 보여 준다 (실제 배점은 논점 수에 따라 다르다)
      '<span class="as-task__meta">배점 100 · 권장 ' + p.maxChars + '자</span>' +
      '<span class="as-task__n">' + (pi + 1) + ' / ' + cur.it.parts.length + '</span></div>' +

      '<p class="as-task__q">' + esc(p.ask) + '</p>' +

      (p.verdict ? '<div class="as-warnbar"><i></i><span>판단(해당한다 / 해당하지 않는다)을 ' +
        '문장 안에 반드시 쓰십시오. 틀리면 근거는 채점되지 않습니다.</span></div>' : '') +

      '<div class="as-answer">' +
      '<div class="as-answer__head"><span class="as-k">답안 작성</span>' +
      '<span class="as-answer__cnt" id="cc-' + pi + '"><b>0</b> / ' + p.maxChars + '자</span>' +
      '<span class="as-answer__bar"><i id="bar-' + pi + '" style="width:0"></i></span></div>' +
      '<textarea class="as-answer__input" id="ans-' + pi + '" rows="4" spellcheck="false" ' +
      'placeholder="짧게 한두 문장으로. 서술어로 끝맺으세요."></textarea>' +
      '<div class="as-answer__foot"><span>단축키 ⌘/Ctrl + Enter 제출</span>' +
      '<span>서술어로 끝맺을 것 · 나열은 75% 상한</span></div></div>' +

      '<div class="as-submit">' +
      '<button class="as-btn as-btn--red as-btn--grow" id="go-' + pi + '" type="button">' +
      '<span>답하기</span><span class="as-btn__sub">ANSWER →</span></button>' +
      '<div class="as-timer" id="tmr-' + pi + '"></div></div>' +

      '<div id="micro-' + pi + '"></div>';
    $('#parts').appendChild(box);

    var ta = $('#ans-' + pi);
    ta.addEventListener('input', function () {
      renderCount(pi, p, ta.value.replace(/\s/g, '').length);
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitPart(pi, false); }
    });
    $('#go-' + pi).addEventListener('click', function () { submitPart(pi, false); });
    if (pi > 0) bring(box);
    ta.focus();

    var left = cur.left[pi] = p.timeLimit;
    renderTimer(pi, left, p.timeLimit, false);
    clearInterval(timer);
    timer = setInterval(function () {
      cur.left[pi] = --left;
      if (!$('#tmr-' + pi) || cur.results[pi]) { clearInterval(timer); return; }
      renderTimer(pi, left, p.timeLimit, false);
      if (left <= 0) { clearInterval(timer); submitPart(pi, true); }
    }, 1000);
  }

  function submitPart(pi, timedOut) {
    if (cur.results[pi]) return;          // 두 번 제출 방지
    clearInterval(timer);
    var p = cur.it.parts[pi];
    var text = $('#ans-' + pi).value;
    var g = window.AE.gradeParts([{ text: text }], [p], p.form);
    if (timedOut) {
      var cut = Math.round(g.max * 0.05);
      g.total = Math.max(0, g.total - cut);
      g.parts[0].total = Math.max(0, g.parts[0].total - cut);
      g.percent = g.max ? Math.round(g.total / g.max * 100) : 0;
      g.flags.push('시간 초과 자동 제출 → 5% 차감');
      cur.timedOut = true;
    }
    cur.over += Math.max(0, text.replace(/\s/g, '').length - p.maxChars * 1.15);
    cur.results[pi] = g;
    cur.texts[pi] = text;

    $('#ans-' + pi).disabled = true;
    $('#go-' + pi).disabled = true;
    renderTimer(pi, timedOut ? 0 : Math.max(0, cur.left[pi] || 0), p.timeLimit, true);
    renderMicro(pi, p, g);

    if (pi + 1 < cur.it.parts.length) renderPart(pi + 1);
    else finishScene();
  }

  function vtext(x) { return x === 'yes' ? '해당한다' : x === 'no' ? '해당하지 않는다' : '미기재'; }

  /* ---------- 화면 03 · 칸 판정 ---------- */
  var MARK = {
    got:     { mk: '○', aria: '획득', cls: 'got' },
    partial: { mk: '△', aria: '부분 인정', cls: 'partial' },
    miss:    { mk: '✕', aria: '미언급', cls: 'miss' },
    void:    { mk: '✕', aria: '무효', cls: 'void' },
    bonus:   { mk: '＋', aria: '가점', cls: 'bonus' },
    wrong:   { mk: '⚠', aria: '오개념 감점', cls: 'wrong' }
  };

  function issueRow(kind, label, meta, score, i, extra) {
    var m = MARK[kind];
    return '<div class="as-issue as-issue--' + m.cls + '" style="animation-delay:' + (0.06 * i).toFixed(2) + 's">' +
      '<span class="as-issue__mk" role="img" aria-label="' + m.aria + '">' + m.mk + '</span>' +
      '<div><div class="as-issue__lab">' + label + (extra || '') + '</div>' +
      (meta ? '<div class="as-issue__meta">' + meta + '</div>' : '') + '</div>' +
      '<span class="as-issue__sc">' + score + '</span></div>';
  }

  function scaleBar(gr) {
    var all = ['S', 'A', 'B', 'C', 'D'];
    return '<div class="as-scale" aria-hidden="true">' + all.map(function (x) {
      return '<i class="' + (x === gr ? 'on' : '') + '"></i>';
    }).join('') + '</div><div class="as-scale__lab" aria-hidden="true">' + all.map(function (x) {
      return '<span class="' + (x === gr ? 'on' : '') + '">' + x + '</span>';
    }).join('') + '</div>';
  }

  function verdictHead(opts) {
    var gr = letter(opts.percent), bad = opts.percent < 60;
    return '<div class="as-verdict__head">' +
      '<div class="as-scan" aria-hidden="true"><i></i></div>' +
      '<div class="as-score"><div class="as-sec">' + esc(opts.label) + '</div>' +
      '<div class="as-score__row"><span class="as-score__n">' + opts.percent + '</span>' +
      '<span class="as-score__max">/ 100</span>' +
      '<span class="as-grade' + (bad ? ' as-grade--red' : '') + (opts.small ? ' as-grade--sm' : '') +
      '" role="img" aria-label="등급 ' + gr + '">' + gr + '</span></div>' +
      scaleBar(gr) + '</div>' +
      '<div class="as-verdict__side">' + opts.side + '</div></div>';
  }

  function renderMicro(pi, part, g) {
    var pp = g.parts[0], r = pp.res, i = 0;
    var rows = r.must.map(function (m, k) {
      var kind = m.hit ? 'got' : m.partial ? 'partial' : m.negated ? 'void' : 'miss';
      var meta = m.negated ? '부정문으로 서술되어 무효 · 판정하지 않았습니다'
        : m.nearMiss ? '맥락 연결 부족 · 다른 논점과 이어 쓰지 않았습니다'
        : m.partial ? '핵심어는 있으나 한정어가 빠짐 · 절반'
        : (!m.hit && m.hint) ? esc(m.hint)
        : '';
      var why = m.why
        ? '<button class="as-why" type="button" aria-expanded="false" data-why="' + pi + '-' + k + '">왜?</button>' +
          '<div class="as-whybox" id="why-' + pi + '-' + k + '" hidden>' + esc(m.why) + '</div>'
        : '';
      var sc = m.hit ? '+' + m.score : m.partial ? '+' + Math.round(m.score / 2) +
        ' <span class="as-dim">/ ' + m.score + '</span>' : '0';
      return issueRow(kind, esc(m.label), meta, sc, i++, why);
    }).join('') +
      (r.bonus || []).filter(function (b) { return b.hit; }).map(function (b) {
        return issueRow('bonus', esc(b.label), '가점', '+' + b.score, i++);
      }).join('') +
      (r.trap || []).filter(function (t) { return t.hit; }).map(function (t) {
        return issueRow('wrong', esc(t.label), '오개념 감점 · ' + seatOf().trust + ' 하락', t.score, i++);
      }).join('');

    var side =
      (pp.verdict
        ? '<div class="as-judge' + (pp.verdict.correct ? '' : ' as-judge--bad') + '">' +
          '<div class="as-k">판단 정오</div>' +
          '<b>판단 ' + vtext(pp.verdict.given) + ' · 정답 ' + vtext(pp.verdict.expected) + '</b>' +
          '<p>' + (pp.verdict.correct
            ? '판단이 정확하므로 근거 서술 전체가 채점 대상에 포함되었습니다.'
            : '판단이 틀려 근거 서술은 채점되지 않았습니다.') + '</p></div>'
        : '') +
      react(part.who, reactionFor(part, g)) +
      (g.flags.length ? '<div class="as-flags">' + g.flags.map(function (f, k) {
        return '<div class="as-flag' + (/차감|초과/.test(f) ? ' as-flag--red' : '') +
          '" style="animation-delay:' + (0.26 + k * 0.06).toFixed(2) + 's">' +
          '<span>FLAG ' + (k + 1) + '</span><span>' + esc(f) + '</span></div>';
      }).join('') + '</div>' : '');

    $('#micro-' + pi).innerHTML =
      '<div class="as-verdict as-verdict--part" aria-live="polite">' +
      verdictHead({ label: '문항 ' + part.key + ' · 판정', percent: g.percent, side: side, small: true }) +
      '<div class="as-issues"><div class="as-issues__head">' +
      '<span class="as-sec">논점 채점</span><span class="as-k">' +
      '획득 ' + r.must.filter(function (m) { return m.hit; }).length +
      ' · 부분 ' + r.must.filter(function (m) { return m.partial; }).length +
      ' · 미언급 ' + r.must.filter(function (m) { return !m.hit && !m.partial; }).length + '</span></div>' +
      rows +
      '<p class="as-crit">이 칸은 ' + r.must.map(function (m) {
        return '「' + esc(m.label) + '」';
      }).join(', ') + '을 중심으로 채점했습니다.</p></div></div>';

    $$('.as-why', $('#micro-' + pi)).forEach(function (b) {
      b.addEventListener('click', function () {
        var w = $('#why-' + b.getAttribute('data-why'));
        w.hidden = !w.hidden;
        b.setAttribute('aria-expanded', String(!w.hidden));
      });
    });
  }

  /* ---------- 장면 정산 ---------- */
  function chip(label, n) {
    return '<span class="as-chip ' + (n <= -30 ? 'as-chip--crash' : n > 0 ? 'as-chip--up' : n < 0 ? 'as-chip--down' : '') +
      '">' + esc(label) + ' <b>' + sign(n) + '</b></span>';
  }

  function finishScene() {
    var it = cur.it;
    var total = 0, max = 0, flags = [];
    cur.results.forEach(function (g) { total += g.total; max += g.max; flags = flags.concat(g.flags); });
    var res = { parts: cur.results.map(function (g) { return g.parts[0]; }),
                total: total, max: max, percent: max ? Math.round(total / max * 100) : 0, flags: flags };
    var out = window.SEASON.apply(S, it, cur.texts, res, { over: cur.over, timedOut: cur.timedOut });

    renderHud(out.delta);
    renderDossier();

    var nx = window.SEASON.nextScene(S), last = !nx;
    var total = window.SEASON.sceneList(S).length;
    var d = out.delta;
    var side =
      '<div class="as-k">게이지 변화</div>' +
      '<div class="as-chips">' + chip('감사증거', d.E) + chip('감사시간', d.T) +
      chip(seatOf().trust, d.R) + chip('회사 태도', d.C) + '</div>' +
      events(out.events);

    var box = document.createElement('div');
    box.className = 'as-verdict as-verdict--scene';
    box.id = 'summary';
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      verdictHead({ label: '장면 ' + ('0' + (S.i + 1)).slice(-2) + ' · ' + it.sc.chapter + ' · 정산',
                    percent: res.percent, side: side }) +

      '<details class="as-model"><summary><span class="as-k">모범답안</span>' +
      '<span>펼쳐보기</span><span class="as-model__plus">+</span></summary>' +
      '<div class="as-model__body">' +
      it.parts.map(function (p, k) {
        return '<p class="as-model__p"><b>문항 ' + esc(p.key) + '</b>' + esc(p.model) + '</p>';
      }).join('') +
      (it.sc.ref ? '<div class="as-model__ref">' + esc(it.sc.ref) + '</div>' : '') +
      '</div></details>' +

      '<div class="as-verdict__foot">' +
      '<button class="as-btn as-btn--ink as-btn--grow" id="btn-next" type="button"><span>' +
      (last ? '감사보고서 발행' : '다음 장면 · ' + esc(nx.chapter)) + '</span>' +
      '<span class="as-btn__sub">' + (last ? 'ENDING' : ('0' + (S.i + 2)).slice(-2) + ' / ' + total) + ' →</span></button>' +
      '<button class="as-btn as-btn--out" id="btn-c1" type="button">첨삭 요청문 복사</button></div>';
    $('#parts').appendChild(box);

    $('#btn-next').addEventListener('click', next);
    $('#btn-c1').addEventListener('click', function () {
      copyOut(feedback([S.results[S.results.length - 1]]), this);
    });
    bring(box);

    var toast = (out.events || []).filter(function (e) { return e.kind === 'flag' || e.kind === 'found'; })[0];
    if (toast) setTimeout(function () { showToast(toast); }, 900);
  }

  /* ---------- 화면 05 · 전환 연출 ---------- */
  function showToast(e) {
    var el = $('#fx-toast');
    el.innerHTML = '<span class="as-toast__k">' + (e.kind === 'found' ? '단서<br>확보' : '분기<br>획득') +
      '</span><span class="as-toast__t">' + esc(e.text) + '</span>';
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.hidden = true; }, still() ? 3000 : 7000);
  }

  function wipe(sc, done) {
    if (still()) { done(); return; }
    var el = $('#fx-wipe');
    el.innerHTML =
      '<span class="as-wipe__k">기준일 이동</span>' +
      '<span class="as-wipe__d">' + esc(sc.day) + '</span>' +
      '<span class="as-wipe__line"></span>' +
      '<span class="as-wipe__t">장면 ' + ('0' + (S.i + 1)).slice(-2) + ' · ' + esc(sc.chapter) + '</span>';
    el.hidden = false;
    clearTimeout(wipeT);
    wipeT = setTimeout(function () { el.hidden = true; done(); }, 1600);
  }

  function next() {
    var d = S.results.length ? S.results[S.results.length - 1].delta : null;
    S.i++;
    var nx = window.SEASON.nextScene(S);
    if (!nx) return ending();
    wipe(nx, function () { step(d); });
  }

  /* ============================================================
     화면 04 — 엔딩 (1년 뒤)
     ============================================================ */
  var STATE_TEXT = {
    found: '발견 · 회사가 수정 거부',
    fixed: '발견 · 수정됨',
    missed: '미발견 → 1년 뒤 드러남',
    cleared: '없었음 · 확인 완료',
    lucky: '없었음 · 확인하지 않음 (운)'
  };
  var TONE_CLASS = { ok: 'as-ending--ok', warn: 'as-ending--warn', bad: 'as-ending--bad' };

  function finalCell(label, v, tone) {
    return '<div class="as-final__cell"><span class="as-k">' + esc(label) + '</span>' +
      '<div class="as-final__v' + (tone === 'bad' || tone === 'crash' ? ' bad' : '') + '">' + v + '</div>' +
      '<span class="as-final__bar"><i class="' + (tone || '') + '" style="width:' +
      Math.max(0, Math.min(100, v)) + '%"></i></span></div>';
  }

  function ending() {
    clearInterval(timer);
    var E = window.SEASON.epilogue(S), g = S.gauge, a = E.audit;
    var sum = 0; S.results.forEach(function (r) { sum += r.res.percent; });
    var avg = Math.round(sum / S.results.length * 10) / 10;
    var dec = S.decision, seed = S.seed, seat = S.seat, coId = S.company;
    var no = 0;
    window.EPILOGUE.audit.forEach(function (x, k) { if (x.id === a.id) no = k + 1; });

    var areas = {};
    S.results.forEach(function (r) {
      var k = r.it.sc.area;
      areas[k] = areas[k] || { s: 0, n: 0 };
      areas[k].s += r.res.percent; areas[k].n++;
    });
    var bars = Object.keys(areas).map(function (k) { return { k: k, p: Math.round(areas[k].s / areas[k].n) }; })
      .sort(function (x, y) { return x.p - y.p; });

    var others = Object.keys(window.SEASON.SEATS).filter(function (k) { return k !== seat; });

    $('#end-body').innerHTML =
      '<div class="as-ending ' + (TONE_CLASS[a.tone] || 'as-ending--bad') + '">' +

      '<div class="as-ending__hero">' +
      '<div class="as-art">' + window.ART.scene('review') + '</div>' +
      '<div class="as-ending__veil"></div>' +
      '<span class="as-ending__no">ENDING ' + ('0' + no).slice(-2) + ' / ' +
      ('0' + window.EPILOGUE.audit.length).slice(-2) + '</span>' +
      '<div class="as-ending__stamp"><div><b>' + esc(a.title) + '</b>' +
      '<span>1년 뒤 · 감리</span></div></div>' +
      '<span class="as-ending__cap">시즌 ' + seed + ' · ' + esc(seatOf().name) + ' · 감리 결과</span>' +
      '</div>' +

      '<div class="as-ending__body">' +
      '<div class="as-ending__rule"><span>1년 뒤</span><i></i><span>감리 심의</span></div>' +
      '<h2 class="as-ending__t">' + esc(a.title) + '</h2>' +
      '<p class="as-ending__p">' + esc(a.text) + '</p>' +
      '<p class="as-ending__p">' + esc(E.company.text) + '</p>' +
      '<p class="as-ending__p">' + esc(E.career.text) + '</p>' +

      '<div class="as-final">' +
      finalCell('감사증거', g.E, gaugeTone('E', g.E)) +
      finalCell('감사시간', g.T, gaugeTone('T', g.T)) +
      finalCell(seatOf().trust, g.R, gaugeTone('R', g.R)) +
      finalCell('회사 태도', S.rel.company, gaugeTone('C', S.rel.company)) +
      finalCell('답안 평균', avg, avg < 60 ? 'bad' : '') +
      '</div>' +

      '<div class="as-colsec">이번 시즌의 진실</div>' +
      '<p class="as-p" style="padding:14px 0 16px">찾은 것 <b>' + E.found.toFixed(1) + '억원</b> · ' +
      '놓친 것 <b>' + E.missed.toFixed(1) + '억원</b>' +
      (dec ? ' · 확인한 사실에 비춘 정답 의견 <b>' + esc(dec.kind) + '</b> — ' +
        (S.opinionOK ? '맞힘' : '틀림') : '') + '</p>' +
      E.rows.map(function (r) {
        return '<div class="as-truth as-truth--' + r.state + '"><div class="as-truth__h">' +
          '<b>' + esc(r.title) + '</b><span>' + (r.active ? r.amount.toFixed(1) + '억원' : '—') + '</span>' +
          '<em>' + STATE_TEXT[r.state] + '</em></div>' +
          '<p>' + esc(r.text) + '</p>' +
          (r.state === 'missed' || r.state === 'lucky'
            ? '<p class="how">어떻게 찾았어야 했나 — ' + esc(r.how) + '</p>' : '') +
          '</div>';
      }).join('') +

      '<div class="as-cols" style="margin-top:36px"><div>' +
      '<div class="as-colsec">영역별 성취</div><div class="as-bars">' +
      bars.map(function (x, k) {
        var bad = x.p < 60;
        return '<div><span>' + esc(x.k) + '</span>' +
          '<span class="as-bars__t"><i class="' + (bad ? 'bad' : '') + '" style="width:' + x.p +
          '%;animation-delay:' + (0.1 + k * 0.08).toFixed(2) + 's"></i></span>' +
          '<span class="as-bars__v' + (bad ? ' bad' : '') + '">' + x.p + '</span></div>';
      }).join('') + '</div>' +

      '<div class="as-colsec">오답노트 · 복습 카드 ' + E.review + '장</div>' +
      (E.review ? cards(S.cards.review, 'as-card--review')
                : '<p class="as-p as-dim" style="padding-top:14px">놓친 개념이 없다.</p>') +
      '</div>' +

      '<div><div class="as-colsec">장면별 점수</div>' +
      '<table class="as-scenescore"><tbody>' +
      S.results.map(function (r, k) {
        var p = r.res.percent, bad = p < 60;
        return '<tr><td class="no">' + ('0' + (k + 1)).slice(-2) + '</td>' +
          '<td class="nm">' + esc(r.it.sc.chapter) + '</td>' +
          '<td class="sc' + (bad ? ' bad' : '') + '">' + p + '</td>' +
          '<td class="bar"><span><i class="' + (bad ? 'bad' : '') + '" style="width:' + p + '%"></i></span></td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="as-scenescore__sum"><span class="as-sec">평균</span><b>' + avg.toFixed(1) + '</b></div>' +

      (dec ? '<div class="as-opinion"><span class="as-k">표명한 감사의견</span>' +
        '<b>' + esc(dec.kind) + '</b><p>' +
        (S.opinionOK
          ? '확인한 사실에 비추어 타당한 의견이었습니다. 감사증거 ' + g.E + ' · 미수정왜곡표시 ' +
            (S.mis ? S.mis.total.toFixed(1) : '0.0') + '억원.'
          : '확인한 사실에 비추어 타당하지 않은 의견이었습니다. 조서에 적어 둔 것과 결론이 어긋났습니다.') +
        '</p></div>' : '') + '</div></div>' +

      '<div class="as-colsec" style="margin-top:36px">내가 내린 결정들</div>' +
      '<ol class="as-timeline">' + S.log.map(function (l) {
        return '<li><div class="as-timeline__h"><span>' + esc(l.day) + '</span>' +
          '<b>' + esc(l.chapter) + '</b><em>' + l.percent + '</em></div>' + events(l.events) + '</li>';
      }).join('') + '</ol>' +

      '<details class="as-model as-model--flat"><summary><span class="as-k">익힌 개념</span>' +
      '<span>' + E.learned + '장 펼쳐보기</span><span class="as-model__plus">+</span></summary>' +
      '<div class="as-model__body">' +
      (E.learned ? cards(S.cards.learned)
                 : '<p class="as-p as-dim">이번 시즌에 익힌 개념이 없다.</p>') + '</div></details>' +

      '<div class="as-row" style="margin-top:32px">' +
      '<button class="as-btn as-btn--red as-btn--grow" id="btn-ca" type="button">' +
      '<span>전체 첨삭 요청 복사</span><span class="as-btn__sub">COPY</span></button>' +
      '<button class="as-btn as-btn--out" id="btn-same" type="button">같은 시즌 다시</button>' +
      others.map(function (k) {
        return '<button class="as-btn as-btn--out seat-again" type="button" data-seat="' + k + '">같은 시즌을 ' +
          esc(window.SEASON.SEATS[k].name) + '로</button>';
      }).join('') +
      '<button class="as-btn as-btn--out" id="btn-new" type="button">새 시즌</button></div>' +
      '<textarea id="outbox" class="as-out" readonly hidden></textarea>' +
      '</div></div>';

    $('#btn-ca').addEventListener('click', function () { copyOut(feedback(S.results), this); });
    $('#btn-same').addEventListener('click', function () { start(seed, seat); });
    $$('.seat-again').forEach(function (b) {
      b.addEventListener('click', function () { start(seed, b.getAttribute('data-seat'), coId); });
    });
    $('#btn-new').addEventListener('click', function () { start(null, seat, coId); });

    var db = load();
    db.history = (db.history || []).concat([{ t: Date.now(), seed: seed, seat: seat, company: coId,
      end: a.title, tone: a.tone, avg: avg, found: E.found, missed: E.missed }]).slice(-30);
    save(db);
    show('end');
  }

  /* ---------- 첨삭 요청 ---------- */
  function feedback(rows) {
    var L = [];
    L.push('아래는 CPA 2차 회계감사 답안 연습 결과입니다. 실제 2차 채점 기준으로 첨삭해 주세요.');
    L.push('요청: ① 누락 논점 ② 틀리거나 위험한 서술 ③ 답안 표현·구조 교정 ④ 실제라면 몇 점인지');
    L.push('좌석: ' + seatOf().name + ' (' + seatOf().role + ')');
    L.push('='.repeat(52));
    rows.forEach(function (r, i) {
      var sc = r.it.sc;
      L.push('');
      L.push('[' + (i + 1) + '] ' + sc.chapter + ' (' + sc.area + ')' + (r.it.v && r.it.v.label ? ' — ' + r.it.v.label : ''));
      L.push('기준서: ' + (sc.ref || (sc.standards || []).join(', ')));
      if (r.it.situation) { L.push('— 상황 —'); L.push(r.it.situation); }
      r.it.parts.forEach(function (p, k) {
        var pp = r.res.parts[k];
        L.push('');
        L.push(p.key + ' ' + p.ask);
        L.push('  내 답안: ' + ((r.texts[k] || '').trim() || '(무응답)'));
        if (pp && pp.verdict) L.push('  판단: 내 판단 ' + vtext(pp.verdict.given) + ' / 정답 ' + vtext(pp.verdict.expected));
        if (pp) {
          var hit = pp.res.must.filter(function (m) { return m.hit; }).map(function (m) { return m.label; });
          var half = pp.res.must.filter(function (m) { return m.partial; }).map(function (m) { return m.label; });
          var mis = pp.res.must.filter(function (m) { return !m.hit && !m.partial; }).map(function (m) { return m.label; });
          var tr = (pp.res.trap || []).filter(function (t) { return t.hit; }).map(function (t) { return t.label; });
          L.push('  자동채점: ' + pp.percent + '점');
          if (hit.length) L.push('    획득: ' + hit.join(' / '));
          if (half.length) L.push('    절반: ' + half.join(' / '));
          if (mis.length) L.push('    누락: ' + mis.join(' / '));
          if (tr.length) L.push('    감점: ' + tr.join(' / '));
        }
        L.push('  모범답안: ' + p.model);
      });
    });
    L.push('');
    L.push('='.repeat(52));
    L.push('※ 자동채점은 키워드 기반이라 오채점이 있을 수 있습니다. 정답인데 누락으로 잡힌 표현이 있으면 지적해 주세요.');
    return L.join('\n');
  }

  function copyOut(text, btn) {
    var lab = btn.querySelector('span') || btn;
    var old = lab.textContent;
    var done = function () {
      lab.textContent = '복사됨 ✓';
      setTimeout(function () { lab.textContent = old; }, 1600);
    };
    function fb() {
      var b = $('#outbox');
      if (!b) {
        b = document.createElement('textarea');
        b.id = 'outbox'; b.className = 'as-out'; b.readOnly = true;
        (btn.closest('section') || document.body).appendChild(b);
      }
      b.hidden = false; b.value = text; b.select();
      try { document.execCommand('copy'); done(); } catch (e) { lab.textContent = '↓ 아래에서 복사'; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb);
    else fb();
  }

  /* ============================================================
     화면 01 — 타이틀 / 홈
     ============================================================ */
  /* 조건부 장면이 있어서 시즌 길이가 고정이 아니다.
     업종 전용 장면까지 있으므로 회사를 정해야 길이를 셀 수 있다 */
  function sceneRange(coId) {
    var mine = window.SCENES.filter(function (s) {
      return !s.only || s.only.indexOf(coId) >= 0;
    });
    var fixed = mine.filter(function (s) { return !s.when; }).length;
    return (fixed === mine.length ? mine.length : fixed + '~' + mine.length) + ' SCENES';
  }

  /* 회사를 바꾸면 표지가 통째로 다시 그려진다. 그때 입력하던 시즌 코드를 잃지 않도록 */
  var seedDraft = '';

  function home() {
    clearInterval(timer);
    var db = load(), h = (db.history || []).slice().reverse();
    var cos = window.COMPANIES, seats = window.SEASON.SEATS;
    var coId = db.company && cos[db.company] ? db.company : window.COMPANY_DEFAULT;
    var c = cos[coId];
    var chosen = db.seat && seats[db.seat] ? db.seat : 'senior';
    var now = new Date();
    var today = now.getFullYear() + '. ' + pad2(now.getMonth() + 1) + '. ' + pad2(now.getDate()) + '.';

    $('#home-body').innerHTML =
      '<div class="as-title">' +

      '<div class="as-title__art">' +
      '<div class="as-art">' + window.ART.scene('tower') + '</div>' +
      '<div class="as-title__veil"></div>' +
      tags([{ text: 'CASE FILE · ' + c.market }, { text: '수임 검토', red: true }]) +
      '<div class="as-title__stamp"><div class="as-k">감사기준일</div><b>' + esc(dotDate(c.fy)) + '</b></div>' +
      '<div class="as-title__foot">' +
      '<div><div class="as-k">피감사회사</div><div class="as-title__co">' + esc(c.name) + '</div></div>' +
      '<div style="text-align:right"><div class="as-k">현재시각</div>' +
      '<div class="as-title__clock">' + clock(now) + '</div></div></div>' +
      '</div>' +

      '<div class="as-title__body">' +
      '<h1 class="as-logo">감사<br>시즌<span>·</span>2026</h1>' +
      '<div class="as-rule"><i></i><span>' + sceneRange(coId) + ' · ' +
      Object.keys(cos).length + ' CASES · ' +
      Object.keys(seats).length + ' SEATS · ' + window.EPILOGUE.audit.length + ' ENDINGS</span></div>' +

      '<p class="as-lead">' + esc(c.firm) + '에 ' + esc(c.name) + '(' + esc(c.market) + ', ' +
      esc(c.industry) + ') 감사가 배정됐다. 수임 검토부터 보고서 발행까지, 이번 시즌을 끌고 가는 것은 당신이다.</p>' +
      '<p class="as-lead">선택지는 없다. 모든 대응은 <strong>답안을 쓰는 것</strong>뿐이며, ' +
      '판단은 문장 안에 들어 있어야 인정된다.</p>' +
      '<p class="as-lead">이 회사에는 무언가가 숨어 있다. 무엇이 얼마나 숨어 있는지는 ' +
      '<strong>시즌마다 다르다.</strong> 짚은 만큼만 드러나고, 놓친 것은 1년 뒤 감리로 돌아온다.</p>' +
      '<p class="as-lead">거쳐 가는 장면도 시즌마다 다르다. 회사 사정에 따라 열리는 장면이 있고, ' +
      '<strong>내가 찾아냈을 때에만</strong> 열리는 장면이 있다.</p>' +

      '<div class="as-sec as-sec--rule">어느 회사를 맡겠나</div>' +
      '<div class="as-cos" role="group" aria-label="회사 선택">' +
      Object.keys(cos).map(function (k) {
        var o = cos[k];
        return '<button class="as-co" type="button" data-co="' + k + '" aria-pressed="' +
          (k === coId) + '"><b>' + esc(o.name) + '</b>' +
          '<u>' + esc(o.market) + ' · ' + esc(o.industry) + '</u>' +
          '<span>' + esc(o.hook) + '</span>' +
          '<em>중요성 ' + o.mat + '억원 · ' + esc(o.matBasis.split(' — ')[0]) + '</em></button>';
      }).join('') + '</div>' +
      '<p class="as-lead" style="margin-top:12px">회사가 바뀌면 <strong>묻는 논점</strong>이 바뀐다. ' +
      '제조는 재고를 세고, 바이오는 추정을 따지고, IT는 통제를 본다. ' +
      '중요성의 기준부터 다르다.</p>' +

      '<div class="as-sec as-sec--rule">어느 자리에 앉겠나</div>' +
      '<div class="as-seats" role="group" aria-label="좌석 선택">' +
      Object.keys(seats).map(function (k) {
        var s = seats[k];
        return '<button class="as-seat" type="button" data-seat="' + k + '" aria-pressed="' +
          (k === chosen) + '"><b>' + esc(s.name) + '</b><span>' + esc(s.role) + '</span>' +
          '<em>' + esc(s.hint) + '</em></button>';
      }).join('') + '</div>' +

      '<div class="as-sec as-sec--rule" style="margin-top:30px">게이지 4종</div>' +
      '<ul class="as-rulelist">' +
      '<li><b>감사증거</b><span>답안 수준만큼 쌓인다. 낮은 채로 마지막에 도달하면 범위제한이 강제된다.</span></li>' +
      '<li><b>감사시간</b><span>칸마다 줄고, 답이 길수록 더 준다. 0이 되면 마감 실패 엔딩.</span></li>' +
      '<li><b>신뢰</b><span>윗사람이 나의 판단을 믿는 정도. 오개념을 쓰면 급락한다.</span></li>' +
      '<li><b>회사 태도</b><span>강하게 짚을수록 진실에 가까워지지만 회사가 등을 돌린다.</span></li>' +
      '</ul>' +

      '<div class="as-seed"><label for="seed">시즌 코드</label>' +
      '<input id="seed" inputmode="numeric" maxlength="6" placeholder="비우면 무작위">' +
      '<em>같은 코드 = 같은 진실. 자리만 바꿔 다시 해볼 수 있다.</em></div>' +

      '<button class="as-btn as-btn--red as-btn--wide" id="btn-start" type="button">' +
      '<span>감사 착수</span><span class="as-btn__sub">' + today + ' →</span></button>' +

      (h.length ? '<div style="margin-top:36px"><div class="as-sec as-sec--rule">지난 플레이 기록</div>' +
        '<div class="as-scroll"><table class="as-record"><thead><tr>' +
        '<th>일시</th><th style="text-align:left">엔딩</th><th>회사</th><th>시즌</th><th>자리</th>' +
        '<th>찾음</th><th>놓침</th><th>평균</th></tr></thead><tbody>' +
        h.slice(0, 3).map(function (x) {
          var dt = new Date(x.t);
          return '<tr><td>' + pad2(dt.getMonth() + 1) + '.' + pad2(dt.getDate()) + ' ' + clock(dt) + '</td>' +
            '<td class="as-record__end t-' + (x.tone || '') + '">' + esc(x.end) + '</td>' +
            '<td>' + esc((cos[x.company] || {}).name || '') + '</td>' +
            '<td>' + (x.seed || '') + '</td>' +
            '<td>' + esc((seats[x.seat] || {}).name || '') + '</td>' +
            '<td>' + (x.found != null ? x.found.toFixed(1) : '') + '</td>' +
            '<td>' + (x.missed != null ? x.missed.toFixed(1) : '') + '</td>' +
            '<td class="as-record__avg">' + x.avg + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' : '') +

      '</div></div>';

    $('#seed').value = seedDraft;

    /* 회사는 표지·시즌 길이·중요성을 한꺼번에 바꾸므로 그 자리에서 다시 그린다 */
    $$('.as-co').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-pressed') === 'true') return;
        seedDraft = $('#seed').value || '';
        var d2 = load(); d2.company = b.getAttribute('data-co'); save(d2);
        home();
      });
    });
    $$('.as-seat').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.as-seat').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        chosen = b.getAttribute('data-seat');
        var d2 = load(); d2.seat = chosen; save(d2);
      });
    });
    $('#btn-start').addEventListener('click', function () {
      var v = ($('#seed').value || '').replace(/\D/g, '');
      seedDraft = '';
      start(v ? parseInt(v, 10) : null, chosen, coId);
    });
    show('home');
  }

  /* ---------- 시작 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var db = load();
    var theme = THEMES.indexOf(db.theme) >= 0 ? db.theme : 'auto';
    applyTheme(theme);

    $('#btn-theme').addEventListener('click', function () {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      applyTheme(theme);
      var d = load(); d.theme = theme; save(d);
    });
    $('#btn-quit').addEventListener('click', function () {
      if (!S || confirm('진행 중인 시즌을 버리고 처음으로 돌아갈까요?')) {
        S = null;
        clearInterval(timer);
        $('#fx-toast').hidden = true;
        home();
      }
    });
    $('#btn-dossier').addEventListener('click', function () {
      var el = $('#dossier');
      el.hidden = !el.hidden;
      if (!el.hidden) renderDossier();
    });
    home();
  });
})();
