/* ============================================================
   문항 형식 (formats.js) — 서술 · 판단 · 객관식 · 빈칸 · 분류
   ------------------------------------------------------------
   FORMATS[type] = {
     mount(host, part, api)   → { answer(), destroy(), refresh() }
     review(host, part, ans, g)  채점 뒤 같은 자리에 정답을 표시
   }
   api = { submit(ans), sound(name), clues() }
   채점은 js/engine.js 의 AE.gradeAny 가 한다. 여기서는 그리기와 입력만.
   ============================================================ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function q(host, sel) { return host.querySelector(sel); }
  function qa(host, sel) { return Array.prototype.slice.call(host.querySelectorAll(sel)); }
  function sound(api, n) { if (api && api.sound) api.sound(n); }
  function isTyping(e) { var t = e.target; return t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT'); }
  function keys(fn) {
    function h(e) { fn(e); }
    document.addEventListener('keydown', h);
    return function () { document.removeEventListener('keydown', h); };
  }

  /* 답안 양식 칩 */
  function reqs(p, extra) {
    var out = (p.guide || []).map(function (g) {
      var a = String(g).split(' — ');
      return { t: a[0].replace(/^[①②③④]\s*/, ''), tip: a[1] || '' };
    }).filter(function (g) { return !(p.type === 'judge' && /^판단/.test(g.t)); });
    var html = out.map(function (g) { return '<li title="' + esc(g.tip) + '">' + esc(g.t) + '</li>'; }).join('');
    var m = /(\d+)\s*줄/.exec(p.ask || '');
    if (p.type === 'write' || p.type === 'judge') html += '<li class="lim">' + (m ? m[1] + '줄 · ' : '') + p.maxChars + '자</li>';
    return '<ul class="reqs">' + (extra || '') + html + '</ul>';
  }

  function goBar() {
    return '<div class="go"><button type="button" class="btn" data-act="submit">제출 <kbd>Ctrl Enter</kbd></button><span class="err" data-k="err"></span></div>';
  }
  function err(host, msg) {
    var e = q(host, '[data-k="err"]');
    if (!e) return;
    e.textContent = msg || '';
    if (msg && global.FX) global.FX.shake(e);
  }

  function evChips(api) {
    var list = api && api.clues ? api.clues() : [];
    return list.map(function (c) {
      var t = c.text.length > 26 ? c.text.slice(0, 26) + '…' : c.text;
      return '<span><b>' + esc(c.code) + '</b>' + esc(t) + '</span>';
    }).join('');
  }

  function bindSubmit(host, fn) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="submit"]');
      if (b && host.contains(b)) fn();
    });
    return keys(function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); fn(); }
    });
  }

  /* ── 서술 · 판단 ─────────────────────────────────────── */
  function writeMount(host, p, api) {
    var judge = p.type === 'judge';
    var pick = null;
    var extra = '';
    if (!judge && p.verdict && p.verdict.label) {
      extra = '<li class="hot" title="' + esc(p.verdict.label.yes + ' / ' + p.verdict.label.no) + '">판단 문장 필수</li>';
    }
    host.innerHTML =
      '<p class="ask">' + esc(p.ask) + '</p>' + reqs(p, extra) +
      (judge ? '<div class="pick" data-k="pick">' +
        '<button type="button" data-v="yes"><kbd>A</kbd>' + esc(p.verdict.label.yes) + '</button>' +
        '<button type="button" data-v="no"><kbd>B</kbd>' + esc(p.verdict.label.no) + '</button></div>' : '') +
      '<div class="write"><div class="w-h"><span>' + (judge ? '근거' : '답안') + '</span>' +
        '<span class="cnt" data-k="cnt"><b>0</b> / ' + p.maxChars + '자</span></div>' +
        '<textarea data-k="ta" spellcheck="false" autocomplete="off"></textarea>' +
        '<div class="ev" data-k="ev">' + evChips(api) + '</div></div>' +
      goBar();

    var ta = q(host, '[data-k="ta"]'), cnt = q(host, '[data-k="cnt"]');
    var last = 0;
    ta.addEventListener('input', function () {
      var n = ta.value.replace(/\s/g, '').length;
      cnt.firstChild.textContent = n;
      cnt.classList.toggle('over', n > p.maxChars);
      err(host, '');
      var now = Date.now();
      if (now - last > 45) { sound(api, 'type'); last = now; }
    });

    function choose(v) {
      pick = v;
      qa(host, '[data-k="pick"] button').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-v') === v); });
      sound(api, 'tick');
      err(host, '');
      ta.focus();
    }
    if (judge) {
      q(host, '[data-k="pick"]').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (b) choose(b.getAttribute('data-v'));
      });
    }
    function submit() {
      if (judge && !pick) { err(host, '판단부터 고르기 · A / B'); return; }
      if (!ta.value.trim()) { err(host, '답안이 비어 있음'); ta.focus(); return; }
      api.submit({ text: ta.value, pick: pick });
    }
    var off1 = bindSubmit(host, submit);
    var off2 = keys(function (e) {
      if (!judge || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); choose('yes'); }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); choose('no'); }
    });
    setTimeout(function () { (judge ? q(host, '[data-k="pick"] button') : ta).focus(); }, 30);
    return {
      answer: function () { return { text: ta.value, pick: pick }; },
      refresh: function () { var ev = q(host, '[data-k="ev"]'); if (ev) ev.innerHTML = evChips(api); },
      destroy: function () { off1(); off2(); }
    };
  }

  function highlight(model, p, r) {
    var marks = [];
    (r.must || []).forEach(function (m, i) {
      var item = (p.rubric.must || [])[i] || {};
      var kws = [].concat(item.kw || [], item.half || []);
      for (var k = 0; k < kws.length; k++) {
        var at = model.indexOf(kws[k]);
        if (at >= 0) { marks.push({ at: at, len: kws[k].length, cls: m.hit ? 'hl-ok' : m.partial ? 'hl-half' : 'hl-no' }); break; }
      }
    });
    marks.sort(function (a, b) { return a.at - b.at; });
    var out = '', pos = 0;
    marks.forEach(function (mk) {
      if (mk.at < pos) return;
      out += esc(model.slice(pos, mk.at)) + '<span class="' + mk.cls + '">' + esc(model.substr(mk.at, mk.len)) + '</span>';
      pos = mk.at + mk.len;
    });
    return out + esc(model.slice(pos));
  }

  function writeReview(host, p, ans, g) {
    var judge = p.type === 'judge';
    var pickEl = q(host, '[data-k="pick"]');
    if (pickEl) {
      pickEl.classList.add('locked');
      qa(pickEl, 'button').forEach(function (b) {
        if (b.getAttribute('data-v') === p.verdict.answer) b.classList.add('right');
      });
    }
    qa(host, '.write, .go').forEach(function (el) { el.remove(); });
    var reqsEl = q(host, '.reqs');
    if (reqsEl) reqsEl.remove();
    return {
      model: '<div class="model"><span class="k">모범답안</span><p>' + highlight(p.model, p, g.res) + '</p></div>',
      mine: '<span class="k">내 답안</span>' +
        (judge ? '<div class="pickline">판단 · ' + esc(ans.pick ? p.verdict.label[ans.pick] : '없음') + '</div>' : '') +
        '<p>' + (ans.text && ans.text.trim() ? esc(ans.text) : '<span class="dim">(빈 답안)</span>') + '</p>'
    };
  }

  /* ── 객관식 ──────────────────────────────────────────── */
  function order(p) {
    var idx = p.options.map(function (o, i) { return i; });
    if (p.fixed) return idx;
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = idx[i];
      idx[i] = idx[j]; idx[j] = t;
    }
    return idx;
  }

  function choiceMount(host, p, api) {
    var ord = order(p), picked = [];
    host.innerHTML =
      '<p class="ask">' + esc(p.ask) + '</p>' +
      '<ul class="reqs">' + (p.multi ? '<li class="hot">모두 고르기</li>' : '<li>하나만</li>') +
        '<li class="lim">숫자 1–' + ord.length + '</li></ul>' +
      '<div class="opts" data-k="opts">' + ord.map(function (oi, i) {
        return '<button type="button" class="opt" data-o="' + oi + '"><kbd>' + (i + 1) + '</kbd>' +
          '<span class="ot">' + esc(p.options[oi].t) + '</span>' + (p.multi ? '<span class="box"></span>' : '<span></span>') + '</button>';
      }).join('') + '</div>' + goBar();

    function draw() {
      qa(host, '.opt').forEach(function (b) {
        b.classList.toggle('sel', picked.indexOf(+b.getAttribute('data-o')) >= 0);
      });
    }
    function toggle(oi) {
      var at = picked.indexOf(oi);
      if (p.multi) { if (at >= 0) picked.splice(at, 1); else picked.push(oi); }
      else picked = at >= 0 ? [] : [oi];
      sound(api, 'tick');
      err(host, '');
      draw();
    }
    q(host, '[data-k="opts"]').addEventListener('click', function (e) {
      var b = e.target.closest('.opt');
      if (b) toggle(+b.getAttribute('data-o'));
    });
    function submit() {
      if (!picked.length) { err(host, '보기를 고르지 않음'); return; }
      api.submit({ picked: picked.slice(), order: ord.slice() });
    }
    var off1 = bindSubmit(host, submit);
    var off2 = keys(function (e) {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key) && ord[+e.key - 1] != null) { e.preventDefault(); toggle(ord[+e.key - 1]); }
      else if (e.key === 'Enter' && !p.multi && picked.length) { e.preventDefault(); submit(); }
    });
    return {
      answer: function () { return { picked: picked.slice(), order: ord.slice() }; },
      refresh: function () {},
      destroy: function () { off1(); off2(); }
    };
  }

  function choiceReview(host, p, ans) {
    var picked = ans.picked || [];
    var box = q(host, '[data-k="opts"]');
    if (box) {
      box.classList.add('done');
      qa(box, '.opt').forEach(function (b) {
        var oi = +b.getAttribute('data-o'), o = p.options[oi], on = picked.indexOf(oi) >= 0;
        b.classList.remove('sel');
        var cls = o.ok ? (on ? 'right' : 'missed') : (on ? 'wrong' : 'dimmed');
        b.classList.add(cls);
        b.disabled = true;
        var mark = cls === 'right' ? '✓ 정답' : cls === 'missed' ? '○ 놓침' : cls === 'wrong' ? '✗ 오답' : '';
        var why = (cls === 'wrong' || cls === 'missed') && o.why ? '<span class="why">' + esc(o.why) + '</span>' : '';
        b.innerHTML = b.querySelector('kbd').outerHTML + '<span class="ot">' + esc(o.t) + why + '</span><span class="res-m">' + mark + '</span>';
      });
    }
    qa(host, '.go, .reqs').forEach(function (el) { el.remove(); });
    var right = p.options.filter(function (o) { return o.ok; }).map(function (o) { return o.t; });
    return {
      model: '',
      mine: '<span class="k">내 선택</span><p>' + (picked.length ? picked.map(function (i) { return esc(p.options[i].t); }).join('<br>') : '(선택 없음)') + '</p>',
      key: right
    };
  }

  /* ── 빈칸 ────────────────────────────────────────────── */
  var CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
  function circ(i) { return CIRC.charAt(i) || String(i + 1); }
  // 초성 칸 — 글자 수만큼 칸을 깔고 칸마다 초성을 적는다 (띄어쓰기는 빈 틈)
  function choTiles(word) {
    var AE = global.AE, n = 0;
    return String(word).split('').map(function (c) {
      if (/\s/.test(c)) return '<i class="sp"></i>';
      return '<i style="animation-delay:' + (n++ * 45) + 'ms">' + esc(AE.choseong(c)) + '</i>';
    }).join('');
  }
  function clozeMount(host, p, api) {
    var P = global.AE.parseCloze(p.text), hints = [], at = 0;
    var html = P.seg.map(function (s) {
      if (typeof s === 'string') return esc(s);
      var b = P.blanks[s.blank], w = Math.max(5, b.ans[0].length + 2);
      return '<span class="bl" data-b="' + s.blank + '"><input data-i="' + s.blank + '" size="' + w + '" placeholder="' + circ(s.blank) + '" autocomplete="off" spellcheck="false" aria-label="빈칸 ' + (s.blank + 1) + '"></span>';
    }).join('');
    host.innerHTML =
      '<p class="ask">' + esc(p.ask) + '</p>' +
      '<ul class="reqs"><li class="lim">빈칸 ' + P.blanks.length + '</li><li class="lim">Tab · Enter 다음 칸</li><li class="lim">초성 힌트 = 그 칸 절반</li></ul>' +
      '<div class="cz">' + (p.src ? '<span class="src">' + esc(p.src) + '</span>' : '') + html + '</div>' +
      '<div class="go"><button type="button" class="btn" data-act="submit">제출 <kbd>Ctrl Enter</kbd></button>' +
      '<button type="button" class="btn ghost cz-hint" data-act="hint"><b data-k="hn">' + circ(0) + '</b> <span data-k="ht">초성 보기</span><small data-k="hs">그 칸 ½</small></button>' +
      '<span class="err" data-k="err"></span></div>';
    var inputs = qa(host, '.bl input'), hb = q(host, '[data-act="hint"]');
    function drawHint() {
      var used = hints.indexOf(at) >= 0;
      q(hb, '[data-k="hn"]').textContent = circ(at);
      q(hb, '[data-k="ht"]').textContent = used ? '초성 공개됨' : '초성 보기';
      q(hb, '[data-k="hs"]').textContent = used ? '' : '그 칸 ½';
      hb.disabled = used;
    }
    function fill(i) {
      var span = inputs[i].parentNode, tiles = qa(span, '.cho i:not(.sp)');
      var n = inputs[i].value.replace(/\s/g, '').length;
      tiles.forEach(function (t, k) { t.classList.toggle('on', k < n); });
    }
    function reveal(i) {
      if (hints.indexOf(i) >= 0) return;
      hints.push(i);
      var span = inputs[i].parentNode, ans = P.blanks[i].ans[0];
      var cho = document.createElement('span');
      cho.className = 'cho';
      cho.setAttribute('aria-label', '초성 ' + global.AE.choseong(ans));
      cho.innerHTML = choTiles(ans);
      span.appendChild(cho);
      span.classList.add('hinted');
      q(host, '.cz').classList.add('hinting');
      inputs[i].placeholder = '';
      fill(i);
      sound(api, 'flip');
      drawHint();
      inputs[i].focus();
    }
    inputs.forEach(function (inp, i) {
      inp.addEventListener('focus', function () { at = i; drawHint(); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (inputs[i + 1]) inputs[i + 1].focus(); else q(host, '[data-act="submit"]').focus();
        }
      });
      inp.addEventListener('input', function () { err(host, ''); sound(api, 'type'); if (hints.indexOf(i) >= 0) fill(i); });
    });
    // 버튼을 누르는 순간 칸의 포커스가 빠지지 않게 — 어느 칸의 힌트인지 그대로 남는다
    hb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    hb.addEventListener('click', function () { reveal(at); });
    function values() { return inputs.map(function (x) { return x.value; }); }
    function submit() {
      if (!values().some(function (v) { return v.trim(); })) { err(host, '빈칸이 모두 비어 있음'); inputs[0].focus(); return; }
      api.submit({ values: values(), hints: hints.slice() });
    }
    var off = bindSubmit(host, submit);
    setTimeout(function () { if (inputs[0]) inputs[0].focus(); }, 30);
    return { answer: function () { return { values: values(), hints: hints.slice() }; }, refresh: function () {}, destroy: off };
  }

  // 채점 뒤 — 빈칸 자리에 바로 적는다. 틀린 답은 줄을 긋고 옆에 정답, 힌트를 본 칸은 '초성' 표시
  function clozeReview(host, p, ans, g) {
    var blanks = (g.res && g.res.blanks) || [], hinted = ans.hints || [];
    qa(host, '.bl').forEach(function (span) {
      var i = +span.getAttribute('data-b'), b = blanks[i] || {};
      var inp = span.querySelector('input'), mine = inp ? inp.value.trim() : '';
      var right = (b.ans && b.ans[0]) || '';
      var tag = hinted.indexOf(i) >= 0 ? '<i class="h">초성</i>' : '';
      span.className = 'bl ' + (b.ok ? 'ok' : 'no');
      span.innerHTML = b.ok
        ? '<span class="v">' + esc(mine) + '</span>' + tag
        : (mine ? '<s>' + esc(mine) + '</s>' : '') + '<span class="v">' + esc(right) + '</span>' + tag;
    });
    qa(host, '.go, .reqs').forEach(function (el) { el.remove(); });
    return {
      model: '',
      mine: '<span class="k">내 답</span><p>' + (ans.values || []).map(function (v, i) { return circ(i) + ' ' + esc(v || '—'); }).join('   ') + '</p>'
    };
  }

  /* ── 분류 ────────────────────────────────────────────── */
  function sortMount(host, p, api) {
    var assign = p.items.map(function () { return null; }), row = 0;
    host.innerHTML =
      '<p class="ask">' + esc(p.ask) + '</p>' +
      '<ul class="reqs"><li class="lim">항목마다 하나</li><li class="lim">↑↓ 항목 · 숫자 1–' + p.cats.length + ' 분류</li></ul>' +
      '<table class="sort"><thead><tr><th>항목</th>' + p.cats.map(function (c, i) {
        return '<th><kbd>' + (i + 1) + '</kbd><br>' + esc(c) + '</th>';
      }).join('') + '</tr></thead><tbody>' + p.items.map(function (it, i) {
        return '<tr data-r="' + i + '"><td class="it">' + esc(it.t) + '</td>' + p.cats.map(function (c, ci) {
          return '<td><button type="button" class="cat" data-r="' + i + '" data-c="' + ci + '" aria-label="' + esc(c) + '"></button></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' + goBar();

    function draw() {
      qa(host, 'tbody tr').forEach(function (tr) { tr.classList.toggle('sel', +tr.getAttribute('data-r') === row); });
      qa(host, '.cat').forEach(function (b) {
        var on = assign[+b.getAttribute('data-r')] === +b.getAttribute('data-c');
        b.classList.toggle('on', on);
        b.textContent = on ? '✓' : '';
      });
    }
    function set(r, c) {
      assign[r] = c;
      sound(api, 'tick');
      err(host, '');
      var nxt = assign.indexOf(null);
      row = nxt >= 0 ? nxt : r;
      draw();
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('.cat');
      if (b && host.contains(b)) set(+b.getAttribute('data-r'), +b.getAttribute('data-c'));
      var tr = e.target.closest('tbody tr');
      if (!b && tr) { row = +tr.getAttribute('data-r'); draw(); }
    });
    function submit() {
      var left = assign.filter(function (a) { return a === null; }).length;
      if (left) { err(host, '분류 안 한 항목 ' + left + '개'); return; }
      api.submit({ assign: assign.slice() });
    }
    var off1 = bindSubmit(host, submit);
    var off2 = keys(function (e) {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); row = Math.min(p.items.length - 1, row + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); row = Math.max(0, row - 1); draw(); }
      else if (/^[1-9]$/.test(e.key) && +e.key <= p.cats.length) { e.preventDefault(); set(row, +e.key - 1); }
    });
    draw();
    return { answer: function () { return { assign: assign.slice() }; }, refresh: function () {}, destroy: function () { off1(); off2(); } };
  }

  function sortReview(host, p, ans) {
    var assign = ans.assign || [];
    qa(host, '.cat').forEach(function (b) {
      var r = +b.getAttribute('data-r'), c = +b.getAttribute('data-c'), it = p.items[r];
      var chosen = assign[r] === c, right = it.cat === c;
      b.disabled = true;
      b.classList.remove('on');
      b.textContent = '';
      if (chosen && right) { b.classList.add('right'); b.textContent = '✓'; }
      else if (chosen) { b.classList.add('wrong'); b.textContent = '✗'; }
      else if (right) { b.classList.add('should'); b.textContent = '정답'; }
    });
    qa(host, 'tbody tr').forEach(function (tr) {
      tr.classList.remove('sel');
      var r = +tr.getAttribute('data-r'), it = p.items[r];
      if (assign[r] !== it.cat && it.why) tr.querySelector('.it').insertAdjacentHTML('beforeend', '<span class="why">' + esc(it.why) + '</span>');
    });
    qa(host, '.go, .reqs').forEach(function (el) { el.remove(); });
    return {
      model: '',
      mine: '<span class="k">내 분류</span><p>' + p.items.map(function (it, i) {
        return esc(it.t.split(' — ')[0]) + ' → ' + esc(assign[i] != null ? p.cats[assign[i]] : '—');
      }).join('<br>') + '</p>'
    };
  }

  /* 조서 · 첨삭 요청에 남길 글 */
  function answerText(p, ans) {
    ans = ans || {};
    switch (p.type) {
      case 'judge': return '[' + (ans.pick ? p.verdict.label[ans.pick] : '판단 없음') + '] ' + (ans.text || '');
      case 'choice': return (ans.picked || []).map(function (i) { return '· ' + p.options[i].t; }).join('\n') || '(선택 없음)';
      case 'cloze': return (ans.values || []).map(function (v, i) { return (i + 1) + ') ' + (v || '—'); }).join('  ');
      case 'sort': return p.items.map(function (it, i) { return it.t.split(' — ')[0] + ' → ' + (ans.assign && ans.assign[i] != null ? p.cats[ans.assign[i]] : '—'); }).join('\n');
      case 'mini': return ans.summary || '미니게임';
      default: return ans.text || '';
    }
  }
  function keyText(p) {
    switch (p.type) {
      case 'judge': return '[' + p.verdict.label[p.verdict.answer] + '] ' + p.model;
      case 'choice': return p.options.filter(function (o) { return o.ok; }).map(function (o) { return '· ' + o.t; }).join('\n');
      case 'cloze': return p.text.replace(/\{\{=?([^}|]+)[^}]*\}\}/g, '【$1】');
      case 'sort': return p.items.map(function (it) { return it.t.split(' — ')[0] + ' → ' + p.cats[it.cat]; }).join('\n');
      default: return p.model || '';
    }
  }

  global.FORMATS = {
    write: { mount: writeMount, review: writeReview },
    judge: { mount: writeMount, review: writeReview },
    choice: { mount: choiceMount, review: choiceReview },
    cloze: { mount: clozeMount, review: clozeReview },
    sort: { mount: sortMount, review: sortReview },
    answerText: answerText,
    keyText: keyText,
    esc: esc
  };
})(window);
