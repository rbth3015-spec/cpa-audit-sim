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
          '<div class="mg-hint">청구일 · 지급일이 아니라 <b>의무가 생긴 때</b> — 입고 · 용역 제공 · 사용 기간. 증빙을 열 때마다 시간이 든다.</div>' +
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
              '<div class="mg-foot">나머지 ' + (D.n - M.rows.length) + '건 · 장부 ' + others.toFixed(1) + '억 — 확인 금액과 차이 없음</div></div>' +
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
        ' — 허용왜곡표시 ' + M.D.tol + '억을 ' + (proj > M.D.tol ? '넘어 기각' : '넘지 않아 채택') + '</caption>' + rows + '</table>';
    }
  };

  global.MINIS = { count: count, jet: jet, cutoff: cutoff, confirm: confirm, unrec: unrec, sample: sample };
})(typeof window !== 'undefined' ? window : this);
