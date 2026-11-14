# -*- coding: utf-8 -*-
"""Baut das TV-Anrath-Handball-Logo als echte Vektorgrafik (SVG) nach und
rendert daraus alle App-Icons. Schrift wird in Pfade umgewandelt, damit das
Logo auf jedem Geraet gleich aussieht.

Aufruf (aus dem Repo-Hauptordner):  python3 tools/build_logo.py
Benoetigt: fonttools, Node mit playwright (Chromium), FreeFont (FreeSerif/FreeSans).
"""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = TTFont("/usr/share/fonts/truetype/freefont/FreeSerifBoldItalic.ttf")
FONT_SANS = TTFont("/usr/share/fonts/truetype/freefont/FreeSansBold.ttf")

GREEN = "#2A9138"      # Vereinsgruen aus dem Logo
GREEN_DARK = "#1B5E26"
INK = "#0A0F0B"        # Vereinsschwarz
WHITE = "#FFFFFF"

def _num(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")

def glyph(font, ch, size, transform):
    """Pfad eines Zeichens. transform = (a,b,c,d,e,f) fuer Font-Einheiten*size."""
    gs = font.getGlyphSet(); g = font.getBestCmap()[ord(ch)]
    s = size / font["head"].unitsPerEm
    a, b, c, d, e, f = transform
    pen = SVGPathPen(gs, ntos=_num)
    gs[g].draw(TransformPen(pen, (a * s, b * s, c * s, d * s, e, f)))
    return pen.getCommands(), font["hmtx"][g][0] * s

def advance(font, ch, size):
    return font["hmtx"][font.getBestCmap()[ord(ch)]][0] * size / font["head"].unitsPerEm

def text_line(font, txt, cx, baseline, size, track=0.0):
    w = sum(advance(font, c, size) for c in txt) + track * (len(txt) - 1)
    x = cx - w / 2; out = []
    for c in txt:
        p, adv = glyph(font, c, size, (1, 0, 0, -1, x, baseline))
        out.append(p); x += adv + track
    return " ".join(out)

def text_arc(font, txt, cx, cy, r, size, track=0.0, inside=False):
    """Text auf Kreisbogen, mittig oben (inside=False) bzw. unten laechelnd (inside=True)."""
    advs = [advance(font, c, size) for c in txt]
    total = sum(advs) + track * (len(txt) - 1)
    pos = -total / 2; out = []
    for c, adv in zip(txt, advs):
        mid = pos + adv / 2
        ang = mid / r                       # Bogenmass relativ zur Mitte
        if not inside:                      # Text oben auf dem Bogen, Fuss zur Mitte
            px, py = cx + r * math.sin(ang), cy - r * math.cos(ang)
            ca, sa = math.cos(ang), math.sin(ang)
        else:                               # Text unten, Kopf zur Mitte
            px, py = cx - r * math.sin(-ang), cy + r * math.cos(ang)
            ca, sa = math.cos(-ang), math.sin(-ang)
        # lokales Koordinatensystem: x entlang Tangente, y nach unten
        # Glyph-Ursprung um adv/2 nach links verschieben
        ox = px - ca * adv / 2; oy = py - sa * adv / 2
        p, _ = glyph(font, c, size, (ca, sa, sa, -ca, ox, oy))
        out.append(p); pos += adv + track
    return " ".join(out)

def logo_svg(size=1024, background=True, pad=0):
    """Komplettes Logo. pad = Rand in Prozent (fuer maskierbare Icons)."""
    k = 1 - 2 * pad / 100
    g = []
    g.append('<defs>'
             '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
             f'<stop offset="0" stop-color="{GREEN}"/><stop offset=".38" stop-color="{GREEN_DARK}"/>'
             '<stop offset=".72" stop-color="#0E1F10"/><stop offset="1" stop-color="#030604"/></linearGradient>'
             '<linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">'
             f'<stop offset="0" stop-color="{GREEN}"/><stop offset=".55" stop-color="{GREEN}" stop-opacity=".0"/></linearGradient>'
             '</defs>')
    if background:
        g.append('<rect width="1024" height="1024" fill="url(#bg)"/>')
    g.append(f'<g transform="translate({512*(1-k):.1f} {512*(1-k):.1f}) scale({k:.4f})">')
    # gruener Ring hinter dem Oval
    g.append('<ellipse cx="512" cy="482" rx="470" ry="350" fill="url(#ring)"/>')
    # Oval
    g.append(f'<ellipse cx="512" cy="478" rx="432" ry="308" fill="{WHITE}" stroke="{INK}" stroke-width="14"/>')
    # Bogenschrift oben
    arc = text_arc(FONT, "TURNVEREIN ANRATH", 512, 905, 728, 84, track=2)
    g.append(f'<path d="{arc}" fill="{WHITE}" stroke="{INK}" stroke-width="7" paint-order="stroke" stroke-linejoin="round"/>')
    # T (mit leichtem Schlagschatten wie im Original)
    T = "M215 358 H520 L482 440 H352 V716 H286 V440 H215 Z"
    g.append(f'<path d="{T}" transform="translate(-9 9)" fill="{GREEN_DARK}"/>')
    g.append(f'<path d="{T}" fill="{INK}"/>')
    # A mit breitem rechten Stamm und Gruendungsjahr
    A = ("M548 722 L732 360 H810 V722 H732 V662 H630 L606 722 Z "
         "M656 604 H732 V454 Z")
    g.append(f'<path d="{A}" transform="translate(-9 9)" fill="{GREEN_DARK}" fill-rule="evenodd"/>')
    g.append(f'<path d="{A}" fill="{INK}" fill-rule="evenodd"/>')
    for i, ch in enumerate("1899"):
        g.append(f'<path d="{text_line(FONT_SANS, ch, 771, 470 + i * 70, 62)}" fill="{WHITE}"/>')
    # Haken
    V = ("M366 522 C364 498 392 480 418 486 C440 491 466 528 492 572 "
         "L728 262 C738 250 752 244 770 244 L506 724 C498 738 480 740 470 726 "
         "L380 560 C372 548 367 536 366 522 Z")
    g.append(f'<path d="{V}" fill="none" stroke="{WHITE}" stroke-width="22" stroke-linejoin="round"/>')
    g.append(f'<path d="{V}" fill="{GREEN}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>')
    # Motto
    motto = text_arc(FONT, "~ mehr als nur Sport", 512, -340, 1110, 38, track=1, inside=True)
    g.append(f'<path d="{motto}" fill="{INK}"/>')
    g.append('</g>')
    if background:
        hb = text_line(FONT, "HANDBALL", 512, 948, 82, track=4)
        g.append(f'<path d="{hb}" fill="{WHITE}" stroke="{INK}" stroke-width="6" paint-order="stroke" stroke-linejoin="round"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="{size}" height="{size}">'
            + "".join(g) + '</svg>')

def main():
    import json, subprocess, tempfile
    svg = logo_svg()
    with open(os.path.join(ROOT, "tv-anrath-logo.svg"), "w") as f:
        f.write(svg)
    tmp = tempfile.mkdtemp()
    jobs = []
    for name, px, s in [("icon-180.png", 180, svg), ("icon-192.png", 192, svg), ("icon-512.png", 512, svg),
                        ("icon-maskable-512.png", 512, mask_svg()), ("tv-anrath-logo.png", 256, svg),
                        ("favicon-32.png", 32, svg)]:
        src = os.path.join(tmp, name + ".svg")
        with open(src, "w") as f:
            f.write(s.replace('width="1024" height="1024"', f'width="{px}" height="{px}"', 1))
        jobs.append({"src": src, "px": px, "out": os.path.join(ROOT, name)})
    subprocess.run(["node", os.path.join(ROOT, "tools", "render.js"), json.dumps(jobs)], check=True)

def mask_svg():
    """Maskierbares Icon (Android): Inhalt im sicheren Kreis (80 %)."""
    inner = logo_svg(background=False, pad=0)
    body = inner[inner.index('>') + 1:-6]
    hb = text_line(FONT, "HANDBALL", 512, 948, 82, track=4)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            + body.split('</defs>')[0] + '</defs><rect width="1024" height="1024" fill="url(#bg)"/>'
            + '<g transform="translate(112 102) scale(.78)">' + body.split('</defs>')[1]
            + f'<path d="{hb}" fill="{WHITE}" stroke="{INK}" stroke-width="6" paint-order="stroke"/></g></svg>')

if __name__ == "__main__":
    main()
