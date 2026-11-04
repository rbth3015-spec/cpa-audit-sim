#!/usr/bin/env python3
"""게임 소리를 굽는다. numpy 가 필요하다.

  python tools/audio.py                   assets/audio/ 의 곡을 적어 assets/audio.js 를 만든다
  python tools/audio.py --sfx <원본 폴더>   tools/sfx_picks.json 대로 잘라 assets/sfx.js 도 만든다

sfx_picks.json 형식 — 소리 이름마다 테이크 목록. start · dur 은 초, 없어도 된다
  { "stamp": [{ "file": "묶음/파일.wav", "start": 0.1, "dur": 0.4, "level": -20 }] }
level 은 게임에서 나는 크기 (LUFS, 100ms 창). 소리를 바꿔도 이 값으로 맞춰 구우므로 크기 균형이 유지된다.

앞뒤 무음은 잘라 낸다. 원본 음원은 저장소에 넣지 않는다 (라이선스 — docs/audio-prompts.md).
"""
import base64, io, json, os, struct, sys, wave

import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
AUDIO = os.path.join(ROOT, 'assets', 'audio')
PICKS = os.path.join(ROOT, 'tools', 'sfx_picks.json')
RATE = 32000          # 짧은 소리라 이 정도면 충분하다
OUT = 0.9             # js/fx.js 의 sbus — 파일 소리는 이만큼 줄어 나간다
LIMIT = 0.95          # 굽는 소리의 최고점 한도


def read_wav(path):
    """모노 배열과 표본율. PCM 8 · 16 · 24 · 32비트와 32비트 float WAV 를 읽는다."""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise ValueError('WAV 아님: ' + path)
    pos, fmt, body = 12, None, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack('<I', data[pos + 4:pos + 8])[0]
        if cid == b'fmt ':
            fmt = data[pos + 8:pos + 8 + size]
        elif cid == b'data':
            body = data[pos + 8:pos + 8 + size]
        pos += 8 + size + (size & 1)
    code, ch, rate = struct.unpack('<HHI', fmt[:8])
    bits = struct.unpack('<H', fmt[14:16])[0]
    if code == 0xFFFE:      # 확장 형식 — 실제 형식은 서브포맷 앞 2바이트
        code = struct.unpack('<H', fmt[24:26])[0]
    width = bits // 8
    usable = len(body) - len(body) % (width * ch)
    raw = np.frombuffer(body[:usable], dtype=np.uint8)
    if code == 3 and width == 4:
        x = np.frombuffer(body[:usable], dtype='<f4').astype(np.float64)
    elif width == 1:
        x = (raw.astype(np.float64) - 128) / 128.0
    elif width == 2:
        x = np.frombuffer(body[:usable], dtype='<i2') / 32768.0
    elif width == 3:
        b = raw.reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)
    elif width == 4:
        x = np.frombuffer(body[:usable], dtype='<i4') / float(1 << 31)
    else:
        raise ValueError('읽지 못하는 형식: %d %d' % (code, bits))
    return x.reshape(-1, ch).mean(axis=1), rate


