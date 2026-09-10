/* ============================================================
   회계감사 시뮬레이터 — 진행 로직
   ------------------------------------------------------------
   구성   문제 N (배점)  →  물음 1, 2 ...  →  답안 칸 ①②③
   형식   judge (O·X + 근거)  ·  list (단답 나열)  ·  essay (사례 서술)
   꼬리질문  물음 점수가 낮으면 파트너 추가 질문이 발동한다
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'auditSim.v2';
  var LABELS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

  var S = null, timer = null;

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function mmss(s) { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + ('0' + (s % 60)).slice(-2); }
  function show(id) {
    ['home', 'play', 'final'].forEach(function (k) { $('#screen-' + k).hidden = (k !== id); });
    window.scrollTo(0, 0);
  }

  /* ---------- 자료 카드 ---------- */
  function renderExhibits(list) {
    if (!list || !list.length) return '';
    return list.map(function (x) {
      if (x.type === 'table') {
        return '<div class="ex"><div class="ex-t">' + esc(x.title) + '</div><div class="scroll"><table><thead><tr>' +
          x.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + x.rows.map(function (r) {
            return '<tr>' + r.map(function (c, i) {
              return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div></div>';
      }
      if (x.type === 'kv') {
        return '<div class="ex ex-kv"><div class="ex-t">' + esc(x.title) + '</div><dl>' +
          x.items.map(function (it) { return '<dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd>'; }).join('') +
          '</dl></div>';
      }
      if (x.type === 'memo') {
        return '<div class="ex ex-memo"><div class="ex-tag">내부 자료</div><div class="ex-t">' + esc(x.title) +
          '</div><div class="ex-from">' + esc(x.from) + '</div><p>' + esc(x.body) + '</p></div>';
      }
      if (x.type === 'news') {
        return '<div class="ex ex-news"><div class="ex-tag">언론 보도</div><div class="ex-src">' + esc(x.source) +
          ' · ' + esc(x.date) + '</div><div class="ex-h">' + esc(x.headline) + '</div><p>' + esc(x.body) + '</p></div>';
      }
      return '';
    }).join('');
  }

  /* ---------- 물음 해석 (variant 반영) ---------- */
  function resolve(c, q) {
    var v = q.variants ? pick(q.variants) : { id: '-', label: '' };
    var parts, situations = null;

    if (q.pool) {
      var idxs = v.pick || q.pool.map(function (_, i) { return i; });
      situations = idxs.map(function (idx, i) {
        var p = q.pool[idx];
        return { label: LABELS[i], body: p.body, ox: p.ox, oxScore: p.oxScore,
                 maxChars: p.maxChars, rubric: p.rubric, model: p.model };
      });
      parts = situations;
    } else {
      parts = q.parts(v);
      parts.forEach(function (p, i) { if (!p.label && parts.length > 1) p.label = LABELS[i]; });
    }

    return {
      c: c, q: q, v: v, parts: parts, situations: situations,
      form: q.form,
      situation: q.situation ? q.situation(v) : null,
      exhibits: q.exhibits ? q.exhibits(v) : [],
      model: q.model ? q.model(v) : (situations ? situations.map(function (s) { return s.label + ' ' + s.model; }) : []),
      ref: q.ref, kind: 'main'
    };
  }

  /* ---------- 시작 ---------- */
  function startExam() {
    var db = load(), wrong = db.wrong || {};
    var papers = window.CASES.map(function (c) {
      return { c: c, items: c.questions.map(function (q) { return resolve(c, q); }) };
    });
    S = { mode: 'exam', papers: papers, pi: 0, qi: 0, queue: [], results: [], started: Date.now() };
    S.queue = [papers[0].items[0]];
    renderQ();
  }

  function startPractice(caseId) {
    var c = window.CASES.filter(function (x) { return x.id === caseId; })[0];
    var papers = [{ c: c, items: c.questions.map(function (q) { return resolve(c, q); }) }];
    S = { mode: 'practice', papers: papers, pi: 0, qi: 0, queue: [], results: [], started: Date.now() };
    S.queue = [papers[0].items[0]];
    renderQ();
  }

  function totalQuestions() {
    var n = 0; S.papers.forEach(function (p) { n += p.items.length; }); return n;
  }
  function doneQuestions() {
    var n = 0;
    for (var i = 0; i < S.pi; i++) n += S.papers[i].items.length;
    return n + S.qi;
  }
  function avgPercent() {
    if (!S.results.length) return 0;
    var t = 0; S.results.forEach(function (r) { t += r.res.percent; });
    return Math.round(t / S.results.length);
  }

  /* ---------- 문항 렌더 ---------- */
  function renderQ() {
    var it = S.queue[0];
    var paper = S.papers[S.pi];
    var c = paper.c;

    $('#hud-paper').textContent = '문제 ' + c.no + '. ' + c.title;
    $('#hud-pts').textContent = '(' + c.points + '점)';
    $('#hud-prog').textContent = S.mode === 'practice'
      ? '연습' : doneQuestions() + ' / ' + totalQuestions() + ' 물음';
    $('#g-bar').style.width = (doneQuestions() / totalQuestions() * 100) + '%';
    $('#g-avg').textContent = S.results.length ? avgPercent() + '점' : '—';

    var head = '';
    if (it.kind === 'main' && S.qi === 0) {
      head += '<div class="paper-head"><span class="pno">문제 ' + c.no + '</span>' +
        '<span class="ptitle">' + esc(c.title) + '</span><span class="ppts">' + c.points + '점</span></div>' +
        '<div class="pchap">' + esc(c.chapter) + '</div>' +
        (c.intro ? '<p class="pintro">' + esc(c.intro) + '</p>' : '');
    }
    if (it.kind === 'follow') {
      head += '<div class="q-kind follow">파트너의 추가 질문</div>';
    } else {
      head += '<div class="q-no">(물음 ' + it.q.no + ')' +
        (it.v.label ? ' <span class="vtag">' + esc(it.v.id) + '. ' + esc(it.v.label) + '</span>' : '') + '</div>';
    }

    if (it.situation) head += '<p class="situation">' + nl2br(it.situation) + '</p>';
    head += renderExhibits(it.exhibits);
    head += '<div class="prompt">' + nl2br(it.q ? it.q.text : it.text) + '</div>';

    $('#play-body').innerHTML = head + renderAnswerBox(it) +
      '<div class="row"><button id="btn-submit" class="btn primary">제출</button>' +
      '<span class="tmr" id="tmr"></span></div><div id="result"></div>';

    wireInputs(it);
    $('#btn-submit').addEventListener('click', function () { submit(false); });

    var limit = it.timeLimit || (it.q && it.q.timeLimit) || 180;
    var left = limit;
    $('#tmr').textContent = mmss(left);
    clearInterval(timer);
    timer = setInterval(function () {
      left--;
      var el = $('#tmr'); if (!el) { clearInterval(timer); return; }
      el.textContent = mmss(left);
      el.className = 'tmr' + (left <= 20 ? ' warn' : '');
      if (left <= 0) { clearInterval(timer); submit(true); }
    }, 1000);

    var first = $('.ansbox textarea');
    if (first) first.focus();
    show('play');
  }

  function renderAnswerBox(it) {
    var form = it.form;

    if (form === 'judge') {
      return '<div class="answers judge">' + it.situations.map(function (s, i) {
        return '<div class="jrow" data-i="' + i + '">' +
          '<div class="jhead"><span class="jlabel">' + s.label + '</span>' +
          '<p class="jbody">' + esc(s.body) + '</p></div>' +
          '<div class="jans">' +
          '<div class="oxbox"><span class="oxq">판단</span>' +
          '<button type="button" class="ox" data-ox="O">O</button>' +
          '<button type="button" class="ox" data-ox="X">X</button></div>' +
          '<textarea class="jtext" data-max="' + (s.maxChars || 80) + '" placeholder="근거 (' + (s.maxChars || 80) + '자 이내)"></textarea>' +
          '<div class="cc"><span class="ccv">0</span>/' + (s.maxChars || 80) + '자</div>' +
          '</div></div>';
      }).join('') + '</div>';
    }

    if (form === 'list') {
      return '<div class="answers list">' + it.parts.map(function (p, i) {
        return '<div class="lrow" data-i="' + i + '">' +
          '<span class="llabel">' + (p.label || LABELS[i]) + '</span>' +
          '<textarea class="jtext" rows="1" data-max="' + (p.maxChars || 50) + '" placeholder="' + (p.maxChars || 50) + '자 이내"></textarea>' +
          '<span class="cc"><span class="ccv">0</span>/' + (p.maxChars || 50) + '</span>' +
          '</div>';
      }).join('') + '</div>';
    }

    var p0 = it.parts[0];
    return '<div class="answers essay"><div class="ansbox" data-i="0">' +
      '<textarea class="jtext" data-max="' + (p0.maxChars || 190) + '" placeholder="답안을 입력하세요. 키워드만 나열하면 구조점수가 0점 처리됩니다."></textarea>' +
      '<div class="ansmeta"><span class="cc"><span class="ccv">0</span>자 / 권장 ' + (p0.maxChars || 190) + '자</span></div>' +
      '</div></div>';
  }

  function wireInputs(it) {
    $$('.jtext').forEach(function (ta) {
      var max = +ta.getAttribute('data-max');
      var cc = ta.parentNode.querySelector('.ccv') || (ta.parentNode.parentNode && ta.parentNode.parentNode.querySelector('.ccv'));
      ta.addEventListener('input', function () {
        var n = ta.value.replace(/\s/g, '').length;
        if (cc) { cc.textContent = n; cc.className = 'ccv' + (n > max * 1.15 ? ' over' : ''); }
        if (ta.rows === 1) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
      });
    });
    $$('.ox').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.parentNode;
        $$('.ox', box).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
  }

  function collect(it) {
    if (it.form === 'judge') {
      return $$('.jrow').map(function (row) {
        var on = row.querySelector('.ox.on');
        return { text: row.querySelector('.jtext').value, ox: on ? on.getAttribute('data-ox') : null };
      });
    }
    return $$('.jtext').map(function (ta) { return { text: ta.value, ox: null }; });
  }

  /* ---------- 채점 ---------- */
  function submit(timedOut) {
    clearInterval(timer);
    var it = S.queue[0];
    var answers = collect(it);
    var res = window.AE.gradeParts(answers, it.parts, it.form);

    if (timedOut) {
      res.total = Math.max(0, res.total - Math.round(res.max * 0.05));
      res.percent = res.max ? Math.round(res.total / res.max * 100) : 0;
      res.flags.push('시간 초과 자동 제출 → 5% 차감');
    }
    S.results.push({ it: it, answers: answers, res: res });

    var db = load(); db.wrong = db.wrong || {};
    if (it.kind === 'main') db.wrong[it.c.id + '#' + it.q.no] = res.percent;
    save(db);

    $$('.jtext').forEach(function (t) { t.disabled = true; });
    $$('.ox').forEach(function (b) { b.disabled = true; });
    $('#btn-submit').disabled = true;
    renderResult(it, res);
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

  function renderResult(it, res) {
    var g = res.percent >= 90 ? 'S' : res.percent >= 80 ? 'A' : res.percent >= 70 ? 'B' : res.percent >= 60 ? 'C' : 'D';
    var body = '';

    res.parts.forEach(function (p, i) {
      var r = p.res;
      body += '<div class="presult">' +
        '<div class="phead">' + (p.label ? '<span class="plab">' + p.label + '</span>' : '') +
        (p.ox ? '<span class="oxres ' + (p.oxCorrect ? 'ok' : 'bad') + '">판단 ' +
          (p.given || '무응답') + ' · 정답 ' + p.ox + '</span>' : '') +
        '<span class="pscore">' + p.total + ' / ' + p.max + '</span></div>' +
        '<ul class="items">' + r.must.map(function (x) { return itemRow(x, 'must'); }).join('') +
        (r.bonus || []).map(function (x) { return itemRow(x, 'bonus'); }).join('') +
        (r.trap || []).filter(function (x) { return x.hit; }).map(function (x) { return itemRow(x, 'trap'); }).join('') +
        (r.structure && !r.structure.skip ? r.structure.detail.map(function (d) {
          return '<li class="' + (d[1] ? 'ok' : 'miss') + ' st"><span class="mk">' + (d[1] ? '○' : '✕') +
            '</span><span class="lb">' + esc(d[0]) + '</span><span class="sc">' + d[1] + '/' + d[2] + '</span></li>';
        }).join('') : '') +
        '</ul></div>';
    });

    $('#result').innerHTML =
      '<div class="res"><div class="res-head"><div class="score"><b>' + res.percent + '</b><span>/ 100</span></div>' +
      '<div class="pct g-' + g + '">' + g + ' <small>(' + res.total + '/' + res.max + ')</small></div></div>' +
      (res.flags.length ? '<ul class="flags">' + res.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      body +
      '<details class="model"><summary>모범답안</summary>' +
      (it.model || []).map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') +
      '<div class="ref">' + esc(it.ref || '') + '</div></details>' +
      '<div class="row"><button id="btn-next" class="btn primary">' + nextLabel() + '</button>' +
      '<button id="btn-copy1" class="btn ghost">이 물음 첨삭 요청 복사</button></div></div>';

    $('#btn-next').addEventListener('click', next);
    $('#btn-copy1').addEventListener('click', function () {
      copyOut(buildFeedback([S.results[S.results.length - 1]]), this);
    });
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 진행 ---------- */
  function pendingFollow(it, res) {
    if (it.kind !== 'main' || !it.q.followUps) return null;
    for (var i = 0; i < it.q.followUps.length; i++) {
      var f = it.q.followUps[i];
      var ok = false;
      try { ok = f.when(res, it.v); } catch (e) { ok = false; }
      if (ok) {
        return { kind: 'follow', c: it.c, q: null, v: it.v, form: f.form || 'essay',
                 text: f.q, timeLimit: f.timeLimit || 120,
                 parts: f.parts(it.v), situation: null, exhibits: [],
                 model: f.model ? f.model(it.v) : [], ref: f.ref || it.ref };
      }
    }
    return null;
  }

  function nextLabel() {
    var it = S.queue[0];
    var last = S.results[S.results.length - 1];
    if (last && pendingFollow(it, last.res)) return '파트너의 추가 질문 →';
    var paper = S.papers[S.pi];
    if (S.qi + 1 < paper.items.length) return '다음 물음 →';
    if (S.pi + 1 < S.papers.length) return '문제 ' + S.papers[S.pi + 1].c.no + ' →';
    return '채점 결과 보기';
  }

  function next() {
    var it = S.queue[0];
    var last = S.results[S.results.length - 1];
    var f = last ? pendingFollow(it, last.res) : null;
    if (f) { f.q = { no: it.q.no, text: f.text, timeLimit: f.timeLimit }; S.queue = [f]; renderQ(); return; }

    var paper = S.papers[S.pi];
    if (S.qi + 1 < paper.items.length) { S.qi++; S.queue = [paper.items[S.qi]]; renderQ(); return; }
    if (S.pi + 1 < S.papers.length) { S.pi++; S.qi = 0; S.queue = [S.papers[S.pi].items[0]]; renderQ(); return; }
    finish();
  }

  /* ---------- 종료 ---------- */
  function finish() {
    clearInterval(timer);
    var sum = 0;
    S.results.forEach(function (r) { sum += r.res.percent; });
    var pct = S.results.length ? Math.round(sum / S.results.length) : 0;
    var g = pct >= 90 ? 'S' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : 'D';

    var byStd = {};
    S.results.forEach(function (r) {
      (r.it.c.standards || []).forEach(function (s) {
        byStd[s] = byStd[s] || { sum: 0, n: 0 };
        byStd[s].sum += r.res.percent; byStd[s].n++;
      });
    });
    var stdRows = Object.keys(byStd).map(function (k) {
      return { k: k, p: Math.round(byStd[k].sum / byStd[k].n) };
    }).sort(function (a, b) { return a.p - b.p; });

    var missed = [];
    S.results.forEach(function (r) {
      r.res.parts.forEach(function (p) {
        p.res.must.forEach(function (m) {
          if (!m.hit) missed.push({ t: r.it.c.title, label: m.label, why: m.negated ? '부정문 서술' : m.nearMiss ? '맥락 연결 부족' : '미언급' });
        });
        (p.res.trap || []).forEach(function (t) {
          if (t.hit) missed.push({ t: r.it.c.title, label: '[오개념] ' + t.label, why: '감점' });
        });
        if (p.ox && !p.oxCorrect) missed.push({ t: r.it.c.title, label: '[판단] ' + p.label + ' O·X 오답', why: '정답 ' + p.ox });
      });
    });

    $('#final-body').innerHTML =
      '<div class="final-score"><div class="fs-g g-' + g + '">' + g + '</div>' +
      '<div class="fs-n"><b>' + pct + '</b> / 100</div>' +
      '<div class="fs-sub">' + S.results.length + '물음 · ' + Math.round((Date.now() - S.started) / 60000) + '분</div></div>' +

      '<h3>물음별</h3><div class="scroll"><table class="tbl"><thead><tr><th>문제</th><th>물음</th><th>형식</th><th>점수</th></tr></thead><tbody>' +
      S.results.map(function (r) {
        var f = r.it.form === 'judge' ? 'O·X' : r.it.form === 'list' ? '나열' : '서술';
        return '<tr><td>' + esc(r.it.c.title) + '</td><td>' +
          (r.it.kind === 'follow' ? '추가질문' : '물음 ' + r.it.q.no) +
          (r.it.v && r.it.v.label ? ' <span class="vtag sm">' + esc(r.it.v.id) + '</span>' : '') +
          '</td><td>' + f + '</td><td class="num"><b>' + r.res.percent + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' +

      '<h3>기준서별 (낮은 순)</h3><div class="bars">' +
      stdRows.map(function (s) {
        return '<div class="bar"><span class="bl">' + esc(s.k) + '</span><span class="bt"><i style="width:' +
          s.p + '%"></i></span><span class="bv">' + s.p + '</span></div>';
      }).join('') + '</div>' +

      (missed.length
        ? '<h3>오답노트 · ' + missed.length + '건</h3><ul class="missed">' + missed.map(function (m) {
            return '<li><span class="mtag">' + esc(m.t) + '</span>' + esc(m.label) + ' <em>' + esc(m.why) + '</em></li>';
          }).join('') + '</ul>'
        : '<h3>오답노트</h3><p class="muted">놓친 필수 논점이 없습니다.</p>') +

      '<div class="row"><button id="btn-copy-all" class="btn primary">전체 첨삭 요청 복사</button>' +
      '<button id="btn-home" class="btn ghost">처음으로</button></div>' +
      '<textarea id="outbox" class="outbox" hidden readonly></textarea>';

    $('#btn-copy-all').addEventListener('click', function () { copyOut(buildFeedback(S.results), this); });
    $('#btn-home').addEventListener('click', renderHome);

    var db = load();
    db.history = (db.history || []).concat([{ t: Date.now(), pct: pct, n: S.results.length, mode: S.mode }]).slice(-20);
    save(db);
    show('final');
  }

  /* ---------- 첨삭 요청 텍스트 ---------- */
  function buildFeedback(rows) {
    var L = [];
    L.push('아래는 CPA 2차 회계감사 답안 연습 결과입니다. 실제 2차 채점 기준으로 첨삭해 주세요.');
    L.push('요청: ① 누락 논점 ② 틀리거나 위험한 서술 ③ 답안 표현·구조 교정 ④ 실제라면 몇 점인지');
    L.push('='.repeat(52));
    rows.forEach(function (r, i) {
      var it = r.it;
      L.push('');
      L.push('[' + (i + 1) + '] 문제 ' + it.c.no + '. ' + it.c.title + ' — ' +
             (it.kind === 'follow' ? '추가질문' : '물음 ' + it.q.no) +
             (it.v && it.v.label ? ' (variant ' + it.v.id + ': ' + it.v.label + ')' : ''));
      L.push('기준서: ' + (it.ref || (it.c.standards || []).join(', ')));
      if (it.situation) { L.push('— 상황 —'); L.push(it.situation); }
      L.push('— 문항 —'); L.push(it.q ? it.q.text : it.text);

      r.res.parts.forEach(function (p, k) {
        var a = r.answers[k] || {};
        var s = it.situations && it.situations[k];
        L.push('');
        L.push('  ' + (p.label || '') + (s ? ' ' + s.body : ''));
        if (p.ox) L.push('  내 판단: ' + (a.ox || '무응답') + '  /  정답: ' + p.ox);
        L.push('  내 답안: ' + ((a.text || '').trim() || '(무응답)'));
        L.push('  자동채점: ' + p.total + '/' + p.max);
        var miss = p.res.must.filter(function (m) { return !m.hit; }).map(function (m) { return m.label; });
        var hit = p.res.must.filter(function (m) { return m.hit; }).map(function (m) { return m.label; });
        if (hit.length) L.push('    획득: ' + hit.join(' / '));
        if (miss.length) L.push('    누락: ' + miss.join(' / '));
        var tr = (p.res.trap || []).filter(function (t) { return t.hit; }).map(function (t) { return t.label; });
        if (tr.length) L.push('    감점: ' + tr.join(' / '));
      });
      L.push('— 모범답안 —');
      (it.model || []).forEach(function (m) { L.push('  ' + m); });
    });
    L.push('');
    L.push('='.repeat(52));
    L.push('※ 자동채점은 키워드 기반이라 오채점이 있을 수 있습니다. 정답인데 누락으로 잡힌 표현이 있으면 지적해 주세요.');
    return L.join('\n');
  }

  function copyOut(text, btn) {
    var done = function () {
      var old = btn.textContent; btn.textContent = '복사됨 ✓';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    function fallback() {
      var box = $('#outbox');
      if (!box) {
        box = document.createElement('textarea');
        box.id = 'outbox'; box.className = 'outbox'; box.readOnly = true;
        $('#screen-play').appendChild(box);
      }
      box.hidden = false; box.value = text; box.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { btn.textContent = '↓ 아래 상자에서 복사'; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    clearInterval(timer);
    var db = load(), h = (db.history || []).slice().reverse();
    var nQ = 0, nPts = 0;
    window.CASES.forEach(function (c) { nQ += c.questions.length; nPts += c.points; });

    $('#home-body').innerHTML =
      '<div class="modes">' +
      '<button id="m-exam" class="mode"><b>모의고사 1회분</b><span>문제 ' + window.CASES.length +
      '개 · 물음 ' + nQ + '개 · ' + nPts + '점. 회차마다 상황과 조건이 바뀝니다.</span></button>' +
      '<div class="mode alt"><b>문제 단품 연습</b><span>채점이 납득되는지 확인할 때 쓰세요.</span>' +
      '<select id="sel-case">' + window.CASES.map(function (c) {
        return '<option value="' + c.id + '">문제 ' + c.no + '. ' + esc(c.title) + ' (' + c.points + '점)</option>';
      }).join('') + '</select><button id="m-prac" class="btn small">이 문제 연습</button></div></div>' +
      (h.length ? '<h3>최근 기록</h3><div class="scroll"><table class="tbl"><thead><tr><th>일시</th><th>구분</th><th>물음</th><th>점수</th></tr></thead><tbody>' +
        h.slice(0, 8).map(function (x) {
          var d = new Date(x.t);
          return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
            ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</td><td>' +
            (x.mode === 'exam' ? '모의고사' : '연습') + '</td><td class="num">' + x.n +
            '</td><td class="num"><b>' + x.pct + '</b></td></tr>';
        }).join('') + '</tbody></table></div>' : '');

    $('#m-exam').addEventListener('click', startExam);
    $('#m-prac').addEventListener('click', function () { startPractice($('#sel-case').value); });
    show('home');
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#btn-quit').addEventListener('click', function () {
      if (!S || confirm('진행 중인 시험을 종료하고 처음으로 돌아갈까요?')) renderHome();
    });
    renderHome();
  });
})();
