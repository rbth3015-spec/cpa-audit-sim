"""감사 시즌 2026 — 이미지 에셋 만들기 (tools/images.py)

   실행:  python tools/images.py        (Pillow · numpy 필요)

   image/ 의 원본(장당 7~11MB PNG)을 게임이 쓰는 크기로 잘라 assets/ 에 JPEG 로 저장하고,
   어떤 사진이 있는지 assets/manifest.js 에 적는다. 게임은 그 목록을 보고
   사진이 없는 인물은 이니셜 초상, 없는 장면은 그림으로 대신한다.

   ── 새 이미지를 넣는 법 (docs/image-prompts.md 의 파일 이름 그대로) ──
     인물        image/character/<인물키>.png           예) sua.png  → face-sua.jpg · card-sua.jpg
     인물 표정   image/character/<인물키>-<표정>.png     예) cfo-bad.png → face-cfo-bad.jpg
                 표정: good(웃음·만족) · bad(굳음·불쾌) · tense(긴장·걱정)
     장면        image/background/<장면키>.png          예) ceo.png  → scene-ceo.jpg
   이름만 맞으면 표를 고칠 필요 없다. 구도가 어긋나면 아래 FACE_BOX / SCENE_BOX 에 그 파일만 적는다.

   crop = (왼쪽, 위, 오른쪽, 아래) — 원본 가로·세로에 대한 비율.
   원본 오른쪽 아래 구석의 생성기 표식이 들어가지 않게 잡는다.
"""
from pathlib import Path
import re
import shutil
import sys

import numpy as np
from PIL import Image

sys.stdout.reconfigure(errors='replace')   # 콘솔 인코딩에 없는 글자(—)로 멈추지 않게

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'image', ROOT / 'assets'

# ── 처음 만든 사진들 (파일 이름이 생성기 이름 그대로라 따로 적는다) ──
LEGACY_SCENES = {
    'office':    ('background/1.png',          (0, 0, 1, .78)),      # 수임 검토
    'meeting':   ('background/2.png',          (0, .02, 1, .78)),    # 위험평가 · 왜곡표시의 평가
    'warehouse': ('background/3.png',          (0, 0, 1, .78)),      # 재고실사 입회
    'desk':      ('background/6.png',          (0, .18, .9, .95)),   # 외부조회 · 회계추정치 · 기타정보
    'night':     ('background/7.png',          (0, .1, 1, .78)),     # 특수관계자 · 후속사건
    'report':    ('background/8.png',          (0, .02, 1, .78)),    # 의견형성
    'review':    ('background/*k88etf*.png',   (0, .28, .88, 1)),    # 엔딩 — 1년 뒤 감리
    'lab':       ('background/4.png',          (0, 0, 1, .78)),      # 돌발 업무 — 바이오 회사
    'server':    ('background/5.png',          (0, .05, 1, .78)),    # 돌발 업무 — IT · 데이터
}
# 인물 — 키는 CAST[].avatar.  face = 말풍선 아바타(정사각) · card = 인물 카드(4:5)
LEGACY_CAST = {
    'partner': ('character/*y7xgwl*.png', (.27, .14, .71, .58),    (.21, .11, .77, .81)),  # 정한별
    'manager': ('character/*ezl4cl*.png', (.285, .175, .685, .575), (.21, .14, .77, .84)),  # 유가온
    'staff':   ('character/*u7mguc*.png', (.30, .075, .67, .445),  (.21, .05, .77, .75)),  # 한결
    'cfo':     ('character/*llh6jv*.png', (.285, .185, .695, .595), (.21, .16, .77, .86)),  # 박정후
    'raon':    ('character/*99rduz*.png', (.30, .20, .70, .60),    (.22, .16, .78, .86)),  # 최도현 (라온바이오)
    'nexton':  ('character/*hktgp6*.png', (.405, .09, .59, .43),   (.357, .06, .636, .70)),  # 이선 콜 (넥스턴)
}

# ── 새 이미지의 기본 구도 (docs/image-prompts.md 가 이 구도로 그리게 한다) ──
# 인물: 1:1 정사각, 얼굴이 가로 가운데, 눈높이가 위에서 38% 즈음
DEFAULT_FACE = (.28, .12, .72, .56)
DEFAULT_CARD = (.22, .08, .78, .78)
# 장면: 21:9 가로. 아래쪽 생성기 표식 위에서 자른다
DEFAULT_SCENE = (0, .04, 1, .82)
# 파일별로 구도를 고쳐야 할 때만 적는다  예) 'sua': ((.3, .1, .7, .5), (.2, .05, .8, .8))
FACE_BOX = {}
SCENE_BOX = {}

SCENE_W = 1600
FACE, CARD = (160, 160), (400, 500)
MOODS = ('good', 'bad', 'tense')

# 홈 타이틀 — 세로 영상(720x1280)과 같은 구도의 정지 화면
TITLE_STILL = ('background/*h52uy7*.png', (.081, 0, .919, 1))
TITLE_VIDEO = 'background/*.mp4'


