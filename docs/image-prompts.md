# 이미지 프롬프트

만들어서 아래 **저장 이름** 그대로 넣고 한 번만 실행하면 게임에 바로 들어간다.

```bash
python tools/images.py
```

- 인물 → `image/character/<이름>.png`
- 장면 → `image/background/<이름>.png`
- 사진이 없는 인물은 이니셜 초상으로 나온다. 하나씩 채워도 된다.
- 구도가 어긋나면 `tools/images.py` 의 `FACE_BOX` / `SCENE_BOX` 에 그 파일만 적는다.

공통 톤(기존 사진과 같게): 흑백 다큐멘터리 사진, 35mm, 자연광, 거친 입자, 글자·로고 없음.

---

## 1. 인물 — 8명

정사각 1:1, 상반신 정면, 얼굴이 가운데, 눈높이는 위에서 38% 즈음. 배경은 흐린 실내.

### 심규리 · 디지털감사팀 매니저 (34) — `character/kyuri.png`

```
Black and white documentary portrait photograph of a Korean woman in her mid-30s, data forensics specialist at an accounting firm. Short bob haircut, thin-rimmed glasses, plain dark crew-neck sweater. Calm, unimpressed expression, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred open-plan office with dual monitors showing faint spreadsheets, cool fluorescent light. Shot on 35mm film, natural light, fine grain, high contrast, sharp eyes, shallow depth of field. No text, no logos, no watermark.
```

### 오세진 · 품질관리실 이사 · 업무품질관리검토자 (58) — `character/eqr.png`

```
Black and white documentary portrait photograph of a Korean man in his late 50s, senior quality control partner at an accounting firm. Grey side-parted hair, steel-rimmed glasses, dark grey suit with a white shirt and no tie. Cold, evaluating expression, mouth closed, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred wall of archive binders and a closed office door. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 임재강 · ㈜도원정밀 대표이사 (61) — `character/ceo.png`

```
Black and white documentary portrait photograph of a Korean man in his early 60s, founder and CEO of a mid-size battery equipment manufacturer. Thick swept-back grey hair, heavy build, expensive navy suit with a tie, a slight confident smile that does not reach the eyes. Looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred executive office with a large window and a company flag. Shot on 35mm film, natural window light from the side, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 이수아 · 회계팀 대리 (29) — `character/sua.png`

```
Black and white documentary portrait photograph of a Korean woman in her late 20s, junior accountant in a manufacturing company's finance team. Long hair tied back loosely, no makeup, plain light blouse, an employee lanyard. Careful, slightly anxious expression, eyes on the lens but chin a little lowered. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred cubicle wall with stacked document binders, flat office lighting. Shot on 35mm film, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 문석호 · 영업본부장 (48) — `character/sales.png`

```
Black and white documentary portrait photograph of a Korean man in his late 40s, head of sales at a manufacturing company. Short thick hair, tanned skin, broad shoulders, dress shirt with sleeves rolled up and loosened tie. Broad, hearty smile, relaxed and confident, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred sales floor with a whiteboard of quarterly targets. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 배만수 · 물류센터장 (55) — `character/warehouse.png`

```
Black and white documentary portrait photograph of a Korean man in his mid-50s, warehouse manager with thirty years on the floor. Weathered face, deep lines, short grey hair, work jacket over a company polo shirt, a pen in the chest pocket. Plain, honest, slightly tired expression, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred high steel racking of a distribution centre, overhead industrial lights. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 윤서경 · 감사위원장 · 사외이사 · 전직 부장판사 (63) — `character/chair.png`

```
Black and white documentary portrait photograph of a Korean woman in her early 60s, former senior judge now chair of a listed company's audit committee. Short silver hair, rimless glasses, dark tailored jacket with a high collar, a single pearl earring. Composed, unreadable, authoritative expression, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred boardroom with a long table and closed vertical blinds. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 차무진 · 금융감독원 회계감리국 수석조사역 (45) — `character/fss.png`

