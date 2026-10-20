"""Renders the Bhaktigram mark (lotus + wordmark, white text over a soft dark halo,
78% opacity) at every unit height from 14 to 36 px, as PNGs with alpha."""
import base64, io, json, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LOTUS = "/Users/mohitsengarr/bg-build/assets/brand/lotus-mark.png"
FONT = "/Users/mohitsengarr/bg-build/node_modules/@expo-google-fonts/comfortaa/600SemiBold/Comfortaa_600SemiBold.ttf"
OPACITY = 0.78

def mark(h):
    S = 4  # draw at 4x, then downsample with Lanczos for clean edges
    H = h * S
    font = ImageFont.truetype(FONT, round(H * 0.95))
    lotus = Image.open(LOTUS).convert("RGBA")
    lh = round(H * 1.15); lw = round(lotus.width * lh / lotus.height)
    lotus = lotus.resize((lw, lh), Image.LANCZOS)
    text = "Bhaktigram"
    tb = font.getbbox(text); tw, th = tb[2] - tb[0], tb[3] - tb[1]
    gap = round(H * 0.35); pad = 4 * S
    mw, mh = lw + gap + tw, max(lh, th)
    out = Image.new("RGBA", (mw + 2 * pad, mh + 2 * pad), (0, 0, 0, 0))
    tx, ty = pad + lw + gap - tb[0], pad + (mh - th) // 2 - tb[1]
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((tx, ty), text, font=font, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, H // 8)))
    out.alpha_composite(shadow)
    out.alpha_composite(lotus, (pad, pad + (mh - lh) // 2))
    ImageDraw.Draw(out).text((tx, ty), text, font=font, fill=(255, 255, 255, 235))
    out = out.resize((round(out.width / S), round(out.height / S)), Image.LANCZOS)
    out.putalpha(out.getchannel("A").point(lambda a: round(a * OPACITY)))
    b = io.BytesIO(); out.save(b, "PNG", optimize=True)
    return out.size, base64.b64encode(b.getvalue()).decode()

marks = {}
total = 0
for h in range(14, 37):
    size, b64 = mark(h)
    marks[h] = {"w": size[0], "h": size[1], "png": b64}
    total += len(b64)
json.dump(marks, open(sys.argv[1], "w"))
print("sizes", {h: (m["w"], m["h"]) for h, m in list(marks.items())[::5]}, "total base64 chars", total)