def source(pattern, required=True):
    hits = sorted(SRC.glob(pattern))
    if not hits:
        if required:
            raise SystemExit('원본이 없습니다: image/' + pattern)
        return None
    return hits[0]


def cut(path, box):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    l, t, r, b = box
    return im.crop((round(l * w), round(t * h), round(r * w), round(b * h)))


def save(im, name, size):
    im = im.resize(size, Image.LANCZOS)
    a = np.asarray(im, dtype=np.int16)
    chroma = np.maximum(abs(a[..., 0] - a[..., 1]), abs(a[..., 1] - a[..., 2])).max()
    if chroma <= 6:                      # 흑백 사진은 회색조로 저장하면 1/3 크기가 된다
        im = im.convert('L')
    dst = OUT / name
    im.save(dst, 'JPEG', quality=82, optimize=True, progressive=True)
    print(f'  {name:26} {size[0]}x{size[1]}  {dst.stat().st_size / 1024:6.0f} KB')


def scene(key, path, box):
    im = cut(path, box)
    save(im, f'scene-{key}.jpg', (SCENE_W, round(SCENE_W * im.height / im.width)))


def person(key, path, face, card, mood=None):
    if mood:
        save(cut(path, face), f'face-{key}-{mood}.jpg', FACE)
        return
    save(cut(path, face), f'face-{key}.jpg', FACE)
    save(cut(path, card), f'card-{key}.jpg', CARD)


NAME = re.compile(r'^([a-z][a-z0-9_]*)(?:-(good|bad|tense))?\.(png|jpe?g|webp)$', re.I)


def named(p):
    """규칙대로 이름 붙인 새 파일만 — 생성기 이름 그대로인 옛 원본은 위 표가 맡는다"""
    if p.name.lower().startswith('gemini_generated_image'):
        return None
    return NAME.match(p.name)


def main():
    OUT.mkdir(exist_ok=True)
    done_scene, done_face = set(), set()

    print('장면')
    for key, (pattern, box) in LEGACY_SCENES.items():
        p = source(pattern, required=False)
        if p:
            scene(key, p, box)
            done_scene.add(key)
    for p in sorted((SRC / 'background').glob('*')):
        m = named(p)
        if not m or m.group(2):
            continue
        key = m.group(1).lower()
        scene(key, p, SCENE_BOX.get(key, DEFAULT_SCENE))    # 같은 키면 새 파일이 덮어쓴다
        done_scene.add(key)

    print('인물')
    for key, (pattern, face, card) in LEGACY_CAST.items():
        p = source(pattern, required=False)
        if p:
            person(key, p, face, card)
            done_face.add(key)
    for p in sorted((SRC / 'character').glob('*')):
        m = named(p)
        if not m:
            continue
        key, mood = m.group(1).lower(), m.group(2)
        face, card = FACE_BOX.get(key, (DEFAULT_FACE, DEFAULT_CARD))
        if mood:
            # 표정은 기본 사진과 같은 구도 — 기본 사진이 옛 이름이면 그 구도를 따른다
            if key in LEGACY_CAST and key not in FACE_BOX:
                face = LEGACY_CAST[key][1]
            person(key, p, face, card, mood.lower())
        else:
            person(key, p, face, card)
            done_face.add(key)

    print('타이틀')
    p = source(TITLE_STILL[0], required=False)
    if p:
        save(cut(p, TITLE_STILL[1]), 'title.jpg', (720, 1280))
    v = source(TITLE_VIDEO, required=False)
    if v:
        shutil.copyfile(v, OUT / 'title.mp4')
        print(f'  {"title.mp4":26} (복사)')

    write_manifest()


def write_manifest():
    """assets/ 에 실제로 있는 파일로 목록을 만든다 — 게임은 이 목록만 믿는다"""
    names = [p.name for p in OUT.glob('*.jpg')]
    scene = sorted(n[6:-4] for n in names if n.startswith('scene-'))
    card = sorted(n[5:-4] for n in names if n.startswith('card-'))
    face, mood = [], {}
    for n in names:
        if not n.startswith('face-'):
            continue
        k = n[5:-4]
        m = re.match(r'^(.+)-(good|bad|tense)$', k)
        if m:
            mood.setdefault(m.group(1), []).append(m.group(2))
        else:
            face.append(k)
    face.sort()
    for k in mood:
        mood[k].sort()

    def js(a):
        return '[' + ', '.join("'" + x + "'" for x in a) + ']'
    body = ('/* tools/images.py 가 만든 파일 — 손으로 고치지 않는다 */\n'
            'window.ASSETS = {\n'
            f'  scene: {js(scene)},\n'
            f'  face: {js(face)},\n'
            f'  card: {js(card)},\n'
            '  mood: {' + ', '.join(f"{k}: {js(v)}" for k, v in sorted(mood.items())) + '}\n'
            '};\n')
    (OUT / 'manifest.js').write_text(body, encoding='utf-8')
    print(f'manifest.js — 장면 {len(scene)} · 인물 {len(face)} · 표정 {sum(len(v) for v in mood.values())}')


if __name__ == '__main__':
    main()
