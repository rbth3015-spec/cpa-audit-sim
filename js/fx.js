/* ============================================================
   효과 (fx.js) — 소리 합성 · 숫자 굴리기 · 흔들기
   ------------------------------------------------------------
   assets/audio.js 에 적힌 음악 · 효과음 파일이 있으면 그걸 쓰고,
   없는 소리는 WebAudio 로 합성한다. 파일을 하나도 안 넣어도 게임은 그대로 돈다.
   브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로 첫 입력 때 깨운다.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'auditSim.snd', VOL = 'auditSim.vol';
  var ctx = null, master = null, mbus = null, sbus = null;
  var on = true;
  var vol = { music: 0.7, sfx: 1 };
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 기본값 */ }
  try {
    var saved = JSON.parse(localStorage.getItem(VOL) || '{}');
    ['music', 'sfx'].forEach(function (k) { if (typeof saved[k] === 'number') vol[k] = Math.max(0, Math.min(1, saved[k])); });
  } catch (e) { /* 기본값 */ }

  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32 * vol.sfx;
    master.connect(ctx.destination);
    mbus = ctx.createGain();                       // 합성 배경음 — 음악 크기를 따른다
    mbus.gain.value = 0.32 * vol.music / 0.7;
    mbus.connect(ctx.destination);
    sbus = ctx.createGain();                       // 효과음 파일
    sbus.gain.value = 0.9 * vol.sfx;
    sbus.connect(ctx.destination);
    loadSamples();
    return ctx;
  }
  ['pointerdown', 'keydown'].forEach(function (ev) {
    global.addEventListener(ev, function () { if (on) { wake(); tapeResume(); } }, { once: false, passive: true });
  });

  var trim = 1;                                    // 지금 내는 합성 소리의 크기 배수 — play 가 정한다
  function tone(freq, start, dur, type, vol, slide) {
    var t0 = ctx.currentTime + start;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((vol || 0.4) * trim, t0 + 0.008);
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
    s.buffer = buf; g.gain.value = (vol || 0.3) * trim;
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

  /* ---------- 효과음 파일 ------------------------------------
     tools/audio.py 가 구운 assets/sfx.js — base64 라 file:// 에서도 읽힌다. 처음 깨울 때 읽어 둔다.
     stamp.1 · stamp.2 처럼 번호가 붙으면 같은 소리의 다른 테이크다.
  ------------------------------------------------------------ */
  var SAMPLES = {}, samplesAsked = false;
  function loadSamples() {
    if (samplesAsked || !global.AUDIO || !global.AUDIO.sfx) return;
    samplesAsked = true;
    var el = document.createElement('script');
    el.src = 'assets/sfx.js';
    el.onload = function () {
      var data = global.SFX_DATA || {};
      Object.keys(data).forEach(function (key) {
        var bin = atob(data[key]), buf = new Uint8Array(bin.length), name = key.split('.')[0];
        for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        ctx.decodeAudioData(buf.buffer, function (b) { (SAMPLES[name] = SAMPLES[name] || []).push(b); }, function () { /* 합성으로 */ });
      });
      global.SFX_DATA = null;
    };
    document.head.appendChild(el);
  }
  function sample(name) {
    var takes = SAMPLES[name];
    if (!takes) return false;
    var s = ctx.createBufferSource();
    s.buffer = takes[Math.floor(Math.random() * takes.length)];
    s.playbackRate.value = 0.97 + Math.random() * 0.06;      // 같은 소리도 매번 조금씩 다르게
    s.connect(sbus);
    s.start();
    return true;
  }

  // 파일이 없는 합성 소리의 크기 — 파일 소리(tools/sfx_picks.json 의 level)와 같은 기준으로 재서 맞춘 배수
  var TRIM = { alert: 5.2, chapter: 2.16, send: 3.4, whoosh: 1.7, count: 3, click: 5.75, type: 3.9 };

  // 큰 소리가 날 때 음악을 잠깐 눌러 준다
  var DUCK = { stamp: 0.45, chapter: 0.35, reveal: 0.35, alert: 0.6, great: 0.55, bad: 0.55, card: 0.7 };

  function play(name) {
    if (!on) return;
    if (!wake()) return;
    if (DUCK[name]) { Tape.duckTo = DUCK[name]; Tape.duckEnd = Date.now() + 700; }
    trim = TRIM[name] || 1;
    try { if (!sample(name)) (SOUNDS[name] || SOUNDS.click)(); } catch (e) { /* 소리는 실패해도 게임은 계속 */ }
    trim = 1;
  }

  /* ---------- 음악 파일 --------------------------------------
     assets/audio.js 의 곡을 <audio> 두 대로 겹쳐 튼다. file:// 에서 WebAudio 에 이으면 무음이라
     volume 을 직접 움직인다. 곡이 끝나기 전에 다음 곡을 겹쳐 올려 이음매를 숨긴다.
       home 첫 화면 · scene 평소 · tense 쫓길 때 · end 나쁜 결말 · happy 좋은 결말
  ------------------------------------------------------------ */
  var TRACKS = { home: ['title'], scene: ['play_a', 'play_b'], tense: ['tense'], end: ['end_bad'], happy: ['end_good'] };
  var XFADE = 2.6;
  var MUSIC_TRIM = 0.4;                            // 완성곡은 효과음보다 크게 만들어져 있다 — 글 읽는 데 방해되지 않게 낮춘다
  var Tape = { mood: null, tense: false, cur: null, decks: [], missing: {}, pos: {}, turn: {},
               duck: 1, duckTo: 1, duckEnd: 0, timer: 0, last: 0 };

  function tapeFile(name) { return global.AUDIO && global.AUDIO.tracks && global.AUDIO.tracks[name]; }
  function tapePick(mood) {
    var list = (TRACKS[mood] || []).filter(function (n) { return tapeFile(n) && !Tape.missing[n]; });
    return list.length ? list[(Tape.turn[mood] || 0) % list.length] : null;
  }
  function tapeGo(d) {
    if (document.hidden) return;
    var p = d.el.play();
    if (p && p.catch) p.catch(function () { /* 첫 입력 전이면 막힌다 — tapeResume 이 다시 튼다 */ });
  }
  function tapeDrop(d) {
    try { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); } catch (e) { /* 이미 멈춤 */ }
    Tape.decks = Tape.decks.filter(function (x) { return x !== d; });
  }
  function tapeOpen(name, fade) {
    var el = new Audio('assets/audio/' + tapeFile(name));
    var d = { name: name, el: el, level: 0, target: 1, rate: 1 / Math.max(0.05, fade), closing: false };
    el.preload = 'auto';
    el.volume = 0;
    el.addEventListener('error', function () {
      Tape.missing[name] = true;
      tapeDrop(d);
      if (Tape.cur === d) { Tape.cur = null; Tape.mood = null; if (BGM.want) music(BGM.want); }
    });
    el.addEventListener('loadedmetadata', function () {
      var at = Tape.pos[name] || 0;
      if (at > 0 && at < el.duration - XFADE * 2) { try { el.currentTime = at; } catch (e) { /* 처음부터 */ } }
    });
    Tape.decks.push(d);
    tapeGo(d);
    if (!Tape.timer) { Tape.last = Date.now(); Tape.timer = setInterval(tapeTick, 60); }
    return d;
  }
  function tapeRelease(d, fade) {
    if (!d.closing) Tape.pos[d.name] = d.el.currentTime || 0;
    d.target = 0;
    d.rate = 1 / Math.max(0.05, fade);
  }
  function tapeSwitch(name, fade) {
    var old = Tape.cur;
    if (old && old.name === name) { old.target = 1; old.rate = 1 / fade; return; }
    if (old) tapeRelease(old, fade);
    var back = Tape.decks.filter(function (x) { return x.name === name && !x.closing; })[0];     // 아직 사라지는 중이면 되살린다
    if (back) { back.target = 1; back.rate = 1 / fade; Tape.cur = back; return; }
    Tape.cur = tapeOpen(name, fade);
  }
  function tapeStop(fade) {
    Tape.mood = null; Tape.tense = false;
    if (Tape.cur) tapeRelease(Tape.cur, fade);
    Tape.cur = null;
  }
  // 곡이 끝나 간다 — 다음 곡(없으면 처음부터)을 겹쳐 올린다
  function tapeRoll(d) {
    var mood = Tape.tense ? 'tense' : Tape.mood;
    Tape.turn[mood] = (Tape.turn[mood] || 0) + 1;
    Tape.pos[d.name] = 0;
    d.closing = true;
    d.target = 0;
    d.rate = 1 / XFADE;
    var next = tapePick(mood) || d.name;
    Tape.pos[next] = 0;
    Tape.cur = tapeOpen(next, XFADE);
  }
  function tapeTick() {
    var now = Date.now(), dt = Math.min(0.25, (now - Tape.last) / 1000);
    Tape.last = now;
    var want = now < Tape.duckEnd ? Tape.duckTo : 1;
    Tape.duck += (want - Tape.duck) * Math.min(1, dt * (want < Tape.duck ? 9 : 1.5));   // 빨리 눌렀다 천천히 돌아온다
    Tape.decks.slice().forEach(function (d) {
      var step = d.rate * dt;
      d.level = d.level < d.target ? Math.min(d.target, d.level + step) : Math.max(d.target, d.level - step);
      try { d.el.volume = Math.max(0, Math.min(1, Math.sin(d.level * Math.PI / 2) * vol.music * MUSIC_TRIM * Tape.duck)); } catch (e) { /* 무시 */ }
      if (d.target === 0 && d.level <= 0) tapeDrop(d);
    });
    var c = Tape.cur;
    if (c && c.el.duration && c.el.duration - c.el.currentTime < XFADE + 0.4) tapeRoll(c);
    if (!Tape.decks.length) { clearInterval(Tape.timer); Tape.timer = 0; }
  }
  function tapeResume() {
    if (document.hidden) return;
    Tape.decks.forEach(function (d) { if (d.el.paused) tapeGo(d); });
  }

  /* ---------- 합성 배경음 ------------------------------------
     음악 파일이 없을 때. 밤 사무실의 공기 한 겹 · 가끔 울리는 한 음 ·
     시간이 얼마 안 남으면 도는 초침. 끊기는 데 없이 계속 흐른다.
       FX.music('home' | 'scene' | 'end' | 'happy' | null)   틀기 · 바꾸기 · 끄기
       FX.tension(0~1)                                       쫓기는 정도 (남은 시간 · 회사 태도)
  ------------------------------------------------------------ */
  var BGM = { mood: null, want: null, bus: null, nodes: [], timer: 0, tension: 0 };
  var SCALE = [261.63, 311.13, 349.23, 392.00, 466.16];    // 단조 5음 — 밝지 않게

  function bgmStop(fade) {
    if (BGM.timer) { clearTimeout(BGM.timer); BGM.timer = 0; }
    var bus = BGM.bus, list = BGM.nodes;
    BGM.bus = null; BGM.nodes = []; BGM.mood = null;
    if (!bus || !ctx) return;
    var t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value || 0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + (fade == null ? 1.1 : fade));
    setTimeout(function () {
      list.forEach(function (n) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* 이미 멈춤 */ } });
      try { bus.disconnect(); } catch (e) { /* 이미 끊김 */ }
    }, ((fade == null ? 1.1 : fade) + 0.2) * 1000);
  }

  /* 한 음 — 느리게 들어와 길게 사라진다 */
  function bgmNote(freq, vol, dur) {
    if (!BGM.bus) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(BGM.bus);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  /* 다음 한 음을 예약한다 — 쫓길수록 자주, 엔딩이면 더 드물게 */
  function bgmSchedule() {
    if (!BGM.bus) return;
    var end = BGM.mood === 'end';
    var gap = (end ? 9000 : 6500) - BGM.tension * 2600 + Math.random() * (end ? 7000 : 5000);
    BGM.timer = setTimeout(function () {
      if (!BGM.bus) return;
      var i = Math.floor(Math.random() * SCALE.length);
      var oct = Math.random() < (end ? 0.75 : 0.45) ? 0.5 : 1;
      bgmNote(SCALE[i] * oct, 0.05 + BGM.tension * 0.03, 2.4 + Math.random() * 1.6);
      // 쫓기면 초침이 돈다
      if (BGM.tension > 0.62 && !end) {
        var n = 0, beat = setInterval(function () {
          if (!BGM.bus || n++ > 6 || BGM.tension <= 0.62) { clearInterval(beat); return; }
          noise(0, 0.02, 0.03 + BGM.tension * 0.02, 3200);
        }, 1000);
      }
      bgmSchedule();
    }, Math.max(2200, gap));
  }

  function music(mood) {
    BGM.want = mood || null;                       // 소리를 껐다 켜면 여기로 돌아온다
    if (!mood) { tapeStop(1.1); bgmStop(); return; }
    if (!on) return;
    var track = tapePick(mood);
    if (track) {
      bgmStop(0.5);
      if (Tape.mood === mood && Tape.cur) return;
      Tape.mood = mood; Tape.tense = false;
      tapeSwitch(track, mood === 'home' ? 1.5 : XFADE);
      return;
    }
    tapeStop(1.1);
    if (mood === 'home') { bgmStop(); return; }    // 첫 화면은 파일이 없으면 조용히
    if (mood === 'happy') mood = 'end';
    if (!wake()) return;
    if (BGM.mood === mood && BGM.bus) return;
    bgmStop(0.5);
    setTimeout(function () {
      if (!on || !ctx) return;
      var end = mood === 'end';
      var bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.exponentialRampToValueAtTime(end ? 0.5 : 0.62, ctx.currentTime + 2.2);
      bus.connect(mbus);

      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = end ? 180 : 240; lp.Q.value = 0.7;
      lp.connect(bus);

      // 드론 두 겹 — 5도로 살짝 어긋나게
      var base = end ? 49 : 55;
      [[base, 0.08, 'sine'], [base * 1.5, 0.045, 'triangle'], [base * 2.01, 0.025, 'sine']].forEach(function (d) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = d[2]; o.frequency.value = d[0];
        o.detune.value = (Math.random() * 8 - 4);
        g.gain.value = d[1];
        o.connect(g); g.connect(lp);
        o.start(); BGM.nodes.push(o);
      });

      // 공기 — 아주 낮게 깔리는 잡음
      var len = Math.floor(ctx.sampleRate * 4), buf = ctx.createBuffer(1, len, ctx.sampleRate), d0 = buf.getChannelData(0);
      for (var i = 0, last = 0; i < len; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;      // 갈색 잡음에 가깝게
        d0[i] = last;
      }
      var air = ctx.createBufferSource(), ag = ctx.createGain(), af = ctx.createBiquadFilter();
      air.buffer = buf; air.loop = true;
      af.type = 'lowpass'; af.frequency.value = 620;
      ag.gain.value = end ? 0.16 : 0.1;                // 깔리는 잡음은 들릴 듯 말 듯
      air.connect(af); af.connect(ag); ag.connect(bus);
      air.start(); BGM.nodes.push(air);

      // 아주 느린 숨 — 드론이 미세하게 부풀었다 가라앉는다
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.045; lg.gain.value = end ? 40 : 55;
      lfo.connect(lg); lg.connect(lp.frequency);
      lfo.start(); BGM.nodes.push(lfo);

      BGM.bus = bus; BGM.mood = mood;
      bgmSchedule();
    }, BGM.bus ? 520 : 0);
  }

  function tension(v) {
    // 배경음이 조여 오는 정도 — 남은 시간이 줄면 1 에 가까워진다
    BGM.tension = Math.max(0, Math.min(1, +v || 0));
    if (Tape.mood !== 'scene' || !tapePick('tense')) return;
    if (!Tape.tense && BGM.tension > 0.8) { Tape.tense = true; tapeSwitch(tapePick('tense'), 3); }
    else if (Tape.tense && BGM.tension < 0.5) { Tape.tense = false; tapeSwitch(tapePick('scene'), 3); }
  }

  // 화면이 가려지면 멈추고, 돌아오면 이어서 튼다
  global.addEventListener('visibilitychange', function () {
    if (document.hidden) Tape.decks.forEach(function (d) { try { d.el.pause(); } catch (e) { /* 무시 */ } });
    else if (on) tapeResume();
    if (!ctx) return;
    if (document.hidden) { try { ctx.suspend(); } catch (e) { /* 무시 */ } }
    else if (on) { try { ctx.resume(); } catch (e) { /* 무시 */ } }
  });

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 저장 안 됨 */ }
    if (on) { wake(); play('tick'); if (BGM.want) music(BGM.want); }
    else { tapeStop(0.4); bgmStop(0.4); }
  }

  // 음악 · 효과음 크기 (0~1)
  function setVol(kind, v) {
    vol[kind] = Math.max(0, Math.min(1, +v || 0));
    try { localStorage.setItem(VOL, JSON.stringify(vol)); } catch (e) { /* 저장 안 됨 */ }
    if (!ctx) return;
    master.gain.value = 0.32 * vol.sfx;
    sbus.gain.value = 0.9 * vol.sfx;
    mbus.gain.value = 0.32 * vol.music / 0.7;
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

  global.FX = { play: play, setOn: setOn, isOn: function () { return on; }, roll: roll, shake: shake,
                music: music, tension: tension, setVol: setVol, vol: function (k) { return vol[k]; },
                // 소리가 실제로 도는지 보는 용도 (검증 스크립트 · 디버그)
                state: function () {
                  return { ctx: ctx ? ctx.state : 'none', mood: BGM.mood, want: BGM.want,
                           playing: !!BGM.bus, voices: BGM.nodes.length, tension: BGM.tension,
                           track: Tape.cur ? Tape.cur.name : null, decks: Tape.decks.length, tense: Tape.tense,
                           at: Tape.cur ? Tape.cur.el.currentTime : 0, paused: Tape.cur ? Tape.cur.el.paused : true,
                           volume: Tape.cur ? Tape.cur.el.volume : 0, duck: Tape.duck, samples: Object.keys(SAMPLES).length };
                } };
})(window);
