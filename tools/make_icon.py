# -*- coding: utf-8 -*-
"""生成 JHELIX 应用图标：512px PNG + 多尺寸 ICO。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "ui" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 512
SCALE = 2
W = SIZE * SCALE

img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 深空渐变底板
top = (14, 21, 36)
bottom = (7, 11, 20)
grad = Image.new("RGBA", (W, W))
gd = ImageDraw.Draw(grad)
for y in range(W):
    t = y / max(1, W - 1)
    gd.line(
        [(0, y), (W, y)],
        fill=(
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t),
            255,
        ),
    )

mask = Image.new("L", (W, W), 0)
md = ImageDraw.Draw(mask)
pad = 26 * SCALE
md.rounded_rectangle([pad, pad, W - pad, W - pad], radius=108 * SCALE, fill=255)
img.paste(grad, (0, 0), mask)

# 边缘光
edge = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ed = ImageDraw.Draw(edge)
ed.rounded_rectangle(
    [pad, pad, W - pad, W - pad],
    radius=108 * SCALE,
    outline=(201, 245, 106, 92),
    width=3 * SCALE,
)
img = Image.alpha_composite(img, edge)

# 左上角极光
glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
gd2 = ImageDraw.Draw(glow)
gd2.ellipse(
    [-120 * SCALE, -150 * SCALE, 330 * SCALE, 260 * SCALE],
    fill=(94, 234, 212, 54),
)
gd2.ellipse(
    [180 * SCALE, 250 * SCALE, 640 * SCALE, 700 * SCALE],
    fill=(201, 245, 106, 34),
)
glow = glow.filter(ImageFilter.GaussianBlur(46 * SCALE))
img = Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", (W, W), (0, 0, 0, 0)), mask))

draw = ImageDraw.Draw(img)

# 字体
def font(size, bold=True):
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


# 主字「JH」
f_main = font(190 * SCALE, True)
text = "JH"
box = draw.textbbox((0, 0), text, font=f_main)
tw, th = box[2] - box[0], box[3] - box[1]
tx = (W - tw) / 2 - box[0]
ty = 180 * SCALE - box[1]
# 光晕
shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.text((tx, ty), text, font=f_main, fill=(201, 245, 106, 130))
shadow = shadow.filter(ImageFilter.GaussianBlur(18 * SCALE))
img = Image.alpha_composite(img, shadow)
draw = ImageDraw.Draw(img)
draw.text((tx, ty), text, font=f_main, fill=(216, 250, 140, 255))

# 下划线
line_w = 176 * SCALE
line_y = 408 * SCALE
draw.rounded_rectangle(
    [(W - line_w) / 2, line_y, (W + line_w) / 2, line_y + 7 * SCALE],
    radius=4 * SCALE,
    fill=(94, 234, 212, 225),
)

# 底部 CET-4
f_sub = font(38 * SCALE, True)
sub = "CET-4"
sb = draw.textbbox((0, 0), sub, font=f_sub)
sw = sb[2] - sb[0]
draw.text(((W - sw) / 2 - sb[0], 431 * SCALE), sub, font=f_sub, fill=(160, 178, 203, 235))

img = img.resize((SIZE, SIZE), Image.LANCZOS)
png_path = OUT / "favicon.png"
img.save(png_path, "PNG")

ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(OUT / "favicon.ico", format="ICO", sizes=ico_sizes)

print("icon ->", png_path)
print("icon ->", OUT / "favicon.ico")
