/* ============================================================
   감사 시즌 2026 — 메신저 (messenger.js)
   ------------------------------------------------------------
   장면과 장면 사이에 끼어드는 대화. 무엇을 보여 줄지는 js/story.js 가 정하고
   이 파일은 그리기만 한다.

     MESSENGER.play(beats, S, { onChoice(beat, i) → 결과, onSeen(beat), onDone() })

   조작  Enter · Space  입력 중이면 끝까지 넘기기 / 다 나왔으면 다음
         1 · 2 · 3      답장 고르기
         Esc            대화 건너뛰기 (고르지 않은 선택은 그냥 지나간다)
   ============================================================ */
(function (global) {
  'use strict';

  var FX = global.FX, STORY = global.STORY, ART = global.ART;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cast(k) { return (global.CAST || {})[k] || { name: k, role: '' }; }
  function signed(n) { return n > 0 ? '+' + n : '−' + Math.abs(n); }

  var isOpen = false;

  function roomIcon(b) {
    if (b.room === 'team') return '<span class="mr-ic">#</span>';
    if (b.room === 'talk') return '<span class="mr-ic talk">◎</span>';
    return ART.face(b.who, null, 'mr-av');
  }
  function roomSub(b) {
    if (b.room === 'team') return '정한별 · 유가온 · 한결 · 심규리';
    if (b.room === 'talk') return '대면';
    var c = cast(b.who);
    return c.role + (c.org ? ' · ' + c.org : '');
  }

  function play(beats, S, opt) {
    opt = opt || {};
    beats = (beats || []).filter(Boolean);
    if (!beats.length) { if (opt.onDone) opt.onDone(); return; }
    isOpen = true;
    // 대화마다 「나」가 누구인지 — 없으면 방금 끝낸 장면의 시점
    function povOf(b) { return b.pov || (global.SEASON && S.seat ? global.SEASON.povOf(S.seat) : 'manager'); }
    function mine(m, b) { return m.from === 'me' || (!!m.from && m.from === povOf(b)); }

    // 지난 대화방 (이번 대화 말고 이미 이야기한 방)
    var past = [], seenRoom = {};
    beats.forEach(function (b) { seenRoom[b.room + '|' + b.name] = 1; });
    (S.story.chat || []).slice().reverse().forEach(function (m) {
      var k = m.room + '|' + m.name;
      if (seenRoom[k] || m.room === 'talk') return;
      seenRoom[k] = 1;
      if (past.length < 5) past.push(m);
    });

    var el = document.createElement('div');
    el.className = 'overlay msg-o';
    el.innerHTML =
      '<div class="msg-bg"></div>' +
      '<div class="msgr" role="dialog" aria-label="메신저">' +
        '<aside class="msgr-rail"><div class="mr-h"><b>세종 메신저</b><span class="mr-me" id="mr-me"></span></div>' +
          '<ul class="mr-list" id="mr-now"></ul>' +
          (past.length ? '<div class="mr-sep">지난 대화</div><ul class="mr-list past">' + past.map(function (m) {
            var who = /^dm:/.test(m.room) ? m.room.slice(3) : null;
            return '<li>' + (m.room === 'team' ? '<span class="mr-ic">#</span>' : ART.face(who, null, 'mr-av')) +
              '<span class="mr-n">' + esc(m.name) + '</span></li>';
          }).join('') + '</ul>' : '') +
          '<div class="mr-f"><kbd>Enter</kbd> 넘기기 <kbd>Esc</kbd> 건너뛰기</div></aside>' +
        '<section class="msgr-main"><header class="mm-h" id="mm-h"></header>' +
          '<div class="mm-body" id="mm-body" aria-live="polite"></div>' +
          '<footer class="mm-f" id="mm-f"></footer></section>' +
      '</div>';
    document.body.appendChild(el);
    var $ = function (s) { return el.querySelector(s); };
    var body = $('#mm-body'), foot = $('#mm-f');

    var bi = 0, queue = [], timer = null, fast = false, state = 'idle', last = null, typingEl = null, pending = null;

    function drawRail() {
      $('#mr-now').innerHTML = beats.map(function (b, i) {
        var unread = i > bi ? b.msgs.filter(function (m) { return m.from && !mine(m, b); }).length : 0;
        return '<li class="' + (i === bi ? 'on' : i < bi ? 'read' : '') + '">' + roomIcon(b) +
          '<span class="mr-n">' + esc(b.room === 'talk' ? '대면 · ' + b.name : b.name) + '</span>' +
          (unread ? '<i class="mr-u">' + unread + '</i>' : '') + '</li>';
      }).join('');
    }

    function startBeat(i) {
      var b = beats[i];
      bi = i; last = null; fast = false;
      el.querySelector('.msg-bg').style.backgroundImage = 'url(' + ART.sceneSrc(b.bg) + ')';
      el.classList.toggle('talk', b.mode === 'talk');
      var pv = povOf(b), pc = cast(pv);
      $('#mr-me').innerHTML = ART.face(pv, null, 'mr-av') + '<span><b>' + esc(pc.name) + '</b>' + esc(pc.role) + '</span><em>나의 시점</em>';
      $('#mm-h').innerHTML = '<div class="mm-t">' + roomIcon(b) + '<div><b>' + esc(b.room === 'talk' ? b.name : b.name) + '</b>' +
        '<span>' + esc(roomSub(b)) + '</span></div></div>' +
        '<div class="mm-r"><span class="mm-pov">' + ART.face(pv, null, 'mr-av') + '<b>' + esc(pc.name) + '</b><em>나의 시점</em></span><time>' + esc(b.time) + '</time></div>';
      body.innerHTML = '<div class="m-day">' + esc(b.time.split(' ').slice(0, 3).join(' ')) + '</div>';
      foot.innerHTML = '';
      drawRail();
      queue = b.msgs.slice();
      state = 'typing';
      FX.play(i ? 'whoosh' : 'msg');
      pump();
    }

    function delay(m) { return Math.max(420, Math.min(1250, 260 + String(m.t || '').length * 30)); }

    function pump() {
      clearTimeout(timer);
      if (!queue.length) return settle();
      var m = queue.shift();
      if (m.from && !mine(m, beats[bi]) && !fast) {
        showTyping(m.from);
        pending = m;
        timer = setTimeout(function () { pending = null; hideTyping(); render(m); pump(); }, delay(m));
      } else {
        render(m);
        timer = setTimeout(pump, fast ? 0 : (m.verdict ? 700 : m.fx ? 380 : 180));
      }
    }

    function showTyping(from) {
      hideTyping();
      typingEl = document.createElement('div');
      typingEl.className = 'm-row typing' + (last === from ? ' cont' : '');
      typingEl.innerHTML = (last === from ? '<span class="m-gap"></span>' : ART.face(from, null, 'av')) +
        '<div class="m-col">' + (last === from ? '' : '<span class="m-n">' + esc(cast(from).name) + '</span>') +
        '<span class="m-b"><i></i><i></i><i></i></span></div>';
      body.appendChild(typingEl);
      scroll();
    }
    function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
    /* 끝까지 넘기기 — 입력 중이던 메시지부터 마저 보여 준다 */
    function rush() {
      fast = true;
      clearTimeout(timer);
      hideTyping();
      if (pending) { var m = pending; pending = null; render(m); }
      pump();
    }
    function scroll() { body.scrollTop = body.scrollHeight; }

    function render(m) {
      var b = beats[bi], d = document.createElement('div');
      if (m.verdict) {
        var v = m.verdict;
        d.className = 'm-verdict ' + (v.ok ? 'ok' : 'no');
        d.innerHTML = '<span class="mv-st">' + (v.ok ? '적정 판단' : '부적절') + '</span>' +
          '<div><b>' + esc(v.label) + '</b>' + (!v.ok && v.note ? '<small>' + esc(v.note) + '</small>' : '') + '</div>';
        FX.play(v.ok ? 'stampSm' : 'bad');
        last = null;
      } else if (m.fx) {
        d.className = 'm-fx';
        d.innerHTML = m.fx;
        last = null;
      } else if (m.sys) {
        d.className = 'm-sys';
        d.textContent = m.sys;
        STORY.log(S, b, m);
        last = null;
      } else if (mine(m, b)) {
        d.className = 'm-row me';
        d.innerHTML = '<div class="m-col"><span class="m-b">' + esc(m.t) + '</span></div>';
        STORY.log(S, b, { from: povOf(b), t: m.t, me: 1 });
        if (m.from !== 'me') FX.play('send');
        last = 'me';
      } else {
        var cont = last === m.from;
        d.className = 'm-row' + (cont ? ' cont' : '');
        d.innerHTML = (cont ? '<span class="m-gap"></span>' : ART.face(m.from, m.mood, 'av')) +
          '<div class="m-col">' + (cont ? '' : '<span class="m-n">' + esc(cast(m.from).name) + '<em>' + esc(cast(m.from).role) + '</em></span>') +
          '<span class="m-b' + (m.mood ? ' mood-' + m.mood : '') + '">' + esc(m.t) + '</span></div>';
        STORY.log(S, b, m);
        FX.play('msg');
        last = m.from;
      }
      body.appendChild(d);
      scroll();
    }

    function settle() {
      hideTyping();
      var b = beats[bi];
      if (b.choice && b._pick == null) return showChoices(b);
      state = 'next';
      var more = bi < beats.length - 1;
      foot.innerHTML = '<button type="button" class="btn sm" data-act="next">' + (more ? '다음 대화' : '계속') + ' <kbd>Enter</kbd></button>';
      var nb = foot.querySelector('[data-act="next"]');
      if (nb) nb.focus({ preventScroll: true });
    }

    function showChoices(b) {
      state = 'choice';
      foot.innerHTML = '<div class="mc-h">답장</div><div class="mc-list">' + b.choice.opts.map(function (o, i) {
        return '<button type="button" class="mc" data-i="' + i + '"><kbd>' + (i + 1) + '</kbd><span>' + esc(o.t) + '</span></button>';
      }).join('') + '</div>';
      var first = foot.querySelector('.mc');
      if (first) first.focus({ preventScroll: true });
    }

    function fxHtml(r) {
      var chips = [];
      var d = r.delta || {};
      if (d.R) chips.push('<span class="' + (d.R > 0 ? 'up' : 'down') + '">신뢰 ' + signed(d.R) + '</span>');
      if (d.E) chips.push('<span class="' + (d.E > 0 ? 'up' : 'down') + '">감사증거 ' + signed(d.E) + '</span>');
      if (d.T) {
        var days = Math.round(d.T * (global.SEASON ? global.SEASON.DAY_RATE : 0.6));
        if (days) chips.push('<span class="down">기한 ' + signed(days) + '일</span>');
      }
      if (d.C) chips.push('<span class="' + (d.C > 0 ? 'warm' : 'cold') + '">회사 태도 ' + signed(d.C) + '</span>');
      (r.bonds || []).forEach(function (bd) {
        var nm = cast(bd.who).name;
        if (bd.from !== bd.to) chips.push('<span class="bd ' + (bd.d > 0 ? 'up' : 'down') + '">' + esc(nm) + ' · ' + esc(bd.from) + ' → ' + esc(bd.to) + '</span>');
        else chips.push('<span class="bd ' + (bd.d > 0 ? 'up' : 'down') + '">' + esc(nm) + (bd.d > 0 ? ' ▲' : ' ▼') + '</span>');
      });
      if (r.bonds && r.bonds.some(function (bd) { return bd.from !== bd.to; })) FX.play('bond');
      return chips.length ? chips.join('') : '';
    }

    function choose(i) {
      var b = beats[bi];
      if (state !== 'choice' || !b.choice || !b.choice.opts[i]) return;
      b._pick = i;
      state = 'typing';
      foot.innerHTML = '';
      render({ from: 'me', t: b.choice.opts[i].t });
      FX.play('send');
      var r = opt.onChoice ? opt.onChoice(b, i) : STORY.choose(S, b, i);
      if (r && r.verdict) queue.push({ verdict: r.verdict });
      var fx = r ? fxHtml(r) : '';
      if (fx) queue.push({ fx: fx });
      ((r && r.reply) || []).forEach(function (m) { queue.push(m); });
      fast = false;
      timer = setTimeout(pump, 380);
    }

    function next() {
      if (state !== 'next') return;
      STORY.markSeen(S, beats[bi]);
      if (opt.onSeen) opt.onSeen(beats[bi]);
      if (bi < beats.length - 1) startBeat(bi + 1);
      else close();
    }

    function skipAll() {
      if (state === 'closed') return;
      clearTimeout(timer);
      beats.forEach(function (b) {
        if (!(S.story.seen[b.id])) {
          // 건너뛴 대화도 기록에는 남긴다 — 인물 파일에서 다시 읽을 수 있다
          if (b !== beats[bi] || state === 'idle') b.msgs.forEach(function (m) { STORY.log(S, b, m); });
          STORY.markSeen(S, b);
        }
      });
      close();
    }

    function close() {
      if (state === 'closed') return;           // Enter 연타로 두 번 닫히면 장면을 건너뛴다
      state = 'closed';
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      el.classList.add('out');
      el.style.pointerEvents = 'none';
      isOpen = false;
      setTimeout(function () { el.remove(); if (opt.onDone) opt.onDone(); }, 200);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return skipAll(); }
      if (/^[1-9]$/.test(e.key) && state === 'choice') { e.preventDefault(); e.stopPropagation(); return choose(+e.key - 1); }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (state === 'typing') rush();
        else if (state === 'next') next();
      }
    }
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', function (e) {
      var c = e.target.closest('.mc');
      if (c) return choose(+c.getAttribute('data-i'));
      var n = e.target.closest('[data-act="next"]');
      if (n) return next();
      if (e.target.closest('.mm-body') && state === 'typing') rush();
    });

    startBeat(0);
  }

  global.MESSENGER = { play: play, isOpen: function () { return isOpen; } };
})(window);
