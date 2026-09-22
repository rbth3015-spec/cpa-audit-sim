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

  var jet = {
    name: '분개 테스트',
    labels: function () {
      var D = MD().jet || { rows: [] };
      return JET_BASE.map(function (d) { return { label: d.label, score: d.score, why: d.why }; })
        .concat(D.rows.filter(function (r) { return r.risk; }).map(function (r) {
          return { label: '위험 분개 추출 — ' + r.risk, score: 12 };
        }));
    },
    traps: function () { return []; },

    build: function (seed) {
      var D = MD().jet, R = rng(seed || 1);
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
      if (n > 14) res.flags.push('추출 ' + n + '건 — 조건이 너무 넓음');
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

  global.MINIS = { count: count, jet: jet, cutoff: cutoff };
})(typeof window !== 'undefined' ? window : this);
