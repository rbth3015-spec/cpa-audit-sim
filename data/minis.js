/* ============================================================
   미니게임 데이터 (minis.js)
   ------------------------------------------------------------
   규칙과 화면은 js/minis.js 에 있다. 여기에는 판에 올릴 재료만 둔다.
   시즌 코드(seed)로 섞기 때문에 같은 코드면 같은 판이 나온다.

   count   재고실사 테스트카운트 — 랙 20칸, 실사표, 예외 5종
   jet     분개 테스트 — 전표 24건, 추출 조건 9개, 위험 분개 5건
   cutoff  기간귀속 — 기말 전후 출고 8건, 인도조건별 통제 이전 시점
   confirm 외부조회 — 대상 선정 · 조회처 독립 확인 · 발송 · 회신 예외 처리
   unrec   부외부채 탐색 — 기말 후 지급 10건, 의무 발생 시점으로 판단
   sample  표본 평가 — 표본 왜곡표시 → 모집단 추정 → 허용왜곡표시와 비교
   ============================================================ */
window.MINIDATA = {

  /* 외부조회 — 회사가 준 연락처(pv)와 감사인이 따로 확인한 연락처(iv).
     send.pv / send.iv — 그 연락처로 보냈을 때의 회신
       ok 일치 · fax 회사를 거쳐 들어온 회신 · none 미회신 · diff 금액 차이(v 회신 금액) */
  confirm: {
    title: '매출채권 조회서 발송',
    client: '㈜한빛전자',
    pm: 8.4, total: 233, others: '그 밖의 거래처 1,184곳 · 111.2억 — 표본으로 따로 본다',
    costSec: 3,
    rows: [
      { id: 'K1', name: '㈜대양전기', amt: 42.0, flag: '12월 매출 급증',
        pv: '재무팀 경유 팩스 02-555-0114', iv: '대양전기 경리부 031-720-4410 (등기부 · 대표번호 확인)',
        send: { pv: { r: 'fax' }, iv: { r: 'diff', v: 34.0, why: '12/28 출고분 8.0억 — 대양은 1/4 입고로 회신' } } },
      { id: 'K2', name: '㈜한결소재', amt: 18.5,
        pv: '한결소재 회계팀 02-3141-2200', iv: '한결소재 회계팀 02-3141-2200',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } },
      { id: 'K3', name: '㈜미래테크', amt: 12.3, flag: '신규 거래처',
        pv: '미래테크 재무팀 032-455-7810', iv: '미래테크 재무팀 032-455-7810',
        send: { pv: { r: 'none' }, iv: { r: 'none' } } },
      { id: 'K4', name: '㈜동방기계', amt: 9.1,
        pv: 'dongbang.acct@gmail.com', iv: '동방기계 재무팀 공식 메일 (홈페이지 확인)',
        send: { pv: { r: 'fax' }, iv: { r: 'diff', v: 8.5, why: '12/30 송금 0.6억 — 은행 입금은 1/2' } } },
      { id: 'K5', name: '㈜세진ENG', amt: 7.6,
        pv: '세진ENG 경리팀 031-8017-3300', iv: '세진ENG 경리팀 031-8017-3300',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } },
      { id: 'K6', name: '㈜오성전지', amt: 5.2,
        pv: '오성전지 재무팀 043-210-5500', iv: '오성전지 재무팀 043-210-5500',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } },
      { id: 'K7', name: '㈜그린에너지', amt: 3.9, flag: '1년 넘게 미회수',
        pv: '그린에너지 관리팀 061-330-1200', iv: '그린에너지 관리팀 061-330-1200',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } },
      { id: 'K8', name: '㈜새봄산업', amt: 2.4,
        pv: '새봄산업 총무팀 02-722-8100', iv: '새봄산업 총무팀 02-722-8100',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } },
      { id: 'K9', name: '㈜태광정밀', amt: 1.8,
        pv: '태광정밀 경영지원팀 055-260-7700', iv: '태광정밀 경영지원팀 055-260-7700',
        send: { pv: { r: 'ok' }, iv: { r: 'ok' } } }
    ],
    acts: {
      fax: [{ k: 'take', t: '회신대로 인정' }, { k: 'direct', t: '발신자에게 직접 확인' }],
      none: [{ k: 'close', t: '중요하지 않아 종결' }, { k: 'alt', t: '재발송 · 기말 후 회수 확인' }, { k: 'rep', t: '경영진 확인서로 갈음' }],
      diff: [{ k: 'book', t: '회사 금액 인정' }, { k: 'dig', t: '차이 원인 조사' }, { k: 'fix', t: '회신 금액으로 바로 수정' }]
    }
  },

  /* 부외부채 — 기말 후 지급. owe: 12/31 에 이미 의무가 있었는가, booked: 회사가 부채로 잡았는가 */
  unrec: {
    title: '기말 후 지급 검토',
    client: '㈜한빛전자', costSec: 3,
    rows: [
      { id: 'U1', paid: '1/5', vendor: '한국전력', amt: 1.8, doc: '12월분 전기요금', when: '사용 12/1~12/31', booked: false, owe: true },
      { id: 'U2', paid: '1/8', vendor: '㈜성진물산', amt: 4.6, doc: '원재료 대금 · 청구 1/3', when: '입고 12/28', booked: false, owe: true },
      { id: 'U3', paid: '1/10', vendor: '㈜대림설비', amt: 2.2, doc: '생산라인 수선비 · 청구 1/6', when: '작업 완료 12/29', booked: false, owe: true },
      { id: 'U4', paid: '1/12', vendor: '㈜성진물산', amt: 3.1, doc: '원재료 대금 · 청구 1/6', when: '입고 1/4', booked: false, owe: false },
      { id: 'U5', paid: '1/15', vendor: '㈜태평빌딩', amt: 0.9, doc: '1월분 임차료 · 선불 조건', when: '사용 1/1~1/31', booked: false, owe: false },
      { id: 'U6', paid: '1/6', vendor: '㈜한울로지스', amt: 1.4, doc: '12월 운송비', when: '운송 12/2~12/30', booked: true, owe: true },
      { id: 'U7', paid: '1/20', vendor: '법무법인 정언', amt: 0.6, doc: '자문료', when: '자문 1/2~1/15', booked: false, owe: false },
      { id: 'U8', paid: '1/9', vendor: '국민연금공단', amt: 0.8, doc: '12월분 회사부담금', when: '12월 급여분', booked: true, owe: true },
      { id: 'U9', paid: '1/25', vendor: '㈜미래테크', amt: 5.0, doc: '설비 선급금 · 납품 예정 3월', when: '납품 3월', booked: false, owe: false },
      { id: 'U10', paid: '1/3', vendor: '㈜한결소재', amt: 2.7, doc: '부자재 대금 · 청구 12/24', when: '입고 12/22', booked: true, owe: true }
    ]
  },

  /* 표본 평가 — 매출채권 40건 표본 중 12건을 펼쳐 보이고, 나머지 28건은 차이 없음 */
  sample: {
    title: '매출채권 표본 평가',
    client: '㈜한빛전자',
    pop: 233, popN: 1200, tol: 8.4, n: 40, sampleAmt: 58.0,
    rows: [
      { id: 'S01', name: '㈜대양전기', book: 12.0, audit: 12.0 },
      { id: 'S02', name: '㈜동방기계', book: 6.2, audit: 5.1, why: '반품 1.1억 미반영' },
      { id: 'S03', name: '㈜한결소재', book: 4.8, audit: 4.8 },
      { id: 'S04', name: '㈜세진ENG', book: 3.9, audit: 3.9 },
      { id: 'S05', name: '㈜오성전지', book: 3.5, audit: 2.8, why: '단가 인하 0.7억 미반영' },
      { id: 'S06', name: '㈜새봄산업', book: 3.1, audit: 3.1 },
      { id: 'S07', name: '㈜태광정밀', book: 2.6, audit: 2.1, why: '이중 청구 0.5억' },
      { id: 'S08', name: '㈜그린에너지', book: 2.4, audit: 2.4 },
      { id: 'S09', name: '㈜한울로지스', book: 2.2, audit: 2.2 },
      { id: 'S10', name: '㈜미래셀', book: 1.9, audit: 1.9 },
      { id: 'S11', name: '㈜대원테크', book: 1.6, audit: 1.6 },
      { id: 'S12', name: '㈜성진물산', book: 1.3, audit: 1.3 }
    ],
    methods: [
      { k: 'ratio', t: '비율 추정 — 왜곡표시 ÷ 표본 금액 × 모집단' },
      { k: 'none', t: '추정 안 함 — 표본에서 찾은 금액 그대로' }
    ],
    after: [
      { k: 'ask', t: '경영진에게 수정 요청', ok: true },
      { k: 'more', t: '표본 확대 · 추가 절차', ok: true },
      { k: 'raise', t: '허용왜곡표시를 올려 채택', trap: '허용왜곡표시를 올려 채택' },
      { k: 'close', t: '표본 결과대로 종결', trap: '기각된 모집단을 그대로 종결' }
    ]
  },

  count: {
    title: '본사 창고 테스트카운트',
    system: 'WMS · 본사 창고 랙 현황',
    cols: ['A', 'B', 'C', 'D', 'E'],
    rows: [1, 2, 3, 4],
    samples: 8,
    costSec: 4,
    // 품목 풀 — 단가는 백만원
    items: [
      { code: 'CT-210', name: '코터 롤러', unit: 3.2 },
      { code: 'CT-215', name: '코터 헤드', unit: 4.1 },
      { code: 'SL-400', name: '슬리터 블레이드', unit: 1.8 },
      { code: 'DR-900', name: '건조로 모듈', unit: 9.5 },
      { code: 'WN-120', name: '와인더 샤프트', unit: 2.6 },
      { code: 'PR-330', name: '프레스 금형', unit: 7.4 },
      { code: 'NT-051', name: '노칭 커터', unit: 1.2 },
      { code: 'SV-700', name: '서보 모터', unit: 2.2 },
      { code: 'PL-012', name: 'PLC 제어반', unit: 5.3 },
      { code: 'SN-088', name: '비전 센서', unit: 3.7 },
      { code: 'BL-640', name: '볼스크류', unit: 0.9 },
      { code: 'GR-220', name: '감속기', unit: 1.6 },
      { code: 'CB-300', name: '케이블 트레이', unit: 0.4 },
      { code: 'HT-500', name: '히터 블록', unit: 2.9 },
      { code: 'PK-770', name: '포장 자재', unit: 0.2 },
      { code: 'NM-110', name: '양극재 원료', unit: 1.1 }
    ],
    owner: '㈜한빛소재',
    ticks: [
      { k: 'ok', mark: '✓', name: '일치' },
      { k: 'diff', mark: '△', name: '수량 차이' },
      { k: 'none', mark: '✗', name: '현품 없음' },
      { k: 'miss', mark: '◇', name: '실사표 누락' },
      { k: 'flag', mark: '!', name: '상태 이상' }
    ]
  },

  jet: {
    title: '분개 테스트 — 추출 조건 설계',
    closeDate: '1/5',
    limit: 10,
    criteria: [
      { k: 'after', name: '마감 후 입력', tip: '전표일은 기말 이전인데 입력은 결산 마감(1/5) 이후' },
      { k: 'weekend', name: '주말·공휴일 입력', tip: '입력일이 토·일·공휴일' },
      { k: 'self', name: '입력자 = 승인자', tip: '자기 전표를 자기가 승인' },
      { k: 'exec', name: '경영진 직접 입력', tip: '대표이사 · CFO 가 직접 입력' },
      { k: 'round', name: '억 단위 딱 떨어짐', tip: '금액이 1억원 단위로 끝남' },
      { k: 'blank', name: '적요 없음', tip: '적요란이 비어 있음' },
      { k: 'rare', name: '드문 계정 조합', tip: '평소 쓰지 않는 차변·대변 조합' },
      { k: 'cutoff', name: '기말 전후 매출·역분개', tip: '12/27 ~ 1/5 의 매출 분개와 매출 취소' },
      { k: 'big', name: '10억원 이상', tip: '금액 10억원 이상' }
    ],
    // day: 전표일 / in: 입력일 / wd: 입력 요일 / 금액 원
    rows: [
      { id: 'R1', risk: '마감 후 대표이사가 입력·승인한 결산 매출 조정', day: '12/31', in: '1/9 22:14', wd: '화', user: '대표이사', appr: '대표이사', dr: '매출채권', cr: '매출', amt: 3000000000, memo: '결산 조정', tags: ['after', 'self', 'exec', 'round', 'big', 'cutoff'] },
      { id: 'R2', risk: '주말 밤 영업팀이 입력한 특수관계자 매출', day: '12/29', in: '12/29 21:40', wd: '토', user: '영업팀 김도현', appr: '회계팀장', dr: '매출채권', cr: '매출', amt: 2350000000, memo: '㈜한들상사 납품', tags: ['weekend', 'big', 'cutoff'] },
      { id: 'R3', risk: '적요 없는 자기승인 잡이익', day: '12/30', in: '12/30 18:02', wd: '월', user: '회계팀 이서윤', appr: '회계팀 이서윤', dr: '미수금', cr: '잡이익', amt: 480000000, memo: '', tags: ['blank', 'self', 'rare'] },
      { id: 'R4', risk: '기말 후 역분개된 12월 매출', day: '1/3', in: '1/3 09:15', wd: '금', user: '회계팀장', appr: 'CFO', dr: '매출', cr: '매출채권', amt: 1200000000, memo: '12/28 매출 취소', tags: ['cutoff', 'big', 'round'] },
      { id: 'R5', risk: '마감 후 CFO 가 입력한 재고·원가 반대 조합', day: '12/31', in: '1/7 10:20', wd: '화', user: 'CFO', appr: '회계팀장', dr: '재고자산', cr: '매출원가', amt: 760000000, memo: '재고 조정', tags: ['after', 'exec', 'rare'] },

      { id: 'N1', day: '12/25', in: '12/25 10:02', wd: '목', user: '인사팀', appr: '회계팀장', dr: '급여', cr: '보통예금', amt: 1840000000, memo: '12월 급여', tags: ['weekend', 'big'] },
      { id: 'N2', day: '1/1', in: '1/1 00:10', wd: '목', user: '시스템 자동', appr: '시스템 자동', dr: '이자비용', cr: '미지급비용', amt: 36400000, memo: '차입금 이자 자동 계상', tags: ['weekend', 'self'] },
      { id: 'N3', day: '12/28', in: '12/28 16:30', wd: '금', user: '영업관리 박소영', appr: '회계팀장', dr: '매출채권', cr: '매출', amt: 412000000, memo: '㈜대원테크 납품 #2291', tags: ['cutoff'] },
      { id: 'N4', day: '12/30', in: '12/30 11:05', wd: '월', user: '영업관리 박소영', appr: '회계팀장', dr: '매출채권', cr: '매출', amt: 287500000, memo: '㈜세진ENG 납품 #2304', tags: ['cutoff'] },
      { id: 'N5', day: '1/2', in: '1/2 14:44', wd: '목', user: '영업관리 박소영', appr: '회계팀장', dr: '매출채권', cr: '매출', amt: 198300000, memo: '㈜대원테크 납품 #0003', tags: ['cutoff'] },
      { id: 'N6', day: '12/31', in: '1/4 17:20', wd: '토', user: '회계팀장', appr: 'CFO', dr: '감가상각비', cr: '감가상각누계액', amt: 912000000, memo: '12월 감가상각', tags: ['weekend'] },
      { id: 'N7', day: '12/20', in: '12/20 09:30', wd: '금', user: '자금팀', appr: 'CFO', dr: '단기차입금', cr: '보통예금', amt: 5000000000, memo: '산업은행 차입금 상환', tags: ['round', 'big'] },
      { id: 'N8', day: '12/1', in: '12/1 10:12', wd: '월', user: '총무팀', appr: '회계팀장', dr: '선급비용', cr: '보통예금', amt: 300000000, memo: '화재보험료 1년분', tags: ['round'] },
      { id: 'N9', day: '12/31', in: '1/3 15:02', wd: '금', user: 'CFO', appr: '대표이사', dr: '상여', cr: '미지급비용', amt: 640000000, memo: '성과급 충당', tags: ['exec'] },
      { id: 'N10', day: '12/18', in: '12/18 13:47', wd: '수', user: '대표이사', appr: 'CFO', dr: '기부금', cr: '보통예금', amt: 50000000, memo: '지역 장학재단 기부', tags: ['exec'] },
      { id: 'N11', day: '12/15', in: '12/15 11:20', wd: '월', user: '구매팀', appr: '회계팀장', dr: '원재료', cr: '매입채무', amt: 1430000000, memo: '양극재 원료 매입', tags: ['big'] },
      { id: 'N12', day: '12/10', in: '12/10 16:08', wd: '수', user: '회계팀 이서윤', appr: '회계팀장', dr: '매출채권', cr: '매출', amt: 356000000, memo: '㈜미래셀 납품 #2244', tags: [] },
      { id: 'N13', day: '12/12', in: '12/12 10:41', wd: '금', user: '자금팀', appr: '회계팀장', dr: '보통예금', cr: '매출채권', amt: 520000000, memo: '㈜미래셀 대금 회수', tags: [] },
      { id: 'N14', day: '12/22', in: '12/22 17:55', wd: '월', user: '구매팀', appr: '회계팀장', dr: '소모품비', cr: '미지급금', amt: 8400000, memo: '생산라인 소모품', tags: [] },
      { id: 'N15', day: '12/26', in: '12/26 14:10', wd: '금', user: '회계팀 이서윤', appr: '회계팀장', dr: '외상매입금', cr: '보통예금', amt: 674000000, memo: '11월분 매입대금 지급', tags: [] },
      { id: 'N16', day: '12/31', in: '1/2 11:30', wd: '목', user: '회계팀장', appr: 'CFO', dr: '법인세비용', cr: '미지급법인세', amt: 2180000000, memo: '법인세 추정 계상', tags: ['big'] },
      { id: 'N17', day: '12/5', in: '12/5 15:25', wd: '금', user: '회계팀 이서윤', appr: '회계팀장', dr: '수선비', cr: '미지급금', amt: 23700000, memo: '제1공장 설비 수선', tags: [] },
      { id: 'N18', day: '12/19', in: '12/19 10:00', wd: '목', user: '자금팀', appr: '자금팀', dr: '정기예금', cr: '보통예금', amt: 700000000, memo: '', tags: ['self', 'blank', 'round'] },
      { id: 'N19', day: '12/27', in: '12/27 09:50', wd: '토', user: '물류팀', appr: '회계팀장', dr: '운반비', cr: '미지급금', amt: 12600000, memo: '연말 긴급 출하 운송비', tags: ['weekend'] }
    ]
  },

  cutoff: {
    title: '12월 31일 기간귀속 검사',
    from: '12/15', to: '1/10',
    // 날짜는 12/15 = 0 기준 일수. 인도조건별로 통제가 넘어가는 사건이 다르다
    terms: {
      ship: { name: '선적지 인도', event: 'out', tip: '출고(선적) 시점에 통제 이전' },
      dest: { name: '도착지 인도', event: 'arrive', tip: '고객 도착 시점에 통제 이전' },
      accept: { name: '검수 조건', event: 'accept', tip: '고객 검수 완료 시점에 통제 이전' }
    },
    rows: [
      { id: 'X1', client: '㈜대원테크', amt: 4.1, term: 'ship', out: 15, arrive: 18, booked: 'cur' },
      { id: 'X2', client: '㈜세진ENG', amt: 6.8, term: 'dest', out: 15, arrive: 19, booked: 'cur' },
      { id: 'X3', client: '㈜미래셀', amt: 9.2, term: 'accept', out: 5, arrive: 7, accept: 24, booked: 'cur' },
      { id: 'X4', client: '㈜한빛소재', amt: 2.7, term: 'ship', out: 18, arrive: 21, booked: 'next' },
      { id: 'X5', client: '㈜오성전지', amt: 3.3, term: 'dest', out: 11, arrive: 14, booked: 'cur' },
      { id: 'X6', client: '㈜대원테크', amt: 5.6, term: 'ship', out: 16, arrive: 20, booked: 'next' },
      { id: 'X7', client: '㈜그린에너지', amt: 7.5, term: 'accept', out: 0, arrive: 2, accept: 13, booked: 'cur' },
      { id: 'X8', client: '㈜세진ENG', amt: 1.9, term: 'dest', out: 16, arrive: 16, booked: 'cur' }
    ]
  }
};
