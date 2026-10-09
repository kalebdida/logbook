"""Draw the app icons (PNG) from the same idea as assets/favicon.svg: a dark
tile with a phosphor-green ">_" prompt. Run once; the PNGs are committed.

    python3 scripts/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
BG = (5, 8, 6)
GREEN = (124, 232, 160)
EDGE = (57, 255, 140)
FONT_PATHS = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]


def font(size):
    for p in FONT_PATHS:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def draw_icon(size, maskable=False):
    scale = 4  # draw big, shrink: smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG + (255,))
        inner = 0.62  # keep the glyph inside the safe circle
    else:
        r = int(s * 0.19)
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG + (255,))
        pad = int(s * 0.035)
        edge = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(edge).rounded_rectangle([pad, pad, s - 1 - pad, s - 1 - pad], radius=r - pad, outline=EDGE + (90,), width=max(2, int(s * 0.012)))
        img = Image.alpha_composite(img, edge)
        inner = 0.78
    text = ">_"
    f = font(int(s * inner * 0.5))
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    x, y = (s - w) / 2 - box[0], (s - h) / 2 - box[1] + s * 0.01
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text((x, y), text, font=f, fill=GREEN + (150,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(s * 0.025)))
    ImageDraw.Draw(img).text((x, y), text, font=f, fill=GREEN + (255,))
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    for size in (192, 512, 1024):
        draw_icon(size).save(OUT / f"icon-{size}.png", optimize=True)
    draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png", optimize=True)
    apple = Image.new("RGBA", (180, 180), BG + (255,))
    apple.alpha_composite(draw_icon(180, maskable=True))
    apple.convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
