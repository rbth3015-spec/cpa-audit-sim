/* ============================================================
   장면 아트 (art.js)
   ------------------------------------------------------------
   디자인 시안의 사진 자리를 대신한다. 외부 이미지 파일은 쓰지 않는다.
     · 오프라인 · 단일 폴더로 돌아간다
     · 색은 전부 CSS 변수라 라이트/다크가 자동으로 바뀐다
     · 무채색으로만 그린다 — 빨강은 사진 위에 올리는 HTML 마킹의 몫이다
     · 모서리를 둥글리지 않는다 (Modernist: radius 0). 원은 조명·머리·도장뿐
     · 평면 블록과 2px 구조선으로만 만든다

   캔버스는 그려질 자리의 비율에 맞춘다
     무대 800×350 (16:7) · 타이틀 800×1200 · 초상 136×136
   무대 아래 ~26% 는 대사 박스가 덮으므로 주요 형태는 y 250 위에 둔다.
   ============================================================ */
(function (global) {
  'use strict';

  var W = 800, H = 350;          // 무대 기본 캔버스

  function svg(inner, w, h) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" ' +
      'role="img" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  function wrap(inner) { return svg(inner, W, H); }

  /* 공통 조각 -------------------------------------------------- */
  var _uid = 0;
  function fade(a, b, w, h) {
    var id = 'as-g' + (++_uid);
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
      '</linearGradient></defs><rect width="' + (w || W) + '" height="' + (h || H) + '" fill="url(#' + id + ')"/>';
  }
  function rect(x, y, w, h, fill, op) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="' + fill + '"' + (op == null ? '' : ' opacity="' + op + '"') + '/>';
  }
  function line(x1, y1, x2, y2, stroke, sw) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + stroke + '" stroke-width="' + (sw || 1) + '"/>';
  }
  function circle(cx, cy, r, fill, op, stroke, sw) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '"' +
      (op == null ? '' : ' opacity="' + op + '"') +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + (sw || 2) + '"' : '') + '/>';
  }
  /* 액자 · 창틀 — 2px 구조선 */
  function frame(x, y, w, h, stroke) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="none" stroke="' + (stroke || 'var(--as-line-strong)') + '" stroke-width="2"/>';
  }
  /* 도시 실루엣 — seed 를 주면 장면마다 같은 스카이라인이 나온다.
     x0~x1 을 주면 그 안에서만 그린다 (창틀 안에 넣을 때 clipPath 없이 쓴다) */
  function skyline(y, seed, fill, op, h0, h1, x0, x1) {
    var lo = x0 == null ? -24 : x0, hi = x1 == null ? W + 24 : x1;
    var s = '', x = lo, r = seed;
    for (var i = 0; i < 60 && x < hi; i++) {
      r = (r * 9301 + 49297) % 233280;
      var w = Math.min(30 + (r / 233280) * 52, hi - x);
      r = (r * 9301 + 49297) % 233280;
      var h = (h0 || 34) + (r / 233280) * ((h1 || 130) - (h0 || 34));
      s += rect(x.toFixed(0), (y - h).toFixed(0), w.toFixed(0), h.toFixed(0), fill, op);
      x += w + 9;
    }
    return s;
  }
  /* 창문 격자 — 몇 칸만 불이 켜져 있다 */
  function windows(x, y, cols, rows, cw, ch, gap, seed, lit, onFill) {
    var s = '', r = seed;
    for (var c = 0; c < cols; c++) {
      for (var v = 0; v < rows; v++) {
        r = (r * 9301 + 49297) % 233280;
        var on = (r / 233280) < (lit == null ? 0.26 : lit);
        s += rect(x + c * (cw + gap), y + v * (ch + gap), cw, ch,
          on ? (onFill || 'var(--as-panel)') : 'var(--as-ink)', on ? 0.9 : 0.3);
      }
    }
    return s;
  }
  /* 서류 더미 — 기울기 없이 층만 쌓는다 */
  function papers(x, base, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += rect(x + i * 5, base - 58 - i * 7, 54, 58 + i * 7, 'var(--as-panel)', 0.92) +
        line(x + i * 5, base - 58 - i * 7, x + i * 5 + 54, base - 58 - i * 7, 'var(--as-line-strong)', 1.5);
    }
    return s;
  }
  /* 선반 위 바인더 */
  function binders(x, base, n, w, h, seed) {
    var s = '', r = seed;
    for (var i = 0; i < n; i++) {
      r = (r * 9301 + 49297) % 233280;
      s += rect(x + i * (w + 3), base - h, w, h, 'var(--as-ink)', 0.16 + (r / 233280) * 0.26);
    }
    return s;
  }
  /* 사람 — 머리(원) + 어깨(사각). 실루엣만 쓴다 */
  function figure(x, base, scale, fill, op) {
    var s = scale || 1;
    return circle(x, base - 54 * s, 14 * s, fill, op == null ? 0.7 : op) +
      rect(x - 18 * s, base - 38 * s, 36 * s, 38 * s, fill, op == null ? 0.58 : op);
  }

  /* 장면 ------------------------------------------------------- */
  var SCENES = {

    // 파트너 방 — 수임 검토
    office: function () {
      var s = fade('var(--as-panel)', 'var(--as-panel-2)');
      s += rect(0, 0, W, 56, 'var(--as-ink)', 0.07) + line(0, 56, W, 56, 'var(--as-line-strong)', 2);
      s += rect(150, 20, 176, 9, 'var(--as-panel)', 0.95) + rect(474, 20, 176, 9, 'var(--as-panel)', 0.95);

      s += rect(26, 84, 206, 166, 'var(--as-sunk)', 1) + frame(26, 84, 206, 166);
      [128, 172, 216].forEach(function (y, i) {
        s += binders(36, y, 7, 22, 36, 71 + i * 13) + line(26, y, 232, y, 'var(--as-line-strong)', 2);
      });
      s += binders(36, 250, 6, 22, 34, 191);

      s += rect(272, 84, 240, 166, 'var(--as-sunk)', 1) +
        skyline(250, 77, 'var(--as-dim)', 0.45, 34, 140, 272, 512) +
        frame(272, 84, 240, 166) + line(392, 84, 392, 250, 'var(--as-line-strong)', 2) +
        line(272, 167, 512, 167, 'var(--as-line-strong)', 2);

      s += rect(552, 84, 218, 166, 'var(--as-panel)', 1) + frame(552, 84, 218, 166) +
        line(661, 84, 661, 250, 'var(--as-line)', 1);

      s += line(0, 250, W, 250, 'var(--as-line-strong)', 2) + rect(0, 250, W, 100, 'var(--as-panel)', 0.94);
      s += papers(154, 250, 4) + papers(560, 250, 3);
      s += rect(346, 198, 122, 52, 'var(--as-ink)', 0.78) + rect(354, 206, 106, 36, 'var(--as-panel)', 0.34);
      s += figure(676, 250, 1, 'var(--as-ink)', 0.5);
      return wrap(s);
    },

    // 회의실 — 위험평가 회의 · 왜곡표시 평가
    meeting: function () {
      var s = fade('var(--as-panel)', 'var(--as-panel-2)');
      s += line(0, 48, W, 48, 'var(--as-line)', 1);
      [244, 556].forEach(function (x) {
        s += line(x, 0, x, 40, 'var(--as-line-strong)', 2) + rect(x - 42, 40, 84, 10, 'var(--as-panel)', 0.95);
      });

      s += rect(48, 66, 262, 150, 'var(--as-sunk)', 1) + frame(48, 66, 262, 150);
      s += rect(70, 88, 150, 9, 'var(--as-ink)', 0.7) +
        rect(70, 108, 196, 5, 'var(--as-dim)', 0.6) + rect(70, 122, 128, 5, 'var(--as-dim)', 0.6) +
        '<polyline points="70,192 116,166 156,176 200,132 248,150 290,110" fill="none" ' +
        'stroke="var(--as-ink)" stroke-width="3"/>';

      s += rect(556, 66, 214, 150, 'var(--as-sunk)', 1) +
        skyline(216, 411, 'var(--as-dim)', 0.4, 30, 116, 556, 770) +
        frame(556, 66, 214, 150) + line(663, 66, 663, 216, 'var(--as-line-strong)', 2);

      s += line(0, 244, W, 244, 'var(--as-line)', 1);
      [190, 318, 446, 574].forEach(function (x, i) {
        s += figure(x, 252, 0.92 + (i % 2) * 0.06, 'var(--as-ink)', 0.4);
      });
      s += rect(96, 252, 608, 16, 'var(--as-line-strong)', 1) + rect(0, 268, W, 82, 'var(--as-panel)', 0.94);
      [190, 318, 446, 574].forEach(function (x) {
        s += rect(x - 27, 240, 54, 10, 'var(--as-panel)', 0.95);
      });
      return wrap(s);
    },

    // 창고 — 재고실사 입회
    warehouse: function () {
      var s = fade('var(--as-panel-2)', 'var(--as-sunk)');
      s += '<path d="M0 92 L400 18 L800 92 Z" fill="var(--as-dim)" opacity="0.2"/>' +
        '<path d="M0 92 L400 18 L800 92" fill="none" stroke="var(--as-line-strong)" stroke-width="2"/>';
      [96, 288, 480, 672].forEach(function (x) { s += rect(x, 40, 78, 8, 'var(--as-panel)', 0.9); });

      for (var i = 0; i < 5; i++) s += rect(34 + i * 184, 92, 10, 208, 'var(--as-ink)', 0.22);
      [158, 226, 294].forEach(function (y) { s += line(0, y, W, y, 'var(--as-line-strong)', 2); });

      var stacks = [[58, 158, 2], [60, 226, 3], [240, 158, 3], [244, 226, 1],
                    [424, 158, 1], [428, 226, 3], [606, 158, 3], [610, 226, 2]];
      stacks.forEach(function (st) {
        for (var k = 0; k < st[2]; k++) {
          var x = st[0] + k * 56;
          s += rect(x, st[1] - 52, 50, 52, 'var(--as-ink)', 0.24 + k * 0.07) +
            line(x, st[1] - 52, x + 50, st[1] - 52, 'var(--as-line-strong)', 2) +
            line(x + 25, st[1] - 52, x + 25, st[1], 'var(--as-bg)', 2);
        }
      });
      s += line(0, 300, W, 300, 'var(--as-line-strong)', 2) + rect(0, 300, W, 50, 'var(--as-panel)', 0.92);
      s += figure(566, 300, 1.06, 'var(--as-ink)', 0.6);
      return wrap(s);
    },

    // 실험실 — 개발비 자산화 (라온바이오)
    /* 창고의 자리를 대신한다. 셀 물건이 없는 회사라 선반에는 시약이 선다. */
    lab: function () {
      var s = fade('var(--as-panel)', 'var(--as-panel-2)');
      s += rect(0, 0, W, 46, 'var(--as-ink)', 0.06) + line(0, 46, W, 46, 'var(--as-line-strong)', 2);
      [112, 344, 576].forEach(function (x) { s += rect(x, 14, 112, 8, 'var(--as-panel)', 0.95); });

      // 시약장 — 선반마다 높이가 다른 병이 선다
      s += rect(30, 74, 214, 176, 'var(--as-sunk)', 1);
      [126, 178, 230].forEach(function (y, r) {
        for (var i = 0; i < 9; i++) {
          var h = 20 + ((i * 7 + r * 5) % 5) * 6;
          s += rect(42 + i * 22, y - h, 13, h, 'var(--as-ink)', 0.18 + (i % 3) * 0.09) +
            rect(45 + i * 22, y - h - 6, 7, 6, 'var(--as-ink)', 0.36);
        }
        s += line(30, y, 244, y, 'var(--as-line-strong)', 2);
      });
      s += frame(30, 74, 214, 176) + line(137, 74, 137, 250, 'var(--as-line)', 1);

      // 벽면 — 파이프라인 진행 도표. 이 회사의 자산은 저 칸들 안에 있다
      s += rect(286, 74, 224, 116, 'var(--as-sunk)', 1) + frame(286, 74, 224, 116);
      [0, 1, 2, 3, 4].forEach(function (r) {
        var y = 88 + r * 20, w = [166, 128, 74, 40, 26][r];
        s += rect(300, y, w, 9, 'var(--as-ink)', 0.62 - r * 0.09) +
          line(300, y + 13, 496, y + 13, 'var(--as-line)', 1);
      });

      // 후드 — 새시가 반쯤 내려와 있다
      s += rect(556, 74, 214, 176, 'var(--as-sunk)', 1) +
        rect(556, 74, 214, 42, 'var(--as-ink)', 0.18) + frame(556, 74, 214, 176) +
        line(556, 116, 770, 116, 'var(--as-line-strong)', 2) + line(663, 116, 663, 250, 'var(--as-line)', 1);

      // 벤치 — 플라스크 · 비커 · 시험관 거치대
      s += line(0, 250, W, 250, 'var(--as-line-strong)', 2) + rect(0, 250, W, 100, 'var(--as-panel)', 0.94);
      s += '<path d="M300 198 h20 v24 l28 28 h-76 l28 -28 z" fill="var(--as-ink)" opacity="0.34"/>' +
        '<path d="M300 198 h20 v24 l28 28 h-76 l28 -28 z" fill="none" stroke="var(--as-line-strong)" stroke-width="2"/>';
      s += rect(372, 204, 36, 46, 'var(--as-ink)', 0.16) + rect(372, 228, 36, 22, 'var(--as-ink)', 0.46) +
        frame(372, 204, 36, 46);
      s += rect(430, 236, 78, 14, 'var(--as-ink)', 0.66);
      for (var t = 0; t < 5; t++) s += rect(436 + t * 14, 206, 8, 30, 'var(--as-ink)', 0.26);
      s += papers(112, 250, 4);
      s += figure(624, 250, 1.02, 'var(--as-ink)', 0.5);
      return wrap(s);
    },

    // 서버실 — IT일반통제 (넥스트온)
    /* 통로 끝에 문이 있고 문 옆에 카드 리더가 있다. 이 장면의 논점이 거기 있다. */
    server: function () {
      var s = fade('var(--as-panel-2)', 'var(--as-sunk)');
      s += rect(0, 0, W, 40, 'var(--as-ink)', 0.08) + line(0, 40, W, 40, 'var(--as-line-strong)', 2);
      [46, 300, 554].forEach(function (x) { s += rect(x, 12, 200, 6, 'var(--as-ink)', 0.22); });

      // 통로 끝 — 출입문과 카드 리더
      s += rect(318, 56, 150, 232, 'var(--as-sunk)', 1);
      s += rect(352, 92, 72, 196, 'var(--as-ink)', 0.12) + frame(352, 92, 72, 196) +
        line(352, 104, 424, 104, 'var(--as-line)', 1) + rect(414, 184, 7, 18, 'var(--as-ink)', 0.62);
      s += rect(438, 150, 15, 24, 'var(--as-ink)', 0.52) + rect(441, 156, 9, 5, 'var(--as-panel)', 0.92);

      // 랙 — 통로 양쪽으로 세 열씩
      [12, 114, 216, 468, 570, 672].forEach(function (x, i) {
        s += rect(x, 56, 102, 232, 'var(--as-panel)', 1);
        for (var u = 0; u < 11; u++) {
          var y = 66 + u * 20;
          s += rect(x + 8, y, 86, 14, 'var(--as-ink)', 0.13 + ((u + i) % 3) * 0.07) +
            line(x + 8, y + 14, x + 94, y + 14, 'var(--as-line)', 1);
          if ((u * 3 + i * 5) % 4) s += rect(x + 84, y + 4, 6, 6, 'var(--as-ink)', 0.66);
        }
        s += frame(x, 56, 102, 232);
      });

      // 액세스 플로어 — 통로 끝으로 모인다
      s += line(0, 288, W, 288, 'var(--as-line-strong)', 2) + rect(0, 288, W, 62, 'var(--as-panel)', 0.94);
      for (var g = 0; g <= 8; g++) {
        var fx = g * 100;
        s += line(fx, 350, fx + (393 - fx) * 0.42, 288, 'var(--as-line)', 1);
      }
      s += line(0, 320, W, 320, 'var(--as-line)', 1);
      // 통로 안쪽에 선 사람 — 아래쪽은 대사 띠에 가리므로 어깨선을 올려 잡는다
      s += figure(393, 250, 1.02, 'var(--as-ink)', 0.8);
      return wrap(s);
    },

    // 책상 — 조서 작업 · 외부조회 · 회계추정치 · 기타정보
    desk: function () {
      var s = fade('var(--as-panel)', 'var(--as-panel-2)');
      s += rect(0, 0, W, 58, 'var(--as-ink)', 0.06) + line(0, 58, W, 58, 'var(--as-line-strong)', 2);
      s += line(58, 124, 306, 124, 'var(--as-line-strong)', 2) + binders(66, 124, 8, 24, 46, 517);
      s += circle(702, 104, 28, 'none', null, 'var(--as-line-strong)', 3) +
        line(702, 104, 702, 86, 'var(--as-ink)', 3) + line(702, 104, 715, 112, 'var(--as-ink)', 3);

      s += rect(252, 78, 300, 172, 'var(--as-ink)', 0.84) + rect(264, 90, 276, 148, 'var(--as-panel)', 0.32);
      [[0, 176], [1, 236], [2, 140], [3, 208], [4, 104]].forEach(function (r) {
        s += rect(282, 110 + r[0] * 26, r[1], 8, 'var(--as-panel)', 0.76 - r[0] * 0.09);
      });
      s += line(0, 250, W, 250, 'var(--as-line-strong)', 2) + rect(0, 250, W, 100, 'var(--as-sunk)', 1);
      s += rect(360, 250, 84, 10, 'var(--as-ink)', 0.7);
      s += papers(60, 250, 5) + papers(620, 250, 4) + rect(178, 206, 34, 44, 'var(--as-ink)', 0.62);
      return wrap(s);
    },

    // 야근 — 특수관계자 · 후속사건
    night: function () {
      var s = rect(0, 0, W, H, 'var(--as-ink)', 1);
      s += skyline(292, 991, 'var(--as-bg)', 0.12, 70, 240);
      s += windows(44, 104, 6, 6, 16, 18, 16, 5171, 0.2, 'var(--as-bg)');
      s += windows(600, 82, 6, 7, 15, 17, 16, 8123, 0.18, 'var(--as-bg)');
      s += circle(712, 54, 20, 'var(--as-bg)', 0.5);
      s += rect(284, 132, 232, 128, 'var(--as-bg)', 0.28) + rect(296, 144, 208, 104, 'var(--as-bg)', 0.44);
      s += figure(400, 260, 1.08, 'var(--as-ink)', 0.92);
      s += line(0, 292, W, 292, 'var(--as-bg)', 1) + rect(0, 292, W, 58, 'var(--as-bg)', 0.05);
      return wrap(s);
    },

    // 감사보고서 발행 — 의견형성
    report: function () {
      var s = fade('var(--as-panel-2)', 'var(--as-panel)');
      s += line(0, 62, W, 62, 'var(--as-line)', 1);
      [[26, 493], [624, 733]].forEach(function (b) {
        s += rect(b[0], 96, 150, 154, 'var(--as-sunk)', 1) + frame(b[0], 96, 150, 154) +
          binders(b[0] + 10, 172, 5, 24, 60, b[1]) + line(b[0], 172, b[0] + 150, 172, 'var(--as-line-strong)', 2) +
          binders(b[0] + 10, 250, 5, 24, 56, b[1] + 7);
      });
      s += rect(276, 24, 248, 226, 'var(--as-panel)', 1) + frame(276, 24, 248, 226);
      s += rect(302, 52, 168, 11, 'var(--as-ink)', 0.85) + line(302, 84, 498, 84, 'var(--as-line-strong)', 2);
      [[0, 196], [1, 164], [2, 184], [3, 132]].forEach(function (r) {
        s += rect(302, 102 + r[0] * 22, r[1], 6, 'var(--as-dim)', 0.6);
      });
      s += line(302, 196, 498, 196, 'var(--as-line)', 1) +
        rect(302, 210, 150, 6, 'var(--as-dim)', 0.44) + rect(302, 226, 104, 6, 'var(--as-dim)', 0.44);
      s += circle(472, 222, 26, 'none', 0.7, 'var(--as-ink)', 3);
      s += line(0, 250, W, 250, 'var(--as-line-strong)', 2) + rect(0, 250, W, 100, 'var(--as-panel)', 0.94);
      return wrap(s);
    },

    // 감리 심의실 — 엔딩
    review: function () {
      var s = rect(0, 0, W, H, 'var(--as-panel)', 1);
      s += rect(0, 0, W, 240, 'var(--as-panel-2)', 1);
      [64, 204, 596, 736].forEach(function (x) { s += rect(x, 28, 20, 212, 'var(--as-sunk)', 1); });
      s += circle(400, 62, 34, 'none', 0.7, 'var(--as-ink-2)', 2) + circle(400, 62, 17, 'var(--as-ink)', 0.16);
      s += line(0, 240, W, 240, 'var(--as-line-strong)', 2);

      s += rect(126, 168, 548, 14, 'var(--as-line-strong)', 1) + rect(146, 182, 508, 58, 'var(--as-sunk)', 1) +
        frame(146, 182, 508, 58);
      [236, 400, 564].forEach(function (x) {
        s += figure(x, 168, 0.9, 'var(--as-ink)', 0.34) + rect(x - 28, 156, 56, 10, 'var(--as-panel)', 0.95);
      });
      [212, 400, 588].forEach(function (x) { s += rect(x - 26, 258, 52, 46, 'var(--as-ink)', 0.18); });
      s += circle(96, 292, 30, 'none', 0.5, 'var(--as-ink)', 5) + line(118, 314, 152, 348, 'var(--as-ink)', 7);
      return wrap(s);
    },

    // 야간 사옥 외관 — 타이틀 (세로로 긴 캔버스)
    tower: function () {
      var s = rect(0, 0, 800, 1200, 'var(--as-ink)', 1);
      s += skyline(1200, 3301, 'var(--as-bg)', 0.09, 220, 660);
      s += rect(20, 430, 168, 770, 'var(--as-bg)', 0.1) + windows(38, 460, 4, 18, 24, 26, 14, 911, 0.16, 'var(--as-bg)');
      s += rect(614, 372, 166, 828, 'var(--as-bg)', 0.1) + windows(632, 402, 4, 20, 24, 26, 13, 7717, 0.18, 'var(--as-bg)');
      s += rect(210, 120, 380, 1080, 'var(--as-bg)', 0.16) +
        '<rect x="210" y="120" width="380" height="1080" fill="none" stroke="var(--as-bg)" stroke-width="2" opacity="0.3"/>';
      s += rect(210, 120, 380, 10, 'var(--as-bg)', 0.42) + rect(386, 58, 8, 62, 'var(--as-bg)', 0.3);
      s += windows(251, 156, 7, 28, 34, 24, 10, 4127, 0.28, 'var(--as-bg)');
      s += circle(706, 122, 26, 'var(--as-bg)', 0.5);
      s += line(0, 1128, 800, 1128, 'var(--as-bg)', 2) + rect(0, 1128, 800, 72, 'var(--as-ink)', 1);
      s += figure(336, 1128, 1.7, 'var(--as-bg)', 0.42) + figure(452, 1128, 1.45, 'var(--as-bg)', 0.3);
      return svg(s, 800, 1200);
    }
  };

  /* 인물 초상 -------------------------------------------------- */
  /* 사진 자리(136×136)를 채우는 무채색 실루엣. 배역마다 어깨/머리가 다르다. */
  var FACES = {
    partner: { tone: 0.84, shoulder: 116, hair: '<path d="M34 56 h68 v-10 q-34 -20 -68 0 z"/>' },
    manager: { tone: 0.72, shoulder: 108, hair: '<path d="M32 58 q36 -36 72 0 q-10 -32 -36 -32 q-26 0 -36 32 z"/>' },
    cfo:     { tone: 0.9,  shoulder: 122, hair: '<path d="M34 52 h68 v-8 q-34 -18 -68 0 z"/>' },
    staff:   { tone: 0.6,  shoulder: 102, hair: '<path d="M32 60 q36 -38 72 0 q-8 -34 -36 -34 q-28 0 -36 34 z"/>' }
  };

  /* meet(slice 가 아니라) — 좁은 화면에서 초상 칸이 가로로 늘어나도
     얼굴이 확대되지 않고 칸 안에 들어간다. 남는 자리는 칸 배경색이 받는다. */
  /* ---------- 사진 대장 ----------
     파일이 실제로 들어온 자리만 여기에 적는다. 적히지 않은 자리는 SVG 가 그린다.
     한 장만 들어와도 앱은 그대로 돈다 — 그래서 SVG 를 지우지 않는다.
     경로는 index.html 기준 상대경로 (file:// 에서도 열려야 한다). */
  var PHOTO = {
    face: {
      // partner: 'assets/art/face-partner.jpg',
      // manager: 'assets/art/face-manager.jpg',
      // staff:   'assets/art/face-staff.jpg',
      // cfo:     'assets/art/face-cfo.jpg'
    },
    scene: {
      // warehouse: 'assets/art/warehouse.jpg',
      // ...
    }
  };
  function plate(src, cls) {
    return '<img src="' + src + '" alt="" loading="lazy" decoding="async"' +
      (cls ? ' class="' + cls + '"' : '') + '>';
  }

  function avatar(kind) {
    if (PHOTO.face[kind]) return plate(PHOTO.face[kind]);
    var f = FACES[kind] || FACES.staff;
    return '<svg viewBox="0 0 136 136" preserveAspectRatio="xMidYMid meet" ' +
      'role="img" aria-hidden="true" focusable="false">' +
      rect(0, 0, 136, 136, 'var(--as-panel-2)', 1) +
      rect(0, 104, 136, 32, 'var(--as-ink)', 0.1) +
      '<g fill="var(--as-ink)" opacity="' + f.tone + '">' +
      '<rect x="' + (68 - f.shoulder / 2) + '" y="96" width="' + f.shoulder + '" height="40"/>' +
      '<circle cx="68" cy="62" r="34"/>' + f.hair + '</g>' +
      line(0, 104, 136, 104, 'var(--as-line-strong)', 2) +
      '</svg>';
  }

  /* 타이머 링 -------------------------------------------------- */
  /* 디자인 시안의 46px 링: r=26 · stroke 5 · rotate(-90) · dasharray = 2πr × 남은비율 */
  function timer(frac, warn) {
    var r = 26, c = 2 * Math.PI * r;
    var on = c * Math.max(0, Math.min(1, frac));
    return '<svg viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--as-line)" stroke-width="5"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' +
      (warn ? 'var(--as-red)' : 'var(--as-ink)') + '" stroke-width="5" stroke-dasharray="' +
      on.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg>';
  }

  global.ART = {
    scene: function (k) { return PHOTO.scene[k] ? plate(PHOTO.scene[k]) : (SCENES[k] || SCENES.desk)(); },
    avatar: avatar,
    timer: timer,
    has: function (k) { return !!SCENES[k]; }
  };
})(window);
