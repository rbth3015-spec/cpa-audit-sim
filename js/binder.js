/* ============================================================
   조서 바인더 (binder.js)
   ------------------------------------------------------------
   A 개요    회사 · 진행 · 게이지 흐름
   B 조서    장면마다 한 장 — 문항 · 내 답 · 틱마크 · 붉은 펜 · 모범답안
   C 증거    채택한 단서 · 미니게임 결과
   D 메모    가려진 메모 — 진실을 찾으면 검은 줄이 걷힌다
   E 카드    개념 카드 도감 — 뒤집으면 해설
   F 오답    60점 미만 문항 — 연습 모드로 다시 풀기
   G 인물    만난 사람 · 관계 · 알게 된 사실 · 메신저 기록
   H 암기    기준서 암기 카드 — 넘기며 외우기 (data/deck.js)

   BINDER.open({ S, prog, last, tab, onRetry, onClose })
     S     진행 중인 시즌 (없으면 prog.last 로 지난 시즌을 보여 준다)
   ============================================================ */
(function (global) {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // 탭 색은 모서리 띠 3px 로만 쓴다 — 종이에서 크게 튀지 않는 낮은 채도
  var TABS = [
    { id: 'A', name: '개요', c: '#8d8676' },
    { id: 'B', name: '조서', c: '#7f8a80' },
    { id: 'C', name: '증거', c: '#8e7f79' },
    { id: 'D', name: '메모', c: '#7c8190' },
    { id: 'E', name: '카드', c: '#9a8a63' },
    { id: 'F', name: '오답', c: '#94726c' },
    { id: 'G', name: '인물', c: '#847b94' },
    { id: 'H', name: '암기', c: '#6f8a90' }
  ];
  var TYPE = { write: '서술', judge: '판단', choice: '객관식', cloze: '빈칸', sort: '분류', mini: '미니게임' };

  var el = null, opt = null, tab = 'A', page = null, filter = 'all', who = null;
  var deckFil = 'all', deckSrc = 'all', study = null, open1 = {};

  function letter(p) { return p >= 90 ? 'S' : p >= 80 ? 'A' : p >= 65 ? 'B' : p >= 50 ? 'C' : 'D'; }
  function play(n) { if (global.FX) global.FX.play(n); }

  function papers() { return opt.S ? (opt.S.papers || []) : ((opt.prog.last && opt.prog.last.papers) || []); }
  function truths() {
    if (opt.S) return opt.S.truths.map(function (t) { return { def: t.def, amount: t.amount, active: t.active, found: t.found, verified: t.verified }; });
    var last = opt.prog.last;
    if (!last || !last.truths) return null;
    var by = {};
    (global.TRUTH || []).forEach(function (d) { by[d.id] = d; });
    return last.truths.map(function (t) { return { def: by[t.id], amount: t.amount, active: t.active, found: t.found, verified: t.verified, ended: true }; })
      .filter(function (t) { return t.def; });
  }

  function head(title, sub) {
    var C = global.COMPANY || {};
    var seatName = opt.S ? global.SEASON.SEATS[opt.S.seat].name : '—';
    return '<div class="bd-head"><div><span class="k">감사조서 · ' + esc(C.name || '') + ' · ' + esc(C.fy || '') + '</span>' +
      '<h2>' + esc(title) + '</h2>' + (sub ? '<span class="k" style="margin-top:6px">' + esc(sub) + '</span>' : '') + '</div>' +
      '<dl class="bd-sign"><div><dt>시즌</dt><dd>' + esc(opt.S ? opt.S.seed : (opt.prog.last ? opt.prog.last.seed : '—')) + '</dd></div>' +
      '<div><dt>작성</dt><dd class="ink">나</dd></div>' +
      '<div><dt>검토</dt><dd class="ink">유가온</dd></div>' +
      '<div><dt>지금 자리</dt><dd>' + esc(seatName) + '</dd></div></dl>' +
      '<button type="button" class="bd-close" data-act="close" aria-label="닫기">✕</button></div>';
  }

  /* ── A 개요 ──────────────────────────────────────────── */
  function spark(list) {
    var W = 520, H = 150, pad = 24;
    if (list.length < 2) return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '"><text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">장면 2개부터</text></svg>';
    function line(key, color, map) {
      var pts = list.map(function (g, i) {
        var x = pad + i * (W - pad * 2) / (list.length - 1);
        var y = H - pad - (map(g[key]) / 100) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      return '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" points="' + pts + '"/>';
    }
    var grid = [0, 50, 100].map(function (v) {
      var y = H - pad - v / 100 * (H - pad * 2);
      return '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e0df"/><text x="4" y="' + (y + 3) + '">' + v + '</text>';
    }).join('');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + grid +
      line('E', '#201e1d', function (v) { return v; }) +
      line('R', '#2f5d43', function (v) { return v; }) +
      line('T', '#ae1800', function (v) { return v; }) +
      line('C', '#8a5a00', function (v) { return v; }) + '</svg>' +
      '<div class="legend"><span><i style="background:#201e1d"></i>감사증거</span><span><i style="background:#2f5d43"></i>신뢰</span>' +
      '<span><i style="background:#ae1800"></i>기한</span><span><i style="background:#8a5a00"></i>회사 태도</span></div>';
  }

  function tabA() {
    var C = global.COMPANY || {}, S = opt.S, P = papers();
    var gs = [{ E: 50, R: 60, T: 100, C: 55 }].concat(P.map(function (x) { return x.g; }).filter(Boolean));
    var prog = '', nScene = (global.SCENES || []).length;
    for (var i = 0; i < nScene; i++) {
      var done = P.some(function (x) { return x.kind === 'scene' && x.idx === i; });
      var curI = S && S.i === i && !done;
      prog += '<span class="' + (done ? 'done' : curI ? 'cur' : '') + '">' + ('0' + (i + 1)).slice(-2) + '</span>';
    }
    var stats = opt.prog;
    return head('감사 개요', S ? '진행 중인 시즌' : (stats.last ? '지난 시즌' : '')) +
      '<div class="bd-body"><div class="ov">' +
        '<section><h3>피감사회사</h3><table>' +
          [['회사', C.name + ' (' + C.market + ')'], ['업종', C.industry], ['매출액', C.revenue], ['자산총계', C.assets],
           ['재무제표 전체 중요성', C.materiality], ['수행중요성', C.pm], ['명백하게 사소한 금액', C.trivial]].map(function (r) {
            return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
          }).join('') + '</table></section>' +
        '<section><h3>진행 <span>' + P.filter(function (x) { return x.kind === 'scene'; }).length + ' / ' + nScene + '</span></h3><div class="prog">' + prog + '</div>' +
          '<h3 style="margin-top:18px">게이지 흐름</h3>' + spark(gs) + '</section>' +
        '<section><h3>누적 기록</h3><table>' +
          [['시즌 플레이', (stats.plays || 0) + '회'], ['최고 평균', stats.best ? stats.best + '점' : '—'],
           ['개념 카드', Object.keys(stats.cards || {}).filter(function (k) { return stats.cards[k] === 'learned'; }).length + '장 익힘'],
           ['오답 노트', (stats.wrong || []).length + '문항']].map(function (r) {
            return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
          }).join('') + '</table></section>' +
        '<section><h3>틱마크 범례</h3><table>' +
          [['✓', '논점 짚음'], ['◐', '핵심어는 있으나 한정어 누락 · 힌트 사용'], ['✗', '논점 누락'], ['!', '감점 서술 · 오답 선택']].map(function (r) {
            return '<tr><th>' + r[0] + '</th><td style="font-family:var(--sans);text-align:left">' + r[1] + '</td></tr>';
          }).join('') + '</table></section>' +
      '</div></div>';
  }

  /* ── B 조서 ──────────────────────────────────────────── */
  function tabB() {
    var P = papers();
    if (page != null && P[page]) return paperPage(P[page]);
    var rows = P.map(function (x, i) {
      return '<tr data-page="' + i + '"><td class="no">' + esc(x.no) + '</td><td>' + esc(x.title) +
        (x.vlabel ? ' <span class="dim">· ' + esc(x.vlabel) + '</span>' : '') + '</td>' +
        '<td class="dim" style="font-family:var(--mono);font-size:12px">' + esc(x.std || '') + '</td>' +
        '<td class="gr">' + letter(x.pct) + '</td><td style="font-family:var(--mono)">' + x.pct + '</td></tr>';
    }).join('');
    return head('조서 목록', P.length + '장 편철') + '<div class="bd-body">' +
      (P.length ? '<table class="wp-index"><thead><tr><th>조서번호</th><th>제목</th><th>기준</th><th>등급</th><th>점수</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="wp-empty">편철한 조서 없음</div>') + '</div>';
  }

  function paperPage(x) {
    var parts = (x.parts || []).map(function (p) {
      var ticks = (p.must || []).map(function (m) {
        return '<li class="' + (m.h ? 'ok' : m.p ? 'half' : 'no') + '">' + esc(m.l) + '</li>';
      }).join('') + (p.trap || []).map(function (t) { return '<li class="trap">' + esc(t) + '</li>'; }).join('');
      var missed = (p.must || []).filter(function (m) { return !m.h; }).map(function (m) { return m.l; });
      return '<div class="wp-part"><div class="pk">' + esc(p.key) + '<small>' + esc(TYPE[p.type] || '') + '</small></div>' +
        '<div><div class="wp-q">' + esc(p.ask) + '</div>' +
          '<div class="wp-a' + (p.ans ? '' : ' empty') + '">' + (p.ans ? esc(p.ans) : '(무응답)') + '</div>' +
          '<ul class="wp-ticks">' + ticks + '</ul>' +
          (missed.length ? '<div class="wp-pen">검토 — ' + esc(missed.join(' · ')) + ' 보완</div>' : '<div class="wp-pen" style="color:#2f5d43">검토 — 이상 없음</div>') +
          (p.keyText ? '<details class="wp-model"><summary>모범답안 · 정답</summary><p>' + esc(p.keyText).replace(/\n/g, '<br>') + '</p></details>' : '') +
        '</div><div class="grd"><b>' + letter(p.pct) + '</b><span>' + p.pct + '점</span></div></div>';
    }).join('');
    return head(x.no + ' ' + x.title, (x.day || '') + (x.seat ? ' · ' + x.seat + ' 자리' : '')) +
      '<div class="bd-body"><button type="button" class="wp-back" data-act="index">← 목록</button>' +
      '<div class="wp-top"><div><h3>' + esc(x.title) + (x.vlabel ? ' — ' + esc(x.vlabel) : '') + '</h3>' +
        (x.sit ? '<p>' + esc(x.sit) + '</p>' : '') + '</div>' +
        '<span class="stamp' + (x.pct >= 80 ? ' good' : '') + '">' + (x.pct >= 80 ? '검토<br>완료' : x.pct >= 50 ? '보완<br>요구' : '재작성') + '</span></div>' +
      parts + '<div class="wp-legend">✓ 논점 짚음 · ◐ 부분 인정 · ✗ 누락 · ! 감점</div></div>';
  }

  /* ── C 증거 ──────────────────────────────────────────── */
  function tabC() {
    var P = papers().filter(function (x) { return (x.clues && x.clues.length) || x.mini; });
    var cards = P.map(function (x) {
      var got = (x.clues || []).filter(function (c) { return c.got; }).length;
      return '<div class="ev-card"><h4>' + esc(x.no + ' ' + x.title) + '<span>단서 ' + got + '/' + (x.clues || []).length + '</span></h4><ul>' +
        (x.clues || []).map(function (c, i) {
          return '<li class="' + (c.got ? '' : 'miss') + '"><b>EV-' + ('0' + (i + 1)).slice(-2) + '</b>' + esc(c.t) + (c.got ? '' : ' — 놓침') + '</li>';
        }).join('') +
        (x.mini ? '<li><b>MINI</b>' + esc(x.mini) + '</li>' : '') + '</ul></div>';
    }).join('');
    return head('증거 보관함', '채택한 단서 · 현장 결과') + '<div class="bd-body">' +
      (cards ? '<div class="ev-grid">' + cards + '</div>' : '<div class="wp-empty">채택한 증거 없음</div>') + '</div>';
  }

  /* ── D 가려진 메모 ───────────────────────────────────── */
  function tabD() {
    var T = truths();
    if (!T) return head('가려진 메모') + '<div class="bd-body"><div class="wp-empty">시즌 시작 전</div></div>';
    var n = T.filter(function (t) { return t.found || t.verified; }).length;
    var items = T.map(function (t) {
      var d = t.def, open = t.found || t.verified || t.ended;
      if (!open) {
        return '<li><span class="ac">' + esc(d.account) + '</span><span class="bar">' + String(d.hidden).replace(/\S/g, '■') + '</span>' +
          '<span class="lead">' + esc(d.lead || '') + '</span></li>';
      }
      var tag = t.found ? '<span class="tag found">발견 ' + t.amount.toFixed(1) + '억</span>'
        : t.verified ? '<span class="tag cleared">이상 없음</span>'
        : t.active ? '<span class="tag" style="color:#ae1800">놓침</span>' : '<span class="tag cleared">없었음</span>';
      return '<li class="open"><span class="ac">' + esc(d.account) + '</span><span class="txt">' +
        esc(global.SEASON.truthText(t)) + '</span>' + tag + '</li>';
    }).join('');
    return head('가려진 메모', '찾은 만큼 걷힌다') + '<div class="bd-body"><div class="memo-r">' +
      '<h3>확인이 필요한 사항</h3><p>확인 ' + n + ' / ' + T.length + '</p>' +
      '<ol>' + items + '</ol></div></div>';
  }

  /* ── E 개념 카드 ─────────────────────────────────────── */
  function family(std) {
    if (!std) return '기타';
    if (/윤리|회계사법|외부감사법|외감법/.test(std)) return '윤리 · 법';
    var m = /(\d)\d\d/.exec(std);
    if (!m) return '기타';
    return { 1: 'KSA 100 · 품질', 2: 'KSA 200 · 총칙', 3: 'KSA 300 · 위험평가', 4: 'KSA 400 · 왜곡표시', 5: 'KSA 500 · 감사증거', 6: 'KSA 600 · 타인의 업무', 7: 'KSA 700 · 보고' }[m[1]] || '기타';
  }
  function tabE() {
    var all = global.SEASON.cardIndex();
    var st = opt.prog.cards || {}, fresh = opt.prog.fresh || {};
    var learned = all.filter(function (c) { return st[c.label] === 'learned'; }).length;
    var groups = {}, order = [];
    all.forEach(function (c) {
      var f = family(c.std);
      if (!groups[f]) { groups[f] = []; order.push(f); }
      groups[f].push(c);
    });
    order.sort();
    var body = order.map(function (f) {
      var list = groups[f].filter(function (c) {
        var s = st[c.label];
        return filter === 'all' || (filter === 'learned' && s === 'learned') || (filter === 'review' && s === 'review');
      });
      if (!list.length) return '';
      var got = groups[f].filter(function (c) { return st[c.label] === 'learned'; }).length;
      return '<section class="cc-sec"><h3 class="bd-h3">' + esc(f) + '<span>' + got + ' / ' + groups[f].length + '</span></h3><div class="cc-grid">' +
        list.map(function (c) {
          var s = st[c.label] || 'locked';
          return '<button type="button" class="cc ' + s + (fresh[c.label] ? ' new' : '') + '" data-card>' +
            '<span class="cc-in"><span class="cc-f"><span class="cc-std">' + esc(c.std) + '</span>' +
            '<span class="cc-t">' + (s === 'locked' ? '?' : esc(c.label)) + '</span>' +
            '<span class="cc-where">' + (s === 'locked' ? esc(c.where || '') + '에서 발견' : esc(c.where || '')) + '</span></span>' +
            '<span class="cc-b"><p>' + (s === 'locked' ? '아직 만나지 못한 카드' : esc(c.why)) + '</p></span></span></button>';
        }).join('') + '</div></section>';
    }).join('');
    return head('개념 카드 도감', '뒤집으면 해설') + '<div class="bd-body">' +
      '<div class="cc-top"><b>' + learned + ' / ' + all.length + '</b><span class="meter"><i style="width:' + Math.round(learned / Math.max(1, all.length) * 100) + '%"></i></span>' +
      '<span class="cc-filter">' + [['all', '전체'], ['learned', '익힘'], ['review', '복습']].map(function (f) {
        return '<button type="button" data-filter="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
      }).join('') + '</span></div>' + (body || '<div class="wp-empty">해당 카드 없음</div>') + '</div>';
  }

  /* ── F 오답 ──────────────────────────────────────────── */
  function tabF() {
    var W = opt.prog.wrong || [];
    var list = W.slice().sort(function (a, b) { return a.pct - b.pct; }).map(function (w) {
      return '<li><span class="src">' + esc(w.title || w.src) + ' ' + esc(w.key) + '</span><span class="q">' + esc(w.ask) + '</span><span class="pc">' + w.pct + '</span></li>';
    }).join('');
    return head('오답 노트', '60점 미만') + '<div class="bd-body">' +
      (W.length ? '<ul class="wrong-list">' + list + '</ul>' +
        (opt.onRetry ? '<div class="bd-actions"><button type="button" class="btn" data-act="retry">오답 다시 풀기 <kbd>' + W.length + '</kbd></button></div>' : '')
        : '<div class="wp-empty">오답 노트 비어 있음</div>') + '</div>';
  }

  /* ── G 인물 ──────────────────────────────────────────── */
  function GROUPS() {
    return [['team', '세종회계법인'], ['client', (global.COMPANY || {}).name || '회사'],
            ['outside', '외부'], ['other', '다른 고객사']];
  }
  function storyOf() {
    if (opt.S) return { story: opt.S.story || {}, bond: opt.S.bond || {} };
    var last = opt.prog.last;
    return { story: (last && last.story) || {}, bond: (last && last.bond) || {}, past: true };
  }
  function tabG() {
    var C = global.CAST || {}, O = global.CAST_ORDER || {}, st = storyOf(), facts = st.story.facts || {};
    var chat = st.story.chat || [], met = {};
    chat.forEach(function (m) { if (m.from) met[m.from] = 1; if (/^dm:/.test(m.room)) met[m.room.slice(3)] = 1; });
    var ids = [], GROUP = GROUPS();
    GROUP.forEach(function (g) { (O[g[0]] || []).forEach(function (k) { if (C[k]) ids.push(k); }); });
    if (!who || ids.indexOf(who) < 0) who = ids[0];
    var BD = (global.STORYDATA && global.STORYDATA.BONDS) || {};
    var list = GROUP.map(function (g) {
      var ks = (O[g[0]] || []).filter(function (k) { return C[k]; });
      if (!ks.length) return '';
      return '<div class="pp-g">' + esc(g[1]) + '</div>' + ks.map(function (k) {
        var c = C[k], b = st.bond[k];
        var band = b != null && BD[k] != null && global.STORY ? global.STORY.bandOf(k, b) : '';
        return '<button type="button" class="pp-i' + (k === who ? ' on' : '') + (met[k] ? ' met' : '') + '" data-person="' + k + '">' +
          global.ART.face(k, null, 'pp-av') + '<span><b>' + esc(c.name) + '</b><small>' + esc(c.role) + '</small></span>' +
          (band ? '<em>' + esc(band) + '</em>' : '') + '</button>';
      }).join('');
    }).join('');

    var c = C[who], b = st.bond[who];
    var fl = (c.facts || []).map(function (f) {
      var open = f.open || facts[f.id];
      return open ? '<li>' + esc(f.t) + '</li>' : '<li class="hid"><span>' + String(f.t).replace(/\S/g, '■') + '</span></li>';
    }).join('');
    var lines = chat.filter(function (m) { return m.from === who || m.room === 'dm:' + who; }).slice(-14);
    var log = lines.map(function (m) {
      var mine = m.from === 'staff' || !!m.me;         // 옛 기록은 'staff'(나), 새 기록은 그 대화의 시점 인물
      return '<li class="' + (mine ? 'me' : m.sys ? 'sys' : '') + '"><span class="t">' + esc(m.time || '') + '</span>' +
        '<span class="w">' + esc(m.sys ? '' : m.from === 'staff' ? '나' : (C[m.from] || {}).name || '') + '</span><span class="x">' + esc(m.sys || m.t) + '</span></li>';
    }).join('');
    var meter = b != null && BD[who] != null
      ? '<div class="pp-bond"><span class="k">관계</span><span class="meter"><i style="width:' + b + '%"></i></span><b>' + esc(global.STORY.bandOf(who, b)) + '</b></div>' : '';
    return head('인물 파일', (st.past ? '지난 시즌 · ' : '') + '만난 사람 · 알게 된 것') + '<div class="bd-body"><div class="pp">' +
      '<nav class="pp-list">' + list + '</nav>' +
      '<article class="pp-file"><div class="pp-top">' + global.ART.card(who, 'pp-card') +
        '<div><span class="k">' + esc(c.org || '') + '</span><h3>' + esc(c.name) + '</h3><p class="pp-role">' + esc(c.role) + (c.age ? ' · ' + c.age + '세' : '') + '</p>' +
        '<p class="pp-tag">' + esc(c.tag || '') + '</p>' + meter + '</div></div>' +
        '<h4 class="bd-h3">알게 된 것</h4><ul class="pp-facts">' + (fl || '<li class="dim">—</li>') + '</ul>' +
        '<h4 class="bd-h3">메신저 기록<span>' + lines.length + '</span></h4>' +
        (log ? '<ul class="pp-log">' + log + '</ul>' : '<div class="wp-empty" style="padding:18px">아직 나눈 대화가 없다</div>') +
      '</article></div></div>';
  }

  /* 탭에 붙는 숫자 — 무엇이 얼마나 들었는지 (설명 대신 숫자로) */
  function tabNote(id) {
    var P = papers(), pr = opt.prog || {};
    if (id === 'A') return opt.S ? 'D-' + global.SEASON.dday(opt.S) : '';
    if (id === 'B') return P.length ? P.length + '장' : '';
    if (id === 'C') {
      var got = 0, all = 0;
      P.forEach(function (x) { (x.clues || []).forEach(function (c) { all++; if (c.got) got++; }); });
      return all ? got + ' / ' + all : '';
    }
    if (id === 'D') {
      var T = truths();
      if (!T) return '';
      return T.filter(function (t) { return t.found || t.verified; }).length + ' / ' + T.length;
    }
    if (id === 'E') {
      var cards = global.SEASON.cardIndex(), st = pr.cards || {};
      return cards.filter(function (c) { return st[c.label] === 'learned'; }).length + ' / ' + cards.length;
    }
    if (id === 'F') return (pr.wrong || []).length ? (pr.wrong || []).length + '개' : '';
    if (id === 'H') {
      var ds = (opt.prog.deck || {});
      var DK = (global.DECK || []).concat(global.DECK_NOTES || []);
      return DK.filter(function (c) { return ds[c.id] === 'known'; }).length + ' / ' + DK.length;
    }
    if (id === 'G') {
      var st2 = storyOf(), met = {};
      (st2.story.chat || []).forEach(function (m) { if (m.from) met[m.from] = 1; if (/^dm:/.test(m.room)) met[m.room.slice(3)] = 1; });
      var n = Object.keys(met).length;
      return n ? n + '명' : '';
    }
    return '';
  }

  function drawTabs() {
    var wrongN = (opt.prog.wrong || []).length;
    var freshN = Object.keys(opt.prog.fresh || {}).length;
    el.querySelector('.bd-tabs').innerHTML = TABS.map(function (t) {
      var badge = t.id === 'E' && freshN ? '<span class="badge">' + freshN + '</span>'
        : t.id === 'F' && wrongN ? '<span class="badge">' + wrongN + '</span>' : '';
      var note = tabNote(t.id);
      return '<button type="button" class="bd-tab' + (t.id === tab ? ' on' : '') + '" data-tab="' + t.id + '" style="--c:' + t.c + '">' +
        '<b>' + t.id + '</b><span>' + t.name + '</span><i>' + esc(note) + '</i>' + badge + '</button>';
    }).join('');
  }

  /* ── H 암기 카드 ─────────────────────────────────────── */
  function deck() {
    var base = (global.DECK || []).map(function (c) { return c; });
    var notes = (global.DECK_NOTES || []);
    if (deckSrc === 'ksa') return base;
    if (deckSrc === 'note') return notes;
    return base.concat(notes);
  }
  function deckState() { opt.prog.deck = opt.prog.deck || {}; return opt.prog.deck; }
  function deckSave() { if (opt.save) opt.save(opt.prog); }
  function deckGroups() {
    var g = {}, order = [];
    deck().forEach(function (c) {
      if (!g[c.std]) { g[c.std] = []; order.push(c.std); }
      g[c.std].push(c);
    });
    return { g: g, order: order };
  }

  function cardBack(c) {
    return '<ul class="dk-a">' + c.a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      (c.note ? '<p class="dk-note">' + esc(c.note) + '</p>' : '') +
      (c.src ? '<p class="dk-src">' + esc(c.src) + '</p>' : '');
  }

  function tabH() {
    if (study) return studyView();
    var st = deckState(), D = deck(), G = deckGroups();
    var known = D.filter(function (c) { return st[c.id] === 'known'; }).length;
    var list = G.order.filter(function (k) { return deckFil === 'all' || deckFil === k; }).map(function (k) {
      var cs = G.g[k];
      var kn = cs.filter(function (c) { return st[c.id] === 'known'; }).length;
      return '<section class="dk-sec"><h3 class="bd-h3">' + esc(k) + '<span>' + kn + ' / ' + cs.length + '</span></h3>' +
        '<div class="dk-grid">' + cs.map(function (c) {
          var s2 = st[c.id] || '';
          return '<button type="button" class="dk ' + s2 + (open1[c.id] ? ' open' : '') + '" data-dk="' + c.id + '">' +
            '<span class="dk-h"><b>' + esc(c.std) + '</b><i>' + esc(c.tag) + '</i>' +
              (s2 === 'known' ? '<em class="kn">익힘</em>' : s2 === 'again' ? '<em class="ag">다시</em>' : '') + '</span>' +
            '<span class="dk-q">' + esc(c.q) + '</span>' + (open1[c.id] ? cardBack(c) : '') + '</button>';
        }).join('') + '</div></section>';
    }).join('');
    var chips = [['all', '전체']].concat(G.order.map(function (k) { return [k, k]; }));
    var srcs = [['all', '전체 ' + ((global.DECK || []).length + (global.DECK_NOTES || []).length)],
                ['ksa', '기준서 ' + (global.DECK || []).length],
                ['note', '내 노트 ' + (global.DECK_NOTES || []).length]];
    return head('암기 카드', '기준서 · 기출 · 내 노트') + '<div class="bd-body">' +
      '<div class="dk-top"><b>' + known + ' / ' + D.length + '</b>' +
        '<span class="meter"><i style="width:' + Math.round(known / Math.max(1, D.length) * 100) + '%"></i></span>' +
        '<span class="dk-src-f">' + srcs.map(function (f) {
          return '<button type="button" data-dsrc="' + f[0] + '" class="' + (deckSrc === f[0] ? 'on' : '') + '">' + esc(f[1]) + '</button>';
        }).join('') + '</span>' +
        '<button type="button" class="btn sm" data-act="study">넘기며 외우기 <kbd>Space</kbd></button></div>' +
      '<div class="dk-fil">' + chips.map(function (f) {
        return '<button type="button" data-dfil="' + esc(f[0]) + '" class="' + (deckFil === f[0] ? 'on' : '') + '">' + esc(f[1]) + '</button>';
      }).join('') + '</div>' + (list || '<div class="wp-empty">카드 없음</div>') + '</div>';
  }

  function startStudy() {
    var st = deckState();
    var pool = deck().filter(function (c) { return deckFil === 'all' || c.std === deckFil; });
    // 다시 볼 카드 → 아직 안 본 카드 → 익힌 카드 순
    var rank = function (c) { return st[c.id] === 'again' ? 0 : st[c.id] ? 2 : 1; };
    pool = pool.slice().sort(function (a, b) { return rank(a) - rank(b); }).slice(0, 20);
    if (!pool.length) return;
    study = { q: pool, i: 0, back: false, done: { known: 0, again: 0 } };
    play('flip');
    render(false);
  }

  function studyAnswer(v) {
    if (!study || !study.back) return;
    var c = study.q[study.i];
    deckState()[c.id] = v;
    study.done[v]++;
    deckSave();
    study.i++;
    study.back = false;
    play(v === 'known' ? 'ok' : 'tick');
    render(false);
  }

  function studyView() {
    var n = study.q.length;
    if (study.i >= n) {
      return head('암기 카드', '한 바퀴 끝') + '<div class="bd-body"><div class="dk-done">' +
        '<span class="stamp good">완료</span><div><h3>' + n + '장</h3>' +
        '<p>익힘 ' + study.done.known + ' · 다시 ' + study.done.again + '</p></div></div>' +
        '<div class="bd-actions"><button type="button" class="btn" data-act="study">한 바퀴 더 <kbd>Space</kbd></button>' +
        '<button type="button" class="btn ghost" data-act="study-exit">카드 목록</button></div></div>';
    }
    var c = study.q[study.i];
    return head('암기 카드', (study.i + 1) + ' / ' + n) + '<div class="bd-body"><div class="dk-study">' +
      '<div class="dk-card' + (study.back ? ' back' : '') + '" data-act="flip">' +
        '<div class="dk-c-h"><b>' + esc(c.std) + '</b><i>' + esc(c.tag) + '</i></div>' +
        '<p class="dk-c-q">' + esc(c.q) + '</p>' +
        (study.back ? cardBack(c) : '<span class="dk-c-hint">Space · 클릭 — 뒤집기</span>') + '</div>' +
      (study.back
        ? '<div class="dk-ans"><button type="button" class="btn" data-ans="known">안다 <kbd>1</kbd></button>' +
          '<button type="button" class="btn ghost" data-ans="again">다시 <kbd>2</kbd></button></div>'
        : '<div class="dk-ans"><button type="button" class="btn ghost" data-act="study-exit">그만 <kbd>Esc</kbd></button></div>') +
      '</div></div>';
  }

  function render(flip) {
    var html = { A: tabA, B: tabB, C: tabC, D: tabD, E: tabE, F: tabF, G: tabG, H: tabH }[tab]();
    var pg = el.querySelector('.bd-page');
    pg.innerHTML = html;
    if (flip) { pg.classList.remove('flip'); void pg.offsetWidth; pg.classList.add('flip'); }
    drawTabs();
  }

  function open(o) {
    close(true);
    opt = o || {};
    opt.prog = opt.prog || {};
    tab = opt.tab || 'A';
    page = null;
    study = null;
    open1 = {};
    if (opt.who) who = opt.who;
    filter = 'all';
    el = document.createElement('div');
    el.className = 'overlay binder-o';
    el.innerHTML = '<div class="binder" role="dialog" aria-label="조서">' +
      '<div class="bd-spine"><i></i><i></i><i></i></div><div class="bd-page"></div>' +
      '<div class="bd-tabs"></div></div>';
    document.body.appendChild(el);
    render(true);
    play('open');

    el.addEventListener('click', function (e) {
      if (e.target === el) return close();
      var t = e.target.closest('[data-tab],[data-act],[data-page],[data-card],[data-filter],[data-person],[data-dk],[data-dfil],[data-dsrc],[data-ans]');
      if (!t) return;
      if (t.hasAttribute('data-person')) { who = t.getAttribute('data-person'); play('tick'); render(false); return; }
      if (t.hasAttribute('data-dk')) { var dk = t.getAttribute('data-dk'); open1[dk] = !open1[dk]; play('flip'); render(false); return; }
      if (t.hasAttribute('data-dfil')) { deckFil = t.getAttribute('data-dfil'); play('tick'); render(false); return; }
      if (t.hasAttribute('data-dsrc')) { deckSrc = t.getAttribute('data-dsrc'); deckFil = 'all'; play('tick'); render(false); return; }
      if (t.hasAttribute('data-ans')) { studyAnswer(t.getAttribute('data-ans')); return; }
      if (t.hasAttribute('data-tab')) { tab = t.getAttribute('data-tab'); page = null; play('flip'); render(true); return; }
      if (t.hasAttribute('data-page')) { page = +t.getAttribute('data-page'); play('flip'); render(true); return; }
      if (t.hasAttribute('data-card')) { t.classList.toggle('flipped'); play('flip'); return; }
      if (t.hasAttribute('data-filter')) { filter = t.getAttribute('data-filter'); render(false); return; }
      var act = t.getAttribute('data-act');
      if (act === 'study') { startStudy(); return; }
      if (act === 'study-exit') { study = null; play('flip'); render(true); return; }
      if (act === 'flip' && study) { study.back = !study.back; play('flip'); render(false); return; }
      if (act === 'close') close();
      else if (act === 'index') { page = null; play('flip'); render(true); }
      else if (act === 'retry' && opt.onRetry) { var fn = opt.onRetry; close(); fn(); }
    });
    el._key = function (e) {
      var typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName);
      if (study) {                                   // 암기 중에는 카드 조작이 먼저
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); study = null; render(true); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); study.back = !study.back; play('flip'); render(false); return; }
        if (e.key === '1') { e.preventDefault(); studyAnswer('known'); return; }
        if (e.key === '2') { e.preventDefault(); studyAnswer('again'); return; }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === ' ' && tab === 'H' && !typing) { e.preventDefault(); e.stopPropagation(); startStudy(); }
      else if (/^[a-hA-H]$/.test(e.key) && !typing) {
        tab = e.key.toUpperCase(); page = null; play('flip'); render(true);
      }
    };
    document.addEventListener('keydown', el._key, true);
  }

  function close(silent) {
    if (!el) return;
    document.removeEventListener('keydown', el._key, true);
    el.remove();
    el = null;
    var cb = opt && opt.onClose;
    if (!silent && cb) cb();
  }

  global.BINDER = { open: open, close: close, isOpen: function () { return !!el; } };
})(window);
