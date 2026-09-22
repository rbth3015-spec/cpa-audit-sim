/* ============================================================
   효과 (fx.js) — 소리 합성 · 숫자 굴리기 · 흔들기
   ------------------------------------------------------------
   음원 파일 없이 WebAudio 로 짧은 소리를 만든다.
   브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로 첫 입력 때 깨운다.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'auditSim.snd';
  var ctx = null, master = null;
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 기본값 */ }

  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  }
  ['pointerdown', 'keydown'].forEach(function (ev) {
    global.addEventListener(ev, function () { if (on) wake(); }, { once: false, passive: true });
  });

  function tone(freq, start, dur, type, vol, slide) {
    var t0 = ctx.currentTime + start;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(start, dur, vol, hp) {
    var t0 = ctx.currentTime + start;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 600;
    s.buffer = buf; g.gain.value = vol || 0.3;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0);
  }

  var SOUNDS = {
    click: function () { tone(1400, 0, 0.03, 'square', 0.06); },
    tick: function () { tone(900, 0, 0.04, 'triangle', 0.16); },
    count: function () { tone(520, 0, 0.06, 'triangle', 0.25); tone(780, 0.05, 0.06, 'triangle', 0.18); },
    type: function () { noise(0, 0.02, 0.05, 2400); },
    ok: function () { tone(660, 0, 0.12, 'triangle', 0.3); tone(990, 0.09, 0.2, 'triangle', 0.3); },
    great: function () { tone(660, 0, 0.1, 'triangle', 0.3); tone(880, 0.08, 0.1, 'triangle', 0.3); tone(1320, 0.16, 0.28, 'triangle', 0.3); },
    mid: function () { tone(520, 0, 0.14, 'triangle', 0.28); tone(560, 0.12, 0.18, 'triangle', 0.22); },
    bad: function () { tone(220, 0, 0.22, 'sawtooth', 0.14, 150); tone(160, 0.12, 0.3, 'sawtooth', 0.12, 110); },
    stamp: function () { tone(120, 0, 0.18, 'sine', 0.7, 50); noise(0, 0.12, 0.35, 300); },
    stampSm: function () { tone(180, 0, 0.1, 'sine', 0.45, 80); noise(0, 0.06, 0.2, 500); },
    alarm: function () { tone(1760, 0, 0.07, 'square', 0.07); },
    flip: function () { noise(0, 0.18, 0.18, 1800); },
    open: function () { noise(0, 0.25, 0.12, 900); tone(300, 0, 0.2, 'sine', 0.12, 520); },
    reveal: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.07, 0.3, 'triangle', 0.26); }); },
    alert: function () { tone(880, 0, 0.12, 'square', 0.12); tone(880, 0.18, 0.12, 'square', 0.12); },
    card: function () { tone(1046, 0, 0.08, 'sine', 0.25); tone(1568, 0.06, 0.18, 'sine', 0.2); },
    // 메신저 — 받기 · 보내기 · 입력 중 · 관계 변화
    msg: function () { tone(1320, 0, 0.05, 'sine', 0.16); tone(1760, 0.045, 0.07, 'sine', 0.12); },
    send: function () { noise(0, 0.08, 0.08, 2600); tone(740, 0, 0.06, 'sine', 0.1, 1100); },
    bond: function () { tone(392, 0, 0.18, 'sine', 0.14); tone(587, 0.1, 0.26, 'sine', 0.12); },
    chapter: function () { tone(98, 0, 0.9, 'sine', 0.22, 92); noise(0, 0.5, 0.05, 200); tone(196, 0.25, 0.7, 'triangle', 0.06); },
    whoosh: function () { noise(0, 0.22, 0.1, 1400); },
    // 장면 넘김 — 종이가 링에서 넘어가는 소리 · 자리 이동 — 휙 건너가는 소리
    turn: function () { noise(0, 0.34, 0.16, 1100); noise(0.12, 0.2, 0.08, 2600); tone(150, 0.3, 0.14, 'sine', 0.16, 90); },
    hop: function () { noise(0, 0.26, 0.09, 1800); tone(440, 0.02, 0.22, 'triangle', 0.1, 880); }
  };

  function play(name) {
    if (!on) return;
    if (!wake()) return;
    try { (SOUNDS[name] || SOUNDS.click)(); } catch (e) { /* 소리는 실패해도 게임은 계속 */ }
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 저장 안 됨 */ }
    if (on) { wake(); play('tick'); }
  }

  /* 숫자 굴리기 */
  function roll(el, from, to, ms, fmt) {
    if (!el) return;
    fmt = fmt || function (n) { return String(n); };
    var t0 = performance.now();
    ms = ms || 700;
    function step(t) {
      var k = Math.max(0, Math.min(1, (t - t0) / ms));   // 첫 프레임 시각이 t0 보다 이를 수 있다
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  global.FX = { play: play, setOn: setOn, isOn: function () { return on; }, roll: roll, shake: shake };
})(window);
