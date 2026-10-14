/* ============================================================
   감사 시즌 2026 — 등장인물 (cast.js)
   ------------------------------------------------------------
   키는 장면 · 업무 · 메신저의 who / from / speaker 가 가리키는 이름이다.
   avatar 는 사진 파일 이름 (assets/face-<avatar>.jpg · card-<avatar>.jpg).
   사진이 아직 없으면 js/art.js 가 이니셜 초상으로 대신 그린다
   (어떤 사진이 있는지는 tools/images.py 가 만드는 assets/manifest.js 에 적힌다).

   필드
     group   team 법인 · client 도원정밀 · outside 외부 · other 다른 고객사
     tag     인물 파일 첫 줄 (한 줄)
     facts   조서 '인물' 탭에 쌓이는 사실. open: true 면 처음부터 보인다.
             나머지는 메신저 선택 · 장면 결과로 열린다 (data/story.js fx.fact)
             co: '<회사>' — 그 회사 이야기에서만 열리는 사실. 다른 회사 시즌에서는 세지 않는다
             (회사 쪽 인물의 사실은 data/seasons.js 가 알아서 표시한다)
     voice   대사를 쓸 때 지킬 말투 (화면에는 안 나온다)
   ============================================================ */
window.CAST = {
  /* ── 세종회계법인 ── */
  partner: {
    name: '정한별', role: '업무수행이사', org: '세종회계법인 감사2본부', group: 'team', avatar: 'partner', age: 54,
    tag: '결론부터 묻는다',
    voice: '짧게, 하게체 섞은 반말. "~하게", "~지", "다시 보게"',
    facts: [
      { id: 'p_rule', t: '입버릇 — "조서에 없는 건 한 일이 아니다"', open: true },
      { id: 'p_scar', t: '2014년 대운건설 감사 — 조서 미비로 감리 경고를 받았다', open: true },
      { id: 'p_press', co: 'seorin', t: '법인 경영위원회가 도원정밀 수임 유지를 주문했다' }
    ]
  },
  manager: {
    name: '유가온', role: '시니어', org: '세종회계법인 감사2본부', group: 'team', avatar: 'manager', age: 32,
    tag: '감사 현장 책임자',
    voice: '빠르고 건조한 반말. 지시는 한 문장. 이사 앞에서는 "이사님, ~입니다"',
    facts: [
      { id: 'g_coffee', t: '현장에 제일 먼저 오고 제일 늦게 나간다', open: true },
      { id: 'g_offer', co: 'seorin', t: '박정후 상무에게서 재무팀장 자리를 제안받았다' },
      { id: 'g_report', co: 'seorin', t: '제안을 거절하고 품질관리실에 보고했다' },
      { id: 'g_hide', co: 'seorin', t: '제안을 알리지 않은 채 시즌을 계속했다' }
    ]
  },
  assoc: {
    name: '한결', role: '어쏘', org: '세종회계법인 감사2본부', group: 'team', avatar: 'staff', age: 26,
    tag: '입사 2년차 · 엑셀을 가장 늦게 끈다',
    voice: '존댓말, "선배!", 긴장하면 말끝을 흐린다. 메신저에서는 ㅠ · ㅎ 가끔',
    facts: [
      { id: 'k_first', t: '상장사 감사는 이번이 처음', open: true },
      { id: 'k_stock', co: 'seorin', t: '입사 전에 산 도원정밀 주식 10주가 있었다' },
      { id: 'k_sold', co: 'seorin', t: '주식을 처분하고 품질관리실에 보고했다' },
      { id: 'k_kept', co: 'seorin', t: '주식을 그대로 둔 채 시즌을 계속했다' },
      { id: 'k_night', co: 'seorin', t: '새벽 입력 전표에서 경일상사라는 이름을 처음 봤다' }
    ]
  },
  kyuri: {
    name: '심규리', role: '디지털감사팀 매니저', org: '세종회계법인', group: 'team', avatar: 'kyuri', age: 34,
    tag: '데이터로만 말한다',
    voice: '숫자와 결론만. 감정 표현 없음. "쿼리 돌려 볼게요. 3분."',
    facts: [
      { id: 'q_role', t: '분개 데이터 추출 · IT통제 테스트 담당', open: true },
      { id: 'q_found', co: 'seorin', t: '마감 후 입력 전표 추출 쿼리를 짰다' }
    ]
  },
  eqr: {
    name: '오세진', role: '업무품질관리검토자', org: '세종회계법인 품질관리실', group: 'team', avatar: 'eqr', age: 58,
    tag: '보고서 나가기 전 마지막 관문',
    voice: '격식체, 차갑다. "근거는요?" "조서에 없습니다."',
    facts: [
      { id: 'e_role', t: '상장사 감사보고서는 그의 검토를 거쳐야 나간다', open: true }
    ]
  },
  staff: {
    name: '나', role: '담당 회계사', org: '세종회계법인 감사2본부', group: 'team', avatar: 'me',
    tag: '장면마다 앉는 자리가 바뀐다', facts: []
  },

  /* ── ㈜도원정밀 ── */
  cfo: {
    name: '박정후', role: '재무담당임원', org: '㈜도원정밀', group: 'client', avatar: 'cfo', age: 51,
    tag: '전직 회계사 · 감사를 안다',
    voice: '정중한 존댓말 속 압박. "~하시죠", "~아니겠습니까"',
    facts: [
      { id: 'c_ex', t: '대형 회계법인 출신. 감사인이 무엇을 볼지 안다', open: true },
      { id: 'c_list', t: '임가공 재고 명세서를 회계팀에 직접 넘겼다' },
      { id: 'c_order', t: '경일상사 거래는 대표이사 지시였다고 말했다' }
    ]
  },
  ceo: {
    name: '임재강', role: '대표이사', org: '㈜도원정밀', group: 'client', avatar: 'ceo', age: 61,
    tag: '창업자 · 상장 신화',
    voice: '느긋한 하대. 상대를 직함으로 부른다. "정 이사, ~요"',
    facts: [
      { id: 'ceo_found', t: '2009년 창업, 2019년 코스닥 상장', open: true },
      { id: 'ceo_wife', t: '배우자 서미란이 ㈜경일상사 대표이사다' }
    ]
  },
  sua: {
    name: '이수아', role: '회계팀 대리', org: '㈜도원정밀', group: 'client', avatar: 'sua', age: 29,
    tag: '말수가 적다',
    voice: '조심스러운 존댓말. 말끝을 흐린다 "…"',
    facts: [
      { id: 's_desk', t: '결산 자료를 감사팀에 가져다주는 담당', open: true },
      { id: 's_sheet', t: '임가공 재고 명세서는 자기가 만든 게 아니라고 했다' },
      { id: 's_handle', t: '경일상사 거래 전표는 늘 대표이사 결재로 내려왔다고 했다' },
      { id: 's_tip', t: '경일상사 건을 감사팀에 제보했다' }
    ]
  },
  sales: {
    name: '문석호', role: '영업본부장', org: '㈜도원정밀', group: 'client', avatar: 'sales', age: 48,
    tag: '목표가 곧 인격',
    voice: '호탕한 존댓말, 허허 웃는다. 숫자 이야기만 한다',
    facts: [
      { id: 'm_memo', t: '12월 마감 메신저 — "계약서 날인만 되면 매출"', open: true }
    ]
  },
  warehouse: {
    name: '배만수', role: '물류센터장', org: '㈜도원정밀', group: 'client', avatar: 'warehouse', age: 55,
    tag: '창고 30년',
    voice: '투박하고 짧다. 본 것만 말한다',
    facts: [
      { id: 'w_honest', t: '본사 창고 랙 번호를 전부 외운다', open: true },
      { id: 'w_never', t: '임가공업체 재고는 서류로만 봤다고 했다' }
    ]
  },
  chair: {
    name: '윤서경', role: '감사위원장 · 사외이사', org: '㈜도원정밀', group: 'client', avatar: 'chair', age: 63,
    tag: '전직 부장판사',
    voice: '격식체, 짧고 정확하다. "~습니까"',
    facts: [
      { id: 'y_role', t: '감사위원회 위원장. 감사인 선임과 보고를 받는다', open: true },
      { id: 'y_direct', t: '경영진 없이 감사인 보고를 받겠다고 했다' }
    ]
  },

  /* ── 외부 ── */
  fss: {
    name: '차무진', role: '회계감리국 수석조사역', org: '금융감독원', group: 'outside', avatar: 'fss', age: 45,
    tag: '1년 뒤에 온다',
    voice: '관공서 문체. 감정 없음',
    facts: [ { id: 'f_role', t: '감사인 감리 담당', open: true } ]
  },

  /* ── 다른 고객사 (돌발 업무) ── */
  raon: {
    name: '최도현', role: '재무이사', org: '㈜신진바이오', group: 'other', avatar: 'raon', age: 47,
    tag: '임상 3상 · 자금이 급하다',
    voice: '빠른 존댓말. 결론을 재촉한다',
    facts: [ { id: 'r_role', t: '초도감사 고객사 재무 책임자', open: true } ]
  },
  nexton: {
    name: '이선 콜', role: '해외 종속기업 CFO', org: 'Nexton Technology (미국)', group: 'other', avatar: 'nexton', age: 41,
    tag: '그룹감사 부문 경영진',
    voice: '짧은 존댓말에 영어 단어 섞음',
    facts: [ { id: 'n_role', t: '그룹재무제표의 유의적 부문 경영진', open: true } ]
  }
};

/* 홈 · 조서 인물 탭에 보이는 순서 */
window.CAST_ORDER = {
  team: ['partner', 'manager', 'assoc', 'kyuri', 'eqr'],
  client: ['cfo', 'ceo', 'sua', 'sales', 'warehouse', 'chair'],
  outside: ['fss'],
  other: ['raon', 'nexton']
};
