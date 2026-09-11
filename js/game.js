/* ============================================================
   감사 시즌 2026 — 화면 (game.js)
   ------------------------------------------------------------
   로직은 js/season.js 에 있다. 이 파일은 그리기만 한다.
   디자인을 교체할 때는 이 파일의 render 계열 함수만 바꾸면 된다.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var STORE = 'auditSim.v4';
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
  function show(id) {
    ['home', 'play', 'end'].forEach(function (k) { $('#screen-' + k).hidden = (k !== id); });
    $('#btn-dossier').hidden = (id !== 'play');
    if (id !== 'play') $('#dossier').hidden = true;
    window.scrollTo(0, 0);
  }
  function gz(v, label, tone) { return '<span class="gz">' + window.ART.ring(v, label, tone) + '</span>'; }
  function relTone(c) { return c < 35 ? 'var(--bad)' : c >= 65 ? 'var(--ok)' : 'var(--ink3)'; }

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

  /* ---------- HUD · 조서 ---------- */
  function renderHud() {
    var sc = window.SCENES[Math.min(S.i, window.SCENES.length - 1)], g = S.gauge, c = S.rel.company;
    $('#hud-day').textContent = sc.day;
    $('#hud-ch').textContent = sc.chapter;
    $('#hud-n').textContent = (S.i + 1) + ' / ' + window.SCENES.length;
    $('#gauges').innerHTML =
      gz(g.E, '감사증거', 'var(--acc)') +
      gz(g.T, '감사시간', g.T < 30 ? 'var(--bad)' : 'var(--ok)') +
      gz(g.R, '신뢰', g.R < 40 ? 'var(--bad)' : 'var(--warn)') +
      gz(c, '회사 · ' + window.SEASON.band(c), relTone(c));
  }

  // 조서에는 플레이어가 "알고 있는 것"만 보인다. 숨은 진실은 드러나지 않는다.
  function renderDossier() {
    var el = $('#dossier');
    if (!el || !S) return;
    var found = S.truths.filter(function (t) { return t.active && t.found; });
    var cleared = S.truths.filter(function (t) { return t.verified; });
    var flags = Object.keys(S.flags).map(function (k) { return window.SEASON.FLAG_TEXT[k] || k; });
    var c = S.rel.company;
    el.innerHTML =
      '<div class="dhead"><b>감사조서</b><span>시즌 ' + S.seed + '</span>' +
      '<button id="btn-dclose" class="hbtn">닫기</button></div>' +
      '<div class="dsec"><h4>회사의 태도</h4><p>' + window.SEASON.band(c) + ' (' + c + ')' +
      (c < 35 ? ' — 자료 제출이 늦어지고 있다' : c >= 65 ? ' — 협조적이다. 너무 편한 건 아닌지' : '') + '</p></div>' +
      '<div class="dsec"><h4>발견한 사항</h4>' + (found.length
        ? '<ul>' + found.map(function (t) {
            return '<li>' + esc(t.def.title) + ' <b>' + t.amount.toFixed(1) + '억원</b></li>';
          }).join('') + '</ul>'
        : '<p class="muted">아직 없다</p>') + '</div>' +
      (cleared.length ? '<div class="dsec"><h4>확인 완료 · 이상 없음</h4><ul>' +
        cleared.map(function (t) { return '<li>' + esc(t.def.short || t.def.title) + '</li>'; }).join('') + '</ul></div>' : '') +
      (flags.length ? '<div class="dsec"><h4>진행 중</h4><ul>' +
        flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
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
  function start(seed) {
    S = window.SEASON.create(seed != null ? { seed: seed } : {});
    step();
  }

  function step() {
    var sc = window.SCENES[S.i];
    cur = window.SEASON.resolve(sc, S);
    var it = cur;
    var cast = window.CAST[it.speaker] || window.CAST.manager;

    renderHud();
    renderDossier();

    $('#play-body').innerHTML =
      '<div class="scene">' + window.ART.scene(sc.art) +
      '<div class="scene-tag">' + esc(sc.area) + '</div></div>' +
      (it.note ? '<div class="note"><b>여파</b>' + esc(it.note) + '</div>' : '') +
      '<div class="say">' + window.ART.avatar(cast.avatar) +
      '<div class="bubble"><b>' + esc(cast.name) + '</b><span>' + esc(cast.role) + '</span>' +
      '<p>' + esc(it.line) + '</p></div></div>' +
      (it.situation ? '<p class="situation">' + esc(it.situation) + '</p>' : '') +
      exhibits(it.exhibits) +
      '<div class="prompt">' + esc(it.prompt) + '</div>' +
      (it.verdict ? '<div class="vhint">판단(해당한다 / 해당하지 않는다)을 <b>문장 안에</b> 쓰십시오. 판단이 틀리면 근거는 채점되지 않습니다.</div>' : '') +
      '<div class="ansbox"><textarea id="ans" placeholder="답안을 타이핑하세요. 키워드만 나열하면 구조점수가 0점 처리됩니다."></textarea>' +
      '<div class="ansmeta"><span id="cc">0</span>자 / 권장 ' + it.maxChars + '자</div></div>' +
      '<div class="row"><button id="btn-go" class="btn primary">제출</button>' +
      '<span class="tmr" id="tmr"></span></div><div id="result"></div>';

    var ta = $('#ans');
    ta.addEventListener('input', function () {
      var n = ta.value.replace(/\s/g, '').length;
      $('#cc').textContent = n;
      $('#cc').className = n > it.maxChars * 1.15 ? 'over' : '';
    });
    $('#btn-go').addEventListener('click', function () { submit(false); });
    ta.focus();

    var left = it.timeLimit;
    $('#tmr').textContent = mmss(left);
    clearInterval(timer);
    timer = setInterval(function () {
      left--;
      var el = $('#tmr'); if (!el) { clearInterval(timer); return; }
      el.textContent = mmss(left);
      el.className = 'tmr' + (left <= 20 ? ' warn' : '');
      if (left <= 0) { clearInterval(timer); submit(true); }
    }, 1000);

    show('play');
  }

  /* ---------- 채점 · 반영 ---------- */
  function submit(timedOut) {
    clearInterval(timer);
    var it = cur, text = $('#ans').value;
    var part = { maxChars: it.maxChars, rubric: it.rubric };
    if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
    var res = window.AE.gradeParts([{ text: text }], [part], 'essay');

    if (timedOut) {
      res.total = Math.max(0, res.total - Math.round(res.max * 0.05));
      res.percent = res.max ? Math.round(res.total / res.max * 100) : 0;
      res.flags.push('시간 초과 자동 제출 → 5% 차감');
    }
    var over = Math.max(0, text.replace(/\s/g, '').length - it.maxChars * 1.15);
    var out = window.SEASON.apply(S, it, text, res, { over: over, timedOut: timedOut });

    $('#ans').disabled = true;
    $('#btn-go').disabled = true;
    renderHud();
    renderDossier();
    renderResult(it, res, res.parts[0], out);
  }

  function itemRow(i, kind) {
    var cls, mark;
    if (kind === 'trap') { cls = i.hit ? 'bad' : 'ok-dim'; mark = i.hit ? '⚠' : '·'; }
    else if (i.hit) { cls = 'ok'; mark = '○'; }
    else if (i.negated || i.nearMiss) { cls = 'neg'; mark = i.negated ? '✕' : '△'; }
    else { cls = 'miss'; mark = '✕'; }
    var note = '';
    if (i.negated) note = ' <em>부정문으로 서술되어 무효</em>';
    else if (i.nearMiss) note = ' <em>맥락 연결 부족</em>';
    else if (i.fuzzy) note = ' <em>오타 허용 인정</em>';
    else if (!i.hit && kind !== 'trap' && i.hint) note = ' <em>' + esc(i.hint) + '</em>';
    return '<li class="' + cls + '"><span class="mk">' + mark + '</span><span class="lb">' + esc(i.label) + note +
      '</span><span class="sc">' + (i.got > 0 ? '+' : '') + i.got + '</span></li>';
  }

  function chip(label, n) {
    return '<span class="chip ' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + label + ' ' + sign(n) + '</span>';
  }

  function renderResult(it, res, p, out) {
    var g = res.percent >= 90 ? 'S' : res.percent >= 80 ? 'A' : res.percent >= 70 ? 'B' : res.percent >= 60 ? 'C' : 'D';
    var r = p.res;
    var last = S.i + 1 >= window.SCENES.length;
    var d = out.delta;

    var vbox = '';
    if (p.verdict) {
      var ok = p.verdict.correct;
      vbox = '<div class="vres ' + (ok ? 'ok' : 'bad') + '">판단 ' +
        (p.verdict.given === 'yes' ? '해당한다' : p.verdict.given === 'no' ? '해당하지 않는다' : '미기재') +
        ' · 정답 ' + (p.verdict.expected === 'yes' ? '해당한다' : '해당하지 않는다') +
        (ok ? '' : ' — 판단이 틀려 근거 서술은 채점되지 않았습니다') + '</div>';
    }

    var after = '<div class="after">' + chip('감사증거', d.E) + chip('감사시간', d.T) +
      chip('신뢰', d.R) + chip('회사 태도', d.C) + '</div>' +
      (out.events.length ? '<ul class="evs">' + out.events.map(function (e) {
        return '<li class="ev ' + e.kind + '">' + esc(e.text) + '</li>';
      }).join('') + '</ul>' : '');

    $('#result').innerHTML =
      '<div class="res"><div class="res-head"><div class="score"><b>' + res.percent + '</b><span>/ 100</span></div>' +
      '<div class="pct g-' + g + '">' + g + '</div></div>' + after + vbox +
      (res.flags.length ? '<ul class="flags">' + res.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      '<ul class="items">' +
      r.must.map(function (x) { return itemRow(x, 'must'); }).join('') +
      (r.bonus || []).filter(function (x) { return x.hit; }).map(function (x) { return itemRow(x, 'bonus'); }).join('') +
      (r.trap || []).filter(function (x) { return x.hit; }).map(function (x) { return itemRow(x, 'trap'); }).join('') +
      (r.structure && !r.structure.skip ? r.structure.detail.map(function (dd) {
        return '<li class="' + (dd[1] ? 'ok' : 'miss') + ' st"><span class="mk">' + (dd[1] ? '○' : '✕') +
          '</span><span class="lb">' + esc(dd[0]) + '</span><span class="sc">' + dd[1] + '/' + dd[2] + '</span></li>';
      }).join('') : '') + '</ul>' +
      '<details class="model"><summary>모범답안</summary>' +
      (it.model || []).map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') +
      '<div class="ref">' + esc(it.sc.ref || '') + '</div></details>' +
      '<div class="row"><button id="btn-next" class="btn primary">' +
      (last ? '감사보고서 발행 →' : '다음 · ' + esc(window.SCENES[S.i + 1].chapter) + ' →') + '</button>' +
      '<button id="btn-c1" class="btn ghost">이 장면 첨삭 요청 복사</button></div></div>';

    $('#btn-next').addEventListener('click', next);
    $('#btn-c1').addEventListener('click', function () {
      copyOut(feedback([S.results[S.results.length - 1]]), this);
    });
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    var dec = S.decision;

    var areas = {};
    S.results.forEach(function (r) {
      var k = r.it.sc.area;
      areas[k] = areas[k] || { s: 0, n: 0 };
      areas[k].s += r.res.percent; areas[k].n++;
    });
    var bars = Object.keys(areas).map(function (k) {
      return { k: k, p: Math.round(areas[k].s / areas[k].n) };
    }).sort(function (x, y) { return x.p - y.p; });

    var missed = [];
    S.results.forEach(function (r) {
      r.part.res.must.forEach(function (m) {
        if (!m.hit) missed.push({ t: r.it.sc.chapter, l: m.label, w: m.negated ? '부정문 서술' : m.nearMiss ? '맥락 연결 부족' : '미언급' });
      });
      (r.part.res.trap || []).forEach(function (t) {
        if (t.hit) missed.push({ t: r.it.sc.chapter, l: '[오개념] ' + t.label, w: '감점' });
      });
      if (r.part.verdict && !r.part.verdict.correct) missed.push({ t: r.it.sc.chapter, l: '[판단] 방향 오답', w: '근거 서술 전체 무효' });
    });

    $('#end-body').innerHTML =
      '<div class="scene">' + window.ART.scene('review') + '</div>' +
      '<div class="ending ' + a.tone + '"><div class="etag">1년 뒤 · 시즌 ' + S.seed + '</div>' +
      '<h2>' + esc(a.title) + '</h2>' +
      '<p>' + esc(a.text) + '</p><p>' + esc(E.company.text) + '</p><p>' + esc(E.career.text) + '</p></div>' +

      '<div class="finalg">' +
      gz(g.E, '감사증거', 'var(--acc)') + gz(g.T, '감사시간', 'var(--ok)') +
      gz(g.R, '신뢰', 'var(--warn)') + gz(S.rel.company, '회사 태도', relTone(S.rel.company)) +
      gz(avg, '답안 평균', 'var(--ink3)') + '</div>' +

      '<h3>이번 시즌의 진실</h3>' +
      '<p class="muted">찾은 것 <b>' + E.found.toFixed(1) + '억원</b> · 놓친 것 <b>' + E.missed.toFixed(1) + '억원</b>' +
      (dec ? ' · 확인한 사실에 비춘 정답 의견 <b>' + esc(dec.kind) + '</b> — ' + (S.opinionOK ? '맞힘' : '틀림') : '') + '</p>' +
      '<div class="truths">' + E.rows.map(function (r) {
        return '<div class="truth ' + r.state + '"><div class="th"><b>' + esc(r.title) + '</b>' +
          '<span>' + (r.active ? r.amount.toFixed(1) + '억원' : '—') + '</span>' +
          '<em>' + STATE_TEXT[r.state] + '</em></div>' +
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

      '<h3>영역별</h3><div class="bars">' + bars.map(function (x) {
        return '<div class="bar"><span class="bl">' + esc(x.k) + '</span><span class="bt"><i style="width:' +
          x.p + '%"></i></span><span class="bv">' + x.p + '</span></div>';
      }).join('') + '</div>' +

      (missed.length ? '<h3>오답노트 · ' + missed.length + '건</h3><ul class="missed">' +
        missed.map(function (m) {
          return '<li><span class="mtag">' + esc(m.t) + '</span>' + esc(m.l) + ' <em>' + esc(m.w) + '</em></li>';
        }).join('') + '</ul>' : '') +

      '<div class="row"><button id="btn-ca" class="btn primary">전체 첨삭 요청 복사</button>' +
      '<button id="btn-same" class="btn ghost">같은 시즌 다시 — 다른 선택으로</button>' +
      '<button id="btn-new" class="btn ghost">새 시즌</button></div>' +
      '<textarea id="outbox" class="outbox" hidden readonly></textarea>';

    var seed = S.seed;
    $('#btn-ca').addEventListener('click', function () { copyOut(feedback(S.results), this); });
    $('#btn-same').addEventListener('click', function () { start(seed); });
    $('#btn-new').addEventListener('click', function () { start(); });

    var db = load();
    db.history = (db.history || []).concat([{ t: Date.now(), seed: seed, end: a.title, tone: a.tone, avg: avg,
      found: E.found, missed: E.missed }]).slice(-30);
    save(db);
    show('end');
  }

  /* ---------- 첨삭 요청 ---------- */
  function feedback(rows) {
    var L = [];
    L.push('아래는 CPA 2차 회계감사 답안 연습 결과입니다. 실제 2차 채점 기준으로 첨삭해 주세요.');
    L.push('요청: ① 누락 논점 ② 틀리거나 위험한 서술 ③ 답안 표현·구조 교정 ④ 실제라면 몇 점인지');
    L.push('='.repeat(52));
    rows.forEach(function (r, i) {
      var sc = r.it.sc;
      L.push('');
      L.push('[' + (i + 1) + '] ' + sc.chapter + ' (' + sc.area + ')' + (r.it.v && r.it.v.label ? ' — ' + r.it.v.label : ''));
      L.push('기준서: ' + (sc.ref || (sc.standards || []).join(', ')));
      if (r.it.situation) { L.push('— 상황 —'); L.push(r.it.situation); }
      L.push('— 문항 —'); L.push(r.it.prompt);
      L.push('— 내 답안 —'); L.push((r.text || '').trim() || '(무응답)');
      if (r.part.verdict) {
        L.push('— 판단 — 내 판단: ' + (r.part.verdict.given === 'yes' ? '해당한다' : r.part.verdict.given === 'no' ? '해당하지 않는다' : '미기재') +
               ' / 정답: ' + (r.part.verdict.expected === 'yes' ? '해당한다' : '해당하지 않는다'));
      }
      L.push('— 자동채점: ' + r.res.percent + '점 —');
      var hit = r.part.res.must.filter(function (m) { return m.hit; }).map(function (m) { return m.label; });
      var mis = r.part.res.must.filter(function (m) { return !m.hit; }).map(function (m) { return m.label; });
      if (hit.length) L.push('  획득: ' + hit.join(' / '));
      if (mis.length) L.push('  누락: ' + mis.join(' / '));
      var tr = (r.part.res.trap || []).filter(function (t) { return t.hit; }).map(function (t) { return t.label; });
      if (tr.length) L.push('  감점: ' + tr.join(' / '));
      L.push('— 모범답안 —');
      (r.it.model || []).forEach(function (m) { L.push('  ' + m); });
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
    var c = window.COMPANY;
    $('#home-body').innerHTML =
      '<div class="scene">' + window.ART.scene('office') + '</div>' +
      '<div class="hero"><h2>감사 시즌 2026</h2>' +
      '<p>자네는 ' + esc(c.firm) + ' 소속 담당 회계사다. ' + esc(c.name) + '(' + esc(c.market) + ', ' + esc(c.industry) +
      ')의 감사를 수임 검토부터 보고서 발행까지 끌고 간다.</p>' +
      '<p class="hero-sub">이 회사에는 무언가가 숨어 있다. 무엇이 얼마나 숨어 있는지는 <b>시즌마다 다르다.</b> ' +
      '모든 대응은 타이핑으로 한다. 짚은 만큼만 드러나고, 놓친 것은 1년 뒤에 돌아온다.</p>' +
      '<ul class="rules">' +
      '<li><b>감사증거</b> 답안 수준만큼 쌓인다. 낮으면 마지막에 범위제한이 된다</li>' +
      '<li><b>감사시간</b> 장면마다 줄고, 답이 길수록 더 준다. 0이 되면 마감 실패</li>' +
      '<li><b>신뢰</b> 파트너의 신뢰. 오개념을 쓰면 급락한다</li>' +
      '<li><b>회사 태도</b> 강하게 짚을수록 진실에 가까워지지만 회사가 등을 돌린다. 조회를 막고 자료를 늦게 준다</li>' +
      '</ul>' +
      '<div class="seedrow"><label>시즌 코드 <input id="seed" inputmode="numeric" maxlength="6" placeholder="비우면 무작위"></label>' +
      '<span class="muted">같은 코드 = 같은 진실. 선택만 바꿔 다시 해볼 수 있다.</span></div>' +
      '<button id="btn-start" class="btn primary big">감사 착수</button></div>' +
      (h.length ? '<h3>지난 시즌</h3><div class="scroll"><table class="tbl"><thead><tr><th>일시</th><th>시즌</th><th>엔딩</th><th>찾음</th><th>놓침</th><th>평균</th></tr></thead><tbody>' +
        h.slice(0, 8).map(function (x) {
          var d = new Date(x.t);
          return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + '</td><td class="num">' + (x.seed || '') +
            '</td><td class="t-' + (x.tone || '') + '">' + esc(x.end) + '</td><td class="num">' + (x.found != null ? x.found.toFixed(1) : '') +
            '</td><td class="num">' + (x.missed != null ? x.missed.toFixed(1) : '') + '</td><td class="num">' + x.avg + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '');
    $('#btn-start').addEventListener('click', function () {
      var v = ($('#seed').value || '').replace(/\D/g, '');
      start(v ? parseInt(v, 10) : null);
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
