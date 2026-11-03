# 게임 음악 만들기

Suno로 곡을 뽑아 `assets/audio/`에 넣고 `python tools/audio.py`를 돌리면 게임이 알아서 쓴다. 파일이 없는 곡은 합성음으로 대신한다.

## 약관에서 지킬 것

확인일 2026-11-03. 바뀔 수 있으니 결제 전에 [요금](https://suno.com/pricing)과 [약관](https://suno.com/terms)을 다시 본다.

- 유료 플랜에서 뽑고, Suno가 승인한 경로로 **정식 다운로드**한다. 상업 이용 권리는 이렇게 받은 곡에 붙고 해지 후에도 남는다.
- Remix로 만든 곡은 상업 이용이 안 된다.
- 워터마크와 메타데이터를 지우지 않는다.
- 저작권 발생까지 보증하지는 않는다. 다른 사람이 비슷한 곡을 쓰는 것을 막을 수 없을 수 있다.
- 프롬프트에 실제 작곡가 · 가수 · 작품 이름을 넣지 않는다.

## 뽑는 법

1. Custom 모드, **Instrumental 켬**.
2. 아래 Style을 그대로 붙이고 제목만 넣는다. 가사 칸은 비운다.
3. 곡마다 3~4번 뽑아 듣고 하나를 고른다. 다운로드는 Pro 기준 한 달 20회라, 고른 곡만 받는다.
4. 표의 파일 이름으로 바꿔 `assets/audio/`에 넣는다.

## 곡 목록

| 파일 | 쓰이는 곳 | 듣고 고를 기준 |
|---|---|---|
| `title.mp3` | 첫 화면 | 처음 30초 안에 표정이 나오는 곡 |
| `play_a.mp3` | 평소 장면 1 | 글을 읽는 데 방해되지 않는 곡. 튀는 선율 없음 |
| `play_b.mp3` | 평소 장면 2 | play_a와 분위기는 같고 악기가 다른 곡 |
| `tense.mp3` | 제한 시간 막판 | 앞으로 밀어붙이지만 시끄럽지 않은 곡 |
| `end_bad.mp3` | 나쁜 결말 · 보통 결말 | 무겁게 내려앉는 곡 |
| `end_good.mp3` | 좋은 결말 | 벅차지 않고 조용히 풀리는 곡 |

곡 길이는 2~3분이면 된다. 끝나기 전에 게임이 다음 곡을 겹쳐 올리므로 딱 맞는 반복은 필요 없다. 시작이 조용한 곡이 유리하다.

## Style

**title** · 제목 `Fiscal Year End`

```
instrumental, cinematic prestige drama main theme, restrained felt piano ostinato, low string swell, muted pulse, slow build, elegant and tense, corporate thriller, D minor, 76 BPM, polished studio mix, wide stereo, no vocals, no drums until the second half
```

**play_a** · 제목 `Night Audit`

```
instrumental, minimal underscore for reading, soft electric piano, sparse pizzicato, warm sub pulse, focused late night office mood, unobtrusive, no lead melody, A minor, 88 BPM, clean modern film score, no vocals, low dynamics
```

**play_b** · 제목 `Working Papers`

```
instrumental, minimal underscore for reading, muted marimba and light analog synth arpeggio, soft bass, quiet tick percussion, concentration, modern workplace drama, no lead melody, E minor, 92 BPM, clean mix, no vocals, low dynamics
```

**tense** · 제목 `Deadline`

```
instrumental, tense thriller underscore, staccato low strings, ticking percussion, rising synth pulse, urgent but controlled, no big drums, no brass, C minor, 118 BPM, tight modern mix, no vocals, steady intensity from the first bar
```

**end_bad** · 제목 `Inspection Notice`

```
instrumental, somber orchestral elegy, slow solo cello over sustained strings, sparse piano, heavy and quiet, regret, B minor, 58 BPM, intimate recording, no vocals, no percussion, soft ending
```

**end_good** · 제목 `First Light`

```
instrumental, quiet hopeful resolution, solo piano opening joined by warm strings, gentle sunrise feeling, understated, no triumph, D major, 66 BPM, intimate film score, no vocals, no drums, soft ending
```

## 효과음

Sonniss GDC 2026 번들에서 고른 소리를 `tools/audio.py`가 다듬어 `assets/sfx.js`로 굽는다. 효과음 자체로 재배포하면 안 되므로 원본은 저장소에 넣지 않는다. 게임에 들어간 형태로만 둔다.
