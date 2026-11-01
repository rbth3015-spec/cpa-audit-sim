/* ============================================================
   미니게임 (minis.js)
   ------------------------------------------------------------
   MINIS[game] = {
     name            화면에 쓰는 이름
     labels(data)    채점 논점 — season.js 가 라벨 계약 · 개념 카드에 쓴다
     traps(data)     감점 논점
     build(seed)     판 만들기 (data/minis.js 재료를 시즌 코드로 섞는다)
     grade(model, state)   DOM 없이 채점 → engine 과 같은 모양
     mount(host, model, api)   화면. { state(), destroy() } 를 돌려준다
     review(model, state)      채점 뒤 정답 공개 HTML
   }
   api = { submit(), spend(sec), sound(name) }
   ============================================================ */
(function (global) {
  'use strict';

  function MD() { return global.MINIDATA || {}; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, R) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(R() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pack(must, trap) {
    var max = 0, total = 0;
    must.forEach(function (m) { max += m.score; total += m.got; });
    (trap || []).forEach(function (t) { total += t.got; });
    total = Math.max(0, Math.min(max, total));
    return { must: must, bonus: [], trap: trap || [], flags: [], total: total, max: max,
             percent: max ? Math.round(total / max * 100) : 0 };
  }
  function scored(defs, hits) {
    return defs.map(function (d, i) {
      var h = !!hits[i];
      return { label: d.label, score: d.score, got: h ? d.score : 0, hit: h, partial: false, why: d.why };
    });
  }
  function won(n) { return n.toLocaleString('ko-KR'); }
  function keyHandler(fn) {
    function h(e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      fn(e);
    }
    document.addEventListener('keydown', h);
    return function () { document.removeEventListener('keydown', h); };
  }

  /* ============================================================
     재고실사 테스트카운트
     ============================================================ */
  var COUNT_DEFS = [
    { label: '시험적 검사(직접 수량 확인) 수행', score: 10,
      why: '재고실사 입회 — 실사 관찰에 더해 감사인이 직접 수량을 세는 시험적 검사' },
    { label: '실사표→현품 방향 검사(실재성)', score: 10,
      why: '실사표 → 현품 — 기록된 재고가 실제로 있는지: 실재성' },
    { label: '현품→실사표 방향 검사(완전성)', score: 10,
      why: '현품 → 실사표 — 있는 재고가 빠짐없이 기록됐는지: 완전성' },
    { label: '현품 없는 실사표 항목 식별', score: 14,
      why: '실사표에만 있는 재고 — 실재성 예외. 가공재고 가능성, 원인 규명' },
    { label: '실사표 누락 재고 식별', score: 14,
      why: '실사표에 없는 현품 — 완전성 예외. 누락 원인과 소유권 확인' },
    { label: '수량 차이 식별', score: 14,
      why: '수량 차이 — 회사에 재집계 요구, 차이 원인과 실사표 수정 확인' },
    { label: '파손 재고 식별 — 평가 검토', score: 14,
      why: '파손·진부화 재고 — 수량이 맞아도 순실현가능가치 평가 문제' },
    { label: '타사 소유 재고 식별 — 재고에서 제외', score: 14,
      why: '위탁받은 타사 재고 — 회사 재고 아님(권리와 의무). 실사표에서 제외' }
  ];
  var EX_INDEX = { none: 3, miss: 4, diff: 5, dmg: 6, cons: 7 };
  var EX_TICK = { none: 'none', miss: 'miss', diff: 'diff', dmg: 'flag', cons: 'flag' };
  var EX_NAME = { none: '현품 없음', miss: '실사표 누락', diff: '수량 차이', dmg: '파손', cons: '타사 소유' };

  var count = {
    name: '재고 실사',
    labels: function () { return COUNT_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '정상 품목을 예외로 표시', score: -5 }]; },

    build: function (seed) {
      var D = MD().count, R = rng(seed || 1);
      var locs = [];
      D.rows.forEach(function (r) { D.cols.forEach(function (c) { locs.push(c + '-' + r); }); });
      var order = shuffle(locs.slice(), R);
      var pool = shuffle(D.items.filter(function (x) { return x.code !== 'DR-900' && x.code !== 'NM-110'; }), R);
      var fake = D.items.filter(function (x) { return x.code === 'DR-900'; })[0];
      var consI = D.items.filter(function (x) { return x.code === 'NM-110'; })[0];
      var racks = {};
      locs.forEach(function (l) { racks[l] = { loc: l, empty: true }; });
      function qty() { return 10 * (2 + Math.floor(R() * 13)); }
      var filled = order.slice(0, 15), empties = order.slice(15);
      filled.forEach(function (l, i) {
        var it = i < 14 ? pool[i] : consI;
        racks[l] = { loc: l, empty: false, code: it.code, name: it.name, unit: it.unit, qty: qty(), ex: null, tag: null };
      });
      // 예외 배치 — 순서가 섞였으니 앞에서부터 쓴다
      var regular = filled.slice(0, 14);
      var byUnit = regular.slice().sort(function (a, b) { return racks[b].unit - racks[a].unit; });
      var diffLoc = byUnit[0];
      var rest = regular.filter(function (l) { return l !== diffLoc; });
      var missLoc = rest[0], dmgLoc = rest[1];
      var consLoc = filled[14];
      racks[diffLoc].ex = 'diff';
      racks[missLoc].ex = 'miss';
      racks[dmgLoc].ex = 'dmg';
      racks[dmgLoc].tag = '파손 · 폐기 예정';
      racks[consLoc].ex = 'cons';
      racks[consLoc].tag = D.owner + ' 소유 · 위탁 보관';
      var fakeLoc = empties[0];

      var sheet = [];
      filled.forEach(function (l) {
        var r = racks[l];
        if (r.ex === 'miss') return;
        var q = r.ex === 'diff' ? r.qty + 10 * (2 + Math.floor(R() * 3)) : r.qty;
        sheet.push({ loc: l, code: r.code, name: r.name, qty: q, amt: Math.round(q * r.unit) });
      });
      sheet.push({ loc: fakeLoc, code: fake.code, name: fake.name, qty: 120, amt: Math.round(120 * fake.unit), fake: true });
      racks[fakeLoc].ex = 'none';
      racks[fakeLoc].fakeOf = fake.code;
      sheet.sort(function (a, b) { return a.loc < b.loc ? -1 : 1; });

      var expect = {};
      locs.forEach(function (l) {
        var r = racks[l];
        if (r.ex) expect[l] = EX_TICK[r.ex];
        else if (!r.empty) expect[l] = 'ok';
      });
      return { D: D, locs: locs, racks: racks, sheet: sheet, expect: expect };
    },

    grade: function (M, st) {
      st = st || { tested: {} };
      var T = st.tested || {}, used = 0, sDir = 0, fDir = 0;
      Object.keys(T).forEach(function (l) {
        used++;
        if (T[l].dir === 'sheet') sDir++; else fDir++;
      });
      var hits = [used >= 6, sDir >= 2, fDir >= 2, false, false, false, false, false];
      var trap = [], falses = 0;
      Object.keys(M.racks).forEach(function (l) {
        var r = M.racks[l], t = T[l];
        if (r.ex && t && t.tick === EX_TICK[r.ex]) hits[EX_INDEX[r.ex]] = true;
        if (!r.ex && !r.empty && t && t.tick && t.tick !== 'ok') falses++;
      });
      if (falses) {
        var n = Math.min(3, falses);
        trap.push({ label: '정상 품목을 예외로 표시', score: -5 * n, got: -5 * n, hit: true });
      }
      var r = pack(scored(COUNT_DEFS, hits), trap);
      r.detail = { used: used, sheet: sDir, floor: fDir, falses: falses };
      return r;
    },

    mount: function (host, M, api) {
      var D = M.D, st = { tested: {} }, sel = null;
      var TICKS = D.ticks;
      function sheetRow(l) { return M.sheet.filter(function (s) { return s.loc === l; })[0]; }
      function used() { return Object.keys(st.tested).length; }

      host.innerHTML =
        '<div class="mg count">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">표본 <b data-k="used">0</b> / ' + D.samples + '</span>' +
            '<span class="mg-stat">실사표→현품 <b data-k="s">0</b></span>' +
            '<span class="mg-stat">현품→실사표 <b data-k="f">0</b></span>' +
            '<button type="button" class="btn sm" data-act="done">카운트 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="insp" data-k="insp"></div>' +
          '<div class="mg-split">' +
            '<div class="board dark"><div class="board-strip"><span>' + esc(D.system) + '</span><span class="rec"><i></i>12/31 18:40</span></div>' +
              '<div class="racks" data-k="racks"></div></div>' +
            '<div class="cs"><table class="sheet-t"><caption>회사 재고실사표 <span>12/31 · 금액 백만원</span></caption>' +
              '<thead><tr><th>위치</th><th>품목</th><th class="n">수량</th><th class="n">금액</th><th>틱</th></tr></thead>' +
              '<tbody data-k="rows"></tbody></table></div>' +
          '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };

      function markOf(l) {
        var t = st.tested[l];
        if (!t || !t.tick) return '';
        var tk = TICKS.filter(function (x) { return x.k === t.tick; })[0];
        return tk ? tk.mark : '';
      }
      function draw() {
        var h = '<span></span>' + D.cols.map(function (c) { return '<span class="rk-h">' + c + '</span>'; }).join('');
        D.rows.forEach(function (row) {
          h += '<span class="rk-h">' + row + '</span>';
          D.cols.forEach(function (c) {
            var l = c + '-' + row, r = M.racks[l], t = st.tested[l];
            var cls = 'rk' + (r.empty ? ' empty' : '') + (sel && sel.loc === l ? ' sel' : '') + (t ? ' done' : '') + (r.tag ? ' tagged' : '');
            h += '<button type="button" class="' + cls + '" data-loc="' + l + '">' +
              '<span class="rk-loc">' + l + '</span>' +
              (r.empty ? '<span class="rk-empty">빈 랙</span>'
                : '<span class="rk-code">' + esc(r.code) + '</span><span class="rk-name">' + esc(r.name) + '</span>' +
                  (r.tag ? '<span class="rk-tag">' + esc(r.tag) + '</span>' : '') +
                  '<span class="rk-qty">' + (t ? r.qty : '?') + '</span>') +
              (t && t.tick ? '<span class="rk-tick">' + markOf(l) + '</span>' : '') +
              '</button>';
          });
        });
        $('racks').innerHTML = h;
        $('rows').innerHTML = M.sheet.map(function (s) {
          var t = st.tested[s.loc];
          return '<tr data-loc="' + s.loc + '" class="' + (sel && sel.loc === s.loc ? 'sel' : '') + (t ? ' done' : '') + '">' +
            '<td class="mono">' + s.loc + '</td><td>' + esc(s.code) + ' <small>' + esc(s.name) + '</small></td>' +
            '<td class="n">' + s.qty + '</td><td class="n">' + won(s.amt) + '</td>' +
            '<td class="tk">' + markOf(s.loc) + '</td></tr>';
        }).join('');
        $('used').textContent = used();
        var sD = 0, fD = 0;
        Object.keys(st.tested).forEach(function (l) { if (st.tested[l].dir === 'sheet') sD++; else fD++; });
        $('s').textContent = sD; $('f').textContent = fD;
        insp();
      }
      function insp() {
        var el = $('insp');
        if (!sel) {
          el.innerHTML = '<span class="insp-hint">랙 · 실사표 줄 고르기</span>';
          return;
        }
        var l = sel.loc, r = M.racks[l], s = sheetRow(l), t = st.tested[l];
        var dir = t ? t.dir : sel.dir;
        var info = '<b class="insp-loc">' + l + '</b>' +
          '<span class="insp-dir">' + (dir === 'sheet' ? '실사표 → 현품' : '현품 → 실사표') + '</span>' +
          '<span>실사표 <b>' + (s ? s.qty : '없음') + '</b></span>' +
          '<span>현품 <b>' + (t ? (r.empty ? '0 (빈 랙)' : r.qty) : '?') + '</b></span>' +
          (r.tag ? '<span class="insp-tag">' + esc(r.tag) + '</span>' : '');
        var act;
        if (!t) {
          if (r.empty && !s) act = '<span class="insp-hint">빈 랙 · 실사표에도 없음</span>';
          else if (used() >= D.samples) act = '<span class="insp-hint">표본 소진</span>';
          else act = '<button type="button" class="btn sm" data-act="count">세기 <kbd>Space</kbd> <em>−' + D.costSec + '초</em></button>';
        } else {
          act = '<span class="ticks">' + TICKS.map(function (x, i) {
            return '<button type="button" class="tick' + (t.tick === x.k ? ' on' : '') + '" data-tick="' + x.k + '">' +
              '<kbd>' + (i + 1) + '</kbd><b>' + x.mark + '</b>' + esc(x.name) + '</button>';
          }).join('') + '</span>';
        }
        el.innerHTML = '<span class="insp-info">' + info + '</span>' + act;
      }
      function pick(l, dir) {
        sel = { loc: l, dir: dir };
        api.sound && api.sound('click');
        draw();
      }
      function doCount() {
        if (!sel || st.tested[sel.loc]) return;
        var r = M.racks[sel.loc], s = sheetRow(sel.loc);
        if (r.empty && !s) return;
        if (used() >= D.samples) return;
        st.tested[sel.loc] = { dir: sel.dir, tick: null };
        api.spend && api.spend(D.costSec);
        api.sound && api.sound('count');
        draw();
      }
      function setTick(k) {
        if (!sel || !st.tested[sel.loc]) return;
        st.tested[sel.loc].tick = k;
        api.sound && api.sound('tick');
        draw();
      }

      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-loc],[data-act],[data-tick]');
        if (!b || !host.contains(b)) return;
        if (b.hasAttribute('data-tick')) return setTick(b.getAttribute('data-tick'));
        var act = b.getAttribute('data-act');
        if (act === 'count') return doCount();
        if (act === 'done') return api.submit();
        if (b.hasAttribute('data-loc')) pick(b.getAttribute('data-loc'), b.tagName === 'TR' ? 'sheet' : 'floor');
      });
      var off = keyHandler(function (e) {
        if (e.key === ' ' || e.key === 'Enter') { if (sel && !st.tested[sel.loc]) { e.preventDefault(); doCount(); } }
        else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); setTick(TICKS[+e.key - 1].k); }
      });
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: off };
    },

    review: function (M, st) {
      var T = (st && st.tested) || {};
      var rows = Object.keys(M.racks).filter(function (l) { return M.racks[l].ex; }).sort().map(function (l) {
        var r = M.racks[l], t = T[l], want = EX_TICK[r.ex];
        var got = t && t.tick === want;
        var what = r.ex === 'none' ? (r.fakeOf + ' 실사표 120 · 현품 0') :
                   r.ex === 'miss' ? (r.code + ' 현품 ' + r.qty + ' · 실사표 없음') :
                   r.ex === 'diff' ? (r.code + ' 현품 ' + r.qty + ' · 실사표 ' + (M.sheet.filter(function (s) { return s.loc === l; })[0] || {}).qty) :
                   (r.code + ' · ' + r.tag);
        return '<tr class="' + (got ? 'ok' : 'no') + '"><td class="mono">' + l + '</td><td>' + EX_NAME[r.ex] + '</td>' +
          '<td>' + esc(what) + '</td><td class="n">' + (got ? '✓ 찾음' : (t ? (t.tick ? '틱 틀림' : '틱 없음') : '안 셈')) + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>숨어 있던 예외 5건</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     분개 테스트 — 추출 조건 설계
     ============================================================ */
  var JET_BASE = [
    { label: '결산 수정분개 포함 분개 테스트', score: 15,
      why: '분개 테스트 — 보고기간 말 결산 과정의 분개·조정사항 포함. 마감 후 입력·경영진 입력·드문 계정 조합으로 추출' },
    { label: '기간귀속 절차 확대', score: 10,
      why: '기말 전후 매출·역분개 추출 — 매출 기간귀속 위험에 대한 대응' },
    { label: '추출 범위 적정 (10건 이하)', score: 15,
      why: '추출 조건 — 위험 특성에 맞춘 조합. 전부 뽑으면 검토 불가능한 모집단' }
  ];

  function jetData(data) {
    var base = MD().jet || { rows: [] }, D = {}, k;
    for (k in base) D[k] = base[k];
    for (k in (data || {})) D[k] = data[k];
    return D;
  }

  var jet = {
    name: '분개 테스트',
    labels: function (data) {
      var D = jetData(data);
      return JET_BASE.map(function (d) { return { label: d.label, score: d.score, why: d.why }; })
        .concat(D.rows.filter(function (r) { return r.risk; }).map(function (r) {
          return { label: '위험 분개 추출 — ' + r.risk, score: 12 };
        }));
    },
    traps: function () { return []; },

    build: function (seed, data) {
      var D = jetData(data), R = rng(seed || 1);
      return { D: D, rows: shuffle(D.rows.slice(), R) };
    },

    grade: function (M, st) {
      var on = (st && st.on) || [];
      var ex = M.rows.filter(function (r) { return r.tags.some(function (t) { return on.indexOf(t) >= 0; }); });
      var n = ex.length;
      var hits = [on.indexOf('after') >= 0 && n <= 14, on.indexOf('cutoff') >= 0 && n <= 14, n > 0 && n <= M.D.limit];
      var must = scored(JET_BASE, hits);
      if (!hits[2] && n > M.D.limit && n <= M.D.limit + 3) { must[2].got = 8; must[2].partial = true; }
      M.D.rows.filter(function (r) { return r.risk; }).forEach(function (r) {
        var caught = ex.some(function (x) { return x.id === r.id; });
        must.push({ label: '위험 분개 추출 — ' + r.risk, score: 12, got: caught ? 12 : 0, hit: caught, partial: false });
      });
      var res = pack(must, []);
      if (n > 14) res.flags.push('추출 ' + n + '건 · 조건이 너무 넓음');
      res.detail = { extracted: n, on: on.slice() };
      return res;
    },

    mount: function (host, M, api) {
      var D = M.D, st = { on: [] };
      function extracted() {
        return M.rows.filter(function (r) { return r.tags.some(function (t) { return st.on.indexOf(t) >= 0; }); });
      }
      host.innerHTML =
        '<div class="mg jet">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">추출 <b data-k="n">0</b> / ' + M.rows.length + '</span>' +
            '<span class="mg-stat lim">한도 ' + D.limit + '건</span>' +
            '<span class="mg-stat">결산 마감 ' + esc(D.closeDate) + '</span>' +
            '<button type="button" class="btn sm" data-act="done">추출 확정 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="crit" data-k="crit"></div>' +
          '<div class="je-wrap"><table class="je"><thead><tr><th>전표일</th><th>입력</th><th>입력자</th><th>승인자</th><th>차변</th><th>대변</th><th class="n">금액(원)</th><th>적요</th><th>해당 조건</th></tr></thead>' +
          '<tbody data-k="rows"></tbody></table></div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      var NAME = {};
      D.criteria.forEach(function (c) { NAME[c.k] = c.name; });

      function draw() {
        var ex = extracted(), n = ex.length;
        $('crit').innerHTML = D.criteria.map(function (c, i) {
          var cnt = M.rows.filter(function (r) { return r.tags.indexOf(c.k) >= 0; }).length;
          return '<button type="button" class="crit-b' + (st.on.indexOf(c.k) >= 0 ? ' on' : '') + '" data-c="' + c.k + '" title="' + esc(c.tip) + '">' +
            '<kbd>' + (i + 1) + '</kbd>' + esc(c.name) + '<em>' + cnt + '</em></button>';
        }).join('');
        $('rows').innerHTML = M.rows.map(function (r) {
          var hitT = r.tags.filter(function (t) { return st.on.indexOf(t) >= 0; });
          return '<tr class="' + (hitT.length ? 'x' : '') + '">' +
            '<td class="mono">' + r.day + '</td><td class="mono">' + r['in'] + ' <small>' + r.wd + '</small></td>' +
            '<td>' + esc(r.user) + '</td><td>' + esc(r.appr) + '</td><td>' + esc(r.dr) + '</td><td>' + esc(r.cr) + '</td>' +
            '<td class="n mono">' + won(r.amt) + '</td><td>' + (r.memo ? esc(r.memo) : '<i class="blank">—</i>') + '</td>' +
            '<td class="tags">' + hitT.map(function (t) { return '<span>' + esc(NAME[t]) + '</span>'; }).join('') + '</td></tr>';
        }).join('');
        var nb = $('n');
        nb.textContent = n;
        nb.parentNode.classList.toggle('over', n > D.limit);
      }
      function toggle(k) {
        var i = st.on.indexOf(k);
        if (i >= 0) st.on.splice(i, 1); else st.on.push(k);
        api.sound && api.sound('tick');
        draw();
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-c],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        toggle(b.getAttribute('data-c'));
      });
      var off = keyHandler(function (e) {
        if (/^[1-9]$/.test(e.key) && D.criteria[+e.key - 1]) { e.preventDefault(); toggle(D.criteria[+e.key - 1].k); }
      });
      draw();
      return { state: function () { return { on: st.on.slice() }; }, destroy: off };
    },

    review: function (M, st) {
      var on = (st && st.on) || [];
      var rows = M.rows.filter(function (r) { return r.risk; }).map(function (r) {
        var caught = r.tags.some(function (t) { return on.indexOf(t) >= 0; });
        var names = r.tags.map(function (t) {
          return (M.D.criteria.filter(function (c) { return c.k === t; })[0] || {}).name;
        }).join(' · ');
        return '<tr class="' + (caught ? 'ok' : 'no') + '"><td class="mono">' + r.day + '</td><td>' + esc(r.risk) + '</td>' +
          '<td class="dim">' + esc(names) + '</td><td class="n">' + (caught ? '✓ 추출' : '놓침') + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>위험 분개 5건과 잡히는 조건</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     기간귀속 — 12월 31일 선
     ============================================================ */
  var CUT_DEFS = [
    { id: 'X2', label: '도착 전 인식한 도착지 인도 매출', score: 25,
      why: '도착지 인도 — 고객 도착 시점에 통제 이전. 기말 전 출고라도 1/1 이후 도착이면 차기 매출' },
    { id: 'X3', label: '검수 전 인식한 검수 조건 매출', score: 25,
      why: '검수 조건 — 고객 검수 완료 시점에 통제 이전. 출고·도착만으로 인식 불가' },
    { id: 'X6', label: '기말 출고한 선적지 인도 매출 누락', score: 25,
      why: '선적지 인도 — 출고(선적) 시점에 통제 이전. 12/31 출고분은 당기 매출' },
    { id: null, label: '정상 거래를 오류로 표시하지 않음', score: 25 }
  ];
  var CUT_LAST = 16;   // 12/31 (12/15 = 0)

  function dayLabel(d) {
    return d <= 16 ? '12/' + (15 + d) : '1/' + (d - 16);
  }

  var cutoff = {
    name: '기간귀속',
    labels: function () { return CUT_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '정상 거래를 기간귀속 오류로 표시', score: -8 }]; },

    build: function (seed) {
      var D = MD().cutoff, R = rng(seed || 1);
      var rows = shuffle(D.rows.slice(), R).map(function (r) {
        var ev = D.terms[r.term].event;
        var at = ev === 'out' ? r.out : ev === 'arrive' ? r.arrive : r.accept;
        var right = at <= CUT_LAST ? 'cur' : 'next';
        return { id: r.id, client: r.client, amt: r.amt, term: r.term, out: r.out, arrive: r.arrive,
                 accept: r.accept, booked: r.booked, right: right, error: right !== r.booked };
      });
      return { D: D, rows: rows };
    },

    grade: function (M, st) {
      var flag = (st && st.flag) || {};
      var hits = CUT_DEFS.map(function (d) {
        if (!d.id) return false;
        return !!flag[d.id] && M.rows.some(function (r) { return r.id === d.id && r.error; });
      });
      var falses = M.rows.filter(function (r) { return !r.error && flag[r.id]; }).length;
      hits[3] = falses === 0 && Object.keys(flag).some(function (k) { return flag[k]; });
      var trap = falses ? [{ label: '정상 거래를 기간귀속 오류로 표시', score: -8 * falses, got: -8 * falses, hit: true }] : [];
      var r = pack(scored(CUT_DEFS, hits), trap);
      r.detail = { falses: falses };
      return r;
    },

    mount: function (host, M, api) {
      var D = M.D, st = { flag: {} }, SPAN = 26;
      function pct(d) { return (d / SPAN * 100).toFixed(2) + '%'; }
      var ticks = '';
      for (var d = 0; d <= SPAN; d += 2) ticks += '<span style="left:' + pct(d) + '">' + dayLabel(d) + '</span>';
      host.innerHTML =
        '<div class="mg cut">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">오류 표시 <b data-k="n">0</b></span>' +
            '<span class="mg-stat">▲ 출고 · ● 도착 · ■ 검수</span>' +
            '<button type="button" class="btn sm" data-act="done">검사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="cut-axis"><span class="cut-lab"></span><span class="cut-scale">' + ticks +
            '<i class="ye" style="left:' + pct(16.5) + '"><b>12/31</b></i></span><span class="cut-act"></span></div>' +
          '<div class="lanes" data-k="lanes"></div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('lanes').innerHTML = M.rows.map(function (r, i) {
          var t = D.terms[r.term], on = !!st.flag[r.id];
          var mk = '<i class="m out" style="left:' + pct(r.out) + '" title="출고 ' + dayLabel(r.out) + '">▲</i>' +
                   '<i class="m arr" style="left:' + pct(r.arrive) + '" title="도착 ' + dayLabel(r.arrive) + '">●</i>' +
                   (r.accept != null ? '<i class="m acc" style="left:' + pct(r.accept) + '" title="검수 ' + dayLabel(r.accept) + '">■</i>' : '');
          return '<div class="lane' + (on ? ' on' : '') + '">' +
            '<span class="cut-lab"><kbd>' + (i + 1) + '</kbd><b>' + esc(r.client) + '</b><em>' + r.amt.toFixed(1) + '억</em>' +
              '<span class="term">' + esc(t.name) + '</span>' +
              '<span class="bk ' + r.booked + '">회사 ' + (r.booked === 'cur' ? '당기' : '차기') + ' 인식</span></span>' +
            '<span class="cut-scale"><i class="ye" style="left:' + pct(16.5) + '"></i>' +
              '<span class="span-l" style="left:' + pct(r.out) + ';width:' + pct((r.accept != null ? r.accept : r.arrive) - r.out) + '"></span>' + mk + '</span>' +
            '<span class="cut-act"><button type="button" class="flag-b' + (on ? ' on' : '') + '" data-id="' + r.id + '">' + (on ? '✗ 귀속 오류' : '정상') + '</button></span>' +
          '</div>';
        }).join('');
        $('n').textContent = Object.keys(st.flag).filter(function (k) { return st.flag[k]; }).length;
      }
      function toggle(id) {
        st.flag[id] = !st.flag[id];
        api.sound && api.sound(st.flag[id] ? 'stampSm' : 'tick');
        draw();
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-id],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        toggle(b.getAttribute('data-id'));
      });
      var off = keyHandler(function (e) {
        if (/^[1-8]$/.test(e.key) && M.rows[+e.key - 1]) { e.preventDefault(); toggle(M.rows[+e.key - 1].id); }
      });
      draw();
      return { state: function () { return { flag: JSON.parse(JSON.stringify(st.flag)) }; }, destroy: off };
    },

    review: function (M, st) {
      var flag = (st && st.flag) || {};
      var rows = M.rows.map(function (r) {
        var t = M.D.terms[r.term];
        var mine = !!flag[r.id], good = mine === r.error;
        return '<tr class="' + (good ? 'ok' : 'no') + '"><td>' + esc(r.client) + '</td><td>' + esc(t.name) + '</td>' +
          '<td class="dim">' + esc(t.tip) + '</td><td>' + (r.right === 'cur' ? '당기' : '차기') + '</td>' +
          '<td class="n">' + (r.error ? (mine ? '✓ 오류 찾음' : '오류 놓침') : (mine ? '정상인데 표시' : '정상')) + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>인도조건별 통제 이전 시점과 올바른 귀속</caption>' + rows + '</table>';
    }
  };

  /* Ctrl · Cmd + Enter 로 검사 종료 — keyHandler 는 조합키를 거르므로 따로 단다 */
  function doneKey(api) {
    function h(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); api.submit(); } }
    document.addEventListener('keydown', h);
    return function () { document.removeEventListener('keydown', h); };
  }
  function eok(n) {
    var s = (Math.round(n * 100) / 100).toFixed(n >= 10 ? 1 : 2);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s + '억';
  }

  /* ============================================================
     외부조회 — 발송대
     대상 선정 → 조회처 고르기(회사 제공 · 독립 확인) → 발송 → 회신 예외 처리.
     회사가 준 연락처로 보내면 회신이 회사를 거쳐 「일치」로 돌아오고, 독립 확인한 곳으로 보내면 차이가 드러난다.
     ============================================================ */
  var CF_DEFS = [
    { label: '금액 · 위험 기준으로 조회 대상 선정', score: 20,
      why: '외부조회 대상 — 수행중요성을 넘는 잔액과 위험 징후(기말 급증 · 신규 · 장기 미회수)가 있는 잔액은 빠짐없이' },
    { label: '조회처를 독립적으로 확인해 감사인이 직접 발송', score: 20,
      why: '외부조회 통제 — 회사가 준 연락처를 그대로 쓰지 않고 등기부 · 대표번호로 확인. 발송과 회수를 감사인이 통제' },
    { label: '회사를 거친 회신은 증거로 쓰지 않고 직접 확인', score: 20,
      why: '회신의 신뢰성 — 회사를 거쳐 들어온 회신은 감사인이 통제하지 못한 경로. 발신자에게 직접 확인' },
    { label: '미회신은 대체적 감사절차로', score: 20,
      why: '미회신 — 재발송 후에도 없으면 기말 후 현금회수 · 출하 증빙 등 대체적 감사절차. 경영진 확인서로 갈음 불가' },
    { label: '회신 차이는 원인을 조사', score: 20,
      why: '회신 차이 — 시점 차이(송금 중 · 미입고)인지 왜곡표시인지 조정 내역과 증빙으로 확인. 한쪽 금액을 그대로 쓰지 않는다' }
  ];
  var CF_TX = { ok: '✓ 일치', fax: '⚠ 회사를 거쳐 들어옴', none: '✗ 미회신', diff: '≠ 금액 차이' };
  function cfNeed(M, r) { return r.amt >= M.D.pm || !!r.flag; }
  function cfReply(r, via) { return r.send[via] || r.send.pv; }
  function cfReplies(M, st) {
    var pick = (st && st.pick) || {}, via = (st && st.via) || {};
    return M.rows.filter(function (r) { return pick[r.id]; }).map(function (r) { return { r: r, rep: cfReply(r, via[r.id] || 'pv') }; });
  }

  var confirm = {
    name: '외부조회',
    labels: function () { return CF_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () {
      return [{ label: '회사를 거친 회신을 그대로 인정', score: -12, please: true },
              { label: '미회신을 경영진 확인서로 갈음', score: -10 },
              { label: '회신 차이를 회사 금액으로 인정', score: -10, please: true }];
    },
    build: function () { var D = MD().confirm; return { D: D, rows: D.rows.slice() }; },

    grade: function (M, st) {
      st = st || {};
      var pick = st.pick || {}, via = st.via || {}, act = st.act || {}, sent = !!st.sent;
      var need = M.rows.filter(function (r) { return cfNeed(M, r); });
      var reps = sent ? cfReplies(M, st) : [];
      var of = function (k) { return reps.filter(function (x) { return x.rep.r === k; }); };
      var fax = of('fax'), none = of('none'), diff = of('diff');
      var h1 = sent && need.every(function (r) { return pick[r.id]; });
      var h2 = sent && reps.length > 0 && need.filter(function (r) { return r.pv !== r.iv; }).every(function (r) { return pick[r.id] && via[r.id] === 'iv'; }) &&
               reps.every(function (x) { return x.r.pv === x.r.iv || via[x.r.id] === 'iv'; });
      var h3 = sent && reps.length > 0 && fax.every(function (x) { return act[x.r.id] === 'direct'; });
      var h4 = none.length > 0 && none.every(function (x) { return act[x.r.id] === 'alt'; });
      var h5 = diff.length > 0 && diff.every(function (x) { return act[x.r.id] === 'dig'; });
      var trap = [];
      var nTake = fax.filter(function (x) { return act[x.r.id] === 'take'; }).length;
      if (nTake) trap.push({ label: '회사를 거친 회신을 그대로 인정', score: -12 * nTake, got: -12 * nTake, hit: true, please: true });
      if (none.some(function (x) { return act[x.r.id] === 'rep'; })) trap.push({ label: '미회신을 경영진 확인서로 갈음', score: -10, got: -10, hit: true });
      var nBook = diff.filter(function (x) { return act[x.r.id] === 'book'; }).length;
      if (nBook) trap.push({ label: '회신 차이를 회사 금액으로 인정', score: -10 * nBook, got: -10 * nBook, hit: true, please: true });
      var r = pack(scored(CF_DEFS, [h1, h2, h3, h4, h5]), trap);
      r.detail = { sent: reps.length, fax: fax.length, none: none.length, diff: diff.length };
      return r;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '조회 ' + d.sent + '곳 · 회사 경유 ' + d.fax + ' · 미회신 ' + d.none + ' · 차이 ' + d.diff;
    },
    perfect: function (M) {
      var st = { pick: {}, via: {}, act: {}, sent: true };
      M.rows.forEach(function (r) { if (cfNeed(M, r)) { st.pick[r.id] = true; st.via[r.id] = 'iv'; } });
      cfReplies(M, st).forEach(function (x) { if (x.rep.r !== 'ok') st.act[x.r.id] = { fax: 'direct', none: 'alt', diff: 'dig' }[x.rep.r]; });
      return st;
    },

    mount: function (host, M, api) {
      var D = M.D, st = { pick: {}, via: {}, act: {}, sent: false }, fresh = false;
      host.innerHTML =
        '<div class="mg cf">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">' + esc(D.client) + ' · 매출채권 <b>' + D.total + '억</b></span>' +
            '<span class="mg-stat lim">수행중요성 ' + D.pm + '억</span>' +
            '<span class="mg-stat">조회 <b data-k="n">0</b></span>' +
            '<button type="button" class="btn sm" data-act="send">발송 <kbd>Enter</kbd></button>' +
            '<button type="button" class="btn sm" data-act="done" hidden>검사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-steps" data-k="steps"></div>' +
          '<table class="mg-t cf-t"><thead><tr><th></th><th>거래처</th><th class="n">잔액</th><th>조회처</th><th>회신</th><th>처리</th></tr></thead>' +
            '<tbody data-k="rows"></tbody></table>' +
          '<div class="mg-foot">' + esc(D.others) + '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function steps() {
        var n = cfReplies(M, st).filter(function (x) { return x.rep.r !== 'ok'; }).length;
        var left = st.sent ? cfReplies(M, st).filter(function (x) { return x.rep.r !== 'ok' && !st.act[x.r.id]; }).length : 0;
        $('steps').innerHTML = ['대상 선정', '조회처 확인', '발송', '회신 처리'].map(function (s, i) {
          var on = st.sent ? i === 3 : i < 2, done = st.sent && i < 3;
          return '<span class="' + (on ? 'on' : '') + (done ? ' done' : '') + '"><b>' + (i + 1) + '</b>' + s +
            (i === 3 && st.sent ? ' <em>' + (left ? '남은 예외 ' + left : n ? '예외 처리 끝' : '예외 없음') + '</em>' : '') + '</span>';
        }).join('');
      }
      function draw() {
        var k = 0;
        $('rows').innerHTML = M.rows.map(function (r, i) {
          var on = !!st.pick[r.id], v = st.via[r.id] || 'pv', rep = st.sent && on ? cfReply(r, v) : null;
          var via = on
            ? '<div class="via">' + ['pv', 'iv'].map(function (w) {
                return '<button type="button" class="via-b' + (v === w ? ' on' : '') + '" data-via="' + w + '" data-id="' + r.id + '"' + (st.sent ? ' disabled' : '') + '>' +
                  '<em>' + (w === 'pv' ? '회사 제공' : '독립 확인') + '</em>' + esc(w === 'pv' ? r.pv : r.iv) + '</button>';
              }).join('') + '</div>'
            : '<span class="dim">—</span>';
          var repH = '', actH = '';
          if (rep) {
            // 회신은 발송 직후 한 통씩 도착한다 — 그 뒤 처리 버튼을 눌러 다시 그릴 때는 그대로 둔다
            repH = '<span class="rep ' + rep.r + (fresh ? '' : ' still') + '" style="--i:' + (k++) + '">' + CF_TX[rep.r] +
              (rep.r === 'diff' ? ' · 회신 <b>' + rep.v.toFixed(1) + '억</b><small>' + esc(rep.why) + '</small>' : '') + '</span>';
            if (rep.r !== 'ok') actH = '<div class="acts">' + D.acts[rep.r].map(function (a) {
              return '<button type="button" class="act-b' + (st.act[r.id] === a.k ? ' on' : '') + '" data-ak="' + a.k + '" data-id="' + r.id + '">' + esc(a.t) + '</button>';
            }).join('') + '</div>';
          }
          return '<tr class="' + (on ? 'on' : '') + (st.sent && !on ? ' off' : '') + '">' +
            '<td class="ck"><button type="button" class="pk' + (on ? ' on' : '') + '" data-pick="' + r.id + '"' + (st.sent ? ' disabled' : '') + '><kbd>' + (i + 1) + '</kbd></button></td>' +
            '<td><b>' + esc(r.name) + '</b>' + (r.flag ? '<span class="fl-tag">⚑ ' + esc(r.flag) + '</span>' : '') + '</td>' +
            '<td class="n">' + r.amt.toFixed(1) + '억</td><td>' + via + '</td><td>' + repH + '</td><td>' + actH + '</td></tr>';
        }).join('');
        $('n').textContent = Object.keys(st.pick).filter(function (id) { return st.pick[id]; }).length;
        host.querySelector('[data-act="send"]').hidden = st.sent;
        host.querySelector('[data-act="done"]').hidden = !st.sent;
        steps();
      }
      function send() {
        var n = Object.keys(st.pick).filter(function (id) { return st.pick[id]; }).length;
        if (!n || st.sent) return;
        st.sent = true;
        if (api.spend) api.spend(D.costSec * n);
        api.sound && api.sound('send');
        fresh = true; draw(); fresh = false;
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pick],[data-via],[data-ak],[data-act]');
        if (!b || !host.contains(b) || b.disabled) return;
        var act = b.getAttribute('data-act');
        if (act === 'send') return send();
        if (act === 'done') return api.submit();
        var id = b.getAttribute('data-id') || b.getAttribute('data-pick');
        if (b.hasAttribute('data-pick')) { st.pick[id] = !st.pick[id]; if (!st.via[id]) st.via[id] = 'pv'; api.sound && api.sound('tick'); }
        else if (b.hasAttribute('data-via')) { st.via[id] = b.getAttribute('data-via'); api.sound && api.sound('flip'); }
        else if (b.hasAttribute('data-ak')) { st.act[id] = b.getAttribute('data-ak'); api.sound && api.sound('stampSm'); }
        draw();
      });
      var off1 = keyHandler(function (e) {
        if (st.sent) return;
        if (/^[1-9]$/.test(e.key) && M.rows[+e.key - 1]) {
          e.preventDefault(); var id = M.rows[+e.key - 1].id;
          st.pick[id] = !st.pick[id]; if (!st.via[id]) st.via[id] = 'pv'; api.sound && api.sound('tick'); draw();
        } else if (e.key === 'Enter') { e.preventDefault(); send(); }
      });
      var off2 = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: function () { off1(); off2(); } };
    },

    review: function (M, st) {
      st = st || {};
      var pick = st.pick || {}, via = st.via || {}, act = st.act || {};
      var rows = M.rows.map(function (r) {
        var need = cfNeed(M, r), on = !!pick[r.id], v = via[r.id] || 'pv', rep = st.sent && on ? cfReply(r, v) : null;
        var best = cfReply(r, 'iv');
        var good = on === need && (!on || r.pv === r.iv || v === 'iv') &&
          (!rep || rep.r === 'ok' || act[r.id] === { fax: 'direct', none: 'alt', diff: 'dig' }[rep.r]);
        var right = need ? (r.pv !== r.iv ? '독립 확인한 곳으로 발송 · ' : '발송 · ') +
          (best.r === 'none' ? '미회신 → 대체적 감사절차' : best.r === 'diff' ? '차이 ' + best.why + ' → 원인 조사' : '일치') : '표본으로 (금액 · 위험 작음)';
        return '<tr class="' + (good ? 'ok' : 'no') + '"><td>' + esc(r.name) + (r.flag ? ' <small>⚑ ' + esc(r.flag) + '</small>' : '') + '</td>' +
          '<td class="n">' + r.amt.toFixed(1) + '억</td><td class="dim">' + esc(right) + '</td>' +
          '<td class="n">' + (good ? '✓' : on ? (rep ? CF_TX[rep.r] : '발송') : need ? '빠뜨림' : '—') + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>조회 대상 · 조회처 · 회신 처리 (수행중요성 ' + M.D.pm + '억 이상 · 위험 징후는 필수)</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     부외부채 — 기말 후 지급 검토
     청구일 · 지급일이 아니라 의무가 생긴 때(입고 · 용역 제공 · 사용 기간)로 기말 부채인지 가린다
     ============================================================ */
  var UN_DEFS = [
    { key: 'use', label: '12월에 쓴 비용의 미계상 부채', score: 25,
      why: '부외부채 — 사용 기간이 기말 이전이면 청구 · 지급이 1월이어도 기말 부채(미지급비용)' },
    { key: 'recv', label: '12월 입고분 매입의 미계상 부채', score: 25,
      why: '부외부채 — 입고(통제 이전) 시점에 매입채무. 청구서가 1월에 와도 기말 부채' },
    { key: 'svc', label: '12월에 끝난 용역의 미계상 부채', score: 25,
      why: '부외부채 — 용역 제공이 기말 전에 끝났으면 청구 전이라도 기말 부채' },
    { key: null, label: '정상 지급을 부외부채로 표시하지 않음', score: 25,
      why: '차기에 생긴 의무 · 이미 계상된 부채 · 선급금은 부외부채가 아니다' }
  ];
  var UN_KEY = { U1: 'use', U2: 'recv', U3: 'svc' };

  var unrec = {
    name: '부외부채 탐색',
    labels: function () { return UN_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '정상 지급을 부외부채로 표시', score: -8 }]; },
    build: function (seed) {
      var D = MD().unrec, R = rng(seed || 1);
      var rows = shuffle(D.rows.slice(), R).map(function (r) {
        return Object.assign({}, r, { miss: r.owe && !r.booked, key: UN_KEY[r.id] || null });
      });
      return { D: D, rows: rows };
    },
    grade: function (M, st) {
      var flag = (st && st.flag) || {};
      var hits = UN_DEFS.map(function (d) {
        if (!d.key) return false;
        return M.rows.some(function (r) { return r.key === d.key && r.miss && flag[r.id]; });
      });
      var falses = M.rows.filter(function (r) { return !r.miss && flag[r.id]; }).length;
      hits[3] = falses === 0 && M.rows.some(function (r) { return flag[r.id]; });
      var trap = falses ? [{ label: '정상 지급을 부외부채로 표시', score: -8 * falses, got: -8 * falses, hit: true }] : [];
      var r = pack(scored(UN_DEFS, hits), trap);
      r.detail = { found: M.rows.filter(function (x) { return x.miss && flag[x.id]; }).length, falses: falses, opened: Object.keys((st && st.open) || {}).length };
      return r;
    },
    summary: function (M, st, g) { var d = g.res.detail || {}; return '부외부채 ' + d.found + '/3 · 오표시 ' + d.falses + '건 · 증빙 ' + d.opened + '건 확인'; },
    perfect: function (M) { var flag = {}; M.rows.forEach(function (r) { if (r.miss) flag[r.id] = true; }); return { flag: flag, open: {} }; },

    mount: function (host, M, api) {
      var D = M.D, st = { flag: {}, open: {} };
      host.innerHTML =
        '<div class="mg un">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">' + esc(D.client) + ' · 1월 지급 <b>' + M.rows.length + '건</b></span>' +
            '<span class="mg-stat">부외부채 표시 <b data-k="n">0</b></span>' +
            '<button type="button" class="btn sm" data-act="done">검사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-hint">청구일 · 지급일이 아니라 <b>의무가 생긴 때</b>(입고 · 용역 제공 · 사용 기간)로 본다.</div>' +
          '<table class="mg-t un-t"><thead><tr><th></th><th>지급일</th><th>거래처</th><th class="n">금액</th><th>내용</th><th>증빙</th><th>12/31 장부</th><th>판정</th></tr></thead>' +
            '<tbody data-k="rows"></tbody></table>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('rows').innerHTML = M.rows.map(function (r, i) {
          var on = !!st.flag[r.id], op = !!st.open[r.id];
          return '<tr class="' + (on ? 'on' : '') + '"><td class="ck"><kbd>' + ((i + 1) % 10) + '</kbd></td>' +
            '<td class="mono">' + esc(r.paid) + '</td><td><b>' + esc(r.vendor) + '</b></td><td class="n">' + r.amt.toFixed(1) + '억</td>' +
            '<td>' + esc(r.doc) + '</td>' +
            '<td>' + (op ? '<span class="ev-open">' + esc(r.when) + '</span>' : '<button type="button" class="ev-b" data-open="' + r.id + '">증빙 보기</button>') + '</td>' +
            '<td>' + (r.booked ? '<span class="bk cur">미지급금 계상</span>' : '<span class="bk next">—</span>') + '</td>' +
            '<td><button type="button" class="flag-b' + (on ? ' on' : '') + '" data-id="' + r.id + '">' + (on ? '✗ 부외부채' : '정상') + '</button></td></tr>';
        }).join('');
        $('n').textContent = Object.keys(st.flag).filter(function (k) { return st.flag[k]; }).length;
      }
      function toggle(id) { st.flag[id] = !st.flag[id]; api.sound && api.sound(st.flag[id] ? 'stampSm' : 'tick'); draw(); }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-id],[data-open],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        if (b.hasAttribute('data-open')) {
          st.open[b.getAttribute('data-open')] = true;
          if (api.spend) api.spend(D.costSec || 3);
          api.sound && api.sound('flip'); draw(); return;
        }
        toggle(b.getAttribute('data-id'));
      });
      var off1 = keyHandler(function (e) {
        var i = e.key === '0' ? 9 : +e.key - 1;
        if (/^[0-9]$/.test(e.key) && M.rows[i]) { e.preventDefault(); toggle(M.rows[i].id); }
      });
      var off2 = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: function () { off1(); off2(); } };
    },

    review: function (M, st) {
      var flag = (st && st.flag) || {};
      var rows = M.rows.map(function (r) {
        var mine = !!flag[r.id], good = mine === r.miss;
        var why = r.miss ? '12/31 전에 의무 발생 · 장부에 없음' : r.owe ? '이미 미지급금으로 계상' : '의무가 1월 이후에 생김 (차기)';
        return '<tr class="' + (good ? 'ok' : 'no') + '"><td>' + esc(r.vendor) + ' <small>' + esc(r.doc) + '</small></td>' +
          '<td>' + esc(r.when) + '</td><td class="dim">' + esc(why) + '</td>' +
          '<td class="n">' + (r.miss ? (mine ? '✓ 찾음' : '놓침') : (mine ? '정상인데 표시' : '정상')) + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>의무가 생긴 때로 본 기말 부채 여부</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     표본 평가 — 표본 왜곡표시 → 모집단 추정 → 허용왜곡표시와 비교 → 판정 · 후속 조치
     표본에서 찾은 금액(2.3억)만 보면 허용왜곡표시(8.4억)보다 작지만, 추정하면 넘는다
     ============================================================ */
  var SP_DEFS = [
    { label: '표본에서 왜곡표시 식별', score: 20,
      why: '표본 — 장부 금액과 확인 금액의 차이가 왜곡표시. 차이가 없는 항목을 표시하지 않는다' },
    { label: '표본 왜곡표시를 모집단으로 추정', score: 25,
      why: '추정 — 표본에서 찾은 왜곡표시를 모집단 전체로 추정(비율 추정: 왜곡표시 ÷ 표본 금액 × 모집단). 표본 금액 그대로 판정하지 않는다' },
    { label: '추정 왜곡표시가 허용왜곡표시를 넘으면 기각', score: 25,
      why: 'KSA 530 — 추정 왜곡표시를 허용왜곡표시와 비교해 모집단을 채택하거나 기각' },
    { label: '기각 뒤 수정 요청 · 추가 절차', score: 30,
      why: '기각 — 경영진에게 수정을 요청하고, 표본 확대 · 추가 절차로 감사위험을 낮춘다. 허용왜곡표시를 사후에 올리지 않는다' }
  ];
  function spFound(M, mark) {
    return M.rows.filter(function (r) { return mark[r.id]; }).reduce(function (a, r) { return a + Math.max(0, r.book - r.audit); }, 0);
  }
  function spProj(M, found, method) { return method === 'ratio' ? found / M.D.sampleAmt * M.D.pop : found; }
  function spTrue(M) { return spProj(M, M.rows.reduce(function (a, r) { return a + (r.book - r.audit); }, 0), 'ratio'); }

  var sample = {
    name: '표본 평가',
    labels: function () { return SP_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () {
      return [{ label: '추정 없이 표본 금액으로 판정', score: -10 },
              { label: '허용왜곡표시를 올려 채택', score: -12, please: true },
              { label: '기각된 모집단을 그대로 종결', score: -10, please: true },
              { label: '차이 없는 표본을 왜곡표시로 표시', score: -5 }];
    },
    build: function (seed) {
      var D = MD().sample, R = rng(seed || 1);
      return { D: D, rows: shuffle(D.rows.slice(), R) };
    },
    grade: function (M, st) {
      st = st || {};
      var mark = st.mark || {}, after = st.after || {};
      var real = M.rows.filter(function (r) { return r.book !== r.audit; });
      var falses = M.rows.filter(function (r) { return r.book === r.audit && mark[r.id]; }).length;
      var over = spTrue(M) > M.D.tol;
      var h1 = real.every(function (r) { return mark[r.id]; }) && falses === 0;
      var h2 = st.method === 'ratio';
      var h3 = st.decide === (over ? 'reject' : 'accept');
      var okAfter = M.D.after.filter(function (a) { return a.ok; }), badAfter = M.D.after.filter(function (a) { return a.trap; });
      var h4 = h3 && okAfter.every(function (a) { return after[a.k]; }) && !badAfter.some(function (a) { return after[a.k]; });
      var trap = [];
      if (st.method === 'none') trap.push({ label: '추정 없이 표본 금액으로 판정', score: -10, got: -10, hit: true });
      if (after.raise) trap.push({ label: '허용왜곡표시를 올려 채택', score: -12, got: -12, hit: true, please: true });
      if (after.close && st.decide === 'reject') trap.push({ label: '기각된 모집단을 그대로 종결', score: -10, got: -10, hit: true, please: true });
      if (falses) trap.push({ label: '차이 없는 표본을 왜곡표시로 표시', score: -5 * falses, got: -5 * falses, hit: true });
      var r = pack(scored(SP_DEFS, [h1, h2, h3, h4]), trap);
      var found = spFound(M, mark);
      r.detail = { found: found, proj: spProj(M, found, st.method || 'none'), decide: st.decide || null };
      return r;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '표본 왜곡표시 ' + eok(d.found) + ' → 추정 ' + eok(d.proj) + ' · ' + (d.decide === 'reject' ? '기각' : d.decide === 'accept' ? '채택' : '판정 없음');
    },
    perfect: function (M) {
      var mark = {}, after = {};
      M.rows.forEach(function (r) { if (r.book !== r.audit) mark[r.id] = true; });
      M.D.after.forEach(function (a) { if (a.ok) after[a.k] = true; });
      return { mark: mark, method: 'ratio', decide: spTrue(M) > M.D.tol ? 'reject' : 'accept', after: after };
    },

    mount: function (host, M, api) {
      var D = M.D, st = { mark: {}, method: null, decide: null, after: {} };
      var others = Math.round((D.sampleAmt - M.rows.reduce(function (a, r) { return a + r.book; }, 0)) * 10) / 10;
      host.innerHTML =
        '<div class="mg sp">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">모집단 <b>' + D.popN.toLocaleString('ko-KR') + '건 · ' + D.pop + '억</b></span>' +
            '<span class="mg-stat">표본 <b>' + D.n + '건 · ' + D.sampleAmt.toFixed(1) + '억</b></span>' +
            '<span class="mg-stat lim">허용왜곡표시 ' + D.tol + '억</span>' +
            '<button type="button" class="btn sm" data-act="done">검사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-split">' +
            '<div><table class="mg-t sp-t"><thead><tr><th></th><th>거래처</th><th class="n">장부</th><th class="n">확인</th><th>표시</th></tr></thead><tbody data-k="rows"></tbody></table>' +
              '<div class="mg-foot">나머지 ' + (D.n - M.rows.length) + '건 · 장부 ' + others.toFixed(1) + '억, 확인 금액과 차이 없음</div></div>' +
            '<div class="sp-ws" data-k="ws"></div>' +
          '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('rows').innerHTML = M.rows.map(function (r, i) {
          var on = !!st.mark[r.id];
          return '<tr class="' + (on ? 'on' : '') + '"><td class="ck">' + (i < 10 ? '<kbd>' + ((i + 1) % 10) + '</kbd>' : '') + '</td><td><b>' + esc(r.name) + '</b></td>' +
            '<td class="n">' + r.book.toFixed(1) + '</td><td class="n">' + r.audit.toFixed(1) + '</td>' +
            '<td><button type="button" class="flag-b' + (on ? ' on' : '') + '" data-mark="' + r.id + '">' + (on ? '✗ 왜곡표시' : '—') + '</button></td></tr>';
        }).join('');
        var found = spFound(M, st.mark), proj = st.method ? spProj(M, found, st.method) : null;
        var scale = Math.max(D.tol * 1.6, proj || 0), over = proj != null && proj > D.tol;
        $('ws').innerHTML =
          '<div class="ws-row"><span>표본 왜곡표시</span><b>' + eok(found) + '</b></div>' +
          '<div class="ws-k">추정 방법</div><div class="ws-opts">' + D.methods.map(function (m) {
            return '<button type="button" class="act-b' + (st.method === m.k ? ' on' : '') + '" data-method="' + m.k + '">' + esc(m.t) + '</button>';
          }).join('') + '</div>' +
          '<div class="ws-row big"><span>추정 왜곡표시</span><b class="' + (over ? 'over' : '') + '">' + (proj == null ? '—' : eok(proj)) + '</b></div>' +
          '<div class="ws-bar"><i class="fill' + (over ? ' over' : '') + '" style="width:' + (proj == null ? 0 : Math.min(100, proj / scale * 100)).toFixed(1) + '%"></i>' +
            '<i class="tol" style="left:' + (D.tol / scale * 100).toFixed(1) + '%"><b>허용 ' + D.tol + '억</b></i></div>' +
          '<div class="ws-k">판정</div><div class="ws-opts two">' +
            '<button type="button" class="act-b' + (st.decide === 'accept' ? ' on' : '') + '" data-decide="accept">모집단 채택</button>' +
            '<button type="button" class="act-b' + (st.decide === 'reject' ? ' on' : '') + '" data-decide="reject">모집단 기각</button></div>' +
          (st.decide ? '<div class="ws-k">후속 조치 <small>모두 고르기</small></div><div class="ws-opts">' + D.after.map(function (a) {
            return '<button type="button" class="act-b' + (st.after[a.k] ? ' on' : '') + '" data-after="' + a.k + '">' + esc(a.t) + '</button>';
          }).join('') + '</div>' : '');
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mark],[data-method],[data-decide],[data-after],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        if (b.hasAttribute('data-mark')) { var id = b.getAttribute('data-mark'); st.mark[id] = !st.mark[id]; api.sound && api.sound(st.mark[id] ? 'stampSm' : 'tick'); }
        else if (b.hasAttribute('data-method')) { st.method = b.getAttribute('data-method'); api.sound && api.sound('flip'); }
        else if (b.hasAttribute('data-decide')) { st.decide = b.getAttribute('data-decide'); api.sound && api.sound('stamp'); }
        else if (b.hasAttribute('data-after')) { var k = b.getAttribute('data-after'); st.after[k] = !st.after[k]; api.sound && api.sound('tick'); }
        draw();
      });
      var off1 = keyHandler(function (e) {
        var i = e.key === '0' ? 9 : +e.key - 1;
        if (/^[0-9]$/.test(e.key) && M.rows[i]) { e.preventDefault(); st.mark[M.rows[i].id] = !st.mark[M.rows[i].id]; api.sound && api.sound('tick'); draw(); }
      });
      var off2 = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: function () { off1(); off2(); } };
    },

    review: function (M, st) {
      st = st || {};
      var real = M.rows.filter(function (r) { return r.book !== r.audit; });
      var sum = real.reduce(function (a, r) { return a + (r.book - r.audit); }, 0), proj = spTrue(M);
      var rows = real.map(function (r) {
        return '<tr class="' + ((st.mark || {})[r.id] ? 'ok' : 'no') + '"><td>' + esc(r.name) + '</td><td class="dim">' + esc(r.why || '') + '</td>' +
          '<td class="n">' + eok(r.book - r.audit) + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>표본 왜곡표시 ' + eok(sum) + ' ÷ 표본 ' + M.D.sampleAmt + '억 × 모집단 ' + M.D.pop + '억 = 추정 ' + eok(proj) +
        '. 허용왜곡표시 ' + M.D.tol + '억을 ' + (proj > M.D.tol ? '넘어 기각' : '넘지 않아 채택') + '</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     내부거래 대사 — 연결 전 모회사 채권과 종속기업 채무를 맞춘다
     차이마다 원인을 증빙으로 가린다: 운송 중 재고 · 환율 · 설명 안 됨(왜곡표시)
     그리고 기말재고에 남은 내부 이익(미실현이익)을 계산한다
     ============================================================ */
  var IC_DEFS = [
    { key: 'transit', label: '운송 중 재고 식별 — 선적 후 미입고', score: 20,
      why: '내부거래 대사 — 한쪽만 기록한 운송 중 재고는 시차. 연결에서 그룹 재고로 잡고 채권 · 채무를 맞춘다' },
    { key: 'fx', label: '환율 차이 식별 — 송장일 · 기말 환율', score: 15,
      why: '내부거래 대사 — 외화 거래는 두 회사가 다른 환율을 쓰면 차이가 난다. 원인이 설명되면 조정' },
    { key: 'unexp', label: '설명 안 된 차이를 왜곡표시로 집계', score: 25,
      why: '설명 안 된 대사 차이 — 원인을 끝까지 조사하고, 해소되지 않으면 왜곡표시로 집계' },
    { key: 'profit', label: '미실현이익 — 기말 잔존 재고(운송 중 포함) × 이익률', score: 30,
      why: '미실현이익 — 기말까지 그룹 밖으로 팔리지 않은 내부거래 재고의 이익. 운송 중 재고도 그룹 재고' },
    { key: 'ev', label: '증빙으로 확인 — 근거 없는 전표의 선적서류', score: 10,
      why: '증빙 — 차이 원인을 짐작으로 붙이지 않는다. 선적서류 · 입고 기록으로 확인' }
  ];
  var IC_TX = { transit: '운송 중', fx: '환율', unexp: '설명 안 됨' };

  var ic = {
    name: '내부거래 대사',
    labels: function () { return IC_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '근거 없는 차이를 운송 중으로 처리', score: -12, please: true }]; },
    build: function (seed) {
      var D = MD().ic, R = rng(seed || 1);
      return { D: D, rows: shuffle(D.rows.slice(), R) };
    },
    grade: function (M, st) {
      st = st || {};
      var cause = st.cause || {}, open = st.open || {};
      function row(k) { return M.rows.filter(function (r) { return r.cause === k; })[0]; }
      var pf = (M.D.profit.filter(function (x) { return x.k === st.pf; })[0] || {});
      var un = row('unexp');
      var hits = [
        cause[row('transit').id] === 'transit',
        cause[row('fx').id] === 'fx',
        cause[un.id] === 'unexp',
        !!pf.ok,
        !!open[un.id] && cause[un.id] === 'unexp'
      ];
      var trap = cause[un.id] === 'transit'
        ? [{ label: '근거 없는 차이를 운송 중으로 처리', score: -12, got: -12, hit: true, please: true }] : [];
      var r = pack(scored(IC_DEFS, hits), trap);
      r.detail = { right: hits.slice(0, 3).filter(Boolean).length, pf: pf.v, opened: Object.keys(open).length };
      return r;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '차이 원인 ' + d.right + '/3 · 미실현이익 ' + (d.pf == null ? '고르지 않음' : eok(d.pf)) + ' · 증빙 ' + d.opened + '건';
    },
    perfect: function (M) {
      var cause = {}, open = {};
      M.rows.forEach(function (r) { if (r.cause) cause[r.id] = r.cause; if (r.cause === 'unexp') open[r.id] = true; });
      return { cause: cause, open: open, pf: 'stock' };
    },

    mount: function (host, M, api) {
      var D = M.D, st = { cause: {}, open: {}, pf: null };
      host.innerHTML =
        '<div class="mg ic">' +
          '<div class="mg-bar"><b>' + esc(D.title) + ' — ' + esc(D.parent) + ' ↔ ' + esc(D.sub) + '</b>' +
            '<span class="mg-stat">12월 · 채권 <b>' + D.ar.toFixed(1) + '억</b> · 채무 <b>' + D.ap.toFixed(1) + '억</b></span>' +
            '<span class="mg-stat lim">차이 ' + (D.ar - D.ap).toFixed(1) + '억</span>' +
            '<span class="mg-stat">원인 <b data-k="n">0</b> / 3</span>' +
            '<button type="button" class="btn sm" data-act="done">대사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-hint">차이마다 원인을 <b>증빙으로</b> 가린다. 증빙을 열 때마다 시간이 든다.</div>' +
          '<div class="mg-split">' +
            '<div><table class="mg-t ic-t"><thead><tr><th>거래</th><th class="n">' + esc(D.parent) + '</th><th class="n">' + esc(D.sub) + '</th><th class="n">차이</th><th>증빙</th><th>원인</th></tr></thead>' +
              '<tbody data-k="rows"></tbody></table>' +
              '<div class="mg-foot">금액 억원 · ' + esc(D.parent) + ' 매출 = ' + esc(D.sub) + ' 매입</div></div>' +
            '<div class="sp-ws" data-k="ws"></div>' +
          '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('rows').innerHTML = M.rows.map(function (r) {
          var d = Math.round((r.p - r.s) * 10) / 10, op = !!st.open[r.id];
          var causeH = !d ? '<span class="ic-ok">✓ 일치</span>'
            : '<div class="acts">' + ['transit', 'fx', 'unexp'].map(function (k) {
                return '<button type="button" class="act-b' + (st.cause[r.id] === k ? ' on' : '') + '" data-cause="' + k + '" data-id="' + r.id + '">' + IC_TX[k] + '</button>';
              }).join('') + '</div>';
          return '<tr class="' + (d ? 'dif' : '') + '"><td><b>' + esc(r.what) + '</b></td>' +
            '<td class="n">' + r.p.toFixed(1) + '</td><td class="n">' + (r.s ? r.s.toFixed(1) : '—') + '</td>' +
            '<td class="n">' + (d ? '<b>' + d.toFixed(1) + '</b>' : '—') + '</td>' +
            '<td>' + (op ? '<span class="ev-open">' + esc(r.ev) + '</span>' : '<button type="button" class="ev-b" data-open="' + r.id + '">증빙 보기</button>') + '</td>' +
            '<td>' + causeH + '</td></tr>';
        }).join('');
        var marked = M.rows.filter(function (r) { return r.p !== r.s && st.cause[r.id]; });
        $('n').textContent = marked.length;
        var unexp = marked.filter(function (r) { return st.cause[r.id] === 'unexp'; }).reduce(function (a, r) { return a + (r.p - r.s); }, 0);
        var pf = D.profit.filter(function (x) { return x.k === st.pf; })[0];
        $('ws').innerHTML =
          '<div class="ws-row"><span>설명 안 된 차이 → 왜곡표시</span><b class="' + (unexp ? 'over' : '') + '">' + eok(unexp) + '</b></div>' +
          '<div class="ws-k">미실현이익 · ' + esc(D.sub) + ' 기말재고 중 ' + esc(D.parent) + '분</div>' +
          '<div class="ws-row"><span>창고 재고</span><b>' + D.stock.toFixed(1) + '억</b></div>' +
          '<div class="ws-row"><span>운송 중 (12/29 선적)</span><b>' + D.transit.toFixed(1) + '억</b></div>' +
          '<div class="ws-row"><span>' + esc(D.parent) + ' 매출총이익률</span><b>' + D.margin + '%</b></div>' +
          '<div class="ws-k">계산 기준 <small>하나</small></div><div class="ws-opts">' + D.profit.map(function (x) {
            return '<button type="button" class="act-b' + (st.pf === x.k ? ' on' : '') + '" data-pf="' + x.k + '">' + esc(x.t) + '</button>';
          }).join('') + '</div>' +
          '<div class="ws-row big"><span>제거할 미실현이익</span><b>' + (pf ? eok(pf.v) : '—') + '</b></div>';
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cause],[data-open],[data-pf],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        if (b.hasAttribute('data-open')) {
          st.open[b.getAttribute('data-open')] = true;
          if (api.spend) api.spend(D.costSec || 3);
          api.sound && api.sound('flip');
        } else if (b.hasAttribute('data-cause')) {
          st.cause[b.getAttribute('data-id')] = b.getAttribute('data-cause');
          api.sound && api.sound('stampSm');
        } else if (b.hasAttribute('data-pf')) {
          st.pf = b.getAttribute('data-pf');
          api.sound && api.sound('tick');
        }
        draw();
      });
      var off = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: off };
    },

    review: function (M, st) {
      st = st || {};
      var cause = st.cause || {};
      var rows = M.rows.filter(function (r) { return r.cause; }).map(function (r) {
        var ok = cause[r.id] === r.cause;
        return '<tr class="' + (ok ? 'ok' : 'no') + '"><td>' + esc(r.what) + '</td><td class="dim">' + esc(r.ev) + '</td>' +
          '<td class="n">' + (r.p - r.s).toFixed(1) + '억 · ' + IC_TX[r.cause] + '</td>' +
          '<td class="n">' + (ok ? '✓' : cause[r.id] ? IC_TX[cause[r.id]] + ' ✗' : '안 가림') + '</td></tr>';
      }).join('');
      var right = M.D.profit.filter(function (x) { return x.ok; })[0], mine = M.D.profit.filter(function (x) { return x.k === st.pf; })[0];
      rows += '<tr class="' + (mine && mine.ok ? 'ok' : 'no') + '"><td>미실현이익</td><td class="dim">' + esc(right.t) + '</td>' +
        '<td class="n">' + eok(right.v) + '</td><td class="n">' + (mine ? (mine.ok ? '✓' : eok(mine.v) + ' ✗') : '안 고름') + '</td></tr>';
      return '<table class="rv-t"><caption>차이 9.0억 = 운송 중 6.3 + 환율 0.9 + 설명 안 됨 1.8 (왜곡표시) · 미실현이익 88.0 × 12.5% = 11.0억</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     통제 표본 — 승인 문서 25장의 속성 검사 (통제테스트)
     서명 · 승인일 · 승인 한도를 본다. 같은 필체 두 장은 고의(위조) 가능성
     표본 이탈률이 허용이탈률을 넘으면 통제에 의존할 수 없다
     ============================================================ */
  var AT_DEFS = [
    { key: 'nosig', label: '서명 없는 승인 — 이탈', score: 15,
      why: '통제테스트 — 승인 서명이 없으면 통제가 수행되지 않은 것. 이탈로 집계' },
    { key: 'late', label: '조정 뒤 승인 — 사후 승인 이탈', score: 15,
      why: '사후 승인 — 조정이 먼저 반영되고 승인이 뒤에 오면 예방 통제로 작동하지 않았다' },
    { key: 'limit', label: '승인 한도 초과 — 권한 없는 승인', score: 15,
      why: '승인 권한 — 한도를 넘는 건을 권한 없는 사람이 승인하면 이탈' },
    { key: 'forge', label: '같은 필체 두 장 — 고의(위조) 가능성', score: 20,
      why: '이탈의 성격 — 같은 필체로 다른 사람 서명이 반복되면 단순 실수가 아니라 고의 가능성. 부정위험 평가로 이어진다' },
    { key: 'rely', label: '이탈률이 허용이탈률 초과 — 통제 의존 불가', score: 25,
      why: '통제테스트 결론 — 표본 이탈률(또는 상한)이 허용이탈률을 넘으면 의존하지 않고 실증절차를 늘린다' },
    { key: null, label: '정상 문서를 이탈로 표시하지 않음', score: 10 }
  ];
  var AT_TX = { ok: '—', dev: '✗ 이탈', intent: '⚠ 고의 의심' };
  // 필체 — 같은 손은 같은 선. 시드로 그리는 짧은 필기선
  function sigSvg(hand, cls) {
    if (!hand) return '<span class="sig none">서명 없음</span>';
    var R = rng(hand * 7919 + 13), x = 6, d = 'M' + x + ' ' + (14 + R() * 6).toFixed(1);
    for (var i = 0; i < 5; i++) {
      var x1 = x + 4 + R() * 6, x2 = x + 8 + R() * 8, nx = x + 12 + R() * 6;
      d += ' C' + x1.toFixed(1) + ' ' + (2 + R() * 10).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + (16 + R() * 10).toFixed(1) + ' ' + nx.toFixed(1) + ' ' + (8 + R() * 12).toFixed(1);
      x = nx;
    }
    return '<svg class="sig ' + (cls || '') + '" viewBox="0 0 96 30" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  var attr = {
    name: '통제 표본',
    labels: function () { return AT_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '이탈이 있는데 통제에 의존', score: -15, please: true }]; },
    build: function (seed) {
      var D = MD().attr, R = rng(seed || 1);
      return { D: D, rows: shuffle(D.rows.slice(), R) };
    },
    grade: function (M, st) {
      st = st || {};
      var mark = st.mark || {};
      function devOf(k) { return M.rows.filter(function (r) { return r.dev === k; }); }
      var hits = [
        devOf('nosig').every(function (r) { return mark[r.id] === 'dev' || mark[r.id] === 'intent'; }),
        devOf('late').every(function (r) { return mark[r.id] === 'dev' || mark[r.id] === 'intent'; }),
        devOf('limit').every(function (r) { return mark[r.id] === 'dev' || mark[r.id] === 'intent'; }),
        devOf('forge').every(function (r) { return mark[r.id] === 'intent'; }),
        st.decide === 'no',
        false
      ];
      var falses = M.rows.filter(function (r) { return !r.dev && mark[r.id] && mark[r.id] !== 'ok'; }).length;
      hits[5] = falses === 0 && M.rows.some(function (r) { return mark[r.id] && mark[r.id] !== 'ok'; });
      var trap = st.decide === 'yes' ? [{ label: '이탈이 있는데 통제에 의존', score: -15, got: -15, hit: true, please: true }] : [];
      if (falses) trap.push({ label: '정상 문서를 이탈로 표시', score: -5 * falses, got: -5 * falses, hit: true });
      var r = pack(scored(AT_DEFS, hits), trap);
      var n = M.rows.filter(function (x) { return mark[x.id] && mark[x.id] !== 'ok'; }).length;
      r.detail = { flagged: n, rate: Math.round(n / M.rows.length * 100), real: M.rows.filter(function (x) { return x.dev; }).length,
                   intent: devOf('forge').filter(function (x) { return mark[x.id] === 'intent'; }).length, decide: st.decide || null };
      return r;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '이탈 표시 ' + d.flagged + '건(' + d.rate + '%) · 고의 의심 ' + d.intent + '/2 · ' + (d.decide === 'no' ? '의존 불가' : d.decide === 'yes' ? '의존' : '판정 없음');
    },
    perfect: function (M) {
      var mark = {};
      M.rows.forEach(function (r) { if (r.dev) mark[r.id] = r.dev === 'forge' ? 'intent' : 'dev'; });
      return { mark: mark, decide: 'no' };
    },

    mount: function (host, M, api) {
      var D = M.D, st = { mark: {}, decide: null };
      var HAND = {};
      D.signers.forEach(function (s) { HAND[s.name] = s; });
      host.innerHTML =
        '<div class="mg at">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">표본 <b>' + M.rows.length + '건</b></span>' +
            '<span class="mg-stat lim">허용이탈률 ' + D.tol + '%</span>' +
            '<span class="mg-stat">이탈 표시 <b data-k="n">0</b></span>' +
            '<button type="button" class="btn sm" data-act="done">검사 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-hint">통제 규칙 · ' + esc(D.rule) + '. 표시는 누를 때마다 <b>이탈 → 고의 의심 → 정상</b>.</div>' +
          '<div class="mg-split">' +
            '<div class="at-wrap"><table class="mg-t at-t"><thead><tr><th>문서</th><th>조정일</th><th class="n">금액</th><th>승인자</th><th>서명</th><th>승인일</th><th>표시</th></tr></thead>' +
              '<tbody data-k="rows"></tbody></table></div>' +
            '<div><div class="sp-ws" data-k="ws"></div>' +
              '<div class="at-ref"><div class="ws-k">서명 견본</div>' + D.signers.map(function (s) {
                return '<div class="at-sg"><span>' + esc(s.name) + '<small>' + esc(s.role) + '</small></span>' + sigSvg(s.hand) + '</div>';
              }).join('') + '</div></div>' +
          '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('rows').innerHTML = M.rows.map(function (r) {
          var m = st.mark[r.id] || 'ok';
          return '<tr class="' + (m !== 'ok' ? 'on' : '') + '"><td class="mono">' + r.id + '</td><td class="mono">' + esc(r.day) + '</td>' +
            '<td class="n">' + won(r.amt) + '만</td><td>' + (r.appr ? esc(r.appr) : '<span class="dim">—</span>') + '</td>' +
            '<td>' + sigSvg(r.hand) + '</td><td class="mono">' + (r.aday ? esc(r.aday) : '—') + '</td>' +
            '<td><button type="button" class="flag-b at-b ' + m + '" data-mark="' + r.id + '">' + AT_TX[m] + '</button></td></tr>';
        }).join('');
        var n = M.rows.filter(function (r) { return st.mark[r.id] && st.mark[r.id] !== 'ok'; }).length;
        var rate = n / M.rows.length * 100, scale = Math.max(D.tol * 3, rate);
        $('n').textContent = n;
        $('ws').innerHTML =
          '<div class="ws-row big"><span>표본 이탈률</span><b class="' + (rate > D.tol ? 'over' : '') + '">' + rate.toFixed(0) + '%</b></div>' +
          '<div class="ws-bar"><i class="fill' + (rate > D.tol ? ' over' : '') + '" style="width:' + Math.min(100, rate / scale * 100).toFixed(1) + '%"></i>' +
            '<i class="tol" style="left:' + (D.tol / scale * 100).toFixed(1) + '%"><b>허용 ' + D.tol + '%</b></i></div>' +
          '<div class="ws-k">결론</div><div class="ws-opts two">' +
            '<button type="button" class="act-b' + (st.decide === 'yes' ? ' on' : '') + '" data-decide="yes">통제에 의존</button>' +
            '<button type="button" class="act-b' + (st.decide === 'no' ? ' on' : '') + '" data-decide="no">의존 불가 · 실증 확대</button></div>';
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mark],[data-decide],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        if (b.hasAttribute('data-mark')) {
          var id = b.getAttribute('data-mark'), cur = st.mark[id] || 'ok';
          st.mark[id] = cur === 'ok' ? 'dev' : cur === 'dev' ? 'intent' : 'ok';
          api.sound && api.sound(st.mark[id] === 'ok' ? 'tick' : 'stampSm');
        } else if (b.hasAttribute('data-decide')) {
          st.decide = b.getAttribute('data-decide');
          api.sound && api.sound('stamp');
        }
        draw();
      });
      var off = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: off };
    },

    review: function (M, st) {
      st = st || {};
      var mark = st.mark || {};
      var WHY = { nosig: '서명 없음', late: '조정 뒤 승인', limit: '한도 초과 승인', forge: '같은 필체 · 위조 가능성' };
      var rows = M.rows.filter(function (r) { return r.dev; }).map(function (r) {
        var m = mark[r.id] || 'ok', ok = r.dev === 'forge' ? m === 'intent' : m !== 'ok';
        return '<tr class="' + (ok ? 'ok' : 'no') + '"><td class="mono">' + r.id + '</td><td>' + WHY[r.dev] + '</td><td class="dim">' + esc(r.note || '') + '</td>' +
          '<td class="n">' + (ok ? '✓' : m === 'ok' ? '놓침' : AT_TX[m]) + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>이탈 5건 / 25건 = 20%. 허용이탈률 ' + M.D.tol + '%를 넘어 통제에 의존할 수 없다</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     반품 데이터 — 추출 조건 설계 (POS 반품)
     심야 · 원거래 없음 · 같은 관리자 · 같은 금액 같은 조건으로 부정 반품을 20건 안에서 잡는다
     ============================================================ */
  var RT_BASE = [
    { key: 'night', label: '심야 · 영업시간 외 반품', score: 15,
      why: '반품 데이터 분석 — 영업시간 밖 반품은 손님 없이 만들어진 거래일 가능성. 추출 조건의 출발점' },
    { key: 'noorig', label: '원거래 없는 반품', score: 15,
      why: '원거래 대사 — 판매 기록이 없는 반품은 실재성이 없다. 반품은 원거래와 결합해 본다' },
    { key: null, label: '추출 건수를 한도 안으로', score: 10,
      why: '추출 조건 설계 — 넓게 걸면 다 볼 수 없다. 위험 특성을 조합해 볼 수 있는 건수로' }
  ];

  var ret = {
    name: '반품 데이터',
    labels: function () {
      var D = MD().ret || { rows: [] };
      return RT_BASE.map(function (d) { return { label: d.label, score: d.score, why: d.why }; })
        .concat(D.rows.filter(function (r) { return r.risk; }).map(function (r) { return { label: '부정 반품 추출 — ' + r.risk, score: 12 }; }));
    },
    traps: function () { return []; },
    build: function (seed) {
      var D = MD().ret, R = rng(seed || 1);
      return { D: D, rows: shuffle(D.rows.slice(), R) };
    },
    grade: function (M, st) {
      var on = (st && st.on) || [];
      var ex = M.rows.filter(function (r) { return r.tags.some(function (t) { return on.indexOf(t) >= 0; }); });
      var n = ex.length, inLim = n > 0 && n <= M.D.limit;
      var hits = [on.indexOf('night') >= 0 && inLim, on.indexOf('noorig') >= 0 && inLim, inLim];
      var must = scored(RT_BASE, hits);
      if (!inLim && n > M.D.limit && n <= M.D.limit + 4) { must[2].got = 5; must[2].partial = true; }
      M.D.rows.filter(function (r) { return r.risk; }).forEach(function (r) {
        var caught = ex.some(function (x) { return x.id === r.id; });
        must.push({ label: '부정 반품 추출 — ' + r.risk, score: 12, got: caught ? 12 : 0, hit: caught, partial: false });
      });
      var res = pack(must, []);
      if (n > M.D.limit) res.flags.push('추출 ' + n + '건 · 한도 ' + M.D.limit + '건을 넘음');
      res.detail = { extracted: n, caught: M.D.rows.filter(function (r) { return r.risk && ex.some(function (x) { return x.id === r.id; }); }).length };
      return res;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '추출 ' + d.extracted + '건 · 부정 반품 ' + d.caught + '/' + M.D.rows.filter(function (r) { return r.risk; }).length;
    },
    perfect: function () { return { on: ['night', 'noorig'] }; },

    mount: function (host, M, api) {
      var D = M.D, st = { on: [] };
      var NAME = {};
      D.criteria.forEach(function (c) { NAME[c.k] = c.name; });
      function extracted() { return M.rows.filter(function (r) { return r.tags.some(function (t) { return st.on.indexOf(t) >= 0; }); }); }
      host.innerHTML =
        '<div class="mg jet rt">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">추출 <b data-k="n">0</b> / ' + M.rows.length + '</span>' +
            '<span class="mg-stat lim">한도 ' + D.limit + '건</span>' +
            '<span class="mg-stat">' + esc(D.scope) + '</span>' +
            '<button type="button" class="btn sm" data-act="done">추출 확정 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="crit" data-k="crit"></div>' +
          '<div class="je-wrap"><table class="je"><thead><tr><th>일자</th><th>시각</th><th>매장</th><th>승인</th><th>원거래</th><th>환불</th><th class="n">금액(원)</th><th>해당 조건</th></tr></thead>' +
          '<tbody data-k="rows"></tbody></table></div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        var ex = extracted(), n = ex.length;
        $('crit').innerHTML = D.criteria.map(function (c, i) {
          var cnt = M.rows.filter(function (r) { return r.tags.indexOf(c.k) >= 0; }).length;
          return '<button type="button" class="crit-b' + (st.on.indexOf(c.k) >= 0 ? ' on' : '') + '" data-c="' + c.k + '" title="' + esc(c.tip) + '">' +
            '<kbd>' + (i + 1) + '</kbd>' + esc(c.name) + '<em>' + cnt + '</em></button>';
        }).join('');
        $('rows').innerHTML = M.rows.map(function (r) {
          var hitT = r.tags.filter(function (t) { return st.on.indexOf(t) >= 0; });
          return '<tr class="' + (hitT.length ? 'x' : '') + '">' +
            '<td class="mono">' + esc(r.day) + '</td><td class="mono">' + esc(r.time) + '</td><td>' + esc(r.store) + '</td><td>' + esc(r.appr) + '</td>' +
            '<td>' + (r.orig ? '<span class="mono">' + esc(r.orig) + '</span>' : '<i class="blank">없음</i>') + '</td><td>' + esc(r.pay) + '</td>' +
            '<td class="n mono">' + won(r.amt) + '</td>' +
            '<td class="tags">' + hitT.map(function (t) { return '<span>' + esc(NAME[t]) + '</span>'; }).join('') + '</td></tr>';
        }).join('');
        var nb = $('n');
        nb.textContent = n;
        nb.parentNode.classList.toggle('over', n > D.limit);
      }
      function toggle(k) {
        var i = st.on.indexOf(k);
        if (i >= 0) st.on.splice(i, 1); else st.on.push(k);
        api.sound && api.sound('tick');
        draw();
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-c],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        toggle(b.getAttribute('data-c'));
      });
      var off = keyHandler(function (e) {
        if (/^[1-9]$/.test(e.key) && D.criteria[+e.key - 1]) { e.preventDefault(); toggle(D.criteria[+e.key - 1].k); }
      });
      var off2 = doneKey(api);
      draw();
      return { state: function () { return { on: st.on.slice() }; }, destroy: function () { off(); off2(); } };
    },

    review: function (M, st) {
      var on = (st && st.on) || [];
      var rows = M.rows.filter(function (r) { return r.risk; }).map(function (r) {
        var caught = r.tags.some(function (t) { return on.indexOf(t) >= 0; });
        var names = r.tags.map(function (t) { return (M.D.criteria.filter(function (c) { return c.k === t; })[0] || {}).name; }).join(' · ');
        return '<tr class="' + (caught ? 'ok' : 'no') + '"><td class="mono">' + esc(r.day + ' ' + r.time) + '</td><td>' + esc(r.risk) + '</td>' +
          '<td class="dim">' + esc(names) + '</td><td class="n">' + (caught ? '✓ 추출' : '놓침') + '</td></tr>';
      }).join('');
      return '<table class="rv-t"><caption>부정 반품 ' + M.rows.filter(function (r) { return r.risk; }).length + '건. 심야 · 원거래 없음 두 조건이면 한도 안에서 모두 잡힌다</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     현장 공정 대조 — 보고된 공정률을 현장 사진 · 공정 일보와 맞춘다
     괴리 난 공종을 표시하고(틀리면 시간이 줄어든다), 다시 잡은 총예정원가로 공정률을 재추정한다
     ============================================================ */
  var ST_DEFS = [
    { key: 'roof', label: '지붕 — 보고 공정률과 현장의 괴리', score: 15,
      why: '현장 대조 — 보고된 공종별 진척을 사진 · 공정 일보 같은 독립적 증거와 맞춘다' },
    { key: 'skin', label: '외장 — 보고 공정률과 현장의 괴리', score: 15 },
    { key: 'mep', label: '설비 — 보고 공정률과 현장의 괴리', score: 15 },
    { key: null, label: '일치하는 공종을 괴리로 표시하지 않음', score: 10 },
    { key: 'rate', label: '보고된 공정률과 현장 대조 — 공정률 재추정', score: 30,
      why: '진행률 — 원가 기준이면 투입 원가 ÷ 다시 잡은 총예정원가. 총예정원가가 과소하면 진행률 · 매출이 부풀어 오른다' },
    { key: 'ev', label: '공정 일보 원본으로 확인', score: 15,
      why: '증거 — 본사 보고가 아니라 현장에서 손으로 쓴 공정 일보 원본' }
  ];

  var site = {
    name: '현장 공정 대조',
    labels: function () { return ST_DEFS.map(function (d) { return { label: d.label, score: d.score, why: d.why }; }); },
    traps: function () { return [{ label: '보고 공정률을 그대로 인정', score: -12, please: true }]; },
    build: function (seed) {
      var D = MD().site, R = rng(seed || 1);
      return { D: D, rows: shuffle(D.works.slice(), R) };
    },
    grade: function (M, st) {
      st = st || {};
      var mark = st.mark || {}, open = st.open || {};
      function w(k) { return M.rows.filter(function (r) { return r.k === k; })[0]; }
      var pr = (M.D.rates.filter(function (x) { return x.k === st.rate; })[0] || {});
      var gaps = M.rows.filter(function (r) { return r.gap; });
      var falses = M.rows.filter(function (r) { return !r.gap && mark[r.k]; }).length;
      var hits = [!!mark.roof && w('roof').gap, !!mark.skin && w('skin').gap, !!mark.mep && w('mep').gap,
                  falses === 0 && gaps.some(function (r) { return mark[r.k]; }), !!pr.ok,
                  gaps.every(function (r) { return open[r.k]; })];
      var trap = st.rate === 'reported' ? [{ label: '보고 공정률을 그대로 인정', score: -12, got: -12, hit: true, please: true }] : [];
      var r = pack(scored(ST_DEFS, hits), trap);
      r.detail = { gaps: gaps.filter(function (x) { return mark[x.k]; }).length, falses: falses, rate: pr.v == null ? null : pr.v };
      return r;
    },
    summary: function (M, st, g) {
      var d = g.res.detail || {};
      return '괴리 공종 ' + d.gaps + '/3 · 오표시 ' + d.falses + '건 · 재추정 공정률 ' + (d.rate == null ? '고르지 않음' : d.rate + '%');
    },
    perfect: function (M) {
      var mark = {}, open = {};
      M.rows.forEach(function (r) { if (r.gap) { mark[r.k] = true; open[r.k] = true; } });
      return { mark: mark, open: open, rate: 're' };
    },

    mount: function (host, M, api) {
      var D = M.D, st = { mark: {}, open: {}, rate: null };
      host.innerHTML =
        '<div class="mg site">' +
          '<div class="mg-bar"><b>' + esc(D.title) + '</b>' +
            '<span class="mg-stat">보고 공정률 <b>' + D.reported + '%</b></span>' +
            '<span class="mg-stat">계약 ' + D.contract + '억 · 원가 투입 ' + D.spent + '억</span>' +
            '<span class="mg-stat">괴리 <b data-k="n">0</b></span>' +
            '<button type="button" class="btn sm" data-act="done">대조 종료 <kbd>Ctrl Enter</kbd></button></div>' +
          '<div class="mg-hint">공종마다 현장과 본사 보고를 맞춘다. <b>괴리가 아닌 공종</b>을 표시하면 시간이 줄어든다.</div>' +
          '<div class="mg-split">' +
            '<div><table class="mg-t st-t"><thead><tr><th>공종</th><th class="n">비중</th><th class="n">보고</th><th>현장 사진</th><th>공정 일보</th><th>판정</th></tr></thead>' +
              '<tbody data-k="rows"></tbody></table></div>' +
            '<div class="sp-ws" data-k="ws"></div>' +
          '</div>' +
        '</div>';
      var $ = function (k) { return host.querySelector('[data-k="' + k + '"]'); };
      function draw() {
        $('rows').innerHTML = M.rows.map(function (r) {
          var on = !!st.mark[r.k], op = !!st.open[r.k];
          return '<tr class="' + (on ? 'on' : '') + '"><td><b>' + esc(r.name) + '</b></td><td class="n">' + r.w + '%</td><td class="n">' + r.rep + '%</td>' +
            '<td><span class="st-ph">' + esc(r.photo) + '</span></td>' +
            '<td>' + (op ? '<span class="ev-open">' + esc(r.log) + '</span>' : '<button type="button" class="ev-b" data-open="' + r.k + '">일보 보기</button>') + '</td>' +
            '<td><button type="button" class="flag-b' + (on ? ' on' : '') + '" data-mark="' + r.k + '">' + (on ? '✗ 괴리' : '일치') + '</button></td></tr>';
        }).join('');
        $('n').textContent = M.rows.filter(function (r) { return st.mark[r.k]; }).length;
        var pr = D.rates.filter(function (x) { return x.k === st.rate; })[0];
        $('ws').innerHTML =
          '<div class="ws-k">원가 기준 진행률</div>' +
          '<div class="ws-row"><span>원가 투입 누계</span><b>' + D.spent + '억</b></div>' +
          '<div class="ws-row"><span>회사 총예정원가</span><b>' + D.eac + '억</b></div>' +
          '<div class="ws-row"><span>다시 잡은 총예정원가</span><b>' + D.eac2 + '억</b></div>' +
          '<div class="ws-k">재추정 공정률 <small>하나</small></div><div class="ws-opts">' + D.rates.map(function (x) {
            return '<button type="button" class="act-b' + (st.rate === x.k ? ' on' : '') + '" data-rate="' + x.k + '">' + esc(x.t) + '</button>';
          }).join('') + '</div>' +
          '<div class="ws-row big"><span>공정률</span><b class="' + (pr && pr.v < D.reported ? 'over' : '') + '">' + (pr ? pr.v + '%' : '—') + '</b></div>';
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mark],[data-open],[data-rate],[data-act]');
        if (!b || !host.contains(b)) return;
        if (b.getAttribute('data-act') === 'done') return api.submit();
        if (b.hasAttribute('data-open')) {
          st.open[b.getAttribute('data-open')] = true;
          if (api.spend) api.spend(D.costSec || 3);
          api.sound && api.sound('flip');
        } else if (b.hasAttribute('data-mark')) {
          var k = b.getAttribute('data-mark');
          st.mark[k] = !st.mark[k];
          var row = M.rows.filter(function (r) { return r.k === k; })[0];
          if (st.mark[k] && row && !row.gap && api.spend) api.spend(D.wrongSec || 5);   // 틀린 표시 — 시간이 준다
          api.sound && api.sound(st.mark[k] ? 'stampSm' : 'tick');
        } else if (b.hasAttribute('data-rate')) {
          st.rate = b.getAttribute('data-rate');
          api.sound && api.sound('tick');
        }
        draw();
      });
      var off = doneKey(api);
      draw();
      return { state: function () { return JSON.parse(JSON.stringify(st)); }, destroy: off };
    },

    review: function (M, st) {
      st = st || {};
      var mark = st.mark || {};
      var rows = M.rows.map(function (r) {
        var ok = !!mark[r.k] === !!r.gap;
        return '<tr class="' + (ok ? 'ok' : 'no') + '"><td>' + esc(r.name) + '</td><td class="dim">' + esc(r.photo) + ' · ' + esc(r.log) + '</td>' +
          '<td class="n">보고 ' + r.rep + '% · 현장 ' + r.real + '%</td><td class="n">' + (ok ? '✓' : mark[r.k] ? '오표시' : '놓침') + '</td></tr>';
      }).join('');
      var right = M.D.rates.filter(function (x) { return x.ok; })[0];
      return '<table class="rv-t"><caption>괴리 공종 셋(지붕 · 외장 · 설비) · ' + esc(right.t) + '</caption>' + rows + '</table>';
    }
  };

  /* ============================================================
     방법 — 미니게임을 처음 만날 때 한 번 뜨는 설명 (game.js 가 띄운다)
     howto(M) = { goal, steps: [{ t, key, d, demo }], warn }
     조작만 알려 준다. 무엇을 골라야 맞는지는 적지 않는다
     demo 는 게임과 같은 클래스로 그린 버튼 모양 (누를 수 없다)
     ============================================================ */
  function sp(cls, html) { return '<span class="' + cls + '">' + html + '</span>'; }
  var TO = '<span class="mi-ar">→</span>';
  function critDemo(M, keys) {
    return M.D.criteria.map(function (c, i) { return { c: c, i: i }; })
      .filter(function (x) { return keys.indexOf(x.c.k) >= 0; })
      .map(function (x, j) {
        var n = M.rows.filter(function (r) { return r.tags.indexOf(x.c.k) >= 0; }).length;
        return sp('crit-b' + (j === 0 ? ' on' : ''), '<kbd>' + (x.i + 1) + '</kbd>' + esc(x.c.name) + '<em>' + n + '</em>');
      }).join('');
  }

  count.howto = function (M) {
    var D = M.D;
    return {
      goal: '현품과 실사표를 양쪽에서 맞춰 본다. 숨은 예외는 다섯 건.',
      steps: [
        { t: '출발점 고르기', d: '랙 칸을 누르면 현품에서, 실사표 줄을 누르면 실사표에서 출발한다.',
          demo: sp('mi-chip dark', '랙 칸') + TO + sp('mi-chip', '실사표') + '<span class="mi-gap"></span>' + sp('mi-chip', '실사표 줄') + TO + sp('mi-chip dark', '현품') },
        { t: '세기', key: 'Space', d: '현품 수량이 열린다. 한 번에 −' + D.costSec + '초, ' + D.samples + '개까지.' },
        { t: '틱 치기', key: '1–5',
          demo: D.ticks.map(function (x, i) { return sp('tick', '<kbd>' + (i + 1) + '</kbd><b>' + x.mark + '</b>' + esc(x.name)); }).join('') },
        { t: '끝내기', key: 'Ctrl Enter' }
      ],
      warn: '정상 품목에 예외 틱'
    };
  };
  jet.howto = function (M) {
    return {
      goal: '추출 조건을 조합해 위험한 분개를 모두 잡는다. 추출은 ' + M.D.limit + '건 안으로.',
      steps: [
        { t: '조건 켜기', key: '1–9', d: '켠 조건 가운데 하나라도 맞으면 추출된다. 칩의 숫자는 그 조건에 걸리는 건수.',
          demo: critDemo(M, ['blank', 'round']) },
        { t: '건수 보기', d: '추출 건수가 한도를 넘으면 붉게 바뀐다.' },
        { t: '확정', key: 'Ctrl Enter' }
      ]
    };
  };
  cutoff.howto = function (M) {
    var T = M.D.terms;
    return {
      goal: '12월 31일 선 앞뒤로 나간 출고 ' + M.rows.length + '건. 매출을 잘못된 해에 잡은 거래를 찾는다.',
      steps: [
        { t: '인도조건 읽기', d: '조건마다 매출을 잡는 날이 다르다. 그날이 선 왼쪽이면 당기, 오른쪽이면 차기.',
          demo: sp('mi-lg', '<b>▲</b>' + esc(T.ship.name) + ' · 출고') + sp('mi-lg', '<b>●</b>' + esc(T.dest.name) + ' · 도착') + sp('mi-lg', '<b>■</b>' + esc(T.accept.name) + ' · 검수') },
        { t: '회사 인식과 대조', d: '줄마다 적힌 회사의 당기 · 차기 인식과 맞는지 본다.' },
        { t: '표시', key: '1–' + M.rows.length, demo: sp('flag-b', '정상') + TO + sp('flag-b on', '✗ 귀속 오류') },
        { t: '끝내기', key: 'Ctrl Enter' }
      ],
      warn: '정상 거래를 오류로 표시'
    };
  };
  confirm.howto = function (M) {
    return {
      goal: '조회서를 보낼 거래처를 고르고, 조회처를 정해 직접 보낸 뒤, 돌아온 회신을 처리한다.',
      steps: [
        { t: '대상 고르기', key: '1–9', d: '번호를 눌러 조회할 거래처를 고른다.' },
        { t: '조회처 정하기', d: '회사가 준 연락처와 감사인이 따로 확인한 연락처 가운데 하나.',
          demo: sp('via-b on', '<em>회사 제공</em>회사가 준 주소') + sp('via-b', '<em>독립 확인</em>등기부 · 대표번호') },
        { t: '발송', key: 'Enter', d: '한 곳에 −' + M.D.costSec + '초. 보낸 뒤에는 대상과 조회처를 바꿀 수 없다.' },
        { t: '회신 처리', d: '일치가 아닌 회신마다 처리를 하나 고른다.',
          demo: sp('rep ok still', '✓ 일치') + sp('rep fax still', '⚠ 회사를 거쳐 들어옴') + sp('rep none still', '✗ 미회신') + sp('rep diff still', '≠ 금액 차이') },
        { t: '끝내기', key: 'Ctrl Enter' }
      ]
    };
  };
  unrec.howto = function (M) {
    return {
      goal: '1월에 나간 돈 ' + M.rows.length + '건. 12월에 이미 생긴 부채인데 장부에 없는 것을 찾는다.',
      steps: [
        { t: '증빙 보기', d: '의무가 생긴 때가 보인다. 한 건에 −' + (M.D.costSec || 3) + '초.',
          demo: sp('ev-b', '증빙 보기') + TO + sp('ev-open', '의무가 생긴 때') },
        { t: '표시', key: '0–9', demo: sp('flag-b', '정상') + TO + sp('flag-b on', '✗ 부외부채') },
        { t: '끝내기', key: 'Ctrl Enter' }
      ],
      warn: '정상 지급을 부외부채로 표시'
    };
  };
  sample.howto = function (M) {
    return {
      goal: '표본에서 나온 왜곡표시로 모집단 전체를 판정한다.',
      steps: [
        { t: '왜곡표시 표시', key: '0–9', d: '장부와 확인 금액을 줄마다 비교한다.',
          demo: sp('flag-b', '—') + TO + sp('flag-b on', '✗ 왜곡표시') },
        { t: '추정 방법', d: '두 방법 가운데 하나. 고르면 추정 금액과 허용왜곡표시 막대가 그려진다.' },
        { t: '판정', demo: sp('act-b', '모집단 채택') + sp('act-b', '모집단 기각') },
        { t: '후속 조치', d: '판정 뒤에 열린다. 해당하는 것을 모두 고른다.' },
        { t: '끝내기', key: 'Ctrl Enter' }
      ]
    };
  };
  ic.howto = function (M) {
    return {
      goal: M.D.parent + ' 채권과 ' + M.D.sub + ' 채무의 차이를 원인별로 가르고, 제거할 미실현이익을 정한다.',
      steps: [
        { t: '증빙 보기', d: '선적서류 · 입고 기록이 열린다. 한 건에 −' + (M.D.costSec || 3) + '초.',
          demo: sp('ev-b', '증빙 보기') + TO + sp('ev-open', '선적일 · 입고일') },
        { t: '원인 고르기', d: '차이가 난 줄마다 하나.',
          demo: sp('act-b', '운송 중') + sp('act-b', '환율') + sp('act-b', '설명 안 됨') },
        { t: '미실현이익', d: '오른쪽 계산 기준 가운데 하나를 고른다.' },
        { t: '끝내기', key: 'Ctrl Enter' }
      ]
    };
  };
  attr.howto = function (M) {
    var s = M.D.signers[0];
    return {
      goal: '승인 문서 ' + M.rows.length + '장을 통제 규칙과 서명 견본으로 검사하고, 통제에 의존할지 정한다.',
      steps: [
        { t: '규칙', d: M.D.rule + '.' },
        { t: '표시', d: '누를 때마다 바뀐다.',
          demo: sp('flag-b at-b ok', '—') + TO + sp('flag-b at-b dev', '✗ 이탈') + TO + sp('flag-b at-b intent', '⚠ 고의 의심') + TO + sp('flag-b at-b ok', '—') },
        { t: '필체 대조', d: '오른쪽 서명 견본과 문서의 서명을 맞춰 본다.',
          demo: sp('mi-sg', esc(s.name) + sigSvg(s.hand)) },
        { t: '결론', d: '표본 이탈률을 보고 통제에 의존할지 정한다.' },
        { t: '끝내기', key: 'Ctrl Enter' }
      ],
      warn: '정상 문서를 이탈로 표시'
    };
  };
  ret.howto = function (M) {
    return {
      goal: '조건을 조합해 부정 반품을 모두 잡는다. 추출은 ' + M.D.limit + '건 안으로.',
      steps: [
        { t: '조건 켜기', key: '1–' + M.D.criteria.length, d: '켠 조건 가운데 하나라도 맞으면 추출된다. 칩의 숫자는 그 조건에 걸리는 건수.',
          demo: critDemo(M, ['weekend', 'big']) },
        { t: '건수 보기', d: '추출 건수가 한도를 넘으면 붉게 바뀐다.' },
        { t: '확정', key: 'Ctrl Enter' }
      ]
    };
  };
  site.howto = function (M) {
    return {
      goal: '공종마다 본사 보고와 현장을 맞추고, 공정률을 다시 잡는다.',
      steps: [
        { t: '일보 보기', d: '현장에서 손으로 쓴 공정 일보. 한 건에 −' + (M.D.costSec || 3) + '초.',
          demo: sp('ev-b', '일보 보기') + TO + sp('ev-open', '공정 일보') },
        { t: '괴리 표시', d: '사진 · 일보가 보고와 다르면 표시한다. 틀린 표시는 −' + (M.D.wrongSec || 5) + '초.',
          demo: sp('flag-b', '일치') + TO + sp('flag-b on', '✗ 괴리') },
        { t: '공정률 다시 잡기', d: '오른쪽 계산 가운데 하나를 고른다.' },
        { t: '끝내기', key: 'Ctrl Enter' }
      ]
    };
  };

  global.MINIS = { count: count, jet: jet, cutoff: cutoff, confirm: confirm, unrec: unrec, sample: sample, ic: ic,
                   attr: attr, ret: ret, site: site };
})(typeof window !== 'undefined' ? window : this);
