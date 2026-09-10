/* ============================================================
   회계감사 시뮬레이터 — 채점 엔진
   ------------------------------------------------------------
   설계 원칙
   1) 단순 includes() 금지. 아래 5단계를 통과해야 득점 인정.
      ① 정규화(공백·문장부호 제거, 소문자화)
      ② 동의어 확장 (data/lexicon.js)
      ③ 오타 허용 (한글 자모 편집거리, 5자 이상 키워드만)
      ④ 부정문 무효화 ("~할 필요가 없다" 를 정답으로 치지 않음)
      ⑤ 근접 조건 (특정 두 키워드가 같은 맥락에 있어야 인정)
   2) 키워드 나열 꼼수 차단 → 구조점수 20점 + 총점 75% 상한
   3) 분량 초과 감점 (실전 시간·지면 배분)
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 한글 자모 분해 (오타 허용용) ---------- */
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  var JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  function toJamo(s) {
    var o = '', i, ch, c;
    s = String(s);
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      c = ch.charCodeAt(0) - 0xAC00;
      if (c >= 0 && c <= 11171) {
        o += CHO[(c / 588) | 0] + JUNG[((c % 588) / 28) | 0] + JONG[c % 28];
      } else {
        o += ch;
      }
    }
    return o;
  }

  /* ---------- 정규화: 글자·숫자만 남김 ---------- */
  /* 문장 경계 표지.
     이것이 없으면 부정문 탐지가 다음 문장까지 넘어가서
     "…지배기구와 커뮤니케이션한다. 거부가 타당하지 않다면…" 처럼
     정상 서술을 부정으로 오판한다. 룬 문자라 \p{L} 에 해당하여 정규화에서 살아남는다. */
  var SENT = 'ᚠ';
  function norm(s) {
    if (s == null) return '';
    var t = String(s).toLowerCase().replace(/[.\n\r!?;]+/g, SENT);
    try {
      return t.replace(/[^\p{L}\p{N}]/gu, '');
    } catch (e) {
      // 구형 브라우저 폴백
      return t.replace(/[\s .,·:;()[\]{}'"`~!?\-–—/\\|*%&+=<>_]/g, '');
    }
  }

  /* ---------- 편집거리 (상한 조기종료) ---------- */
  function ed(a, b, cap) {
    var m = a.length, n = b.length, i, j, best, tmp;
    if (Math.abs(m - n) > cap) return cap + 1;
    var prev = new Array(n + 1), cur = new Array(n + 1);
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i; best = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > cap) return cap + 1;
      tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  /* ---------- 동의어 확장 ---------- */
  var _expandCache = {};
  function expand(kws) {
    var lex = global.LEXICON || {};
    var list = Object.prototype.toString.call(kws) === '[object Array]' ? kws : [kws];
    var key = list.join('');
    if (_expandCache[key]) return _expandCache[key];

    var seen = {}, out = [];
    function push(x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }

    list.forEach(function (k) {
      push(k);
      if (lex[k]) lex[k].forEach(push);
      // k가 alias인 경우: 그 그룹 전체를 끌어온다
      for (var canon in lex) {
        if (!Object.prototype.hasOwnProperty.call(lex, canon)) continue;
        if (canon === k || lex[canon].indexOf(k) >= 0) {
          push(canon);
          lex[canon].forEach(push);
        }
      }
    });
    _expandCache[key] = out;
    return out;
  }

  /* ---------- 부정 표현 ---------- */
  var NEG = /(하지않|되지않|지않|않는|않다|않음|아니|없|불필요|필요없|생략|무시|제외|안해도|말아야|배제|못하|못한|어렵)/;

  /* ---------- 키워드 1개 탐색 (startAt 이후 첫 출현) ---------- */
  function findKw(hay, kw, allowFuzzy, startAt) {
    var k = norm(kw);
    if (k.length < 2) return null;
    var from = startAt || 0;
    var i = hay.indexOf(k, from);
    if (i >= 0) return { i: i, len: k.length, fuzzy: false };
    if (!allowFuzzy || k.length < 5) return null;

    var kj = toJamo(k);
    var tol = k.length >= 9 ? 2 : 1;
    var lens = [k.length - 1, k.length, k.length + 1];
    for (var s = from; s < hay.length; s++) {
      for (var t = 0; t < lens.length; t++) {
        var L = lens[t];
        if (L < 2 || s + L > hay.length) continue;
        if (ed(toJamo(hay.substr(s, L)), kj, tol) <= tol) {
          return { i: s, len: L, fuzzy: true };
        }
      }
    }
    return null;
  }

  /* 매치 직전 문자열이 notBefore 중 하나로 끝나면 무효
     (예: "적정의견" 이 "부적정의견" 의 일부로 잡히는 것을 방지) */
  function blockedByPrefix(hay, f, item) {
    if (!item.notBefore) return false;
    var pre = hay.substring(Math.max(0, f.i - 6), f.i);
    for (var z = 0; z < item.notBefore.length; z++) {
      var nb = norm(item.notBefore[z]);
      if (nb && pre.slice(-nb.length) === nb) return true;
    }
    return false;
  }

  /* ---------- 채점 항목 1개 평가 ---------- */
  function evalItem(hay, item) {
    var kws = expand(item.kw);
    var allowFuzzy = item.fuzzy !== false;
    var negatedHit = null;

    for (var a = 0; a < kws.length; a++) {
      var from = 0, guard = 0, f;
      while (guard++ < 40 && (f = findKw(hay, kws[a], allowFuzzy, from))) {
        // 부분문자열 오매칭 차단
        if (blockedByPrefix(hay, f, item)) {
          if (f.fuzzy) break;
          from = f.i + 1; continue;
        }
        // ④ 부정문 무효화
        if (item.negOk !== true) {
          // 부정문 탐지는 같은 문장 안에서만 한다
          var tail = hay.substr(f.i + f.len, item.negWindow || 12).split(SENT)[0];
          if (NEG.test(tail)) {
            negatedHit = kws[a];
            if (f.fuzzy) break;
            from = f.i + 1; continue;   // 뒤쪽에 긍정 서술이 또 있을 수 있다
          }
        }
        // ⑤ 근접 조건
        if (item.near) {
          var nearKws = expand(item.near);
          var within = item.within || 40;
          var ok = false;
          for (var b = 0; b < nearKws.length; b++) {
            var g = findKw(hay, nearKws[b], false);
            if (g && Math.abs(g.i - f.i) <= within) { ok = true; break; }
          }
          if (!ok) {
            if (f.fuzzy) break;
            from = f.i + 1;
            if (from < hay.length) continue;
            return { hit: false, nearMiss: true, matched: kws[a], need: item.near };
          }
        }
        return { hit: true, matched: kws[a], fuzzy: f.fuzzy };
      }
    }

    if (negatedHit) return { hit: false, negated: true, matched: negatedHit };
    return { hit: false };
  }

  /* ---------- 구조점수 ----------
     실제 2차 답안 문체에 맞춘다.
       essay : 근거 → 판단 순의 서술.  "~때문이다 / ~하여야 한다 / ~에 해당한다"
       judge : O·X 판단의 근거 한두 줄. "~때문이다" 문형과 조문 근거가 핵심
       list  : 단답 나열이 곧 정답이므로 구조점수를 두지 않는다
  ------------------------------------------------------------------ */
  var CAUSAL = /(따라서|그러므로|왜냐하면|하므로|때문|그럼에도|만약|경우에는|이에|우선|또한|다만|한편|아울러|반면|즉|이므로|므로|어서|이나)/;
  var CONCL  = /(의견|결론|판단|보고|변형|한정|거절|부적정|적정|커뮤니케이션|수정을 요구|해당한다|해당하지|하여야|해야)/;
  var GROUND = /(때문이다|때문임|이므로|하므로|에 해당한다|에 해당하기|볼 수 있다|할 수 없다|되기 때문)/;
  var CITE   = /(기준서|회계감사기준|윤리기준|공인회계사법|외감법|외부감사법|시행령|문단|KSA|제\d+조|\d{3}[-–]\d)/;

  function structure(raw, mustHits, form) {
    var t = String(raw || '');
    var detail = [], p = 0, max, listing = false;

    if (form === 'list') {
      return { points: 0, max: 0, detail: [], listing: false, skip: true };
    }

    // 종결어미: 2차 답안은 "~다 / ~음 / ~함 / ~임 / ~때문이다" 로 끝난다
    var endings = (t.match(/(다|음|함|임)(?=[\s.,)]|$)/g) || []).length;
    var sents = t.split(/[.\n;!?]+/).map(function (x) { return x.trim(); })
                 .filter(function (x) { return x.length >= 6; });
    var units = Math.max(sents.length, Math.min(endings, 8));

    if (form === 'judge') {
      max = 10;
      if (GROUND.test(t)) { p += 6; detail.push(['근거 문형 (~때문이다 / ~이므로)', 6, 6]); }
      else                {         detail.push(['근거 문형 (~때문이다 / ~이므로)', 0, 6]); }
      if (CITE.test(t))   { p += 4; detail.push(['기준·법령 근거 제시', 4, 4]); }
      else                {         detail.push(['기준·법령 근거 제시', 0, 4]); }
      return { points: p, max: max, detail: detail, listing: false };
    }

    // essay
    max = 15;
    if (units >= 3)       { p += 6; detail.push(['문장 구성 (3문장 이상)', 6, 6]); }
    else if (units === 2) { p += 4; detail.push(['문장 구성 (2문장)', 4, 6]); }
    else if (units === 1) { p += 2; detail.push(['문장 구성 (1문장)', 2, 6]); }
    else                  {         detail.push(['문장 구성', 0, 6]); }

    if (CAUSAL.test(t)) { p += 4; detail.push(['인과·논리 연결', 4, 4]); }
    else                {         detail.push(['인과·논리 연결', 0, 4]); }

    if (CONCL.test(t))  { p += 5; detail.push(['판단·결론 명시', 5, 5]); }
    else                {         detail.push(['판단·결론 명시', 0, 5]); }

    listing = (endings < 2 && units < 2 && mustHits >= 3);
    if (listing) {
      p = 0;
      detail = detail.map(function (d) { return [d[0], 0, d[2]]; });
    }
    return { points: p, max: max, detail: detail, listing: listing };
  }

  /* ---------- 메인 채점 ---------- */
  function grade(answer, rubric, opt) {
    opt = opt || {};
    rubric = rubric || {};
    var raw = String(answer || '');
    var hay = norm(raw);

    var R = { must: [], bonus: [], trap: [], flags: [] };
    var mustGot = 0, mustMax = 0, mustHits = 0, negCount = 0;

    (rubric.must || []).forEach(function (it) {
      mustMax += it.score;
      var r = evalItem(hay, it);
      if (r.hit) { mustGot += it.score; mustHits++; }
      if (r.negated) negCount++;
      R.must.push({ label: it.label, score: it.score, got: r.hit ? it.score : 0,
                    hit: r.hit, negated: !!r.negated, nearMiss: !!r.nearMiss,
                    fuzzy: !!r.fuzzy, matched: r.matched, hint: it.hint });
    });

    var bCap = (rubric.bonusCap != null) ? rubric.bonusCap : 15;
    var bRaw = 0;
    (rubric.bonus || []).forEach(function (it) {
      var r = evalItem(hay, it);
      var g = r.hit ? it.score : 0;
      bRaw += g;
      R.bonus.push({ label: it.label, score: it.score, got: g, hit: r.hit,
                     negated: !!r.negated, fuzzy: !!r.fuzzy, matched: r.matched });
    });
    var bonusGot = Math.min(bRaw, bCap);

    var trapGot = 0;
    (rubric.trap || []).forEach(function (it) {
      // 함정도 부정문 무효화를 적용한다.
      // "범위제한에 해당하지 않는다" 는 오개념이 아니라 정답 서술이므로 감점하면 안 된다.
      var r = evalItem(hay, { kw: it.kw, negOk: it.negOk === true, fuzzy: it.fuzzy,
                              near: it.near, within: it.within, notBefore: it.notBefore });
      if (r.hit) trapGot += it.score; // it.score 는 음수
      R.trap.push({ label: it.label, score: it.score, got: r.hit ? it.score : 0,
                    hit: r.hit, matched: r.matched });
    });

    var st = structure(raw, mustHits, opt.form);
    R.structure = st;
    if (st.listing) R.flags.push('키워드 나열로 판정 → 구조점수 0점, 총점 75% 상한 적용');
    if (negCount)   R.flags.push('부정문으로 서술된 필수 논점 ' + negCount + '건 → 득점 무효');

    var bare = raw.replace(/\s/g, '').length;
    var maxChars = opt.maxChars || 300;
    var limit = Math.ceil(maxChars * 1.15);   // 15% 유예
    var lenPen = 0;
    if (bare > limit) {
      lenPen = Math.min(12, Math.ceil((bare - limit) / 20));
      R.flags.push('분량 초과 (' + bare + '자 / 권장 ' + maxChars + '자) → 감사시간 예산 −' + lenPen + '점');
    }

    var max = mustMax + bCap + st.max;
    var total = mustGot + bonusGot + trapGot + st.points - lenPen;
    if (st.listing) total = Math.min(total, Math.round(max * 0.75));
    total = Math.max(0, total);

    R.mustGot = mustGot; R.mustMax = mustMax;
    R.bonusGot = bonusGot; R.bonusRaw = bRaw; R.bonusCap = bCap;
    R.trapGot = trapGot; R.lenPen = lenPen;
    R.total = total; R.max = max;
    R.percent = max ? Math.round(total / max * 100) : 0;
    R.chars = bare;
    return R;
  }

  /* ---------- 판단 추출 ----------
     O·X 버튼을 쓰지 않는다. 답안 문장 안에서 판단 방향을 읽어낸다.
       spec = { yes:['발생한다','해당한다'], no:['발생하지 않','해당하지 않'], answer:'yes' }
     같은 문장에 양쪽 표현이 다 나오면 더 구체적인(긴) 쪽을 판단으로 본다.
     길이가 같으면 뒤에 온 쪽 — 결론은 보통 뒤에 오기 때문이다.
  ------------------------------------------------------------------ */
  function readVerdict(raw, spec) {
    if (!spec) return null;
    var hay = norm(raw);
    var best = { side: null, len: 0, at: -1 };

    ['yes', 'no'].forEach(function (side) {
      (spec[side] || []).forEach(function (phrase) {
        expand(phrase).forEach(function (p) {
          var k = norm(p);
          if (k.length < 2) return;
          var i = hay.lastIndexOf(k);
          if (i < 0) return;
          if (k.length > best.len || (k.length === best.len && i > best.at)) {
            best = { side: side, len: k.length, at: i };
          }
        });
      });
    });

    return { given: best.side, expected: spec.answer, correct: best.side === spec.answer };
  }

  /* ---------- 물음 단위 채점 ----------
     실제 2차는 하나의 물음이 여러 칸(①②③ / 답안 양식 표)으로 나뉜다.
     parts 각각을 따로 채점하고 합산한다.

     part = { label, ox:'O'|'X'|null, maxChars, rubric, oxScore }
     ans  = { text:'...', ox:'O'|'X'|null }

     O·X 판단이 틀리면 근거 서술은 논리적으로 무의미하므로 득점을 30%만 인정한다.
  ------------------------------------------------------------------ */
  function gradeParts(answers, parts, form) {
    var out = { parts: [], total: 0, max: 0, flags: [], hits: [] };
    (parts || []).forEach(function (p, i) {
      var a = answers[i] || {};
      var r = grade(a.text, p.rubric || {}, { maxChars: p.maxChars || 120, form: form });

      // 판단은 버튼이 아니라 답안 문장에서 읽는다
      var vMax = 0, vGot = 0, vWrong = false, ver = null;
      if (p.verdict) {
        ver = readVerdict(a.text, p.verdict);
        vMax = (p.verdictScore != null) ? p.verdictScore : 15;
        if (ver.correct) vGot = vMax;
        else {
          vWrong = true;
          out.flags.push((p.label ? p.label + ' ' : '') +
            (ver.given ? '판단이 반대입니다 → 근거 득점 30%만 인정'
                       : '판단(발생 여부·해당 여부)을 문장으로 명시하지 않았습니다'));
        }
      }
      // 실제 GS 채점: "예/아니오 판정이 틀려, 이유 서술의 정확성과 무관하게
      // 부분점수를 부여하지 않았습니다" → 판단이 틀리면 근거 서술은 0점이다.
      var body = r.total;
      if (vWrong && ver && ver.given) body = 0;

      var pTotal = body + vGot;
      var pMax = r.max + vMax;
      r.must.forEach(function (m) { if (m.hit) out.hits.push(m.label); });

      out.parts.push({
        label: p.label, verdict: ver, verdictGot: vGot, verdictMax: vMax,
        res: r, total: pTotal, max: pMax,
        percent: pMax ? Math.round(pTotal / pMax * 100) : 0
      });
      out.total += pTotal; out.max += pMax;
      r.flags.forEach(function (f) { out.flags.push((p.label ? p.label + ' ' : '') + f); });
    });
    out.percent = out.max ? Math.round(out.total / out.max * 100) : 0;
    return out;
  }

  global.AE = {
    grade: grade,
    gradeParts: gradeParts,
    readVerdict: readVerdict,
    norm: norm,
    toJamo: toJamo,
    expand: expand,
    _findKw: findKw
  };
})(window);
