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

    // short : 한 칸에 한 논점을 짧게 쓰는 형식.
    // 긴 문장을 강요하지 않는다. 서술어로 끝맺었는지만 보고,
    // 명사만 늘어놓으면(논점 2개 이상인데 서술어가 없으면) 나열로 본다.
    if (form === 'short') {
      var ends = /(다|음|함|임|것)(?=[\s.,)\]]|$)/.test(t.trim());
      listing = !ends && mustHits >= 2;
      detail.push(['서술어로 끝맺음', ends ? 4 : 0, 4]);
      return { points: ends ? 4 : 0, max: 4, detail: detail, listing: listing };
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
      var got = 0, partial = false;
      if (r.hit) { got = it.score; mustHits++; }
      else if (it.half) {
        // 핵심어는 있으나 한정어가 빠진 경우 절반만 준다.
        // 실제 GS 채점의 "문장 완성도에 따라 점수를 차등 부여" 를 옮긴 것.
        var h = evalItem(hay, { kw: it.half, negOk: it.negOk, notBefore: it.notBefore, fuzzy: it.fuzzy });
        if (h.hit) { got = Math.round(it.score / 2); partial = true; mustHits++; r = h; }
      }
      mustGot += got;
      if (r.negated) negCount++;
      // hit 은 만점일 때만 true. 분기·진실 발견이 이 값을 근거로 삼기 때문이다.
      R.must.push({ label: it.label, score: it.score, got: got,
                    hit: !partial && got === it.score, partial: partial,
                    negated: !!r.negated, nearMiss: !!r.nearMiss,
                    fuzzy: !!r.fuzzy, matched: r.matched, hint: it.hint, why: it.why });
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
    if (st.listing) R.flags.push('용어 나열 — 75%까지만 인정');
    if (negCount)   R.flags.push('부정문으로 쓴 논점 ' + negCount + '개 — 인정 안 함');

    var bare = raw.replace(/\s/g, '').length;
    var maxChars = opt.maxChars || 300;
    var limit = Math.ceil(maxChars * 1.15);   // 15% 유예
    var lenPen = 0;
    if (bare > limit) {
      lenPen = Math.min(12, Math.ceil((bare - limit) / 20));
      R.flags.push('분량 초과 ' + bare + '자 / 권장 ' + maxChars + '자 — −' + lenPen);
    }

    // 가점은 분모에 넣지 않는다. 필수 논점을 다 쓰면 만점이고,
    // 가점은 놓친 부분을 메워주는 역할만 한다 (만점을 넘지는 않는다).
    var max = mustMax + st.max;
    var total = mustGot + bonusGot + trapGot + st.points - lenPen;
    if (st.listing) total = Math.min(total, Math.round(max * 0.75));
    total = Math.max(0, Math.min(total, max));

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
          var s2 = side;
          if (side === 'yes') {
            // "훼손위협이 발생" 뒤에 "하지 않는다" 가 붙으면 반대 판단이다.
            // 긍정 표현이 부정 표현보다 길다는 이유로 긍정으로 읽으면 안 된다.
            var tail = hay.substr(i + k.length, 6).split(SENT)[0];
            if (NEG.test(tail)) s2 = 'no';
          }
          if (k.length > best.len || (k.length === best.len && i > best.at)) {
            best = { side: s2, len: k.length, at: i };
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

     판단이 틀리면 근거 서술은 0점이다 (실제 GS 채점과 같다).
  ------------------------------------------------------------------ */
  function gradeParts(answers, parts, form) {
    var out = { parts: [], total: 0, max: 0, flags: [], hits: [] };
    (parts || []).forEach(function (p, i) {
      var a = answers[i] || {};
      var r = grade(a.text, p.rubric || {}, { maxChars: p.maxChars || 120, form: p.form || form });

      // 판단은 버튼이 아니라 답안 문장에서 읽는다
      var vMax = 0, vGot = 0, vWrong = false, ver = null;
      if (p.verdict) {
        ver = readVerdict(a.text, p.verdict);
        vMax = (p.verdictScore != null) ? p.verdictScore : 15;
        if (ver.correct) vGot = vMax;
        else {
          vWrong = true;
          out.flags.push((p.label ? p.label + ' ' : '') +
            (ver.given ? '판단 반대 — 근거 0점' : '판단 문장 없음 — 판단 0점'));
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

  /* ---------- 서술형이 아닌 칸 ----------
     객관식 · 빈칸 · 분류 · 미니게임도 결과를 서술형과 같은 모양으로 돌려준다.
       { must:[{label,score,got,hit,partial,why}], bonus:[], trap:[{label,score,got,hit,please}],
         flags:[], total, max, percent }
     그래서 season.js 의 분기 · 진실 발견 · 개념 카드가 형식과 무관하게 돈다.
  ------------------------------------------------------------------ */
  function pack(must, trap, flags) {
    var max = 0, total = 0;
    must.forEach(function (m) { max += m.score; total += m.got; });
    (trap || []).forEach(function (t) { total += t.got; });
    total = Math.max(0, Math.min(max, total));
    return { must: must, bonus: [], trap: trap || [], flags: flags || [], total: total, max: max,
             percent: max ? Math.round(total / max * 100) : 0 };
  }

  /* 객관식 — picked: 원래 보기 순서의 번호 배열
     한 개 고르기: 정답 보기 하나가 must, 고른 오답은 trap(0점, please 전달)
     모두 고르기: 정답 보기마다 must, 고른 오답마다 감점. 오답을 두 개 이상 섞으면 명중으로 치지 않는다 */
  function gradeChoice(part, picked) {
    picked = (picked || []).slice();
    var opts = part.options || [];
    var must = [], trap = [], wrong = 0;
    if (!part.multi) {
      var okI = -1;
      opts.forEach(function (o, i) { if (o.ok && okI < 0) okI = i; });
      var ok = opts[okI] || {};
      var right = picked.length === 1 && picked[0] === okI;
      var sc = part.score || 20;
      must.push({ label: part.label || ok.label || ok.t, score: sc, got: right ? sc : 0,
                  hit: right, partial: false, why: part.why || ok.why });
      picked.forEach(function (i) {
        var o = opts[i];
        if (o && !o.ok) trap.push({ label: o.label || ('오답 — ' + o.t), score: 0, got: 0, hit: true, please: !!o.please });
      });
    } else {
      opts.forEach(function (o, i) {
        var on = picked.indexOf(i) >= 0;
        if (o.ok) {
          var s = o.score || 10;
          must.push({ label: o.label || o.t, score: s, got: on ? s : 0, hit: on, partial: false, why: o.why });
        } else if (on) {
          wrong++;
          var pen = o.pen != null ? o.pen : 10;
          trap.push({ label: o.label || ('오답 — ' + o.t), score: -pen, got: -pen, hit: true, please: !!o.please });
        }
      });
    }
    var r = pack(must, trap);
    if (part.multi && wrong >= 2) {
      r.must.forEach(function (m) { if (m.hit) { m.hit = false; m.partial = true; } });
      r.flags.push('오답 ' + wrong + '개 선택 — 명중 인정 안 함');
    }
    return r;
  }

  /* 빈칸 — 본문의 {{정답|허용답}} 을 빈칸으로 쓴다. {{=정답}} 이면 동의어 확장 없이 그 표현만 인정 */
  function parseCloze(text) {
    var seg = [], blanks = [], re = /\{\{([^}]+)\}\}/g, last = 0, m;
    text = String(text || '');
    while ((m = re.exec(text))) {
      if (m.index > last) seg.push(text.slice(last, m.index));
      var body = m[1], exact = body.charAt(0) === '=';
      if (exact) body = body.slice(1);
      var alts = body.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      seg.push({ blank: blanks.length });
      blanks.push({ ans: alts, exact: exact });
      last = m.index + m[0].length;
    }
    if (last < text.length) seg.push(text.slice(last));
    return { seg: seg, blanks: blanks };
  }

  function bare(s) { return norm(s).replace(new RegExp(SENT, 'g'), ''); }

  function sameWord(given, blank) {
    var g = bare(given);
    if (!g) return false;
    var cands = blank.exact ? blank.ans : expand(blank.ans);
    for (var j = 0; j < cands.length; j++) {
      var c = bare(cands[j]);
      if (!c) continue;
      if (g === c) return true;
      if (c.length >= 4 && Math.abs(c.length - g.length) <= 1) {
        var cj = toJamo(c), gj = toJamo(g);
        if (ed(gj, cj, 2) <= (c.length >= 7 ? 2 : 1)) return true;
      }
    }
    return false;
  }

  function choseong(word) {
    var o = '', s = String(word || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 0xAC00;
      o += (c >= 0 && c <= 11171) ? CHO[(c / 588) | 0] : s.charAt(i);
    }
    return o;
  }

  /* values: 빈칸 순서대로 입력값 / hints: 초성 힌트를 본 빈칸 번호
     part.labels: [{label, need:[빈칸번호], score, why}] — 없으면 빈칸마다 하나씩
     힌트를 본 빈칸은 절반만 인정하고, 명중(hit)으로 치지 않는다 */
  function gradeCloze(part, values, hints) {
    values = values || []; hints = hints || [];
    var P = parseCloze(part.text);
    var ok = P.blanks.map(function (b, i) { return sameWord(values[i], b); });
    var groups = part.labels && part.labels.length ? part.labels : P.blanks.map(function (b, i) {
      return { label: b.ans[0], need: [i], score: 10 };
    });
    var must = groups.map(function (gr) {
      var need = gr.need || [];
      var s = gr.score || 10;
      var right = need.filter(function (i) { return ok[i]; }).length;
      var hinted = need.some(function (i) { return hints.indexOf(i) >= 0 && ok[i]; });
      var got = need.length ? Math.round(s * right / need.length) : 0;
      if (hinted) got = Math.round(got / 2);
      var full = right === need.length && need.length > 0;
      return { label: gr.label, score: s, got: got, hit: full && !hinted,
               partial: !(full && !hinted) && got > 0, why: gr.why };
    });
    var r = pack(must, []);
    r.blanks = P.blanks.map(function (b, i) { return { ans: b.ans, given: values[i] || '', ok: ok[i], hint: hints.indexOf(i) >= 0 }; });
    return r;
  }

  /* 분류 — assign[i] = 항목 i 에 고른 분류 번호
     item.wrong = { 분류번호: {label, pen, please} } 로 특정 오분류를 감점 · 회사 태도에 연결할 수 있다 */
  function gradeSort(part, assign) {
    assign = assign || [];
    var must = [], trap = [];
    (part.items || []).forEach(function (it, i) {
      var s = it.score || 10, a = assign[i];
      var hit = a === it.cat;
      must.push({ label: it.label || (it.t + ' — ' + part.cats[it.cat]), score: s, got: hit ? s : 0,
                  hit: hit, partial: false, why: it.why });
      if (a != null && !hit && it.wrong && it.wrong[a]) {
        var w = it.wrong[a], pen = w.pen != null ? w.pen : 0;
        trap.push({ label: w.label, score: -pen, got: -pen, hit: true, please: !!w.please });
      }
    });
    return pack(must, trap);
  }

  /* 한 칸을 형식에 맞게 채점한다.
     ans = { text, pick, picked, values, hints, assign, mini }
     돌려주는 모양은 gradeParts 의 parts[i] 와 같다 */
  function gradeAny(part, ans) {
    ans = ans || {};
    var t = part.type || 'write', r;
    function wrapR(x) { return { label: part.key, verdict: null, verdictGot: 0, verdictMax: 0, res: x,
                                 total: x.total, max: x.max, percent: x.percent }; }
    if (t === 'choice') return wrapR(gradeChoice(part, ans.picked));
    if (t === 'cloze') return wrapR(gradeCloze(part, ans.values, ans.hints));
    if (t === 'sort') return wrapR(gradeSort(part, ans.assign));
    if (t === 'mini') {
      r = ans.mini && global.MINIS && global.MINIS[part.game]
        ? global.MINIS[part.game].grade(ans.mini.model, ans.mini.state)
        : pack([], []);
      return wrapR(r);
    }
    if (t === 'judge') {
      r = grade(ans.text, part.rubric || {}, { maxChars: part.maxChars || 120, form: part.form || 'short' });
      var vMax = part.verdictScore != null ? part.verdictScore : 15;
      var given = ans.pick || null, exp = part.verdict ? part.verdict.answer : null;
      var correct = !!given && given === exp;
      var body = (given && !correct) ? 0 : r.total;
      if (!given) r.flags.push('판단을 고르지 않음 — 판단 0점');
      else if (!correct) r.flags.push('판단 반대 — 근거 0점');
      var tot = body + (correct ? vMax : 0), mx = r.max + vMax;
      return { label: part.key, verdict: { given: given, expected: exp, correct: correct },
               verdictGot: correct ? vMax : 0, verdictMax: vMax, bodyZero: !!given && !correct,
               res: r, total: tot, max: mx, percent: mx ? Math.round(tot / mx * 100) : 0 };
    }
    return gradeParts([{ text: ans.text }], [part], part.form).parts[0];
  }

  global.AE = {
    grade: grade,
    gradeParts: gradeParts,
    gradeAny: gradeAny,
    gradeChoice: gradeChoice,
    gradeCloze: gradeCloze,
    gradeSort: gradeSort,
    parseCloze: parseCloze,
    sameWord: sameWord,
    choseong: choseong,
    pack: pack,
    readVerdict: readVerdict,
    norm: norm,
    toJamo: toJamo,
    expand: expand,
    _findKw: findKw
  };
})(window);
