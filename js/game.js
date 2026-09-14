/* ============================================================
   감사 시즌 2026 — 화면 (game.js)
   ------------------------------------------------------------
   로직은 js/season.js 에 있다. 이 파일은 그리기만 한다.
   디자인을 교체할 때는 이 파일의 render 계열 함수만 바꾸면 된다.

   흐름  장면 → 칸 ①(묻고 · 쓰고 · 바로 채점 · 반응) → 칸 ② → 칸 ③ → 장면 정산
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var STORE = 'auditSim.v5';
  var S = null, cur = null, timer = null;

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function mmss(s) { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + ('0' + (s % 60)).slice(-2); }
  function sign(n) { return (n > 0 ? '+' : '') + n; }
  function one(a) { return a[Math.floor(Math.random() * a.length)]; }
  function letter(p) { return p >= 90 ? 'S' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : 'D'; }
  function show(id) {
    ['home', 'play', 'end'].forEach(function (k) { $('#screen-' + k).hidden = (k !== id); });
    $('#btn-dossier').hidden = (id !== 'play');
    $('#hud-seat').hidden = (id !== 'play');
    if (id !== 'play') $('#dossier').hidden = true;
    window.scrollTo(0, 0);
  }
  function gz(v, label, tone) { return '<span class="gz">' + window.ART.ring(v, label, tone) + '</span>'; }
  function relTone(c) { return c < 35 ? 'var(--bad)' : c >= 65 ? 'var(--ok)' : 'var(--ink3)'; }
  function seatOf() { return window.SEASON.SEATS[S.seat]; }

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

  /* ---------- 자료 카드 ---------- */
  function exhibits(list) {
    if (!list || !list.length) return '';
    return list.map(function (x) {
      if (x.type === 'table') {
        return '<div class="ex"><div class="ex-t">' + esc(x.title) + '</div><div class="scroll"><table><thead><tr>' +
          x.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          x.rows.map(function (r) {
            return '<tr>' + r.map(function (c, i) {
              return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div></div>';
      }
      if (x.type === 'kv') {
        return '<div class="ex ex-kv"><div class="ex-t">' + esc(x.title) + '</div><dl>' +
          x.items.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') +
          '</dl></div>';
      }
      if (x.type === 'memo') {
        return '<div class="ex ex-memo"><div class="ex-tag">내부 자료</div><div class="ex-t">' + esc(x.title) +
          '</div><div class="ex-from">' + esc(x.from) + '</div><p>' + esc(x.body) + '</p></div>';
      }
      return '';
    }).join('');
  }

  function bubble(who, text) {
    var c = window.CAST[who] || window.CAST.manager;
    return '<div class="say">' + window.ART.avatar(c.avatar) +
      '<div class="bubble"><b>' + esc(c.name) + '</b><span>' + esc(c.role) + '</span>' +
      '<p>' + esc(text) + '</p></div></div>';
  }

  /* ---------- HUD · 조서 ---------- */
  function renderHud() {
    var sc = window.SCENES[Math.min(S.i, window.SCENES.length - 1)], g = S.gauge, c = S.rel.company;
    $('#hud-day').textContent = sc.day;
    $('#hud-ch').textContent = sc.chapter;
    $('#hud-n').textContent = (S.i + 1) + ' / ' + window.SCENES.length;
    $('#hud-seat').textContent = seatOf().name;
    $('#gauges').innerHTML =
      gz(g.E, '감사증거', 'var(--acc)') +
      gz(g.T, '감사시간', g.T < 30 ? 'var(--bad)' : 'var(--ok)') +
      gz(g.R, seatOf().trust, g.R < 40 ? 'var(--bad)' : 'var(--warn)') +
      gz(c, '회사 · ' + window.SEASON.band(c), relTone(c));
  }

  function cardList(obj, cls) {
    return Object.keys(obj).map(function (l) {
      return '<div class="card ' + (cls || '') + '"><b>' + esc(l) + '</b><p>' + esc(obj[l].why) + '</p></div>';
    }).join('');
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
      '<div class="dhead"><b>감사조서</b><span>시즌 ' + S.seed + ' · ' + esc(seatOf().name) + '</span>' +
      '<button id="btn-dclose" class="hbtn">닫기</button></div>' +
      '<div class="dsec"><h4>회사의 태도</h4><p>' + window.SEASON.band(c) + ' (' + c + ')' +
      (c < 35 ? ' — 자료 제출이 늦어지고 있다' : c >= 65 ? ' — 협조적이다. 너무 편한 건 아닌지' : '') + '</p></div>' +
      '<div class="dsec"><h4>발견한 사항</h4>' + (found.length
        ? '<ul>' + found.map(function (t) { return '<li>' + esc(t.def.title) + ' <b>' + t.amount.toFixed(1) + '억원</b></li>'; }).join('') + '</ul>'
        : '<p class="muted">아직 없다</p>') + '</div>' +
      (cleared.length ? '<div class="dsec"><h4>확인 완료 · 이상 없음</h4><ul>' +
        cleared.map(function (t) { return '<li>' + esc(t.def.short || t.def.title) + '</li>'; }).join('') + '</ul></div>' : '') +
      (flags.length ? '<div class="dsec"><h4>진행 중</h4><ul>' +
        flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="dsec"><h4>개념 카드 · 익힘 ' + nL + '</h4>' +
        (nL ? cardList(S.cards.learned) : '<p class="muted">논점을 제대로 짚으면 여기 쌓인다</p>') + '</div>' +
      (nR ? '<div class="dsec"><h4>복습 카드 ' + nR + '</h4>' + cardList(S.cards.review, 'review') + '</div>' : '') +
      '<div class="dsec"><h4>기록</h4>' + (S.log.length
        ? '<ol class="dlog">' + S.log.map(function (l) {
            return '<li><span>' + esc(l.day) + '</span> ' + esc(l.chapter) + ' · ' + l.percent + '점' +
              (l.events.length ? '<ul>' + l.events.map(function (e) {
                return '<li class="ev ' + e.kind + '">' + esc(e.text) + '</li>';
              }).join('') + '</ul>' : '') + '</li>';
          }).join('') + '</ol>'
        : '<p class="muted">시즌이 막 시작되었다</p>') + '</div>';
    var x = $('#btn-dclose');
    if (x) x.onclick = function () { el.hidden = true; };
  }

  /* ---------- 장면 ---------- */
  function start(seed, seat) {
    var o = {};
    if (seed != null) o.seed = seed;
    o.seat = seat || (load().seat) || 'senior';
    S = window.SEASON.create(o);
    step();
  }

  function step() {
    var sc = window.SCENES[S.i];
    var it = window.SEASON.resolve(sc, S);
    cur = { it: it, results: [], texts: [], over: 0, timedOut: false };

    renderHud();
    renderDossier();

    $('#play-body').innerHTML =
      '<div class="scene">' + window.ART.scene(sc.art) +
      '<div class="scene-tag">' + esc(sc.area) + '</div></div>' +
      (it.note ? '<div class="note"><b>여파</b>' + esc(it.note) + '</div>' : '') +
      bubble(it.speaker, it.line) +
      (it.situation ? '<p class="situation">' + esc(it.situation) + '</p>' : '') +
      exhibits(it.exhibits) +
      '<div id="parts"></div>';

    show('play');
    renderPart(0);
  }

  /* ---------- 칸 ---------- */
  function renderPart(pi) {
    var p = cur.it.parts[pi];
    var box = document.createElement('div');
    box.className = 'part';
    box.id = 'part-' + pi;
    box.innerHTML =
      bubble(p.who, p.say) +
      '<div class="pask"><span class="pkey">' + esc(p.key) + '</span><span>' + esc(p.ask) + '</span>' +
      '<em>' + (pi + 1) + ' / ' + cur.it.parts.length + '</em></div>' +
      (p.verdict ? '<div class="vhint">판단(해당한다 / 해당하지 않는다)을 <b>문장 안에</b> 쓰십시오. 판단이 틀리면 근거는 채점되지 않습니다.</div>' : '') +
      '<textarea id="ans-' + pi + '" placeholder="짧게 한두 문장으로. 서술어로 끝맺으세요."></textarea>' +
      '<div class="pmeta"><span id="cc-' + pi + '">0</span> / ' + p.maxChars + '자</div>' +
      '<div class="row"><button id="go-' + pi + '" class="btn primary">답하기</button>' +
      '<span class="tmr" id="tmr-' + pi + '"></span></div>' +
      '<div id="micro-' + pi + '"></div>';
    $('#parts').appendChild(box);

    var ta = $('#ans-' + pi);
    ta.addEventListener('input', function () {
      var n = ta.value.replace(/\s/g, '').length;
      var el = $('#cc-' + pi);
      el.textContent = n;
      el.className = n > p.maxChars * 1.15 ? 'over' : '';
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitPart(pi, false); }
    });
    $('#go-' + pi).addEventListener('click', function () { submitPart(pi, false); });
    if (pi > 0) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ta.focus();

    var left = p.timeLimit;
    $('#tmr-' + pi).textContent = mmss(left);
    clearInterval(timer);
    timer = setInterval(function () {
      left--;
      var el = $('#tmr-' + pi);
      if (!el) { clearInterval(timer); return; }
      el.textContent = mmss(left);
      el.className = 'tmr' + (left <= 15 ? ' warn' : '');
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
    $('#tmr-' + pi).textContent = '';
    $('#part-' + pi).classList.add('done');
    renderMicro(pi, p, g);

    if (pi + 1 < cur.it.parts.length) renderPart(pi + 1);
    else finishScene();
  }

  function vtext(x) { return x === 'yes' ? '해당한다' : x === 'no' ? '해당하지 않는다' : '미기재'; }

  function renderMicro(pi, part, g) {
    var pp = g.parts[0], r = pp.res;
    var items = r.must.map(function (m, k) {
      var cls = m.hit ? 'ok' : m.partial ? 'half' : 'miss';
      var mk = m.hit ? '○' : m.partial ? '◐' : '✕';
      var note = m.negated ? ' <em>부정문으로 서술되어 무효</em>'
        : m.nearMiss ? ' <em>맥락 연결 부족</em>'
        : m.partial ? ' <em>핵심어는 있으나 한정어가 빠짐 — 절반</em>'
        : (!m.hit && m.hint) ? ' <em>' + esc(m.hint) + '</em>' : '';
      var why = m.why
        ? '<button class="whybtn" data-why="' + pi + '-' + k + '">왜?</button>' +
          '<div class="why" id="why-' + pi + '-' + k + '" hidden>' + esc(m.why) + '</div>'
        : '';
      return '<li class="' + cls + '"><span class="mk">' + mk + '</span><span class="lb">' + esc(m.label) + note + why + '</span></li>';
    }).join('') +
      (r.bonus || []).filter(function (b) { return b.hit; }).map(function (b) {
        return '<li class="ok"><span class="mk">+</span><span class="lb">' + esc(b.label) + '</span></li>';
      }).join('') +
      (r.trap || []).filter(function (t) { return t.hit; }).map(function (t) {
        return '<li class="bad"><span class="mk">⚠</span><span class="lb">' + esc(t.label) + '</span></li>';
      }).join('');

    var verdict = pp.verdict
      ? '<div class="vres ' + (pp.verdict.correct ? 'ok' : 'bad') + '">판단 ' + vtext(pp.verdict.given) +
        ' · 정답 ' + vtext(pp.verdict.expected) + (pp.verdict.correct ? '' : ' — 근거는 채점되지 않았습니다') + '</div>'
      : '';

    var el = $('#micro-' + pi);
    el.innerHTML =
      '<div class="micro"><div class="micro-head"><span class="g-' + letter(g.percent) + '">' + letter(g.percent) + '</span>' +
      '<span class="sc">' + g.percent + '점</span></div>' +
      '<p class="react">' + esc((window.CAST[part.who] || {}).name || '') + ' — ' + esc(reactionFor(part, g)) + '</p>' +
      verdict +
      (g.flags.length ? '<ul class="flags">' + g.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      '<ul>' + items + '</ul>' +
      '<p class="crit">이 칸은 ' + r.must.map(function (m) { return '「' + esc(m.label) + '」'; }).join(', ') + '을 중심으로 채점했습니다.</p>' +
      '</div>';

    Array.prototype.forEach.call(el.querySelectorAll('.whybtn'), function (b) {
      b.addEventListener('click', function () {
        var w = $('#why-' + b.getAttribute('data-why'));
        w.hidden = !w.hidden;
      });
    });
  }

  /* ---------- 장면 정산 ---------- */
  function chip(label, n) {
    return '<span class="chip ' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + label + ' ' + sign(n) + '</span>';
  }

  function finishScene() {
    var it = cur.it;
    var total = 0, max = 0, flags = [];
    cur.results.forEach(function (g) { total += g.total; max += g.max; flags = flags.concat(g.flags); });
    var res = { parts: cur.results.map(function (g) { return g.parts[0]; }),
                total: total, max: max, percent: max ? Math.round(total / max * 100) : 0, flags: flags };
    var out = window.SEASON.apply(S, it, cur.texts, res, { over: cur.over, timedOut: cur.timedOut });

    renderHud();
    renderDossier();

    var d = out.delta, last = S.i + 1 >= window.SCENES.length;
    var box = document.createElement('div');
    box.className = 'res';
    box.id = 'summary';
    box.innerHTML =
      '<div class="res-head"><div class="score"><b>' + res.percent + '</b><span>/ 100 · 이 장면</span></div>' +
      '<div class="pct g-' + letter(res.percent) + '">' + letter(res.percent) + '</div></div>' +
      '<div class="after">' + chip('감사증거', d.E) + chip('감사시간', d.T) + chip(seatOf().trust, d.R) + chip('회사 태도', d.C) + '</div>' +
      (out.events.length ? '<ul class="evs">' + out.events.map(function (e) {
        return '<li class="ev ' + e.kind + '">' + esc(e.text) + '</li>';
      }).join('') + '</ul>' : '') +
      '<details class="model"><summary>모범답안</summary>' +
      it.parts.map(function (p) { return '<p><span class="mk2">' + esc(p.key) + '</span>' + esc(p.model) + '</p>'; }).join('') +
      '<div class="ref">' + esc(it.sc.ref || '') + '</div></details>' +
      '<div class="row"><button id="btn-next" class="btn primary">' +
      (last ? '감사보고서 발행 →' : '다음 · ' + esc(window.SCENES[S.i + 1].chapter) + ' →') + '</button>' +
      '<button id="btn-c1" class="btn ghost">이 장면 첨삭 요청 복사</button></div>';
    $('#parts').appendChild(box);

    $('#btn-next').addEventListener('click', next);
    $('#btn-c1').addEventListener('click', function () { copyOut(feedback([S.results[S.results.length - 1]]), this); });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function next() {
    S.i++;
    if (S.i >= window.SCENES.length) return ending();
    step();
  }

  /* ---------- 엔딩 ---------- */
  var STATE_TEXT = {
    found: '발견 · 회사가 수정 거부',
    fixed: '발견 · 수정됨',
    missed: '미발견 → 1년 뒤 드러남',
    cleared: '없었음 · 확인 완료',
    lucky: '없었음 · 확인하지 않음 (운)'
  };

  function ending() {
    clearInterval(timer);
    var E = window.SEASON.epilogue(S), g = S.gauge, a = E.audit;
    var sum = 0; S.results.forEach(function (r) { sum += r.res.percent; });
    var avg = Math.round(sum / S.results.length);
    var dec = S.decision, seed = S.seed, seat = S.seat;

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
      '<div class="scene">' + window.ART.scene('review') + '</div>' +
      '<div class="ending ' + a.tone + '"><div class="etag">1년 뒤 · 시즌 ' + seed + ' · ' + esc(seatOf().name) + '</div>' +
      '<h2>' + esc(a.title) + '</h2>' +
      '<p>' + esc(a.text) + '</p><p>' + esc(E.company.text) + '</p><p>' + esc(E.career.text) + '</p></div>' +

      '<div class="finalg">' +
      gz(g.E, '감사증거', 'var(--acc)') + gz(g.T, '감사시간', 'var(--ok)') +
      gz(g.R, seatOf().trust, 'var(--warn)') + gz(S.rel.company, '회사 태도', relTone(S.rel.company)) +
      gz(avg, '답안 평균', 'var(--ink3)') + '</div>' +

      '<h3>이번 시즌의 진실</h3>' +
      '<p class="muted">찾은 것 <b>' + E.found.toFixed(1) + '억원</b> · 놓친 것 <b>' + E.missed.toFixed(1) + '억원</b>' +
      (dec ? ' · 확인한 사실에 비춘 정답 의견 <b>' + esc(dec.kind) + '</b> — ' + (S.opinionOK ? '맞힘' : '틀림') : '') + '</p>' +
      '<div class="truths">' + E.rows.map(function (r) {
        return '<div class="truth ' + r.state + '"><div class="th"><b>' + esc(r.title) + '</b>' +
          '<span>' + (r.active ? r.amount.toFixed(1) + '억원' : '—') + '</span><em>' + STATE_TEXT[r.state] + '</em></div>' +
          '<p>' + esc(r.text) + '</p>' +
          (r.state === 'missed' || r.state === 'lucky' ? '<p class="how">어떻게 찾았어야 했나 — ' + esc(r.how) + '</p>' : '') +
          '</div>';
      }).join('') + '</div>' +

      '<h3>내가 내린 결정들</h3><ol class="timeline">' + S.log.map(function (l) {
        return '<li><span class="tday">' + esc(l.day) + '</span><b>' + esc(l.chapter) + '</b>' +
          '<span class="tpct">' + l.percent + '점</span>' +
          (l.events.length ? '<ul>' + l.events.map(function (e) {
            return '<li class="ev ' + e.kind + '">' + esc(e.text) + '</li>';
          }).join('') + '</ul>' : '') + '</li>';
      }).join('') + '</ol>' +

      '<h3>복습 카드 · ' + E.review + '장</h3>' +
      (E.review ? cardList(S.cards.review, 'review') : '<p class="muted">놓친 개념이 없다.</p>') +
      '<h3>익힌 개념 · ' + E.learned + '장</h3>' +
      (E.learned ? cardList(S.cards.learned) : '<p class="muted">이번 시즌에 익힌 개념이 없다.</p>') +

      '<h3>영역별</h3><div class="bars">' + bars.map(function (x) {
        return '<div class="bar"><span class="bl">' + esc(x.k) + '</span><span class="bt"><i style="width:' +
          x.p + '%"></i></span><span class="bv">' + x.p + '</span></div>';
      }).join('') + '</div>' +

      '<div class="row"><button id="btn-ca" class="btn primary">전체 첨삭 요청 복사</button>' +
      '<button id="btn-same" class="btn ghost">같은 시즌 다시</button>' +
      others.map(function (k) {
        return '<button class="btn ghost seat-again" data-seat="' + k + '">같은 시즌을 ' +
          esc(window.SEASON.SEATS[k].name) + '로</button>';
      }).join('') +
      '<button id="btn-new" class="btn ghost">새 시즌</button></div>' +
      '<textarea id="outbox" class="outbox" hidden readonly></textarea>';

    $('#btn-ca').addEventListener('click', function () { copyOut(feedback(S.results), this); });
    $('#btn-same').addEventListener('click', function () { start(seed, seat); });
    Array.prototype.forEach.call(document.querySelectorAll('.seat-again'), function (b) {
      b.addEventListener('click', function () { start(seed, b.getAttribute('data-seat')); });
    });
    $('#btn-new').addEventListener('click', function () { start(null, seat); });

    var db = load();
    db.history = (db.history || []).concat([{ t: Date.now(), seed: seed, seat: seat, end: a.title, tone: a.tone,
      avg: avg, found: E.found, missed: E.missed }]).slice(-30);
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
    var done = function () {
      var o = btn.textContent; btn.textContent = '복사됨 ✓';
      setTimeout(function () { btn.textContent = o; }, 1600);
    };
    function fb() {
      var b = $('#outbox');
      if (!b) { b = document.createElement('textarea'); b.id = 'outbox'; b.className = 'outbox'; b.readOnly = true; $('#screen-play').appendChild(b); }
      b.hidden = false; b.value = text; b.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '↓ 아래에서 복사'; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb);
    else fb();
  }

  /* ---------- 홈 ---------- */
  function home() {
    clearInterval(timer);
    var db = load(), h = (db.history || []).slice().reverse();
    var c = window.COMPANY, seats = window.SEASON.SEATS;
    var chosen = db.seat && seats[db.seat] ? db.seat : 'senior';

    $('#home-body').innerHTML =
      '<div class="scene">' + window.ART.scene('office') + '</div>' +
      '<div class="hero"><h2>감사 시즌 2026</h2>' +
      '<p>' + esc(c.firm) + '에 ' + esc(c.name) + '(' + esc(c.market) + ', ' + esc(c.industry) +
      ') 감사가 배정됐다. 수임 검토부터 보고서 발행까지, 이번 시즌을 끌고 간다.</p>' +
      '<p class="hero-sub">이 회사에는 무언가가 숨어 있다. 무엇이 얼마나 숨어 있는지는 <b>시즌마다 다르다.</b> ' +
      '모든 대응은 타이핑으로 한다. 짚은 만큼만 드러나고, 놓친 것은 1년 뒤에 돌아온다.</p>' +
      '<h3>어느 자리에 앉겠나</h3><div class="seats">' +
      Object.keys(seats).map(function (k) {
        var s = seats[k];
        return '<button class="seat' + (k === chosen ? ' on' : '') + '" data-seat="' + k + '">' +
          '<b>' + esc(s.name) + '</b><span>' + esc(s.role) + '</span><em>' + esc(s.hint) + '</em></button>';
      }).join('') + '</div>' +
      '<ul class="rules">' +
      '<li><b>감사증거</b> 답안 수준만큼 쌓인다. 낮으면 마지막에 범위제한이 된다</li>' +
      '<li><b>감사시간</b> 칸마다 줄고, 답이 길수록 더 준다. 0이 되면 마감 실패</li>' +
      '<li><b>신뢰</b> 윗사람의 신뢰. 오개념을 쓰면 급락한다</li>' +
      '<li><b>회사 태도</b> 강하게 짚을수록 진실에 가까워지지만 회사가 등을 돌린다</li>' +
      '</ul>' +
      '<div class="seedrow"><label>시즌 코드 <input id="seed" inputmode="numeric" maxlength="6" placeholder="비우면 무작위"></label>' +
      '<span class="muted">같은 코드 = 같은 진실. 자리만 바꿔 다시 해볼 수 있다.</span></div>' +
      '<button id="btn-start" class="btn primary big">감사 착수</button></div>' +
      (h.length ? '<h3>지난 시즌</h3><div class="scroll"><table class="tbl"><thead><tr><th>일시</th><th>시즌</th><th>자리</th><th>엔딩</th><th>찾음</th><th>놓침</th><th>평균</th></tr></thead><tbody>' +
        h.slice(0, 8).map(function (x) {
          var d = new Date(x.t);
          return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + '</td><td class="num">' + (x.seed || '') +
            '</td><td>' + esc((seats[x.seat] || {}).name || '') +
            '</td><td class="t-' + (x.tone || '') + '">' + esc(x.end) + '</td><td class="num">' + (x.found != null ? x.found.toFixed(1) : '') +
            '</td><td class="num">' + (x.missed != null ? x.missed.toFixed(1) : '') + '</td><td class="num">' + x.avg + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '');

    Array.prototype.forEach.call(document.querySelectorAll('.seat'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.seat'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        chosen = b.getAttribute('data-seat');
        var d2 = load(); d2.seat = chosen; save(d2);
      });
    });
    $('#btn-start').addEventListener('click', function () {
      var v = ($('#seed').value || '').replace(/\D/g, '');
      start(v ? parseInt(v, 10) : null, chosen);
    });
    show('home');
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#btn-quit').addEventListener('click', function () {
      if (!S || confirm('진행 중인 시즌을 버리고 처음으로 돌아갈까요?')) { S = null; home(); }
    });
    $('#btn-dossier').addEventListener('click', function () {
      var el = $('#dossier');
      el.hidden = !el.hidden;
      if (!el.hidden) renderDossier();
    });
    home();
  });
})();
