/* 존칭 검사 (honorifics.js)
   ------------------------------------------------------------
     node tools/honorifics.js          세 회사 + 돌발 업무 전부
     node tools/honorifics.js --all    판정 보류(명사로 끝난 말)까지

   장면 대사 · 메신저 대화 · 돌발 업무를 훑어 「누가 누구에게」 말하는지 따진다.
     - 장면: 말하는 사람 → 그 장면의 시점 인물 (자리마다 정한별 · 유가온 · 한결)
     - 대화: 보낸 사람 → 그 대화의 시점 인물(beat.pov), 답장 고르기는 시점 인물 → 상대
   그리고 이것들을 알린다.
     ✕ 직급이 아래인 사람이 위로 반말         (한결 → 유가온, 유가온 → 정한별 · 심규리 …)
     ✕ 감사인과 회사 사람 사이의 반말          (회사 대표의 하대처럼 인물 설정인 것은 빼고)
     ✕ 호칭이 시점 인물과 안 맞음             (유가온에게 「이사님」, 정한별에게 「선배」 …)
     ✕ 시점 인물이 자기 대화에 답하거나, 자기와의 관계 수치를 바꿈
     △ 장면 도입 글이 시점 인물을 3인칭으로 부름
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/lexicon.js', 'data/cast.js', 'data/scenes1.js', 'data/scenes2.js', 'data/truth.js', 'data/cases.js',
                 'data/minis.js', 'data/story.js', 'data/deck.js', 'data/raon.js', 'data/gureum.js',
                 'js/engine.js', 'js/minis.js', 'js/story.js', 'js/season.js', 'data/seasons.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { SEASON, SEASONS } = ctx;
const SHOW_ALL = process.argv.includes('--all');

/* 법인 직급 — 숫자가 클수록 위 */
const RANK = { partner: 5, eqr: 5, pred: 5, kyuri: 4, manager: 3, assoc: 2 };
const FIRM = new Set(['partner', 'eqr', 'kyuri', 'manager', 'assoc', 'pred', 'staff']);
const PLAIN_OK = new Set(['ceo']);             // 임재강 — "느긋한 하대"가 인물 설정
const NAME = k => ((ctx.CAST || {})[k] || {}).name || k;

