/* ============================================================
   장면 아트 (art.js)
   ------------------------------------------------------------
   장면 배너 · 인물 아바타 · 홈 타이틀은 assets/ 의 사진과 영상을 쓴다.
   그 파일들은 tools/images.py 가 image/ 원본에서 구워낸다 (원본은 장당 7~11MB).

   사진이 없는 키는 아래 인라인 SVG 로 그린다. 새 장면에 art 를 붙이고
   사진을 아직 안 만들었을 때도 화면이 비지 않는다.
     · 인터넷 없이 단일 폴더로 돌아간다
     · SVG 는 다크모드에서 자동으로 색이 바뀐다 (CSS 변수 사용)
   ============================================================ */
(function (global) {
  'use strict';

  var W = 800, H = 200;

  /* 사진 에셋 --------------------------------------------------
     어떤 사진이 있는지는 assets/manifest.js (tools/images.py 가 만든다) 에 적혀 있다.
     목록에 없는 인물은 이니셜 초상, 없는 장면은 아래 SVG 로 그린다. */
  var DIR = 'assets/';
  var MAN = global.ASSETS || {
    scene: ['office', 'meeting', 'warehouse', 'desk', 'night', 'report', 'review', 'lab', 'server'],
    face: ['partner', 'manager', 'cfo', 'staff'], card: ['partner', 'manager', 'cfo', 'staff'], mood: {}
  };
  function set(a) { var o = {}; (a || []).forEach(function (k) { o[k] = 1; }); return o; }
  var SCENE_PHOTO = set(MAN.scene), FACE_PHOTO = set(MAN.face), CARD_PHOTO = set(MAN.card);
  var MOODS = MAN.mood || {};

  function photo(file, cls) {
    return '<img class="' + cls + '" src="' + DIR + file + '" alt="" decoding="async">';
  }

  /* 인물 ------------------------------------------------------- */
  function person(who) { var C = global.CAST || {}; return C[who] || null; }
  function avatarKey(who) { var p = person(who); return p ? p.avatar : who; }
  function initial(who) {
    var p = person(who);
    if (!p) return '?';
    if (who === 'staff') return '나';
    return /^[가-힣]/.test(p.name) ? p.name.charAt(0) : p.name.charAt(0).toUpperCase();
  }
  // 같은 사람은 늘 같은 톤 — 이름에서 정한다
  function hue(who) {
    var s = String(who), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  function faceSrc(who, mood) {
    var k = avatarKey(who);
    if (!FACE_PHOTO[k]) return null;
    if (mood && (MOODS[k] || []).indexOf(mood) >= 0) return DIR + 'face-' + k + '-' + mood + '.jpg';
    return DIR + 'face-' + k + '.jpg';
  }
  function placeholder(who, cls) {
    return '<span class="' + cls + ' ph" style="--ph:' + hue(who) + '" aria-hidden="true"><b>' + initial(who) + '</b></span>';
  }
  /* 말풍선 아바타 — 표정 사진이 없으면 기본 사진에 표정 클래스만 붙인다 */
  function face(who, mood, cls) {
    cls = cls || 'av';
    var src = faceSrc(who, mood);
    var own = mood && (MOODS[avatarKey(who)] || []).indexOf(mood) >= 0;
    var moodCls = mood && !own ? ' mood-' + mood : '';
    if (!src) return placeholder(who, cls + moodCls);
    return '<img class="' + cls + moodCls + '" src="' + src + '" alt="" decoding="async">';
  }
  /* 인물 카드 (4:5) */
  function card(who, cls) {
    cls = cls || 'pc';
    var k = avatarKey(who);
    if (CARD_PHOTO[k]) return '<img class="' + cls + '" src="' + DIR + 'card-' + k + '.jpg" alt="" decoding="async">';
    return placeholder(who, cls);
  }
  function sceneSrc(k) { return SCENE_PHOTO[k] ? DIR + 'scene-' + k + '.jpg' : (SCENE_PHOTO.desk ? DIR + 'scene-desk.jpg' : ''); }

  function wrap(inner, cls) {
    return '<svg class="art ' + (cls || '') + '" viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">' + inner + '</svg>';
  }

  /* 공통 조각 -------------------------------------------------- */
  var _uid = 0;
  function sky(a, b) {
    var id = 'sk' + (++_uid);
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
      '</linearGradient></defs><rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }
  function city(y, n, seed, fill, op) {
    var s = '', x = -20, r = seed;
    for (var i = 0; i < n; i++) {
      r = (r * 9301 + 49297) % 233280;
      var w = 26 + (r / 233280) * 44;
      r = (r * 9301 + 49297) % 233280;
      var h = 30 + (r / 233280) * 92;
      s += '<rect x="' + x.toFixed(0) + '" y="' + (y - h).toFixed(0) + '" width="' + w.toFixed(0) +
        '" height="' + h.toFixed(0) + '" fill="' + fill + '" opacity="' + op + '"/>';
      x += w + 8;
      if (x > W + 20) break;
    }
    return s;
  }
  function papers(x, y, n, tilt) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<rect x="' + (x + i * 2) + '" y="' + (y - i * 4) + '" width="46" height="58" rx="2" ' +
        'fill="var(--panel)" stroke="var(--line)" transform="rotate(' + (tilt + i * 1.5) + ' ' + (x + 23) + ' ' + y + ')"/>';
    }
    return s;
  }

  /* 장면 ------------------------------------------------------- */
  var SCENES = {

    // 파트너 방 — 수임 검토
    office: function () {
      return wrap(
        sky('var(--acc-w)', 'var(--panel)') +
        '<rect x="470" y="18" width="300" height="120" rx="4" fill="var(--acc)" opacity=".20"/>' +
        '<rect x="470" y="18" width="300" height="120" rx="4" fill="none" stroke="var(--line)"/>' +
        '<line x1="620" y1="18" x2="620" y2="138" stroke="var(--line)"/>' +
        '<line x1="470" y1="78" x2="770" y2="78" stroke="var(--line)"/>' +
        city(138, 7, 77, 'var(--acc)', '.18') +
        '<rect x="40" y="140" width="420" height="14" rx="3" fill="var(--ink3)" opacity=".48"/>' +
        '<rect x="70" y="154" width="14" height="42" fill="var(--ink3)" opacity=".40"/>' +
        '<rect x="410" y="154" width="14" height="42" fill="var(--ink3)" opacity=".40"/>' +
        papers(120, 118, 4, -6) + papers(250, 122, 3, 5) +
        '<rect x="330" y="104" width="60" height="38" rx="3" fill="var(--ink)" opacity=".68"/>' +
        '<rect x="336" y="110" width="48" height="26" rx="2" fill="var(--acc)" opacity=".62"/>' +
        '<circle cx="80" cy="104" r="9" fill="var(--acc)" opacity=".62"/>' +
        '<rect x="72" y="116" width="16" height="24" rx="6" fill="var(--acc)" opacity=".48"/>'
      );
    },

    // 창고 — 재고실사 입회
    warehouse: function () {
      var s = sky('var(--panel)', 'var(--bg)');
      s += '<path d="M0 62 L400 14 L800 62 L800 200 L0 200 Z" fill="var(--ink3)" opacity=".20"/>';
      for (var i = 0; i < 5; i++) {
        s += '<line x1="' + (60 + i * 170) + '" y1="62" x2="' + (60 + i * 170) + '" y2="200" stroke="var(--line)"/>';
      }
      // 팔레트 박스 더미
      var stacks = [[70, 3], [180, 2], [300, 4], [430, 2], [540, 3], [660, 1]];
      stacks.forEach(function (st) {
        for (var k = 0; k < st[1]; k++) {
          var y = 168 - k * 34;
          s += '<rect x="' + st[0] + '" y="' + y + '" width="66" height="32" rx="2" fill="var(--warn)" opacity="' + (0.42 + k * 0.12) + '"/>' +
               '<line x1="' + (st[0] + 33) + '" y1="' + y + '" x2="' + (st[0] + 33) + '" y2="' + (y + 32) + '" stroke="var(--bg)" stroke-width="2" opacity=".62"/>';
        }
      });
      s += '<circle cx="742" cy="150" r="11" fill="var(--acc)" opacity=".6"/>' +
           '<rect x="732" y="164" width="20" height="30" rx="7" fill="var(--acc)" opacity=".58"/>' +
           '<rect x="754" y="168" width="26" height="20" rx="2" fill="var(--panel)" stroke="var(--line)"/>';
      return wrap(s);
    },

    // 책상 — 조서 작업
    desk: function () {
      return wrap(
        sky('var(--panel)', 'var(--bg)') +
        '<rect x="0" y="146" width="800" height="54" fill="var(--ink3)" opacity=".22"/>' +
        '<rect x="250" y="44" width="300" height="102" rx="5" fill="var(--ink)" opacity=".62"/>' +
        '<rect x="258" y="52" width="284" height="86" rx="3" fill="var(--acc)" opacity=".40"/>' +
        '<rect x="272" y="66" width="150" height="7" rx="3" fill="var(--panel)" opacity=".8"/>' +
        '<rect x="272" y="80" width="210" height="7" rx="3" fill="var(--panel)" opacity=".68"/>' +
        '<rect x="272" y="94" width="120" height="7" rx="3" fill="var(--panel)" opacity=".68"/>' +
        '<rect x="272" y="108" width="180" height="7" rx="3" fill="var(--panel)" opacity=".48"/>' +
        '<rect x="360" y="146" width="80" height="8" rx="2" fill="var(--ink)" opacity=".58"/>' +
        papers(80, 132, 5, -4) + papers(600, 128, 4, 7) +
        '<circle cx="700" cy="122" r="16" fill="none" stroke="var(--line)" stroke-width="3"/>' +
        '<path d="M700 122 L700 112 M700 122 L708 126" stroke="var(--ink3)" stroke-width="2.5" stroke-linecap="round"/>' +
        '<rect x="180" y="118" width="26" height="30" rx="3" fill="var(--bad)" opacity=".58"/>'
      );
    },

    // 회의실 — 지배기구 커뮤니케이션
    meeting: function () {
      var s = sky('var(--acc-w)', 'var(--panel)');
      s += '<ellipse cx="400" cy="152" rx="250" ry="40" fill="var(--ink3)" opacity=".42"/>';
      var seats = [[210, 120], [330, 112], [470, 112], [590, 120]];
      seats.forEach(function (p, i) {
        s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="14" fill="var(--acc)" opacity="' + (0.48 + i * 0.09) + '"/>' +
             '<rect x="' + (p[0] - 16) + '" y="' + (p[1] + 18) + '" width="32" height="26" rx="9" fill="var(--acc)" opacity="' + (0.38 + i * 0.07) + '"/>';
      });
      s += '<rect x="330" y="140" width="140" height="10" rx="2" fill="var(--panel)" stroke="var(--line)"/>' +
           '<rect x="60" y="30" width="180" height="92" rx="4" fill="var(--panel)" stroke="var(--line)"/>' +
           '<rect x="76" y="46" width="120" height="6" rx="3" fill="var(--acc)" opacity=".68"/>' +
           '<rect x="76" y="60" width="148" height="5" rx="2" fill="var(--ink3)" opacity=".52"/>' +
           '<rect x="76" y="72" width="100" height="5" rx="2" fill="var(--ink3)" opacity=".52"/>' +
           '<polyline points="80,110 110,92 140,100 170,72 200,80" fill="none" stroke="var(--bad)" stroke-width="2.5"/>';
      return wrap(s);
    },

    // 야근 — 마감
    night: function () {
      return wrap(
        sky('#1b2536', '#2a3346') +
        city(150, 9, 991, '#0f1622', '.85') +
        '<circle cx="690" cy="46" r="18" fill="#e8e2c8" opacity=".85"/>' +
        '<rect x="0" y="150" width="800" height="50" fill="#0d131c"/>' +
        '<rect x="290" y="70" width="220" height="80" rx="4" fill="#f3e9c0" opacity=".42"/>' +
        '<rect x="300" y="80" width="200" height="60" rx="3" fill="#f3e9c0" opacity=".42"/>' +
        '<circle cx="360" cy="128" r="10" fill="#0d131c" opacity=".7"/>' +
        '<rect x="348" y="140" width="24" height="14" rx="5" fill="#0d131c" opacity=".7"/>'
      );
    },

    // 감사보고서 발행
    report: function () {
      return wrap(
        sky('var(--acc-w)', 'var(--panel)') +
        '<rect x="300" y="24" width="200" height="160" rx="4" fill="var(--panel)" stroke="var(--line)" stroke-width="1.5"/>' +
        '<rect x="324" y="48" width="152" height="9" rx="4" fill="var(--ink)" opacity=".7"/>' +
        '<rect x="324" y="72" width="152" height="5" rx="2" fill="var(--ink3)" opacity=".58"/>' +
        '<rect x="324" y="84" width="120" height="5" rx="2" fill="var(--ink3)" opacity=".58"/>' +
        '<rect x="324" y="96" width="140" height="5" rx="2" fill="var(--ink3)" opacity=".58"/>' +
        '<rect x="324" y="116" width="152" height="5" rx="2" fill="var(--ink3)" opacity=".42"/>' +
        '<rect x="324" y="128" width="96" height="5" rx="2" fill="var(--ink3)" opacity=".42"/>' +
        '<circle cx="452" cy="156" r="20" fill="none" stroke="var(--bad)" stroke-width="2.5" opacity=".65"/>' +
        '<text x="452" y="161" text-anchor="middle" font-size="12" font-weight="700" fill="var(--bad)" opacity=".8">감사</text>' +
        papers(120, 140, 4, -8) + papers(600, 136, 5, 6)
      );
    },

    // 감리 — 에필로그
    review: function () {
      return wrap(
        sky('var(--panel)', 'var(--bg)') +
        '<rect x="0" y="160" width="800" height="40" fill="var(--ink3)" opacity=".26"/>' +
        '<path d="M280 160 L280 66 L400 26 L520 66 L520 160 Z" fill="var(--acc)" opacity=".26"/>' +
        '<path d="M280 66 L400 26 L520 66" fill="none" stroke="var(--acc)" stroke-width="2" opacity=".62"/>' +
        '<rect x="316" y="96" width="16" height="64" fill="var(--acc)" opacity=".42"/>' +
        '<rect x="392" y="96" width="16" height="64" fill="var(--acc)" opacity=".42"/>' +
        '<rect x="468" y="96" width="16" height="64" fill="var(--acc)" opacity=".42"/>' +
        '<circle cx="140" cy="106" r="34" fill="none" stroke="var(--ink3)" stroke-width="4" opacity=".62"/>' +
        '<line x1="164" y1="130" x2="196" y2="162" stroke="var(--ink3)" stroke-width="6" stroke-linecap="round" opacity=".62"/>' +
        '<rect x="620" y="70" width="120" height="90" rx="3" fill="var(--panel)" stroke="var(--line)"/>' +
        '<rect x="634" y="86" width="80" height="5" rx="2" fill="var(--ink3)" opacity=".52"/>' +
        '<rect x="634" y="98" width="92" height="5" rx="2" fill="var(--ink3)" opacity=".52"/>' +
        '<rect x="634" y="110" width="60" height="5" rx="2" fill="var(--ink3)" opacity=".52"/>'
      );
    }
  };

  /* 인물 아바타 ------------------------------------------------ */
  var FACES = {
    partner: { bg: 'var(--acc)', hair: 'M14 26 q18 -18 36 0 v-6 q-18 -14 -36 0 z' },
    manager: { bg: 'var(--ok)', hair: 'M12 28 q20 -22 40 0 q-6 -18 -20 -18 q-14 0 -20 18 z' },
    cfo:     { bg: 'var(--warn)', hair: 'M13 24 q19 -16 38 0 v-4 q-19 -12 -38 0 z' },
    staff:   { bg: 'var(--ink3)', hair: 'M14 27 q18 -20 36 0 q-4 -16 -18 -16 q-14 0 -18 16 z' }
  };

  function avatar(kind) {
    if (FACE_PHOTO[kind]) return photo('face-' + kind + '.jpg', 'avatar');
    if (person(kind)) return face(kind, null, 'avatar');
    var f = FACES[kind] || FACES.staff;
    return '<svg class="avatar" viewBox="0 0 64 64" role="img" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="32" fill="' + f.bg + '" opacity=".26"/>' +
      '<circle cx="32" cy="30" r="14" fill="' + f.bg + '" opacity=".68"/>' +
      '<path d="' + f.hair + '" fill="' + f.bg + '" opacity=".85"/>' +
      '<path d="M10 64 q0 -18 22 -18 q22 0 22 18 z" fill="' + f.bg + '" opacity=".58"/>' +
      '</svg>';
  }

  /* 게이지 링 -------------------------------------------------- */
  function ring(pct, label, tone) {
    var r = 26, c = 2 * Math.PI * r;
    var off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="' + r +
      '" fill="none" stroke="var(--line)" stroke-width="6"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + tone + '" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) +
      '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="37" text-anchor="middle" font-size="17" font-weight="800" fill="var(--ink)">' +
      Math.round(pct) + '</text></svg>' +
      '<span class="ringlab">' + label + '</span>';
  }

  /* 홈 타이틀 — 10초짜리 세로 영상. 소리 없이 한 번 돌고, 끝나면 첫 화면으로 되녹는다
     (영상이 카메라를 움직여서 마지막 구도로 멈춰 있으면 허전하다).
     움직임을 줄이도록 설정한 기기에서는 정지 화면만 보여준다. */
  function title() {
    var still = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 영상이 끝나면 키 비주얼(밤 11시의 감사팀)로 천천히 넘어간다
    var key = SCENE_PHOTO.key ? '<img class="title-key' + (still ? ' on' : '') + '" src="' + DIR + 'scene-key.jpg" alt="" decoding="async">' : '';
    return photo('title.jpg', 'title-still') + key +
      '<video id="title-v" class="title-v" src="' + DIR + 'title.mp4" poster="' + DIR + 'title.jpg"' +
      ' muted playsinline preload="auto"' + (still ? '' : ' autoplay') + '></video>';
  }

  global.ART = {
    scene: function (k) { return SCENE_PHOTO[k] ? photo('scene-' + k + '.jpg', 'art') : (SCENES[k] || SCENES.desk)(); },
    sceneSrc: sceneSrc,
    avatar: avatar,
    face: face,            // (인물, 표정?, 클래스?) → 말풍선 아바타 HTML
    faceSrc: faceSrc,
    card: card,            // (인물, 클래스?) → 4:5 인물 카드 HTML
    portrait: function (kind) { return CARD_PHOTO[kind] ? photo('card-' + kind + '.jpg', 'portrait') : card(kind, 'portrait'); },
    hasFace: function (who) { return !!FACE_PHOTO[avatarKey(who)]; },
    title: title,
    // 짧은 영상 (assets/<키>.mp4) — 없으면 null
    video: function (k) { return (MAN.video || []).indexOf(k) >= 0 ? DIR + k + '.mp4' : null; },
    ring: ring,
    has: function (k) { return !!SCENES[k] || !!SCENE_PHOTO[k]; }
  };
})(window);
