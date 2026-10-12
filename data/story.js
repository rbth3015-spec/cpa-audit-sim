/* ============================================================
   감사 시즌 2026 — 이야기 (story.js)
   ------------------------------------------------------------
   장면과 장면 사이에 메신저 · 대면 대화가 끼어든다 (js/story.js 가 고르고, 화면은 js/messenger.js).
   선택은 사람과의 관계(bond) · 게이지 · 분기 표지(flags)를 바꾸고,
   윤리 · 독립성 선택은 그 자리에서 판정되며 개념 카드로 남는다.

   BEATS 한 개 = 대화방 하나
     at      'pro'(첫 장면 전) · 's1'…'s9'(그 장면이 끝난 뒤)
     when    (S) → 보일지 여부. 같은 at 에서는 위에서부터 최대 2개
     room    'team' 감사팀 방 · 'dm:<인물>' 1:1 · 'talk' 대면 (place 필요)
     msgs    [{ from, t, when?, mood? } | { sys }] 또는 (S) → 배열. t 는 한 줄
     facts   이 대화를 보면 열리는 인물 사실 (data/cast.js facts.id)
     choice  { card?{label, why}, opts[{ t, ok?, note?, fx?, reply? }] }
               ok true/false 가 있으면 판정(윤리 · 독립성) — card 가 개념 카드가 된다
               fx { bond{인물: ±n}, R, E, T, C, flag, fact }   C = 회사 태도
     fork    true 면 갈림길 — 고른 답장이 다음 장면(경로 장면)을 정한다. 건너뛸 수 없고 2개 제한에도 안 걸린다
               opts[{ t, to(가는 장면 이름), sub(장소 · 사람), fx{flag: 'route_…'} }]  옳고 그름은 없다
   문구 — 메신저 한 줄은 32자 안팎. 설명하지 말고 사람처럼 쓴다.
   ============================================================ */
