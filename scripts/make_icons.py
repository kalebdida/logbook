"""Draw the app icons and the Android icon/splash sources from one SVG idea:
Fuji under a crescent moon, a warm window at its foot, on a night-blue tile.
Rendered with Playwright's Chromium, so every size is crisp. Run once; the
PNGs are committed.

    python3 scripts/make_icons.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
RES = ROOT / "resources"

SKY = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060c22"/><stop offset=".65" stop-color="#0d1b44"/><stop offset="1" stop-color="#22396c"/></linearGradient>'
DEFS = (
    "<defs>" + SKY +
    '<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a5288"/><stop offset="1" stop-color="#121f45"/></linearGradient>'
    '<linearGradient id="snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f6fc"/><stop offset="1" stop-color="#a9badc"/></linearGradient>'
    '<radialGradient id="glow"><stop offset="0" stop-color="#f6e7c4" stop-opacity=".2"/><stop offset="1" stop-color="#f6e7c4" stop-opacity="0"/></radialGradient>'
    '<radialGradient id="warm" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#f4c56c" stop-opacity=".55"/><stop offset="1" stop-color="#f4c56c" stop-opacity="0"/></radialGradient>'
    '<mask id="moon"><circle cx="0" cy="0" r="1" fill="#fff"/><circle cx=".42" cy="-.3" r=".86" fill="#000"/></mask>'
    "</defs>"
)


def mark():
    """The drawing in a 100x100 box (no background)."""
    return (
        '<g fill="#fff" opacity=".85"><circle cx="18" cy="20" r=".7"/><circle cx="30" cy="11" r=".5"/><circle cx="44" cy="24" r=".6"/>'
        '<circle cx="58" cy="9" r=".5"/><circle cx="12" cy="40" r=".5"/><circle cx="88" cy="42" r=".6"/><circle cx="52" cy="34" r=".4"/></g>'
        '<circle cx="72" cy="23" r="16" fill="url(#glow)"/>'
        '<g transform="translate(72 23) scale(8.5)"><circle r="1" fill="#f6ecd2" mask="url(#moon)"/></g>'
        '<path d="M2 86 C 20 80 34 62 44 49 L 47 45.5 Q 50 44 53 45.5 L 56 49 C 66 62 80 80 98 86 Z" fill="url(#body)"/>'
        '<path d="M39.5 55 C 42 52 43.5 50.5 44 49 L 47 45.5 Q 50 44 53 45.5 L 56 49 C 56.5 50.5 58 52 60.5 55 L 58.6 56 L 57 54.6 L 55.4 59 L 53.8 56 L 52 61.5 L 50.4 57 L 48.6 62 L 46.8 56.5 L 45 59.5 L 43.4 55.6 L 41.6 57 Z" fill="url(#snow)"/>'
        '<rect y="85.5" width="100" height="15" fill="#070d22"/>'
        '<ellipse cx="50" cy="95" rx="22" ry="5" fill="url(#warm)"/>'
        '<rect x="42" y="82" width="16" height="11" fill="#070d22"/>'
        '<rect x="42" y="82" width="16" height="2" fill="#4f88d6"/>'
        '<rect x="43.4" y="85.6" width="13.2" height="5.4" rx=".4" fill="#f4c56c"/>'
        '<g fill="#070d22" opacity=".45"><rect x="47.6" y="85.6" width=".5" height="5.4"/><rect x="51.9" y="85.6" width=".5" height="5.4"/></g>'
    )


def svg(size, background=True, inset=1.0, radius=0.22, transparent=False):
    """inset < 1 shrinks the drawing toward the middle (safe zones)."""
    off = (1 - inset) * 50
    bg = "" if transparent else (
        '<rect width="100" height="100" rx="%s" fill="url(#sky)"/>' % (radius * 100) if background else ""
    )
    inner = '<g transform="translate(%s %s) scale(%s)">%s</g>' % (off, off, inset, mark()) if inset != 1 else mark()
    clip = '<clipPath id="tile"><rect width="100" height="100" rx="%s"/></clipPath>' % (radius * 100)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 100 100">%s%s%s<g clip-path="url(#tile)">%s</g></svg>'
        % (size, size, DEFS, clip, bg, inner)
    )


def splash(size):
    s = size
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 100 100">%s'
        '<rect width="100" height="100" fill="url(#sky)"/><g transform="translate(36 36) scale(.28)">%s</g></svg>'
        % (s, s, DEFS, mark())
    )


def render(page, markup, path, size, opaque=False):
    page.set_viewport_size({"width": size, "height": size})
    page.set_content('<html><body style="margin:0;background:transparent">%s</body></html>' % markup)
    page.screenshot(path=str(path), omit_background=not opaque, clip={"x": 0, "y": 0, "width": size, "height": size})


def main():
    ASSETS.mkdir(exist_ok=True)
    RES.mkdir(exist_ok=True)
    (ASSETS / "favicon.svg").write_text(svg(32).replace(' width="32" height="32"', "") + "\n")
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        for size in (192, 512, 1024):
            render(page, svg(size), ASSETS / f"icon-{size}.png", size)
        render(page, svg(512, radius=0), ASSETS / "icon-maskable-512.png", 512, opaque=True)
        render(page, svg(180, radius=0), ASSETS / "apple-touch-icon.png", 180, opaque=True)
        render(page, svg(1024), RES / "icon-only.png", 1024)
        render(page, svg(1024, transparent=True, inset=0.62, radius=0), RES / "icon-foreground.png", 1024)
        render(page, '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">%s<rect width="100" height="100" fill="url(#sky)"/></svg>' % DEFS,
               RES / "icon-background.png", 1024, opaque=True)
        render(page, splash(2732), RES / "splash.png", 2732, opaque=True)
        render(page, splash(2732), RES / "splash-dark.png", 2732, opaque=True)
        b.close()
    print("icons written to", ASSETS, "and", RES)


if __name__ == "__main__":
    main()