def resample(x, src, dst):
    if src == dst or len(x) == 0:
        return x
    # 낮은 표본율로 내릴 때 접힘을 줄이려고 먼저 평균을 낸다
    n = max(1, int(src // (dst * 2)))
    if n > 1:
        x = np.convolve(x, np.ones(n) / n, mode='same')
    return np.interp(np.arange(0, len(x) * dst // src) * src / float(dst), np.arange(len(x)), x)


def biquad(x, b, a):
    y = np.zeros(len(x))
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        r = (b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0]
        x2, x1, y2, y1 = x1, v, y1, r
        y[i] = r
    return y


def loudness(x, rate, win=0.1):
    """K 가중(ITU-R BS.1770) 후 win 초 창에서 가장 큰 값. 짧은 소리도 재도록 창은 100ms 로 둔다."""
    A = 10 ** (3.999843853973347 / 40)
    w = 2 * np.pi * 1681.974450955533 / rate
    c, al = np.cos(w), np.sin(w) / (2 * 0.7071752369554196)
    r = 2 * np.sqrt(A) * al
    y = biquad(x, (A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)),
               ((A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r))
    w = 2 * np.pi * 38.13547087602444 / rate
    c, al = np.cos(w), np.sin(w) / (2 * 0.5003270373238773)
    y = biquad(y, ((1 + c) / 2, -(1 + c), (1 + c) / 2), (1 + al, -2 * c, 1 - al))
    n = int(rate * win)
    e = np.convolve(np.concatenate([y * y, np.zeros(n)]), np.ones(n) / n, mode='full')
    return -0.691 + 10 * np.log10(max(e.max(), 1e-12))


def trim(x, rate):
    """앞뒤 무음을 잘라 소리가 누르는 순간 바로 나게 한다."""
    env = np.abs(x)
    peak = env.max() if len(env) else 0
    if peak <= 0:
        return x
    loud = np.nonzero(env > peak * 0.02)[0]
    quiet = np.nonzero(env > peak * 0.004)[0]
    a = max(0, loud[0] - int(rate * 0.002))
    b = min(len(x), quiet[-1] + int(rate * 0.01))
    return x[a:b]


def bake(take, base):
    x, rate = read_wav(os.path.join(base, take['file']))
    start = int(take.get('start', 0) * rate)
    end = start + int(take['dur'] * rate) if 'dur' in take else len(x)
    x = trim(resample(x[start:end], rate, RATE), RATE)
    # 앞 2ms · 뒤 30ms 를 줄여 잘린 자리의 딸깍 소리를 없앤다
    fin, fout = min(int(RATE * 0.002), len(x)), min(int(RATE * 0.03), len(x))
    x = x.copy()
    x[:fin] *= np.linspace(0, 1, fin)
    x[len(x) - fout:] *= np.linspace(1, 0, fout)
    k = 10 ** ((take.get('level', -25) - loudness(x * OUT, RATE)) / 20)
    limit = LIMIT / max(np.abs(x).max(), 1e-6)
    if k > limit:
        print('  ! 최고점 한도로 목표 크기에 못 미침:', take['file'])
        k = limit
    x = x * k
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    return buf.getvalue()


def build_sfx(base):
    picks = json.load(open(PICKS, encoding='utf-8'))
    data, total = {}, 0
    for name in sorted(picks):
        for i, take in enumerate(picks[name], 1):
            raw = bake(take, base)
            total += len(raw)
            data['%s.%d' % (name, i)] = base64.b64encode(raw).decode('ascii')
            print('  %-10s %-2d %6.1f KB  목표 %s LUFS' % (name, i, len(raw) / 1024.0, take.get('level', -25)))
    with open(os.path.join(ROOT, 'assets', 'sfx.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* tools/audio.py 가 만든 파일 — 손으로 고치지 않는다 */\n')
        f.write('window.SFX_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('효과음 %d개 %.0f KB' % (len(data), total / 1024.0))


def main():
    if '--sfx' in sys.argv:
        build_sfx(sys.argv[sys.argv.index('--sfx') + 1])
    tracks = {}
    if os.path.isdir(AUDIO):
        for fn in sorted(os.listdir(AUDIO)):
            stem, ext = os.path.splitext(fn)
            if ext.lower() in ('.mp3', '.m4a', '.ogg', '.wav'):
                tracks[stem] = fn
    sfx = os.path.exists(os.path.join(ROOT, 'assets', 'sfx.js'))
    with open(os.path.join(ROOT, 'assets', 'audio.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* tools/audio.py 가 만든 파일 — 손으로 고치지 않는다 */\n')
        f.write('window.AUDIO = ' + json.dumps({'tracks': tracks, 'sfx': sfx}, ensure_ascii=False) + ';\n')
    print('곡 %d개, 효과음 파일 %s' % (len(tracks), '있음' if sfx else '없음'))


if __name__ == '__main__':
    main()