```
Black and white documentary portrait photograph of a Korean man in his mid-40s, senior investigator at the financial supervisory authority. Neat short hair, plain dark suit, government ID badge on a lanyard, no expression at all. Looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred government office corridor with grey filing cabinets, flat institutional lighting. Shot on 35mm film, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

## 1-2. ㈜동인정보기술 인물 — 4명

SaaS · SI 회사. 사무실은 밝고 캐주얼하다 — 정장보다 니트 · 후드 · 사원증.

### 강민서 · 재무이사 (44) — `character/gcfo.png`

```
Black and white documentary portrait photograph of a Korean woman in her mid-40s, CFO of a listed software company. Sleek shoulder-length hair, minimal makeup, fitted dark blazer over a plain knit top, a thin smartwatch. Smooth, polite, practiced smile that stays on the surface, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred bright open-plan tech office with glass meeting rooms. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 도재윤 · 대표이사 · 창업자 (49) — `character/gceo.png`

```
Black and white documentary portrait photograph of a Korean man in his late 40s, founder and CEO of a software company who used to write the code himself. Short messy hair with grey at the temples, short stubble, black turtleneck under an unstructured jacket, reading glasses pushed up on the head. Relaxed, slightly amused expression, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred loft office with a whiteboard full of system diagrams. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 서태오 · IT운영팀장 (39) — `character/itops.png`

```
Black and white documentary portrait photograph of a Korean man in his late 30s, head of IT operations at a software company. Short practical haircut, dark fleece vest over a checked shirt, an employee ID badge on a lanyard, tired eyes after a night shift. Guarded, defensive expression, arms not visible, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred server room aisle with rows of rack lights. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

### 문경호 · SI본부장 (51) — `character/sipm.png`

```
Black and white documentary portrait photograph of a Korean man in his early 50s, head of the system integration division at a software company, a salesman at heart. Neatly combed hair, suit without a tie, top button open, a phone in the breast pocket. Big confident smile, eyebrows raised as if closing a deal, looking straight into the lens. Square 1:1 composition, head and shoulders, face centered, eye line about 38% from the top. Background: blurred meeting room with a project schedule chart on the wall. Shot on 35mm film, natural light, fine grain, high contrast, shallow depth of field. No text, no logos, no watermark.
```

---

## 2. 표정 — 9장 (선택)

**기존 사진을 같이 첨부하고** 아래 프롬프트를 쓴다. 같은 사람, 같은 옷, 같은 조명, 같은 구도에서 표정만 바뀌어야 한다.
채점 결과와 대사에 따라 게임이 알아서 바꿔 끼운다. 없으면 기본 사진을 쓰니 안 만들어도 된다.

| 첨부할 원본 | 저장 이름 | 표정 |
|---|---|---|
| `image/character/Gemini_…llh6jv….png` (박정후) | `character/cfo-good.png` | 흡족한 미소 |
| 〃 | `character/cfo-bad.png` | 굳은 얼굴 · 불쾌 |
| `image/character/Gemini_…ezl4cl….png` (유가온) | `character/manager-good.png` | 옅은 미소 |
| 〃 | `character/manager-bad.png` | 실망 · 미간 |
| 〃 | `character/manager-tense.png` | 긴장 · 고민 |
| `image/character/Gemini_…u7mguc….png` (한결) | `character/staff-good.png` | 환한 웃음 |
| 〃 | `character/staff-tense.png` | 불안 |
| `image/character/Gemini_…y7xgwl….png` (정한별) | `character/partner-bad.png` | 못마땅함 |
| `character/sua.png` (이수아, 위에서 만든 것) | `character/sua-tense.png` | 겁먹음 |

```
Using the attached photograph as the reference for the same person: keep the identical face, hairstyle, clothing, background, lighting, camera angle, framing and black-and-white film look. Change only the facial expression to: a faint satisfied smile, eyes slightly narrowed, still looking into the lens. Everything else must match the original photograph exactly. No text, no logos, no watermark.
```

표정만 바꿔서 쓰면 된다 — 위 문장에서 `a faint satisfied smile, …` 자리를 바꾼다.

