/* ============================================================
   감사 시즌 2026 — 진행 엔진 (game.js)
   ------------------------------------------------------------
   · 입력은 전부 타이핑. 판단도 문장 안에 써야 인정된다.
   · 게이지 3종 : 감사증거 / 감사시간 / 신뢰
   · 분기 : 답안에서 특정 논점을 짚으면 flag 를 얻고 뒤 장면이 바뀐다
   · 에필로그 : 1년 뒤 감리 결과로 엔딩이 갈린다
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'auditSim.v3';

  var S = null, timer = null;

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function mmss(s) { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + ('0' + (s % 60)).slice(-2); }
  function show(id) {
    ['home', 'play', 'end'].forEach(function (k) { $('#screen-' + k).hidden = (k !== id); });
    window.scrollTo(0, 0);
  }
  function val(x, v) { return (typeof x === 'function') ? x(v) : x; }

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

  /* ---------- 장면 해석 (variant · 분기 · 누적) ---------- */
  function resolve(sc) {
    var v = { id: '-', label: '' };
    if (sc.variants) {
      var ok = sc.variants.filter(function (x) {
        return !x.need || S.flags[x.need];
      });
      // need 가 걸린 판본이 있으면 그것을 우선한다 (분기의 결과를 보여주기 위해)
      var forced = sc.variants.filter(function (x) { return x.need && S.flags[x.need]; });
      v = forced.length ? forced[0] : pick(ok.length ? ok : sc.variants);
    }
    var it = {
      sc: sc, v: v,
      line: v.line || sc.line,
      situation: val(sc.situation, v),
      exhibits: val(sc.exhibits, v) || [],
      rubric: val(sc.rubric, v),
      model: val(sc.model, v),
      verdict: val(sc.verdict, v),
      prompt: sc.prompt, maxChars: sc.maxChars, timeLimit: sc.timeLimit
    };
    if (sc.dynamic) applyDynamic(it);
    return it;
  }

  /* 앞 장면의 결과가 뒤 장면의 숫자를 바꾼다 */
  function applyDynamic(it) {
    if (it.sc.id === 's9') {
      var rows = [['매출 기간귀속 오류', '8.4', '거부'],
                  ['대손충당금 과소', '5.1', '거부'],
                  ['미지급비용 누락', '3.7', '거부']];
      var total = 8.4 + 5.1 + 3.7;
      if (!S.flags.fraud_alert) {
        rows.push(['특수관계자 관련 가공매출 (뒤늦게 확인)', '18.6', '거부']);
        total += 18.6;
        S.late = true;
      }
      if (!S.flags.inv_ok) {
        rows.push(['제3자 보관 재고 과대계상', '9.2', '거부']);
        total += 9.2;
      }
      rows.push(['미수정 합계', total.toFixed(1), '']);
      S.misTotal = total;
      it.exhibits = [
        { type: 'table', title: '미수정왜곡표시 집계 (단위: 억원, 세전이익 기준)',
          head: ['항목', '금액', '경영진 대응'], rows: rows },
        { type: 'kv', title: '중요성', items: [
          ['재무제표 전체 중요성', '12억원'], ['수행중요성', '8억 4천만원'],
          ['명백히 사소한 금액', '6,000만원'], ['미수정 합계', total.toFixed(1) + '억원']] }
      ];
      it.situation = it.sc.situation +
        (S.late ? ' 특히 특수관계자 관련 거래는 감사 종료 직전에야 확인되어 추가 절차를 수행할 시간이 부족하였다.' : '');
    }

    if (it.sc.id === 's10') {
      var t = S.misTotal || 17.2;
      var ev = S.gauge.E;
      var kind, why;
      if (ev < 55) {
        kind = '의견거절'; why = '충분하고 적합한 감사증거를 입수하지 못한 부분이 재무제표 전반에 걸쳐 있다';
      } else if (t >= 35) {
        kind = '부적정의견'; why = '미수정왜곡표시 ' + t.toFixed(1) + '억원이 재무제표의 다수 요소에 걸쳐 중요하고 전반적이다';
      } else if (t > 12) {
        kind = '한정의견'; why = '미수정왜곡표시 ' + t.toFixed(1) + '억원이 중요성 12억원을 초과하나 특정 계정에 국한되어 전반적이지 않다';
      } else {
        kind = '적정의견'; why = '미수정왜곡표시 합계가 중요성에 미달한다';
      }
      S.correctOpinion = kind;
      it.situation = '감사 종료 단계이다. 미수정왜곡표시 합계는 ' + t.toFixed(1) +
        '억원이고 재무제표 전체 중요성은 12억원이다. 감사증거 확보 수준은 ' + ev + '점이다.';
      it.exhibits = [{ type: 'kv', title: '판단 자료', items: [
        ['미수정왜곡표시 합계', t.toFixed(1) + '억원'],
        ['재무제표 전체 중요성', '12억원'],
        ['감사증거 게이지', ev + ' / 100'],
        ['핵심감사사항', '3건 (상장회사)']] }];

      // 정답 의견을 필수 논점으로 추가하고, 나머지는 함정으로
      var all = ['적정의견', '한정의견', '부적정의견', '의견거절'];
      var r = JSON.parse(JSON.stringify(it.rubric));
      r.must = r.must.concat([{ kw: [kind], score: 18, label: kind + ' 표명', notBefore: kind === '적정의견' ? ['부'] : undefined }]);
      r.trap = (r.trap || []).filter(function (x) { return x.kw[0] !== '적정의견' || kind === '적정의견'; });
      all.forEach(function (o) {
        if (o !== kind) r.trap.push({ kw: [o], score: -14, label: '오답 의견 — ' + o, notBefore: o === '적정의견' ? ['부'] : undefined });
      });
      it.rubric = r;
      it.model = it.model.concat(['이번 회차의 정답: ' + kind + '. ' + why + '.']);
    }
  }

  /* ---------- 시작 ---------- */
  function start() {
    S = {
      i: 0, results: [], flags: {}, started: Date.now(),
      gauge: { E: 50, T: 100, R: 60 },
      toasts: []
    };
    step();
  }

  /* ---------- 장면 렌더 ---------- */
  function step() {
    var sc = window.SCENES[S.i];
    var it = resolve(sc);
    S.cur = it;

    var cast = window.CAST[sc.speaker] || window.CAST.manager;
    var g = S.gauge;

    $('#hud-day').textContent = sc.day;
    $('#hud-ch').textContent = sc.chapter;
    $('#hud-n').textContent = (S.i + 1) + ' / ' + window.SCENES.length;
    $('#gauges').innerHTML =
      '<span class="gz">' + window.ART.ring(g.E, '감사증거', 'var(--acc)') + '</span>' +
      '<span class="gz">' + window.ART.ring(g.T, '감사시간', g.T < 30 ? 'var(--bad)' : 'var(--ok)') + '</span>' +
      '<span class="gz">' + window.ART.ring(g.R, '신뢰', g.R < 40 ? 'var(--bad)' : 'var(--warn)') + '</span>';

    var toast = S.toasts.length
      ? '<div class="toast">' + S.toasts.map(esc).join('<br>') + '</div>' : '';
    S.toasts = [];

    $('#play-body').innerHTML =
      '<div class="scene">' + window.ART.scene(sc.art) +
      '<div class="scene-tag">' + esc(sc.area) + '</div></div>' +
      toast +
      '<div class="say">' + window.ART.avatar(cast.avatar) +
      '<div class="bubble"><b>' + esc(cast.name) + '</b><span>' + esc(cast.role) + '</span>' +
      '<p>' + esc(it.line) + '</p></div></div>' +
      (it.situation ? '<p class="situation">' + esc(it.situation) + '</p>' : '') +
      exhibits(it.exhibits) +
      '<div class="prompt">' + esc(it.prompt) + '</div>' +
      (it.verdict ? '<div class="vhint">판단(해당한다 / 해당하지 않는다)을 <b>문장 안에</b> 반드시 쓰십시오. 판단이 틀리면 근거는 채점되지 않습니다.</div>' : '') +
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

  /* ---------- 채점 ---------- */
  function submit(timedOut) {
    clearInterval(timer);
    var it = S.cur, sc = it.sc;
    var text = $('#ans').value;

    var part = { maxChars: it.maxChars, rubric: it.rubric };
    if (it.verdict) { part.verdict = it.verdict; part.verdictScore = it.verdict.score || 14; }
    var res = window.AE.gradeParts([{ text: text }], [part], 'essay');
    var p = res.parts[0];

    if (timedOut) {
      res.total = Math.max(0, res.total - Math.round(res.max * 0.05));
      res.percent = res.max ? Math.round(res.total / res.max * 100) : 0;
      res.flags.push('시간 초과 자동 제출 → 5% 차감');
    }

    // 게이지
    var trapHit = (p.res.trap || []).filter(function (t) { return t.hit; }).length;
    var over = Math.max(0, text.replace(/\s/g, '').length - it.maxChars * 1.15);
    S.gauge.E = clamp(Math.round(S.gauge.E + (res.percent - 55) * 0.45), 0, 100);
    S.gauge.T = clamp(Math.round(S.gauge.T - (sc.cost || 8) - over / 40 - (timedOut ? 5 : 0)), 0, 100);
    S.gauge.R = clamp(Math.round(S.gauge.R + (res.percent >= 80 ? 5 : res.percent >= 60 ? 1 : -4)
                     - trapHit * 8 - (p.verdict && !p.verdict.correct ? 4 : 0)), 0, 100);

    // 분기 flag
    var hits = {};
    p.res.must.forEach(function (m) { if (m.hit) hits[m.label] = 1; });
    (sc.flags || []).forEach(function (f) {
      if (f.if.every(function (l) { return hits[l]; })) {
        S.flags[f.set] = true;
        if (f.toast) S.toasts.push(f.toast);
      }
    });

    S.results.push({ it: it, text: text, res: res, part: p });
    $('#ans').disabled = true;
    $('#btn-go').disabled = true;
    renderResult(it, res, p);
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

  function renderResult(it, res, p) {
    var g = res.percent >= 90 ? 'S' : res.percent >= 80 ? 'A' : res.percent >= 70 ? 'B' : res.percent >= 60 ? 'C' : 'D';
    var r = p.res;
    var last = S.i + 1 >= window.SCENES.length;

    var vbox = '';
    if (p.verdict) {
      var ok = p.verdict.correct;
      vbox = '<div class="vres ' + (ok ? 'ok' : 'bad') + '">판단 ' +
        (p.verdict.given === 'yes' ? '해당한다' : p.verdict.given === 'no' ? '해당하지 않는다' : '미기재') +
        ' · 정답 ' + (p.verdict.expected === 'yes' ? '해당한다' : '해당하지 않는다') +
        (ok ? '' : ' — 판단이 틀려 근거 서술은 채점되지 않았습니다') + '</div>';
    }

    $('#result').innerHTML =
      '<div class="res"><div class="res-head"><div class="score"><b>' + res.percent + '</b><span>/ 100</span></div>' +
      '<div class="pct g-' + g + '">' + g + '</div></div>' + vbox +
      (res.flags.length ? '<ul class="flags">' + res.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      '<ul class="items">' +
      r.must.map(function (x) { return itemRow(x, 'must'); }).join('') +
      (r.bonus || []).filter(function (x) { return x.hit; }).map(function (x) { return itemRow(x, 'bonus'); }).join('') +
      (r.trap || []).filter(function (x) { return x.hit; }).map(function (x) { return itemRow(x, 'trap'); }).join('') +
      (r.structure && !r.structure.skip ? r.structure.detail.map(function (d) {
        return '<li class="' + (d[1] ? 'ok' : 'miss') + ' st"><span class="mk">' + (d[1] ? '○' : '✕') +
          '</span><span class="lb">' + esc(d[0]) + '</span><span class="sc">' + d[1] + '/' + d[2] + '</span></li>';
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
    if (S.i >= window.SCENES.length) return epilogue();
    step();
  }

  /* ---------- 에필로그 ---------- */
  function epilogue() {
    clearInterval(timer);
    var g = S.gauge;
    var sum = 0; S.results.forEach(function (r) { sum += r.res.percent; });
    var avg = Math.round(sum / S.results.length);

    // 최종 의견 정확도
    var lastRes = S.results[S.results.length - 1];
    var opinionOK = lastRes.part.res.must.some(function (m) {
      return m.hit && m.label.indexOf(S.correctOpinion) === 0;
    });

    var end, tone, body;
    if (g.T <= 0) {
      end = '마감 실패'; tone = 'bad';
      body = '감사시간이 소진되어 법정기한 내에 감사보고서를 발행하지 못했다. 회사는 감사인 교체를 통보했고, 법인은 이 건을 손실로 처리했다.';
    } else if (!opinionOK) {
      end = '감리 지적 · 징계'; tone = 'bad';
      body = '1년 뒤, ㈜서린정밀의 분식이 드러났다. 감리 결과 미수정왜곡표시 ' + (S.misTotal || 0).toFixed(1) +
             '억원이 중요성을 초과했음에도 표명한 의견이 부적절했다는 판단이 내려졌다. ' +
             (S.late ? '특히 특수관계자 거래를 감사 종료 직전에야 확인해 실증절차가 부족했다는 점이 지적되었다.' : '') +
             ' 업무수행이사와 담당 회계사에게 징계가 내려졌다.';
    } else if (g.E >= 72 && g.R >= 65) {
      end = '무사통과'; tone = 'ok';
      body = '1년 뒤 감리에서 이 건은 무작위 표본으로 선정되었다. 조서는 논점마다 근거와 결론이 남아 있었고, 지적사항 없이 종결되었다. ' +
             '정한별 이사는 자네를 내년 시즌 인차지로 올렸다.';
    } else if (g.E >= 60) {
      end = '조서 미비 지적'; tone = 'warn';
      body = '감사의견 자체는 적절했다. 다만 감리에서 일부 논점의 감사절차와 결론이 조서에 충분히 문서화되지 않았다는 지적을 받았다. ' +
             '법인은 개선계획을 제출했고, 자네에게는 문서화 교육이 배정되었다.';
    } else {
      end = '증거 부족 경고'; tone = 'warn';
      body = '의견은 맞았으나 뒷받침하는 감사증거가 얇았다. 감리에서 "결론은 타당하나 증거가 결론을 지지하지 못한다"는 평가를 받았다. ' +
             '운이 좋았다는 뜻이다.';
    }

    var weak = {};
    S.results.forEach(function (r) {
      var a = r.it.sc.area;
      weak[a] = weak[a] || { s: 0, n: 0 };
      weak[a].s += r.res.percent; weak[a].n++;
    });
    var rows = Object.keys(weak).map(function (k) {
      return { k: k, p: Math.round(weak[k].s / weak[k].n) };
    }).sort(function (a, b) { return a.p - b.p; });

    var missed = [];
    S.results.forEach(function (r) {
      r.part.res.must.forEach(function (m) {
        if (!m.hit) missed.push({ t: r.it.sc.chapter, l: m.label, w: m.negated ? '부정문 서술' : m.nearMiss ? '맥락 연결 부족' : '미언급' });
      });
      (r.part.res.trap || []).forEach(function (t) {
        if (t.hit) missed.push({ t: r.it.sc.chapter, l: '[오개념] ' + t.label, w: '감점' });
      });
      if (r.part.verdict && !r.part.verdict.correct) {
        missed.push({ t: r.it.sc.chapter, l: '[판단] 방향 오답', w: '근거 서술 전체 무효' });
      }
    });

    $('#end-body').innerHTML =
      '<div class="scene">' + window.ART.scene('review') + '</div>' +
      '<div class="ending ' + tone + '"><div class="etag">1년 뒤</div>' +
      '<h2>' + esc(end) + '</h2><p>' + esc(body) + '</p></div>' +
      '<div class="finalg">' +
      '<span class="gz">' + window.ART.ring(g.E, '감사증거', 'var(--acc)') + '</span>' +
      '<span class="gz">' + window.ART.ring(g.T, '감사시간', 'var(--ok)') + '</span>' +
      '<span class="gz">' + window.ART.ring(g.R, '신뢰', 'var(--warn)') + '</span>' +
      '<span class="gz">' + window.ART.ring(avg, '답안 평균', 'var(--ink3)') + '</span></div>' +

      '<h3>영역별</h3><div class="bars">' + rows.map(function (x) {
        return '<div class="bar"><span class="bl">' + esc(x.k) + '</span><span class="bt"><i style="width:' +
          x.p + '%"></i></span><span class="bv">' + x.p + '</span></div>';
      }).join('') + '</div>' +

      '<h3>장면별</h3><div class="scroll"><table class="tbl"><thead><tr><th>장면</th><th>영역</th><th>점수</th></tr></thead><tbody>' +
      S.results.map(function (r) {
        return '<tr><td>' + esc(r.it.sc.chapter) + '</td><td>' + esc(r.it.sc.area) +
          '</td><td class="num"><b>' + r.res.percent + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' +

      (missed.length ? '<h3>오답노트 · ' + missed.length + '건</h3><ul class="missed">' +
        missed.map(function (m) {
          return '<li><span class="mtag">' + esc(m.t) + '</span>' + esc(m.l) + ' <em>' + esc(m.w) + '</em></li>';
        }).join('') + '</ul>' : '') +

      '<div class="row"><button id="btn-ca" class="btn primary">전체 첨삭 요청 복사</button>' +
      '<button id="btn-again" class="btn ghost">새 시즌 시작</button></div>' +
      '<textarea id="outbox" class="outbox" hidden readonly></textarea>';

    $('#btn-ca').addEventListener('click', function () { copyOut(feedback(S.results), this); });
    $('#btn-again').addEventListener('click', home);

    var db = load();
    db.history = (db.history || []).concat([{ t: Date.now(), end: end, avg: avg, E: g.E, T: g.T, R: g.R }]).slice(-20);
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
      L.push('[' + (i + 1) + '] ' + sc.chapter + ' (' + sc.area + ')' +
             (r.it.v && r.it.v.label ? ' — ' + r.it.v.label : ''));
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
      '<p class="hero-sub">모든 대응은 <b>타이핑</b>으로 한다. 답안에서 무엇을 짚느냐에 따라 뒤 장면이 바뀌고, ' +
      '1년 뒤 감리 결과로 엔딩이 갈린다.</p>' +
      '<ul class="rules"><li><b>감사증거</b> 답안 수준만큼 쌓인다. 낮으면 마지막에 범위제한이 된다</li>' +
      '<li><b>감사시간</b> 장면마다 줄고, 답이 길수록 더 준다. 0이 되면 마감 실패</li>' +
      '<li><b>신뢰</b> 오개념을 쓰면 급락한다</li></ul>' +
      '<button id="btn-start" class="btn primary big">감사 착수</button></div>' +
      (h.length ? '<h3>지난 시즌</h3><div class="scroll"><table class="tbl"><thead><tr><th>일시</th><th>엔딩</th><th>평균</th><th>증거</th></tr></thead><tbody>' +
        h.slice(0, 6).map(function (x) {
          var d = new Date(x.t);
          return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + '</td><td>' + esc(x.end) +
            '</td><td class="num">' + x.avg + '</td><td class="num">' + x.E + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '');
    $('#btn-start').addEventListener('click', start);
    show('home');
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#btn-quit').addEventListener('click', function () {
      if (!S || confirm('진행 중인 시즌을 버리고 처음으로 돌아갈까요?')) home();
    });
    home();
  });
})();
