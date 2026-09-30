# 스토리 라인 DB

아직 게임에 넣지 않은 새 이야기 줄기를 모아 둔 곳이다. 나중에 회사(시즌)로 옮길 때 이 파일에서 시작한다.

| 줄기 | 상태 |
|---|---|
| ㈜한울그룹 (그룹감사) | **게임에 옮김** — `data/haneul.js` (2026-09-30). 미니게임 `ic`(내부거래 대사)도 `js/minis.js` 에 |
| ㈜다온마켓 (내부회계 · IT) | 설계만 |
| ㈜해솔건설 (추정치 · 계속기업) | 설계만 |

- `storylines.json` — 회사 세 곳과, 회사를 가로지르는 세종회계법인 감사2본부의 한 해

## 원칙

- **원문을 옮기지 않는다.** 기출·GS는 논점과 함정의 유형만 참고했다. 상황·숫자·인물은 모두 새로 만들었다.
  `ref`에 적힌 번호는 로컬 참고 DB(`자료/db/items.jsonl`, 저장소에는 없다) 번호다.
  `node tools/refdb.js show <번호>`로 원래 논점을 확인한 뒤, 문장은 새로 쓴다.
- **시점은 자리로 정한다.** 장면의 `view`가 `partner`면 정한별, `senior`면 유가온, `staff`면 한결의 시점이다.
  말투와 호칭은 `tools/honorifics.js` 기준을 따른다.
- **진단 우선.** 배점이 크고 약한 영역(감사절차 수행과 결과 보고)에 장면을 몰아 두었다. 근거는 `docs/진단.md`.

## 구조 (`storylines.json`)

| 키 | 뜻 | 게임에서 |
|---|---|---|
| `company` | 회사 개요 · 중요성 | `data/<회사>.js`의 `COMPANY` |
| `theme` · `exam_focus` | 무엇을 가르치는지 · 기준서 · 반복 논점 | 장면 설계의 기준 |
| `truths` | 숨은 진실(발견하면 결말이 바뀜) | `TRUTH` |
| `cast` | 회사 쪽 인물(법인 팀은 기존 인물) | `CAST` |
| `scenes` | 장면 8개 — 시점 · 판본 · 칸(형식 · 묻는 말 · 논점 · 함정) | `SCENES` |
| `beats` | 장면 사이 대화 — 방 · 시점 · 윤리 판정 | `STORYDATA.BEATS` |
| `fates` · `endings` | 1년 뒤 사람들 · 감리 결과 | `FATES` · 엔딩 |
| `minis` | 새 미니게임 아이디어 | `js/minis.js` |
| `images` | 필요한 사진 | 힉스필드 · `tools/images.py` |

## 옮길 때 순서

1. `company`와 `cast`로 `data/<회사>.js` 뼈대를 만든다 (구름결 `data/gureum.js`가 본보기).
2. 장면마다 `parts`의 `must`를 채점표로 옮긴다. 흔한 낱말 하나를 만점 채점어로 두지 않는다.
   `node tools/gradelab.js --why=<칸>`으로 띠를 확인한다.
3. `beats`는 시점 인물(`pov`)을 먼저 정하고 쓴다. `node tools/honorifics.js`로 호칭을 확인한다.
4. `data/seasons.js`의 BOOK에 한 줄, `index.html`에 스크립트 한 줄을 추가한다.
5. 세 가지를 확인한다: `node tools/validate.js` · `SEASON=<회사> node tools/validate.js` · 헤드리스 자동 플레이.