/* 말끝으로 존댓말 · 반말을 가른다. 명사로 끝난 짧은 말(메신저 말줄임)은 판정하지 않는다 */
function sentences(t) { return String(t || '').split(/(?<=[.!?])\s+|\n/).map(s => s.trim()).filter(Boolean); }
function tail(s) { return s.replace(/^[\s…"'「『“‘(]+/, '').replace(/["'」』”’)\]]+$/, '').replace(/[\s.!?~ㅠㅜㅎㅋ^;:,·]+$/, ''); }
const POLITE = /(요|니다|니까|세요|시죠|죠|시오|십시오|습니까|옵니다)$/;
const PLAIN = /(다|어|아|야|지|해|게|네|나|가|자|라|걸|군|래|냐|니|마|봐|줘|와|워|써|돼|까|거든|잖아|겠어|는가|던가|세)$/;
// 끝에 붙은 부름말(", 이사님")은 떼고 판정한다
const TAIL_VOC = /[,\s]+(이사님|선배님|선배|매니저님|본부장님|대표님|상무님|위원장님|회계사님|팀장님)$/;
function level(t) {
  let res = 'polite';
  for (const s of sentences(t)) {
    let e = tail(tail(s).replace(TAIL_VOC, ''));
    if (!e) continue;
    if (/…$/.test(e)) { res = res === 'polite' ? 'noun' : res; continue; }   // 말끝을 흐림 — 판정 보류
    if (!/[가-힣]$/.test(e)) continue;
    if (POLITE.test(e) || /^(네|넵|예|아니요|아니오)$/.test(e)) continue;
    if (/데$/.test(e)) { res = 'noun'; continue; }                          // "~했는데" — 흐린 말
    if (PLAIN.test(e)) return 'plain';
    res = 'noun';
  }
  return res;
}
/* 문장 맨 앞의 부름말 — 팀 방에서는 이것으로 듣는 사람을 정한다 */
const VOC = [[/^(…\s*)?선배(님)?\s*[,!.]/, 'manager'], [/^(…\s*)?이사님\s*[,!.]/, 'partner'], [/^(…\s*)?(한결 씨|한결아)\s*[,!.]/, 'assoc'],
             [/^(…\s*)?(매니저님|심 매니저)\s*[,!.]/, 'kyuri'], [/^(…\s*)?(유 회계사|가온 씨)\s*[,!.]/, 'manager']];
function vocative(t) { for (const [re, k] of VOC) if (re.test(String(t || ''))) return k; return null; }

/* 이 말은 존댓말이어야 하나 — 말하는 사람과 듣는 사람으로 */
function needPolite(from, to) {
  if (!from || !to || from === to) return false;
  const fFirm = FIRM.has(from), tFirm = FIRM.has(to);
  if (fFirm && tFirm) return (RANK[from] || 0) < (RANK[to] || 0);
  if (!fFirm && tFirm) return !PLAIN_OK.has(from);   // 회사 → 감사인
  if (fFirm && !tFirm) return true;                  // 감사인 → 회사
  return false;
}

/* 호칭 — 문장 맨 앞에서 부르는 말이 듣는 사람과 맞는지 (제3자를 가리키는 말은 보지 않는다) */
function badAddress(text, from, to) {
  const v = vocative(text), out = [];
  if (!v) return out;
  if (v !== to) out.push('부름말이 ' + NAME(v) + '을(를) 부르는데 듣는 사람은 ' + NAME(to));
  if (/^(…\s*)?선배/.test(text) && from !== 'assoc') out.push('「선배」는 한결이 유가온에게');
  return out;
}

const issues = [], soft = [];
let lines = 0;
function say(where, from, to, text, kind) {
  if (!text || !from || !to) return;
  lines++;
  const lv = level(text);
  if (needPolite(from, to) && lv === 'plain')
    issues.push(`${where}  ${NAME(from)} → ${NAME(to)}  반말: "${text}"`);
  else if (needPolite(from, to) && lv === 'noun')
    soft.push(`${where}  ${NAME(from)} → ${NAME(to)}  말줄임: "${text}"`);
  badAddress(text, from, to).forEach(b => issues.push(`${where}  ${NAME(from)} → ${NAME(to)}  ${b}: "${text}"`));
}

/* ── 장면 · 돌발 업무 ─────────────────────────────── */
function stateVariants() {
  const a = SEASON.create({ seed: 7 });
  const b = SEASON.create({ seed: 7 });
  b.rel.company = 30; b.flags.fraud_alert = true; b.flags.chair_backing = true;
  return [a, b];
}
function sweepScenes(label, list) {
  list.forEach(sc => {
    const ids = (sc.variants || [{ id: null }]).map(v => v.id);
    stateVariants().forEach(S => ids.forEach(vid => {
      let it;
      try { it = SEASON.resolve(sc, S, vid); } catch (e) { return; }
      const pov = SEASON.povOf(it.seat), where = `${label} ${sc.id}${vid ? '/' + vid : ''}`;
      if (it.speaker === pov) issues.push(`${where}  말하는 사람이 시점 인물 자신(${NAME(pov)})`);
      say(where + ' 첫마디', it.speaker, pov, it.line);
      (it.parts || []).forEach((p, i) => {
        if (p.who === pov) issues.push(`${where}${'①②③④'[i]}  묻는 사람이 시점 인물 자신(${NAME(pov)})`);
        say(where + '①②③④'[i], p.who, pov, p.say);
      });
      const nm = NAME(pov);
      if (it.note && it.note.includes(nm)) soft.push(`${where}  상황 메모가 시점 인물을 3인칭으로: "${it.note}"`);
    }));
  });
}

/* ── 메신저 대화 ─────────────────────────────────── */
function fakeS() {
  const S = SEASON.create({ seed: 7 });
  S.story = { vars: {}, facts: {}, seen: {}, chat: [] };
  S.bond = { manager: 50, assoc: 50, sua: 40, chair: 30, clin: 30, pred: 40, kyuri: 40, itops: 30 };
  return S;
}
function msgsOf(b, S) { try { return typeof b.msgs === 'function' ? b.msgs(S) : (b.msgs || []); } catch (e) { return []; } }
function sweepBeats(label, D, scenes) {
  const S = fakeS();
  const views = {};
  (scenes || []).forEach(sc => { views[sc.id] = sc.view || 'senior'; });
  (D.BEATS || []).forEach(b => {
    const where = `${label} ${b.id}`;
    const pov = b.pov;
    if (!pov) { issues.push(`${where}  시점 인물(pov)이 없음`); return; }
    const all = [msgsOf(b, S), msgsOf(b, Object.assign(fakeS(), { rel: { company: 30 }, flags: { fraud_alert: 1 } }))].flat();
    const other = /^dm:/.test(b.room) ? b.room.slice(3)
      : (all.find(m => m.from && m.from !== pov) || {}).from || null;
    const team = b.room === 'team';
    // 팀 방에서는 방 안의 가장 윗사람에게 하는 말로 본다
    const top = who => ['partner', 'kyuri', 'manager', 'assoc'].filter(k => k !== who).sort((x, y) => RANK[y] - RANK[x])[0];
    const toOf = (from, t, dflt) => (team && vocative(t)) || dflt;
    all.forEach(m => {
      if (!m.from) return;
      if (m.from === pov) return say(where, pov, toOf(pov, m.t, team ? top(pov) : other), m.t);
      say(where, m.from, toOf(m.from, m.t, team ? top(m.from) : pov), m.t);
    });
    const ch = b.choice;
    (ch && ch.opts || []).forEach((o, i) => {
      say(`${where} 답${i + 1}`, pov, toOf(pov, o.t, team ? top(pov) : other), o.t);
      const bond = (o.fx && o.fx.bond) || {};
      if (bond[pov] != null) issues.push(`${where} 답${i + 1}  시점 인물(${NAME(pov)}) 자신과의 관계 수치를 바꿈`);
      (o.reply || []).forEach(r => {
        if (!r.from) return;
        if (r.from === pov) { issues.push(`${where} 답${i + 1}  시점 인물이 자기에게 답장: "${r.t}"`); return; }
        // 대면에서 제3자가 끼어들면 그 말은 상대에게 한다
        const to = b.room === 'talk' && r.from !== other ? other : (team ? top(r.from) : pov);
        say(`${where} 답${i + 1}`, r.from, to, r.t);
      });
    });
  });
  // 장면 도입 글 — 그 장면의 시점 인물을 3인칭으로 부르면 어색하다
  Object.keys(D.OPEN || {}).forEach(sid => {
    const o = D.OPEN[sid], seat = views[sid];
    if (!seat) return;
    const nm = NAME(SEASON.povOf(seat));
    [o.text].flat().forEach(t => {
      const texts = typeof t === 'function' ? ['A', 'B', 'C', 'BIAS', 'HIT', 'TIP', 'MISS', 'OPEN', 'EDIT'].map(id => { try { return t(S, { id }); } catch (e) { return ''; } }) : [t];
      texts.forEach(x => { if (x && x.includes(nm)) issues.push(`${label} 도입 ${sid}  시점 인물(${nm})을 3인칭으로: "${x}"`); });
    });
  });
}

['seorin', 'raon', 'gureum'].forEach(id => {
  SEASONS.use(id);
  const label = SEASONS.current().name;
  sweepScenes(label, ctx.SCENES);
  sweepBeats(label, ctx.STORYDATA, ctx.SCENES);
});
SEASONS.use('seorin');
sweepScenes('돌발 업무', ctx.CASES || []);

const uniq = a => [...new Set(a)];
const I = uniq(issues), W = uniq(soft);
console.log(`\n■ 존칭 검사 — 대사 ${lines}줄\n`);
I.forEach(x => console.log('  ✕ ' + x));
if (SHOW_ALL) W.forEach(x => console.log('  △ ' + x));
console.log(`\n  고칠 것 ${I.length}` + (W.length ? ` · 판정 보류 ${W.length}${SHOW_ALL ? '' : ' (--all 로 보기)'}` : ''));
process.exitCode = I.length ? 1 : 0;