- 흡족 · 미소 → `a faint satisfied smile, eyes slightly narrowed`
- 굳음 · 불쾌 → `a cold, displeased expression, jaw set, lips pressed thin`
- 실망 → `a disappointed look, brows drawn together, mouth slightly open as if about to speak`
- 긴장 · 고민 → `a tense, worried expression, eyes looking slightly away, brow furrowed`
- 환한 웃음 → `a bright open smile showing teeth, eyes creased`
- 불안 → `an anxious expression, shoulders tight, eyes wide and uncertain`
- 못마땅함 → `a stern disapproving expression, chin slightly lowered, eyes hard`
- 겁먹음 → `a frightened expression, lips parted, eyes wide, leaning back slightly`

---

## 3. 장면 — 7장

가로 21:9 (3136×1344 같은 비율). 사람은 없거나 뒷모습만. 아래 20%는 잘려 나가니 중요한 것을 넣지 않는다.

### 대표이사 집무실 — `background/ceo.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. The empty executive office of a Korean manufacturing company's founder: a massive dark wood desk, one high-backed leather chair turned slightly away, a framed stock-exchange listing plaque on the wall, a golf putter leaning in the corner, floor-to-ceiling window with city haze behind. Late afternoon light through half-open blinds, long shadows across the floor. Shot on 35mm film, natural light, fine grain, high contrast, no people. No text, no logos, no watermark.
```

### 감사위원회 회의실 — `background/board.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. A small board meeting room prepared for an audit committee session: an oval table with four chairs, four closed document folders and water glasses placed exactly, a speakerphone in the middle, blinds drawn, one empty chair pulled out. Cool overhead light, sterile and quiet, no people. Shot on 35mm film, fine grain, high contrast. No text, no logos, no watermark.
```

### 외주 임가공 공장의 재고 적치장 — `background/subcon.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. A subcontractor's cramped processing plant in a Korean industrial district: pallets of metal parts wrapped in plastic film stacked unevenly, handwritten paper tags tied to the wrapping, an old forklift, oil stains on the concrete, daylight cutting in through a roller shutter half open. Dusty air, no people. Shot on 35mm film, natural light, fine grain, high contrast. No text, no logos, no watermark.
```

### 불탄 제2공장 — `background/fire.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. The morning after a factory fire: a burnt production line, collapsed ceiling panels, twisted steel frames, soot-blackened machinery, puddles of water on the floor reflecting a hole in the roof, thin smoke still in the air. Cold grey daylight from above, no people. Shot on 35mm film, fine grain, high contrast. No text, no logos, no watermark.
```

### 지하 주차장 — `background/garage.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. An office building's underground parking level at night: rows of parked cars, concrete pillars with faded level numbers, one flickering fluorescent tube, a single car with its interior light on far down the row. Deep shadows, wet floor sheen, no people visible. Shot on 35mm film, available light, heavy grain, high contrast. No text, no logos, no watermark.
```

### 야근 뒤 새벽 거리 — `background/street.png`

```
Black and white documentary photograph, ultra-wide 21:9 exterior. A Seoul office district street at 2am in winter: a convenience store glowing on the corner, plastic stools outside, steam rising from a vent, one office tower with a few lit windows, empty road, breath-cold air. Shot from across the street, no recognizable people or brand signage. Shot on 35mm film, available light, heavy grain, high contrast. No text, no logos, no watermark.
```

### 감리 — 금융감독원 — `background/fss.png`

```
Black and white documentary photograph, ultra-wide 21:9 interior. A financial supervisory authority's review room: a long table stacked with archive boxes and bound audit working papers, one desk lamp, a single chair, a wall clock, vertical blinds closed. Institutional, cold, no people. Shot on 35mm film, fine grain, high contrast. No text, no logos, no watermark.
```

---

## 4. 나중에 — 있으면 좋은 것

| 쓰임 | 저장 이름 | 한 줄 프롬프트 감 |
|---|---|---|
| 은행 조회 회신 | `background/confirm.png` | 팩스와 개봉한 봉투가 쌓인 책상 |
| 전산실 서버 반출 | `background/data.png` | 외장 디스크와 전표 출력물이 놓인 전산실 |
| 주주총회장 | `background/agm.png` | 접이식 의자가 늘어선 빈 주주총회장 |
| 신진바이오 임상 시설 | `background/clinic.png` | 임상 시험 검체 냉장고가 늘어선 복도 |