(function () {
  function hit(S, k) { return !!(S.hits && S.hits[k]); }
  function vid(S, sid) { return (S.story && S.story.vars && S.story.vars[sid]) || null; }
  function weakest(S) {
    var p = (S.papers || []).filter(function (x) { return x.kind === 'scene' && x.pct < 70; })
      .sort(function (a, b) { return a.pct - b.pct; })[0];
    return p ? p.title : null;
  }

  window.STORYDATA = {

    /* 관계 — 처음 값과 구간 이름 */
    BONDS: { manager: 50, assoc: 50, sua: 10, chair: 30 },
    BAND: {
      manager: [[70, '각별'], [45, '믿음'], [0, '서먹']],
      assoc:   [[70, '각별'], [45, '믿음'], [0, '서먹']],
      sua:     [[50, '신뢰'], [30, '관망'], [0, '경계']],
      chair:   [[50, '지지'], [30, '관망'], [0, '냉담']]
    },
    BOND_WHAT: { manager: '유가온', assoc: '한결', sua: '이수아', chair: '윤서경' },

    /* 독립성 · 윤리 위반 표지 — 1년 뒤 감리에서 짚힌다 */
    ETHICS_BAD: {
      kyul_kept: '업무팀원 한결 — 감사고객 주식 보유',
      gaon_secret: '업무팀원 유가온 — 감사고객 고용 협상 미보고',
      cfo_dinner: '감사고객 접대 수령'
    },

    /* 장면 도입 — 시각 · 장소 · 한두 문장 */
    OPEN: {
      s1: { at: '20×6. 11. 14. 09:40', place: '세종회계법인 14층 이사실', text: '수임 심의 20분 전. 컨설팅본부 보고서가 맨 위에 올라와 있다.' },
      s2: { at: '20×6. 12. 5. 14:00', place: '㈜서린정밀 3층 회의실', text: '벽에 4분기 매출 그래프. 12월 막대만 유난히 길다.' },
      s3: { at: '20×6. 12. 31. 16:00', place: '㈜서린정밀 본사 창고', text: '올해 마지막 출고 트럭이 빠져나간다. 박정후가 입구에 서 있다.' },
      s4: { at: '20×7. 1. 20. 10:30', place: '감사팀 현장 사무실', text: function (S, v) {
        return v.id === 'C' ? '발송 전날 밤, 박정후에게서 전화가 왔다.'
          : v.id === 'B' ? '회신 열다섯 통. 한 통의 팩스 번호가 낯익다.'
          : '회신 봉투가 쌓였다. 세 통이 모자라다.'; } },
      s5: { at: '20×7. 2. 3. 19:20', place: '감사팀 현장 사무실', text: function (S, v) {
        return v.id === 'BIAS' ? '새 계리법인의 보고서. 가정 네 줄이 전부 같은 쪽으로 움직였다.'
          : '계리보고서가 왔다. 작년과 같은 법인, 같은 서식.'; } },
      // 경로 장면 — 시각 · 장소도 고른 길을 따른다
      s5b: { at: function (S, v) { return v.id === 'MEET' ? '20×7. 2. 6. 19:40' : '20×7. 2. 6. 14:00'; },
        place: function (S, v) { return v.id === 'MEET' ? '회사에서 두 정거장 떨어진 카페' : '세종회계법인 9층 서버실'; },
        text: function (S, v) {
          return v.id === 'MEET' ? '이수아는 구석 자리에 먼저 와 있다. 가방을 무릎에 올려놓은 채.'
            : v.id === 'BACK' ? '한결은 카페에서 한 시간을 기다리다 돌아왔다. 심규리가 테이블을 띄워 놓았다.'
            : v.id === 'LATE' ? '심규리의 모니터에 진행률 막대. 12,480건 중 3,100건.'
            : '심규리의 모니터 세 대. 가운데에 12월에 짜 둔 쿼리가 떠 있다.'; } },
      s6: { at: '20×7. 2. 10. 23:10', place: '세종회계법인 14층', text: function (S, v) {
        return v.id === 'HIT' ? '한결이 모니터를 돌려 보인다. 목록에 없는 이름 하나.'
          : v.id === 'TIP' ? '이수아가 보낸 파일이 열려 있다. 등기부등본 한 장.'
          : '발신자 없는 메일 한 통. 첨부는 등기부등본.'; } },
      s6b: { at: function (S, v) { return v.id === 'CHAIR' ? '20×7. 2. 13. 16:00' : '20×7. 2. 13. 14:00'; },
        place: function (S, v) { return v.id === 'CHAIR' ? '㈜서린정밀 감사위원회 회의실' : '㈜서린정밀 대표이사실'; },
        text: function (S, v) {
          return v.id === 'CHAIR' ? '긴 탁자에 윤서경 혼자 앉아 있다. 경영진 자리는 비워 두었다.'
            : '임재강은 창가에 서 있다. 탁자에는 상장 기념패.'; } },
      s7: { at: '20×7. 2. 24. 15:00', place: '감사팀 현장 사무실', text: '사업보고서 초안 312쪽. 인쇄 마감은 금요일.' },
      s8: { at: '20×7. 3. 4. 06:10', place: '세종회계법인 14층', text: '새벽 속보 — 서린정밀 제2공장 화재. 한결이 먼저 와 있다.' },
      s9: { at: '20×7. 3. 8. 10:00', place: '㈜서린정밀 대회의실', text: function (S) {
        return S.flags.chair_backing ? '감사위원장 윤서경이 먼저 와 앉아 있다. 박정후는 집계표를 접는다.'
          : '박정후가 집계표를 반으로 접는다. 감사위원장 자리는 비어 있다.'; } },
      s10: { at: '20×7. 3. 12. 08:30', place: '세종회계법인 14층 이사실', text: '발행일 아침. 도장은 아직 서랍 안에 있다.' }
    },

    BEATS: [

      /* ── 시작 전 ─────────────────────────────── */
      { id: 'pro_team', at: 'pro', room: 'team', pov: 'partner', time: '11. 13. (목) 18:40', bg: 'office',
        msgs: [
          { sys: '유가온 님이 방을 만들었습니다' },
          { from: 'manager', t: '서린정밀 20×6 감사팀 방입니다.' },
          { from: 'partner', t: '내일 10시 수임 심의. 컨설팅본부 용역 건 봐 두게.' },
          { from: 'assoc', t: '잘 부탁드립니다! 상장사는 처음이에요ㅠ' },
          { from: 'kyuri', t: '전표 요청 양식은 기말에 드릴게요.' }
        ],
        choice: { opts: [
          { t: '용역 계약서부터 받아 두게.', fx: { bond: { manager: 4 } },
            reply: [{ from: 'manager', t: '받아 뒀습니다. 공유 폴더 01번입니다.' }] },
          { t: '한결 씨, 막히면 유 회계사한테 바로 묻게.', fx: { bond: { assoc: 6 } },
            reply: [{ from: 'assoc', t: '넵!! 감사합니다, 이사님' }] },
          { t: '내일 보세.',
            reply: [{ from: 'manager', t: '8시 반, 14층 이사실 앞에서 뵙겠습니다.' }] }
        ] } },

      /* ── 수임 검토 뒤 ─────────────────────────── */
      { id: 's1_stock', at: 's1', room: 'dm:assoc', pov: 'manager', time: '11. 14. (금) 21:12', bg: 'night',
        facts: ['k_stock'],
        msgs: [
          { from: 'assoc', t: '선배, 잠깐 괜찮으세요?' },
          { from: 'assoc', t: '오늘 독립성 얘기 듣다가 생각났는데요…' },
          { from: 'assoc', t: '저 입사 전에 서린정밀 주식 10주 샀었어요.', mood: 'tense' },
          { from: 'assoc', t: '30만 원어치라… 괜찮겠죠?' }
        ],
        choice: {
          card: { label: '업무팀원의 직접적 재무적 이해관계 — 금액과 무관하게 금지',
                  why: '직접적 재무적 이해관계 — 업무팀원 본인·직계가족이 감사고객 주식을 보유하면 중요성과 무관하게 금지. 처분하거나 업무팀에서 제외' },
          opts: [
            { t: '오늘 처분하고 품질관리실에 알려. 그 전엔 이 건에서 빠지고.', ok: true,
              fx: { R: 2, bond: { assoc: 4 }, flag: 'kyul_sold', fact: 'k_sold' },
              reply: [{ from: 'assoc', t: '내일 아침에 바로 팔고 보고할게요.' }, { from: 'assoc', t: '말해 주셔서 다행이에요.', mood: 'good' }] },
            { t: '10주면 중요하지 않아. 그냥 둬.', ok: false, note: '직접 보유는 금액을 따지지 않음',
              fx: { flag: 'kyul_kept', fact: 'k_kept' },
              reply: [{ from: 'assoc', t: '그렇죠? 다행이에요ㅎㅎ', mood: 'good' }] },
            { t: '감사 끝나고 팔면 되지. 모른 척할게.', ok: false, note: '감사 기간 중 보유 · 숨기면 위반이 커짐',
              fx: { bond: { assoc: 3 }, flag: 'kyul_kept', fact: 'k_kept' },
              reply: [{ from: 'assoc', t: '넵… 감사합니다 선배.' }] }
          ] } },

      /* ── 위험평가 뒤 ─────────────────────────── */
      { id: 's2_dinner', at: 's2', room: 'dm:cfo', pov: 'manager', time: '12. 8. (월) 10:02', bg: 'office',
        msgs: [
          { from: 'cfo', t: '유 회계사님, 재무 박정후입니다.' },
          { from: 'cfo', t: '감사팀 주차는 3면 잡아 두었습니다.' },
          { from: 'cfo', t: '연말에 팀 전체 저녁 한번 모시겠습니다. 한우로요.', mood: 'good' }
        ],
        choice: {
          card: { label: '감사고객의 선물·접대 — 사소하지 않으면 받지 않음',
                  why: '선물·접대 — 사소하고 중요하지 않은 수준이 아니면 이기적 위협·친밀 위협. 안전장치로 낮출 수 없으므로 거절' },
          opts: [
            { t: '주차는 감사합니다. 식사는 마음만 받겠습니다.', ok: true,
              fx: { R: 1 },
              reply: [{ from: 'cfo', t: '역시 원칙적이시네요. 알겠습니다.' }] },
            { t: '좋습니다. 팀원들이랑 같이 가겠습니다.', ok: false, note: '팀 전체 한우 — 사소한 수준 아님',
              fx: { C: 6, R: -3, flag: 'cfo_dinner' },
              reply: [{ from: 'cfo', t: '좋습니다. 날짜는 제가 맞춰 드리죠.', mood: 'good' }] },
            { t: '감사 끝나고 가시죠. 그땐 괜찮겠죠.', ok: false, note: '다음 해 감사도 이어짐 — 시점만 미룬 접대',
              fx: { C: 3, flag: 'cfo_dinner' },
              reply: [{ from: 'cfo', t: '하하, 그럼 3월에 꼭 모시겠습니다.', mood: 'good' }] }
          ] } },

      { id: 's2_query', at: 's2', room: 'team', pov: 'assoc', time: '12. 8. (월) 18:30', bg: 'server',
        when: function (S) { return !!S.flags.fraud_alert; },
        facts: ['q_found'],
        msgs: [
          { from: 'kyuri', t: '분개 전수 추출 쿼리 짰어요.' },
          { from: 'kyuri', t: '마감 후 입력 · 드문 계정 조합 · 대표 계정 승인.' },
          { from: 'manager', t: '결과 나오면 바로 공유 부탁드려요.' },
          { from: 'assoc', t: '결과는 제가 먼저 볼게요!' }
        ] },

      { id: 's2_sample', at: 's2', room: 'team', pov: 'assoc', time: '12. 8. (월) 18:30', bg: 'server',
        when: function (S) { return !S.flags.fraud_alert; },
        msgs: [
          { from: 'kyuri', t: '분개 테스트는 표본 25건으로 간다면서요.' },
          { from: 'kyuri', t: '전수 추출 필요하면 말해요. 지금은 대기.' },
          { from: 'manager', t: '일단 표본으로 갈게요.' }
        ] },

      /* ── 재고실사 뒤 ─────────────────────────── */
      { id: 's3_ware', at: 's3', room: 'talk', pov: 'assoc', place: '본사 창고 출입구', time: '12. 31. (수) 19:05', bg: 'warehouse',
        facts: ['w_never'],
        msgs: function (S) {
          var third = hit(S, 's3#제3자 보관 재고는 제3자에 대한 조회 또는 검사');
          return [
            { from: 'warehouse', t: '실사 끝났습니다. 수고하셨습니다.' },
            third ? { from: 'warehouse', t: '임가공 쪽도 직접 보신다고요.' }
                  : { from: 'warehouse', t: '본사만 보고 가시네요.' },
            { from: 'warehouse', t: '…그쪽 물량, 저는 서류로만 봤습니다.', mood: 'tense' }
          ];
        } },

      { id: 's3_sua', at: 's3', room: 'dm:sua', pov: 'assoc', time: '1. 2. (금) 19:48', bg: 'desk',
        facts: ['s_sheet'],
        msgs: [
          { from: 'sua', t: '회계사님, 회계팀 이수아입니다. 수불부 올려 두었어요.' },
          { from: 'sua', t: '그리고… 임가공 재고 명세서요.' },
          { from: 'sua', t: '그거 제가 만든 거 아니에요.', mood: 'tense' },
          { from: 'sua', t: '아, 아니에요. 신경 쓰지 마세요.' }
        ],
        choice: { opts: [
          { t: '알겠습니다. 나중에라도 말씀하고 싶으시면 연락 주세요.', fx: { bond: { sua: 20 }, fact: 'c_list' },
            reply: [{ from: 'sua', t: '…네. 감사합니다.' }, { from: 'sua', t: '명세서는 상무님이 회계팀에 직접 주셨어요.' }] },
          { t: '그럼 누가 만들었어요? 지금 말씀해 주세요.', fx: { bond: { sua: -5 } },
            reply: [{ from: 'sua', t: '죄송해요. 괜한 말을 했어요.' }] },
          { t: '자료 감사합니다.',
            reply: [{ sys: '읽음' }] }
        ] } },

      /* ── 외부조회 뒤 ─────────────────────────── */
      { id: 's4_sua', at: 's4', room: 'dm:sua', pov: 'assoc', time: '1. 23. (금) 22:31', bg: 'night',
        when: function (S) { return S.bond.sua >= 30 && !S.flags.sua_leak; },
        facts: ['s_handle'],
        msgs: [
          { from: 'sua', t: '늦게 죄송해요. 하나만 여쭤봐도 될까요?' },
          { from: 'sua', t: '한들상사라는 거래처, 알고 계세요?' },
          { from: 'sua', t: '그 회사 전표는 늘 대표님 결재로만 내려와요.', mood: 'tense' },
          { from: 'sua', t: '제가 이런 말 해도 되는 건지 모르겠어요.' }
        ],
        choice: {
          card: { label: '부정 의혹 제보 — 부정위험 평가에 반영할 정보',
                  why: '부정 의혹·제보 — 무시하지 않고 부정위험 평가에 반영해 추가 절차로 대응. 제보자 신원은 보호' },
          opts: [
            { t: '말씀해 주셔서 고마워요. 이름은 드러나지 않게 할게요.', ok: true,
              fx: { bond: { sua: 20 }, flag: 'sua_heard' },
              reply: [{ from: 'sua', t: '자료는… 제가 정리해서 드릴게요.' }] },
            { t: '확인되지 않은 얘기는 조서에 못 써요.', ok: false, note: '제보 — 부정위험 평가에 반영할 정보',
              fx: { bond: { sua: -10 } },
              reply: [{ from: 'sua', t: '…네. 제가 잘못 생각했나 봐요.' }] },
            { t: '박 상무님께 한번 여쭤볼게요.', ok: false, note: '연루 가능성이 있는 경영진에게 누설',
              fx: { bond: { sua: -25 }, flag: 'sua_leak' },
              reply: [{ from: 'sua', t: '아니요, 그건… 제발 그러지 마세요.', mood: 'tense' }] }
          ] } },

      { id: 's4_cfo', at: 's4', room: 'dm:cfo', pov: 'manager', time: '1. 21. (수) 08:10', bg: 'office',
        when: function (S) { return S.rel.company < 42; },
        msgs: [
          { from: 'cfo', t: '유 회계사님, 어제 일은 유감입니다.', mood: 'bad' },
          { from: 'cfo', t: '그 거래처들은 저희 생명줄입니다.' },
          { from: 'cfo', t: '대표님께서도 걱정이 많으십니다.' }
        ] },

      { id: 's4_sales', at: 's4', room: 'talk', pov: 'assoc', place: '㈜서린정밀 1층 로비', time: '1. 21. (수) 12:40', bg: 'office',
        when: function (S) { return S.rel.company >= 42; },
        msgs: [
          { from: 'sales', t: '허허, 회계사님들 아직 계시네요!' },
          { from: 'sales', t: '올해 매출 1,284억. 창사 이래 최고입니다.', mood: 'good' },
          { from: 'sales', t: '12월에 제가 좀 뛰었죠. 허허.' }
        ] },

      /* ── 회계추정치 뒤 ─────────────────────────── */
      { id: 's5_offer', at: 's5', room: 'dm:manager', pov: 'partner', time: '2. 4. (수) 23:05', bg: 'night',
        facts: ['g_offer'],
        msgs: [
          { from: 'manager', t: '이사님, 늦은 시간에 죄송합니다.' },
          { from: 'manager', t: '박 상무님이 재무팀장 자리를 제안했습니다.' },
          { from: 'manager', t: '연봉 1.5배, 3월 입사 조건입니다.' },
          { from: 'manager', t: '솔직히… 좀 흔들립니다.', mood: 'tense' }
        ],
        choice: {
          card: { label: '감사고객의 고용 제안 — 즉시 알리고 업무팀에서 제외',
                  why: '고용 제안·협상 중인 업무팀원 — 이기적 위협. 법인에 알리고 해당 개인을 업무팀에서 즉시 제외, 그가 한 업무는 재검토' },
          opts: [
            { t: '법인에 바로 알리게. 고민 중이면 이 건에선 빠져야 하고.', ok: true,
              fx: { R: 3, bond: { manager: 8 }, flag: 'gaon_reported', fact: 'g_report' },
              reply: [{ from: 'manager', t: '…네. 알고 있었습니다.' }, { from: 'manager', t: '방금 거절했습니다. 내일 품질관리실에 가겠습니다.' }] },
            { t: '시즌 끝나고 답하면 되지. 나만 알고 있겠네.', ok: false, note: '협상 중인 사실을 숨김 — 이기적 위협 방치',
              fx: { bond: { manager: 4 }, flag: 'gaon_secret', fact: 'g_hide' },
              reply: [{ from: 'manager', t: '감사합니다. 조용히 생각해 보겠습니다.' }] },
            { t: '보고서 나간 뒤에 수락하면 문제없네.', ok: false, note: '감사 중 협상 자체가 위협 — 시점 문제 아님',
              fx: { flag: 'gaon_secret', fact: 'g_hide' },
              reply: [{ from: 'manager', t: '그렇죠? 3월 12일까지만 버티겠습니다.' }] }
          ] } },

      { id: 's5_night', at: 's5', room: 'dm:assoc', pov: 'manager', time: '2. 5. (목) 03:12', bg: 'night',
        when: function (S) { return !!S.flags.fraud_alert; },
        facts: ['k_night'],
        msgs: [
          { from: 'assoc', t: '선배 아직 깨어 계세요?' },
          { from: 'assoc', t: '규리 매니저님 쿼리 결과 보는데요,' },
          { from: 'assoc', t: '새벽 3시에 입력된 전표가 214건이에요.' },
          { from: 'assoc', t: '거래처가 거의 다 한들상사예요.', mood: 'tense' }
        ],
        choice: { opts: [
          { t: '잘 찾았어. 특수관계자 목록에 있는지 봐.', fx: { bond: { assoc: 4 }, E: 1 },
            reply: [{ from: 'assoc', t: '…목록엔 없어요.' }] },
          { t: '등기부부터 떼 봐. 대표가 누군지.', fx: { E: 2 },
            reply: [{ from: 'assoc', t: '아침에 바로 뗄게요!' }] },
          { t: '내일 같이 보자. 오늘은 들어가.', fx: { bond: { assoc: 5 } },
            reply: [{ from: 'assoc', t: '넵ㅠ 들어갈게요' }] }
        ] } },

      { id: 's5_night2', at: 's5', room: 'dm:assoc', pov: 'manager', time: '2. 5. (목) 01:20', bg: 'night',
        when: function (S) { return !S.flags.fraud_alert; },
        msgs: [
          { from: 'assoc', t: '선배, 분개 표본 25건 다 봤어요.' },
          { from: 'assoc', t: '이상은 없어요. 근데 전체가 1만 2천 건이라…' },
          { from: 'assoc', t: '나머지는 정말 안 봐도 되는 거죠?' }
        ] },

      /* ── 갈림길 1 — 전표를 팔 것인가, 사람을 만날 것인가 (다음 장면 s5b 가 여기서 정해진다) ── */
      { id: 's5_fork', at: 's5', fork: true, room: 'team', pov: 'manager', time: '2. 5. (목) 09:10', bg: 'office',
        msgs: function (S) {
          return [
            S.flags.fraud_alert ? { from: 'assoc', t: '한들상사 전표 214건, 목록 뽑아 놨어요.' }
                                : { from: 'assoc', t: '분개 1만 2천 건 중에 본 건 25건이에요.' },
            S.flags.fraud_alert ? { from: 'kyuri', t: '원장이랑 붙여서 전수로 볼 수 있어요. 하루.' }
                                : { from: 'kyuri', t: '전수 추출, 지금 시작하면 이틀이에요.' },
            { from: 'assoc', t: '회계팀 이수아 대리님도 뭔가 아는 눈치였어요.' },
            { from: 'partner', t: '유 회계사, 어느 쪽부터 갈지 정하게.' }
          ];
        },
        choice: { opts: [
          { t: '매니저님, 전수로 돌려 주세요.', to: '분개 전수 분석', sub: '서버실 · 심규리', fx: { flag: 'route_data' },
            reply: [{ from: 'kyuri', t: '서버실로 오세요. 테이블부터 맞춥니다.' }] },
          { t: '한결 씨, 이수아 대리님부터 만나 봐.', to: '제보자 면담', sub: '회사 밖 · 이수아', fx: { flag: 'route_person' },
            reply: [{ from: 'assoc', t: '넵! 회사 밖에서 뵙자고 할게요.' }] }
        ] } },

      /* ── 특수관계자 뒤 ─────────────────────────── */
      { id: 's6_sua', at: 's6', room: 'dm:sua', pov: 'assoc', time: '2. 10. (화) 23:58', bg: 'night',
        when: function (S) {
          var v = vid(S, 's6');
          return !S.flags.sua_leak && (v === 'TIP' || (v === 'MISS' && S.bond.sua >= 30));
        },
        facts: ['s_tip'],
        msgs: function (S) {
          return vid(S, 's6') === 'TIP'
            ? [{ from: 'sua', t: '자료 보셨어요?' }, { from: 'sua', t: '제 이름… 안 나가는 거죠?', mood: 'tense' }]
            : [{ from: 'sua', t: '그 메일, 제가 보냈어요.' },
               // 만나서 자료까지 건넸는데 감사팀이 움직이지 않았던 경우 (s5b MEET 에서 제보를 흘려보냄)
               vid(S, 's5b') === 'MEET' ? { from: 'sua', t: '그날 드린 자료로는 안 움직이시길래…' }
                                        : { from: 'sua', t: '더 일찍 말씀드렸어야 했는데…' },
               { from: 'sua', t: '제 이름… 안 나가는 거죠?', mood: 'tense' }];
        },
        choice: {
          card: { label: '회계부정 신고자 — 신원 비밀 유지 · 불이익 금지',
                  why: '부정행위 신고자 보호(외부감사법) — 신고자 신원 비밀 유지, 회사는 신고자에게 불이익 대우 금지. 감사인은 제보를 부정위험 대응에 반영' },
          opts: [
            { t: '출처는 밝히지 않아요. 감사위원회에만 보고합니다.', ok: true,
              fx: { bond: { sua: 10, chair: 4 }, flag: 'sua_protected' },
              reply: [{ from: 'sua', t: '…고맙습니다. 정말로요.', mood: 'good' }] },
            { t: '사실 확인하려면 박 상무님께는 말해야 해요.', ok: false, note: '연루 의심 경영진에게 신원 노출',
              fx: { bond: { sua: -30 }, flag: 'sua_exposed' },
              reply: [{ sys: '이수아 님이 대화방을 나갔습니다' }] },
            { t: '제보는 증거가 아니라서 크게 쓰이진 않아요.', ok: false, note: '제보 — 부정위험 평가·추가 절차의 출발점',
              fx: { bond: { sua: -10 } },
              reply: [{ from: 'sua', t: '…그렇군요.' }] }
          ] } },

      { id: 's6_sua_hit', at: 's6', room: 'dm:sua', pov: 'assoc', time: '2. 11. (수) 22:40', bg: 'night',
        when: function (S) { return vid(S, 's6') === 'HIT' && S.bond.sua >= 25 && !S.flags.sua_leak; },
        facts: ['s_handle'],
        msgs: [
          { from: 'sua', t: '한들상사… 찾으셨다면서요.' },
          { from: 'sua', t: '다행이에요. 혼자 알고 있기 무서웠어요.', mood: 'tense' }
        ] },

      /* ── 갈림길 2 — 누구에게 먼저 가져갈 것인가 (다음 장면 s6b 가 여기서 정해진다) ── */
      { id: 's6_fork', at: 's6', fork: true, room: 'dm:manager', pov: 'partner', time: '2. 12. (목) 08:30', bg: 'office',
        msgs: function (S) {
          var got = (S.truths || []).some(function (t) { return t.id === 'circular_ar' && t.found; });
          return [
            { from: 'manager', t: '이사님, 한들상사 건 정리했습니다.' },
            got ? { from: 'manager', t: '매출채권은 실체를 확인하지 못했습니다.', mood: 'tense' }
                : { from: 'manager', t: '거래 실체는 아직 확인 중입니다.' },
            { from: 'manager', t: '대표이사실에서 면담하자는 연락이 왔습니다.' },
            { from: 'manager', t: '감사위원장도 따로 뵙자고 하십니다.' }
          ];
        },
        choice: { opts: [
          { t: '감사위원장부터 뵙지. 경영진은 빼고.', to: '감사위원회 보고', sub: '회의실 · 윤서경',
            fx: { flag: 'route_chair', bond: { chair: 8 }, C: -4 },
            reply: [{ from: 'manager', t: '내일 16시, 위원장님만 계신 자리로 잡겠습니다.' }] },
          { t: '대표이사부터 만나지. 해명은 들어 봐야지.', to: '경영진 면담', sub: '대표이사실 · 임재강',
            fx: { flag: 'route_ceo', C: 2, bond: { chair: -8 } },   // 감사위원장은 경영진 다음 차례로 밀렸다
            reply: [{ from: 'manager', t: '내일 14시, 대표이사실입니다.' }] }
        ] } },

      /* ── 첫 보고 뒤 — 감사위원회에 먼저 갔다면 대표이사가 부른다 ── */
      { id: 's6_ceo', at: 's6b', room: 'talk', pov: 'manager', place: '대표이사실', time: '2. 16. (월) 10:00', bg: 'ceo',
        when: function (S) { return !!S.flags.route_chair; },
        facts: ['ceo_wife'],
        msgs: [
          { from: 'ceo', t: '감사위원장한테 먼저 갔다면서요.', mood: 'bad' },
          { from: 'ceo', t: '앉으세요. 커피? 아, 안 드시지.' },
          { from: 'ceo', t: '한들상사는 내 집사람 회사예요. 그게 뭐가 문제입니까.', mood: 'bad' },
          { from: 'ceo', t: '우리 회사 상장시킨 게 누군지 압니까.' }
        ],
        choice: {
          card: { label: '특수관계자 거래 — 경영진 해명과 무관하게 실체 확인·공시·지배기구 보고',
                  why: '미공시 특수관계자 거래 — 경영진 설명만으로 종결 불가. 실체 확인 · 공시 요구 · 지배기구 커뮤니케이션' },
          opts: [
            { t: '특수관계자 거래는 공시 대상입니다. 감사위원회에도 보고드립니다.', ok: true,
              fx: { C: -6, R: 2, bond: { chair: 6 } },
              reply: [{ from: 'ceo', t: '…정 이사, 이 친구 원래 이렇습니까.', mood: 'bad' }, { from: 'partner', t: '원래 이렇습니다.' }] },
            { t: '대표님 설명을 조서에 남기고 정리하겠습니다.', ok: false, note: '경영진 해명만으로 종결',
              fx: { C: 6, R: -4 },
              reply: [{ from: 'ceo', t: '그래요. 말이 통하네.', mood: 'good' }] },
            { t: '거래는 두고 주석만 보완하시죠.', ok: false, note: '실체 확인 없이 공시로만 봉합',
              fx: { C: 4, R: -3 },
              reply: [{ from: 'ceo', t: '박 상무한테 그렇게 하라고 하죠.', mood: 'good' }] }
          ] } },

      /* ── 기타정보 뒤 ─────────────────────────── */
      /* ── 기타정보 뒤 — 한들상사가 드러나자 재무임원이 선을 긋는다 ── */
      { id: 's7_cfo', at: 's7', room: 'dm:cfo', pov: 'manager', time: '2. 24. (화) 20:10', bg: 'office',
        when: function (S) { return (S.truths || []).some(function (t) { return t.id === 'circular_ar' && t.found; }); },
        facts: ['c_order'],
        msgs: [
          { from: 'cfo', t: '유 회계사님, 한 가지만 말씀드리겠습니다.' },
          { from: 'cfo', t: '한들상사 거래는 처음부터 대표님 지시였습니다.', mood: 'tense' },
          { from: 'cfo', t: '저는 결재 라인에 있었을 뿐입니다.' }
        ],
        choice: { opts: [
          { t: '말씀하신 내용은 조서에 남기겠습니다.', fx: { R: 1 },
            reply: [{ from: 'cfo', t: '…알겠습니다.' }] },
          { t: '그 말씀은 감사위원회에서 직접 하시죠.', fx: { C: -2, bond: { chair: 2 } },
            reply: [{ from: 'cfo', t: '…생각해 보겠습니다.', mood: 'bad' }] }
        ] } },

      /* 대표이사를 먼저 만났다면 — 감사위원장이 따로 연락한다. 여기서 바로 가면 감사위원회의 지지를 되찾는다 (만회) */
      { id: 's7_chair', at: 's6b', room: 'dm:chair', pov: 'partner', time: '2. 16. (월) 09:00', bg: 'meeting',
        when: function (S) { return !S.flags.route_chair; },
        msgs: [
          { from: 'chair', t: '감사위원장 윤서경입니다.' },
          { from: 'chair', t: '한들상사 건, 경영진 보고서로만 들었습니다.' },
          { from: 'chair', t: '감사인께 직접 듣고 싶습니다. 어떻게 하시겠습니까.' }
        ],
        choice: {
          card: { label: '경영진 연루 부정 의심 — 지배기구와 직접·적시에 커뮤니케이션',
                  why: '경영진이 관여된 부정 의심 — 지배기구와 적시에 커뮤니케이션. 필요하면 경영진 배석 없이 논의' },
          opts: [
            { t: '경영진 배석 없이 감사위원회에 직접 보고드리겠습니다.', ok: true,
              fx: { bond: { chair: 20 }, fact: 'y_direct' },
              reply: [{ from: 'chair', t: '다음 주 화요일. 위원 셋만 앉습니다.' }] },
            { t: '박 상무님과 함께 들어가 설명드리겠습니다.', ok: false, note: '연루 의심 경영진 동석',
              fx: { bond: { chair: -5 }, C: 3 },
              reply: [{ from: 'chair', t: '…알겠습니다.' }] },
            { t: '결론이 나오면 그때 보고드리겠습니다.', ok: false, note: '적시성 — 확정 전이라도 알림',
              fx: { bond: { chair: -8 } },
              reply: [{ from: 'chair', t: '그때는 늦을 수도 있습니다.' }] }
          ] } },

      /* ── 후속사건 뒤 ─────────────────────────── */
      { id: 's8_night', at: 's8', room: 'team', pov: 'partner', time: '3. 5. (목) 01:40', bg: 'night',
        msgs: [
          { from: 'assoc', t: '대양 채권 명세 다 뽑았어요.' },
          { from: 'manager', t: '화재 주석 문구도 초안 올렸습니다.' },
          { from: 'assoc', t: '선배, 우리 이거 끝나면 삼겹살 먹어요ㅠ' },
          { from: 'kyuri', t: '저도요.' }
        ],
        choice: { opts: [
          { t: '편의점 다녀오지. 뭐 먹겠나?', fx: { bond: { manager: 3, assoc: 4 } },
            reply: [{ from: 'manager', t: '아아 두 잔이요. 감사합니다, 이사님.' }, { from: 'assoc', t: '바나나우유요!!', mood: 'good' }] },
          { t: '오늘은 여기까지 하지. 다들 들어가게.', fx: { bond: { assoc: 5 }, T: -1 },
            reply: [{ from: 'manager', t: '…네. 내일 8시에 뵙겠습니다.' }] },
          { t: '대양 건 정리만 끝내고 가지.', fx: { E: 2, bond: { assoc: -2 } },
            reply: [{ from: 'assoc', t: '넵…' }] }
        ] } },

      /* ── 왜곡표시 평가 뒤 ─────────────────────── */
      { id: 's9_eqr', at: 's9', room: 'dm:eqr', pov: 'partner', time: '3. 9. (월) 17:20', bg: 'report',
        msgs: function (S) {
          var w = weakest(S);
          return [
            { from: 'eqr', t: '품질관리실 오세진입니다. 조서 봤습니다.' },
            w ? { from: 'eqr', t: '「' + w + '」 결론, 근거가 약합니다.', mood: 'bad' }
              : { from: 'eqr', t: '결론마다 근거가 붙어 있군요.', mood: 'good' },
            w ? { from: 'eqr', t: '발행 전에 보완하겠습니까?' } : { from: 'eqr', t: '발행일에 뵙겠습니다.' }
          ];
        },
        choice: { when: function (S) { return !!weakest(S); }, opts: [
          { t: '오늘 밤 보완 조서 올리겠습니다.', fx: { T: -4, E: 4 },
            reply: [{ from: 'eqr', t: '내일 아침 9시에 보겠습니다.' }] },
          { t: '기한이 빠듯합니다. 이대로 가겠습니다.', fx: { R: -2 },
            reply: [{ from: 'eqr', t: '그 판단도 조서에 남기십시오.' }] }
        ] } },

      { id: 's9_partner', at: 's9', room: 'dm:partner', pov: 'manager', time: '3. 11. (수) 22:50', bg: 'office',
        facts: ['p_press'],
        msgs: function (S) {
          return [
            { from: 'partner', t: '내일 발행이야.' },
            S.rel.company < 35 ? { from: 'partner', t: '회사가 감사인 교체 얘기를 꺼냈네.' }
                               : { from: 'partner', t: '회사는 조용하네. 그게 더 신경 쓰이지만.' },
            { from: 'partner', t: '경영위원회는 이 건 지키라더군.' },
            { from: 'partner', t: '의견은 자네가 가져오게. 근거랑 같이.' }
          ];
        } }
    ],

    /* 1년 뒤 — 사람들 (위에서부터 처음 맞는 한 줄) */
    FATES: [
      { who: 'manager', list: [
        { when: function (s) { return s.flags.gaon_reported; }, t: '서린정밀 제안을 거절했다. 이듬해 매니저, 첫 인차지 건에서 분개 테스트부터 짰다.' },
        { when: function (s) { return s.flags.gaon_secret; }, t: '시즌이 끝나고 서린정밀 재무팀장으로 옮겼다. 반년 뒤 감리가 그 이직을 짚었다.' },
        { when: function () { return true; }, t: '그해 겨울에도 현장에 제일 먼저 왔다.' }
      ] },
      { who: 'assoc', list: [
        { when: function (s) { return s.flags.kyul_kept; }, t: '감리에서 보유 주식이 확인됐다. 경고, 반년 동안 상장사 감사에서 빠졌다.' },
        { when: function (s) { return s.bond.assoc >= 65; }, t: '다음 시즌, 어쏘 둘을 데리고 현장에 나갔다. "선배가 하던 대로."' },
        { when: function () { return true; }, t: '다음 시즌에도 엑셀을 가장 늦게 끄는 사람이었다.' }
      ] },
      { who: 'sua', list: [
        { when: function (s) { return s.flags.sua_exposed || s.flags.sua_leak; }, t: '회사가 제보자를 찾아냈다. 한 달 뒤 권고사직.' },
        { when: function (s) { return s.flags.lead_tip && s.flags.sua_protected; }, t: '카페에서 건넨 봉투는 조서에 「익명 제보」로만 남았다. 지금은 다른 상장사 내부감사팀에 있다.' },
        { when: function (s) { return s.flags.sua_protected; }, t: '신원은 끝까지 드러나지 않았다. 지금은 다른 상장사 내부감사팀에 있다.' },
        { when: function (s) { return s.bond.sua >= 30; }, t: '끝내 말하지 않았다. 이듬해 봄 회사를 떠났다.' },
        { when: function () { return true; }, t: '감사팀과는 인사 몇 번이 전부였다.' }
      ] },
      { who: 'cfo', list: [
        { when: function (s) { return s.missedAmount >= 90; }, t: '분식 공모로 기소됐다. "대표 지시였다"는 진술은 받아들여지지 않았다.' },
        { when: function (s) { return s.missedAmount === 0; }, t: '증선위가 해임을 권고했다. 마지막 날, 감사팀 방 앞을 한참 서성였다.' },
        { when: function (s) { return s.foundAmount >= 60; }, t: '자리는 지켰다. 반년 뒤 감리가 남은 조작을 찾아냈다.' },
        { when: function () { return true; }, t: '전무로 승진했다. 1년 뒤, 감리 통지서가 그의 책상에도 왔다.' }
      ] },
      { who: 'ceo', list: [
        { when: function (s) { return s.missedAmount >= 90; }, t: '구속됐다. 한들상사는 폐업했다.' },
        { when: function (s) { return s.foundAmount >= 100; }, t: '이사회가 대표이사 해임안을 가결했다.' },
        { when: function (s) { return s.missedAmount >= 40; }, t: '관리종목 지정 날, 주주총회장에서 고개를 숙였다.' },
        { when: function () { return true; }, t: '여전히 대표이사. 한들상사와의 거래는 그해 끊겼다.' }
      ] },
      { who: 'kyuri', list: [
        { when: function (s) { return s.flags.lead_data; }, t: '서린정밀에서 쓴 결합 쿼리는 이듬해 법인의 표준 분개 테스트 양식이 됐다.' }
      ] },
      { who: 'chair', list: [
        { when: function (s) { return s.flags.route_chair && s.flags.chair_backing; }, t: '경영진 없이 받은 첫 보고를 회의록에 그대로 실었다. "감사인은 독립적이었음."' },
        { when: function (s) { return s.flags.route_ceo && s.flags.chair_backing; }, t: '대표이사 다음에야 보고를 받았다. 그래도 회의록에는 적었다. "감사인은 독립적이었음."' },
        { when: function (s) { return s.flags.chair_backing; }, t: '감사위원회 보고서에 한 줄을 남겼다. "감사인은 독립적이었음."' },
        { when: function (s) { return s.bond.chair >= 50; }, t: '너무 늦게 움직였다며 사임했다. 후임에게 감사인 보고서를 그대로 넘겼다.' },
        { when: function () { return true; }, t: '감사위원회 회의록에는 "보고받음" 네 글자만 남았다.' }
      ] }
    ]
  };
})();
