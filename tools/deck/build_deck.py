"""
Generate the STLS Hybrid project presentation as a real .pptx file.

Usage:
    python build_deck.py

Outputs to ../../docs/STLS-Hybrid.pptx
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt, Emu

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "deck-shots"
OUT = ROOT / "docs" / "STLS-Hybrid.pptx"

# ────────────────────────── Palette (matches the Studio dark theme)
BG          = RGBColor(0x05, 0x07, 0x09)  # canvas
PANEL       = RGBColor(0x0A, 0x0D, 0x10)  # surface-1
PANEL_2     = RGBColor(0x0E, 0x13, 0x18)  # surface-2
STROKE      = RGBColor(0x1A, 0x20, 0x27)
ACCENT      = RGBColor(0xFF, 0xB5, 0x47)  # SEA amber
ACCENT_INK  = RGBColor(0x14, 0x10, 0x0A)
INK_0       = RGBColor(0xF3, 0xF7, 0xF1)
INK_1       = RGBColor(0xD8, 0xDD, 0xE3)
INK_2       = RGBColor(0x8A, 0x92, 0x9E)
INK_3       = RGBColor(0x5A, 0x64, 0x70)
GREEN_INK   = RGBColor(0xA8, 0xEA, 0xC2)
GREEN_BG    = RGBColor(0x0D, 0x19, 0x13)
RED_INK     = RGBColor(0xFF, 0x9A, 0x9A)
RED_BG      = RGBColor(0x18, 0x0D, 0x0D)
INFO_INK    = RGBColor(0x8E, 0xD2, 0xEF)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

# ────────────────────────── Slide builders

def _solid(shape, color: RGBColor) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def _outlined(shape, fill: RGBColor, stroke: RGBColor, width_pt: float = 0.75) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = stroke
    shape.line.width = Pt(width_pt)


def _run(tf, text: str, *, size: int, color: RGBColor, bold: bool = False,
         mono: bool = False, spacing: float = 1.0, first: bool = False) -> None:
    para = tf.paragraphs[0] if first else tf.add_paragraph()
    para.alignment = PP_ALIGN.LEFT
    para.line_spacing = spacing
    run = para.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    if mono:
        run.font.name = "Consolas"
    else:
        run.font.name = "Calibri"


def paint_background(slide, *, panel: bool = False) -> None:
    """Paint the slide with the dark app-surface colour."""
    bg = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H
    )
    _solid(bg, PANEL if panel else BG)


def add_chrome(slide, *, eyebrow: str, title: str, kicker: str | None = None) -> None:
    """Adds the recurring brand chrome at the top of a content slide."""
    # Accent brand tile (top-left)
    tile = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.55), Inches(0.45),
        Inches(0.38), Inches(0.38)
    )
    _outlined(tile, ACCENT_INK, ACCENT, width_pt=1.0)
    tile.text_frame.margin_left = 0
    tile.text_frame.margin_right = 0
    tile.text_frame.margin_top = 0
    tile.text_frame.margin_bottom = 0
    tp = tile.text_frame.paragraphs[0]
    tp.alignment = PP_ALIGN.CENTER
    tr = tp.add_run()
    tr.text = "◆"
    tr.font.size = Pt(14)
    tr.font.color.rgb = ACCENT
    tr.font.bold = True

    # Brand wordmark
    mark = slide.shapes.add_textbox(Inches(1.02), Inches(0.46),
                                    Inches(3.2), Inches(0.4))
    mark.text_frame.margin_left = 0
    mark.text_frame.margin_top = 0
    _run(mark.text_frame, "STLS HYBRID", size=12, color=INK_0,
         bold=True, first=True)

    # Eyebrow / section tag (centre-top)
    if eyebrow:
        eb = slide.shapes.add_textbox(Inches(5.0), Inches(0.5),
                                      Inches(6.5), Inches(0.3))
        eb.text_frame.margin_left = 0
        eb.text_frame.margin_top = 0
        _run(eb.text_frame, eyebrow.upper(), size=9, color=ACCENT,
             bold=True, first=True)

    # Title row
    tbox = slide.shapes.add_textbox(
        Inches(0.55), Inches(0.95), Inches(12.3), Inches(1.1)
    )
    tf = tbox.text_frame
    tf.margin_left = 0
    tf.word_wrap = True
    _run(tf, title, size=32, color=INK_0, bold=True, first=True)
    if kicker:
        _run(tf, kicker, size=14, color=INK_2, spacing=1.15)

    # Accent underline
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.55), Inches(1.98),
        Inches(0.9), Inches(0.04)
    )
    _solid(rule, ACCENT)


def add_footer(slide, *, pagenum: int, total: int) -> None:
    foot = slide.shapes.add_textbox(
        Inches(0.55), Inches(7.1), Inches(12.3), Inches(0.3)
    )
    tf = foot.text_frame
    tf.margin_left = 0
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    r = p.add_run()
    r.text = "STLS Hybrid · Smart Traffic Light System"
    r.font.size = Pt(9)
    r.font.color.rgb = INK_3
    r.font.name = "Calibri"

    pg = slide.shapes.add_textbox(
        Inches(12.0), Inches(7.1), Inches(1.2), Inches(0.3)
    )
    tfp = pg.text_frame
    p2 = tfp.paragraphs[0]
    p2.alignment = PP_ALIGN.RIGHT
    r2 = p2.add_run()
    r2.text = f"{pagenum:02d} / {total:02d}"
    r2.font.size = Pt(9)
    r2.font.color.rgb = INK_3
    r2.font.name = "Consolas"


def add_image_frame(slide, path: Path, *, left: float, top: float,
                    width: float, height: float) -> None:
    """Add an image with an accent border / panel behind it."""
    # Subtle outer frame (accent-edge)
    frame = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(left - 0.04), Inches(top - 0.04),
        Inches(width + 0.08), Inches(height + 0.08)
    )
    _outlined(frame, PANEL, STROKE, width_pt=0.75)
    # Inner accent hair-line at the top
    hair = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(left - 0.04), Inches(top - 0.04),
        Inches(width + 0.08), Inches(0.03)
    )
    _solid(hair, ACCENT)

    slide.shapes.add_picture(
        str(path), Inches(left), Inches(top),
        Inches(width), Inches(height)
    )


def add_bullets(slide, bullets: Sequence[tuple[str, str]], *,
                left: float, top: float, width: float) -> None:
    box = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(4.5)
    )
    tf = box.text_frame
    tf.margin_left = 0
    tf.word_wrap = True
    for idx, (head, body) in enumerate(bullets):
        # Head
        p_head = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p_head.alignment = PP_ALIGN.LEFT
        r1 = p_head.add_run()
        r1.text = "▸  "
        r1.font.size = Pt(13)
        r1.font.color.rgb = ACCENT
        r1.font.bold = True
        r1.font.name = "Calibri"
        r2 = p_head.add_run()
        r2.text = head
        r2.font.size = Pt(13)
        r2.font.color.rgb = INK_0
        r2.font.bold = True
        r2.font.name = "Calibri"

        # Body
        p_body = tf.add_paragraph()
        p_body.alignment = PP_ALIGN.LEFT
        p_body.level = 0
        p_body.space_after = Pt(8)
        r3 = p_body.add_run()
        r3.text = "     " + body
        r3.font.size = Pt(11)
        r3.font.color.rgb = INK_1
        r3.font.name = "Calibri"


def add_kbd_chip(slide, *, left: float, top: float, label: str) -> None:
    w = 0.42
    h = 0.32
    chip = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(left), Inches(top), Inches(w), Inches(h)
    )
    chip.adjustments[0] = 0.2
    _outlined(chip, PANEL_2, STROKE, width_pt=0.75)
    chip.text_frame.margin_left = 0
    chip.text_frame.margin_right = 0
    chip.text_frame.margin_top = Emu(0)
    chip.text_frame.margin_bottom = Emu(0)
    chip.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = chip.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    r.font.size = Pt(9)
    r.font.color.rgb = INK_1
    r.font.bold = True
    r.font.name = "Consolas"


def add_token_chip(slide, *, left: float, top: float, name: str,
                   colour: RGBColor) -> None:
    sw = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(left), Inches(top), Inches(0.42), Inches(0.42)
    )
    sw.adjustments[0] = 0.2
    _outlined(sw, colour, STROKE, width_pt=0.5)
    lbl = slide.shapes.add_textbox(
        Inches(left + 0.5), Inches(top + 0.02),
        Inches(2.3), Inches(0.4)
    )
    lbl.text_frame.margin_left = 0
    _run(lbl.text_frame, name, size=10, color=INK_1, mono=True, first=True)


# ────────────────────────── Slides

def cover(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)

    # Left column — wordmark + title + subtitle
    brand = slide.shapes.add_textbox(Inches(0.8), Inches(0.7),
                                     Inches(6.5), Inches(0.5))
    _run(brand.text_frame, "STLS HYBRID", size=14, color=ACCENT,
         bold=True, first=True)

    sub = slide.shapes.add_textbox(Inches(0.8), Inches(1.15),
                                   Inches(7.0), Inches(0.4))
    _run(sub.text_frame,
         "SMART TRAFFIC LIGHT SYSTEM · ROYAUME DU MAROC",
         size=10, color=INK_3, bold=True, first=True)

    title = slide.shapes.add_textbox(Inches(0.8), Inches(2.2),
                                     Inches(11.5), Inches(2.8))
    tf = title.text_frame
    tf.word_wrap = True
    _run(tf, "Traffic signal engineering,", size=44, color=INK_0,
         bold=True, first=True)
    _run(tf, "control, and runtime — in one product.",
         size=44, color=INK_0, bold=True)
    _run(tf,
         "A web dashboard, a desktop engineering + control tool, "
         "and a field controller runtime.",
         size=16, color=INK_2, spacing=1.2)

    # Accent rule
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.1),
        Inches(1.4), Inches(0.05)
    )
    _solid(rule, ACCENT)

    # Diamond mark (decorative)
    tile = slide.shapes.add_shape(
        MSO_SHAPE.DIAMOND, Inches(11.8), Inches(0.8),
        Inches(0.7), Inches(0.7)
    )
    _outlined(tile, ACCENT_INK, ACCENT, width_pt=1.25)

    # Footer meta
    meta = slide.shapes.add_textbox(Inches(0.8), Inches(6.8),
                                    Inches(11.5), Inches(0.4))
    _run(meta.text_frame,
         "Internal project deck · Engineering + Operations",
         size=10, color=INK_3, first=True)


def agenda(prs: Presentation, total: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Agenda",
               title="What this deck covers",
               kicker=None)

    items = [
        ("01", "Product & positioning",
         "Why STLS exists and the three products that ship together."),
        ("02", "Architecture",
         "Operations dashboard, Desktop Studio, Controller runtime."),
        ("03", "Engineering mode",
         "Configure an intersection end-to-end: identity, approaches, "
         "signal groups, phases, detectors, controller, live schematic."),
        ("04", "Control mode",
         "SEA/TOPS-style operator console — diagram, timing strip, "
         "piano keys, keyboard shortcuts."),
        ("05", "Theme architecture",
         "Dark and light mode built on semantic tokens."),
        ("06", "Stack & status",
         "Technology choices and what comes next."),
    ]

    top = 2.4
    for idx, (num, head, body) in enumerate(items):
        y = top + idx * 0.68
        # Number chip
        chip = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(0.55), Inches(y),
            Inches(0.7), Inches(0.5)
        )
        _outlined(chip, ACCENT_INK, ACCENT, width_pt=1.0)
        chip.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = chip.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = num
        r.font.size = Pt(14)
        r.font.color.rgb = ACCENT
        r.font.bold = True
        r.font.name = "Consolas"

        txt = slide.shapes.add_textbox(
            Inches(1.4), Inches(y - 0.02),
            Inches(11.4), Inches(0.7)
        )
        _run(txt.text_frame, head, size=15, color=INK_0,
             bold=True, first=True)
        _run(txt.text_frame, body, size=11, color=INK_2, spacing=1.1)


def positioning(prs: Presentation, total: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Product positioning",
               title="What STLS is — and what it isn't",
               kicker=None)

    # Two columns: IS / IS NOT
    left = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.55), Inches(2.3),
        Inches(6.1), Inches(4.6)
    )
    left.adjustments[0] = 0.03
    _outlined(left, PANEL, STROKE, width_pt=0.75)
    right = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.85), Inches(2.3),
        Inches(6.1), Inches(4.6)
    )
    right.adjustments[0] = 0.03
    _outlined(right, PANEL, STROKE, width_pt=0.75)

    # Left header
    hl = slide.shapes.add_textbox(Inches(0.9), Inches(2.45),
                                  Inches(5.7), Inches(0.4))
    _run(hl.text_frame, "STLS IS", size=11, color=GREEN_INK,
         bold=True, first=True)
    # Right header
    hr = slide.shapes.add_textbox(Inches(7.2), Inches(2.45),
                                  Inches(5.7), Inches(0.4))
    _run(hr.text_frame, "STLS IS NOT", size=11, color=RED_INK,
         bold=True, first=True)

    add_bullets(slide, [
        ("Traffic-signal engineering software",
         "Configure phases, stages, signal groups, conflict matrix."),
        ("An operator control room",
         "Play traffic lights like a piano during incidents and peaks."),
        ("A field controller runtime",
         "Run the intersection 24/7 on the device in the cabinet."),
    ], left=0.9, top=2.9, width=5.7)

    add_bullets(slide, [
        ("Not an AI research dashboard",
         "No ML panels, no black-box decisions."),
        ("Not a city analytics platform",
         "No KPIs, no long-tail charts. Operators first."),
        ("Not a replacement for SCADA monitoring",
         "The Operations dashboard is for supervision, not control."),
    ], left=7.2, top=2.9, width=5.7)


def architecture(prs: Presentation, total: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Architecture",
               title="Three products, one system",
               kicker="Each surface is focused on the audience it serves.")

    columns = [
        (ACCENT,      INFO_INK, "Operations",
         "Web dashboard for police, district supervisors, and C2.",
         ["Live map & alerts",
          "Hardware health",
          "Read-mostly view"]),
        (ACCENT,      INFO_INK, "Studio · Desktop",
         "Engineering + Control tool — SEA/TOPS style.",
         ["Intersection editor",
          "Apply / Pull to runtime",
          "Piano-key operator console"]),
        (ACCENT,      INFO_INK, "Controller Runtime",
         "Standalone Go process that runs in the field cabinet.",
         ["Cycle simulator",
          "Socket.IO live state",
          "Offline fall-back"]),
    ]

    for idx, (accent, info, name, tag, bullets) in enumerate(columns):
        x = 0.55 + idx * 4.25
        w = 4.0

        card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x), Inches(2.3), Inches(w), Inches(4.65)
        )
        card.adjustments[0] = 0.04
        _outlined(card, PANEL, STROKE, width_pt=0.75)
        # accent hair at top
        hair = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(x), Inches(2.3), Inches(w), Inches(0.06)
        )
        _solid(hair, ACCENT)

        # Product label
        head = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(2.55),
            Inches(w - 0.6), Inches(0.55)
        )
        _run(head.text_frame, name, size=18, color=INK_0,
             bold=True, first=True)
        _run(head.text_frame, tag, size=10, color=INK_2, spacing=1.15)

        # Bullets
        bl = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(3.8),
            Inches(w - 0.6), Inches(2.6)
        )
        tf = bl.text_frame
        tf.margin_left = 0
        tf.word_wrap = True
        for bidx, bullet in enumerate(bullets):
            p = tf.paragraphs[0] if bidx == 0 else tf.add_paragraph()
            p.alignment = PP_ALIGN.LEFT
            p.space_after = Pt(6)
            ra = p.add_run()
            ra.text = "•  "
            ra.font.size = Pt(12)
            ra.font.color.rgb = ACCENT
            ra.font.bold = True
            ra.font.name = "Calibri"
            rb = p.add_run()
            rb.text = bullet
            rb.font.size = Pt(11)
            rb.font.color.rgb = INK_1
            rb.font.name = "Calibri"


def image_slide(prs: Presentation, total: int, *, eyebrow: str, title: str,
                kicker: str | None, image: str,
                bullets: Sequence[tuple[str, str]],
                pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow=eyebrow, title=title, kicker=kicker)

    add_image_frame(slide, SHOTS / image,
                    left=0.55, top=2.3, width=8.4, height=4.5)
    add_bullets(slide, bullets, left=9.25, top=2.3, width=3.7)
    add_footer(slide, pagenum=pagenum, total=total)


def control_hero(prs: Presentation, total: int, pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide,
               eyebrow="Control mode · Hero",
               title="Play traffic lights like a piano",
               kicker="Live diagram · Timing strip · Emergency banners · "
                      "Shortcut-driven piano keys.")

    # Large centred screenshot
    add_image_frame(slide, SHOTS / "12-control-mode-dark.png",
                    left=0.55, top=2.3, width=12.3, height=4.5)

    # Keyboard-chips row
    chips = [
        (0.55, "1 2 3 4"),
        (1.45, "← ↑ → ↓"),
        (2.4,  "Space"),
        (3.1,  "S"),
        (3.55, "R"),
    ]
    # Re-lay out chips roughly in a row
    chip_x = 0.55
    for lbl in ["1", "2", "3", "4", "←", "↑", "→", "↓", "Space", "S", "R"]:
        w = 0.75 if lbl == "Space" else 0.42
        add_kbd_chip(slide, left=chip_x, top=7.05, label=lbl)
        chip_x += w + 0.05

    add_footer(slide, pagenum=pagenum, total=total)


def theme_architecture(prs: Presentation, total: int, pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Theme architecture",
               title="Dark and light, built on semantic tokens",
               kicker="One palette, two themes — scoped to the Studio "
                      "so the Operations dashboard stays fixed-dark.")

    # Left preview (dark) and right preview (light)
    add_image_frame(slide, SHOTS / "03-engineering-diagram-dark.png",
                    left=0.55, top=2.3, width=6.0, height=3.35)
    add_image_frame(slide, SHOTS / "15-engineering-diagram-light.png",
                    left=6.75, top=2.3, width=6.1, height=3.35)

    # Token chips
    tokens_dark = [
        ("--stls-surface-0", BG),
        ("--stls-surface-1", PANEL),
        ("--stls-accent",    ACCENT),
        ("--stls-sig-green", RGBColor(0x39, 0xD9, 0x8A)),
        ("--stls-sig-red",   RGBColor(0xFF, 0x5F, 0x5F)),
    ]
    y = 6.05
    x = 0.55
    for name, col in tokens_dark:
        add_token_chip(slide, left=x, top=y, name=name, colour=col)
        x += 2.5

    add_footer(slide, pagenum=pagenum, total=total)


def stack_slide(prs: Presentation, total: int, pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Technology stack",
               title="A pragmatic, typed toolchain",
               kicker=None)

    stacks = [
        ("Frontend",
         ["Next.js 16 (Turbopack)",
          "React 19 + TypeScript",
          "Tailwind v4 semantic tokens",
          "Socket.IO client for live state"]),
        ("Backend",
         ["NestJS + TypeORM",
          "PostgreSQL (JSONB configs)",
          "Socket.IO gateway",
          "HMAC-signed command channel"]),
        ("Desktop",
         ["Electron wrapper",
          "Loads /studio URL only",
          "Native-feel menus & status bar",
          "Persists last-opened intersection"]),
        ("Controller runtime",
         ["Standalone Go process",
          "1-Hz cycle simulator",
          "Offline fall-back cache",
          "Ticks the signal heads"]),
    ]

    for idx, (head, items) in enumerate(stacks):
        x = 0.55 + idx * 3.15
        w = 3.0
        card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x), Inches(2.3), Inches(w), Inches(4.6)
        )
        card.adjustments[0] = 0.04
        _outlined(card, PANEL, STROKE, width_pt=0.75)
        hair = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(x), Inches(2.3), Inches(w), Inches(0.05)
        )
        _solid(hair, ACCENT)

        h = slide.shapes.add_textbox(
            Inches(x + 0.2), Inches(2.45),
            Inches(w - 0.4), Inches(0.5)
        )
        _run(h.text_frame, head, size=15, color=INK_0,
             bold=True, first=True)

        body = slide.shapes.add_textbox(
            Inches(x + 0.2), Inches(3.05),
            Inches(w - 0.4), Inches(3.5)
        )
        tf = body.text_frame
        tf.word_wrap = True
        for bidx, item in enumerate(items):
            p = tf.paragraphs[0] if bidx == 0 else tf.add_paragraph()
            p.alignment = PP_ALIGN.LEFT
            p.space_after = Pt(6)
            r1 = p.add_run()
            r1.text = "•  "
            r1.font.size = Pt(12)
            r1.font.color.rgb = ACCENT
            r1.font.bold = True
            r1.font.name = "Calibri"
            r2 = p.add_run()
            r2.text = item
            r2.font.size = Pt(11)
            r2.font.color.rgb = INK_1
            r2.font.name = "Calibri"

    add_footer(slide, pagenum=pagenum, total=total)


def roadmap(prs: Presentation, total: int, pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)
    add_chrome(slide, eyebrow="Status · Roadmap",
               title="Where we are, where we're heading",
               kicker=None)

    # Three columns
    cols = [
        ("Shipped",
         GREEN_INK,
         ["Operations dashboard",
          "Studio engineering mode end-to-end",
          "Apply / Pull runtime config",
          "Control mode with piano + shortcuts",
          "Full dark + light theme"]),
        ("In progress",
         RGBColor(0xFF, 0xD0, 0x89),
         ["Coordinated corridors",
          "Scenario simulator (dry-run)",
          "Controller offline sync polish"]),
        ("Next",
         INFO_INK,
         ["Conflict-pair import from CAD",
          "Plan export to field controllers",
          "Multi-operator audit trail"]),
    ]
    for idx, (title, col, items) in enumerate(cols):
        x = 0.55 + idx * 4.25
        w = 4.0
        card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x), Inches(2.3), Inches(w), Inches(4.6)
        )
        card.adjustments[0] = 0.04
        _outlined(card, PANEL, STROKE, width_pt=0.75)

        h = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(2.5),
            Inches(w - 0.6), Inches(0.45)
        )
        _run(h.text_frame, title.upper(), size=11, color=col,
             bold=True, first=True)

        body = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(3.1),
            Inches(w - 0.6), Inches(3.5)
        )
        tf = body.text_frame
        tf.word_wrap = True
        for bidx, item in enumerate(items):
            p = tf.paragraphs[0] if bidx == 0 else tf.add_paragraph()
            p.alignment = PP_ALIGN.LEFT
            p.space_after = Pt(7)
            r1 = p.add_run()
            r1.text = "•  "
            r1.font.size = Pt(12)
            r1.font.color.rgb = col
            r1.font.bold = True
            r1.font.name = "Calibri"
            r2 = p.add_run()
            r2.text = item
            r2.font.size = Pt(11)
            r2.font.color.rgb = INK_1
            r2.font.name = "Calibri"

    add_footer(slide, pagenum=pagenum, total=total)


def closing(prs: Presentation, total: int, pagenum: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    paint_background(slide)

    # Giant amber wordmark
    title = slide.shapes.add_textbox(Inches(0.8), Inches(2.6),
                                     Inches(11.5), Inches(2.5))
    tf = title.text_frame
    _run(tf, "STLS Hybrid", size=72, color=INK_0, bold=True, first=True)
    _run(tf,
         "Engineering · Control · Runtime — one coherent product.",
         size=18, color=INK_2, spacing=1.2)

    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.4),
        Inches(1.4), Inches(0.05)
    )
    _solid(rule, ACCENT)

    meta = slide.shapes.add_textbox(Inches(0.8), Inches(6.8),
                                    Inches(11.5), Inches(0.4))
    _run(meta.text_frame,
         "Thank you · Questions welcome",
         size=11, color=INK_3, first=True)


def build() -> Path:
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H

    # We'll count slides up-front so every footer shows n/N.
    total_slides = 22

    cover(prs)
    agenda(prs, total_slides)
    positioning(prs, total_slides)
    architecture(prs, total_slides)

    image_slide(prs, total_slides,
                eyebrow="Operations dashboard",
                title="City-wide supervision, not control",
                kicker="Read-mostly view for police, district supervisors, "
                       "and the command centre.",
                image="01-operations-dashboard.png",
                bullets=[
                    ("Live map",
                     "Morocco-wide intersection state."),
                    ("Alert feed",
                     "Hardware and operational alerts in one stream."),
                    ("Scenario runner",
                     "Trigger normal / peak / emergency demo scenarios."),
                    ("Strict supervision",
                     "Commands that change traffic stay in Studio."),
                ],
                pagenum=5)

    image_slide(prs, total_slides,
                eyebrow="Studio · Splash",
                title="One intersection at a time",
                kicker="SEA/TOPS-style desktop — project tree on the left, "
                       "workspace in the centre, control rail on the right.",
                image="02-studio-splash-dark.png",
                bullets=[
                    ("Project explorer",
                     "Country → region → city → intersection."),
                    ("Mode tabs",
                     "Engineering · Control · Simulation."),
                    ("Session memory",
                     "Reopens the last intersection you worked on."),
                    ("No dashboard noise",
                     "Every surface is engineer- or operator-focused."),
                ],
                pagenum=6)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Diagram",
                title="Static engineering view of the intersection",
                kicker="Multi-bearing, multi-lane, with turning movements "
                       "and a per-phase phase panel.",
                image="03-engineering-diagram-dark.png",
                bullets=[
                    ("8 cardinal bearings",
                     "N, NE, E, SE, S, SW, W, NW."),
                    ("Real lane geometry",
                     "Lane count per approach drives road width."),
                    ("Turning arrows",
                     "Left / straight / right per signal group."),
                    ("Conflict overlay",
                     "Toggle to see all incompatibility pairs at once."),
                ],
                pagenum=7)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Identity",
                title="Jurisdiction, address, geometry",
                kicker=None,
                image="04-engineering-identity.png",
                bullets=[
                    ("Code + controller",
                     "Fixed identifiers bound to the field cabinet."),
                    ("Name & district",
                     "Human labels — what operators see."),
                    ("Geo anchor",
                     "Lat / Lng used by the Operations map."),
                ],
                pagenum=8)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Approaches",
                title="Cardinal approaches and lane counts",
                kicker=None,
                image="05-engineering-approaches.png",
                bullets=[
                    ("Bearing selector",
                     "Pick any of the 8 cardinal directions."),
                    ("Lanes per approach",
                     "Drives the road width on the diagram."),
                    ("Inline editing",
                     "Click a row to edit — no modal juggling."),
                ],
                pagenum=9)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Signal groups",
                title="Signal groups drive movements",
                kicker="Each group binds to an approach and owns a set of "
                       "aspects (R / Y / G + arrows + pedestrian).",
                image="06-engineering-signal-groups.png",
                bullets=[
                    ("Approach binding",
                     "Needed so phases can reference groups by direction."),
                    ("Aspect toggles",
                     "Coloured chips per supported signal state."),
                    ("Used in phases",
                     "Which groups go green together per phase."),
                ],
                pagenum=10)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Phases & Stages",
                title="Phases, stages, and the conflict matrix",
                kicker="A phase declares green groups; stages order phases; "
                       "the matrix prevents dangerous co-greens.",
                image="07-engineering-phases-stages.png",
                bullets=[
                    ("Green selector",
                     "Toggle which signal groups go green per phase."),
                    ("Timings",
                     "Min-green / yellow / red-clearance per phase."),
                    ("Stage ordering",
                     "Stages run in order — the cycle."),
                    ("Matrix guard",
                     "Surfaces violations in-page — no silent errors."),
                ],
                pagenum=11)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Detectors",
                title="Detectors mapped to controller inputs",
                kicker=None,
                image="08-engineering-detectors.png",
                bullets=[
                    ("Per-approach mapping",
                     "Each detector belongs to an approach."),
                    ("Channel + kind",
                     "Loop, radar, video, piezo, magnetometer."),
                    ("Feeds the runtime",
                     "Upstream data for adaptive decisions."),
                ],
                pagenum=12)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Controller",
                title="Controller link summary",
                kicker="Read-only summary bound to the field cabinet.",
                image="09-engineering-controller.png",
                bullets=[
                    ("Link state",
                     "Online · degraded · offline, at a glance."),
                    ("Firmware & uptime",
                     "Hardware telemetry from the runtime."),
                    ("Battery backed",
                     "Resilience marker surfaced up-front."),
                ],
                pagenum=13)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Live",
                title="Apply / Pull · the runtime bridge",
                kicker="Push the Studio config to the runtime — or pull "
                       "what the runtime actually has. Both are audited.",
                image="10-engineering-live-schematic.png",
                bullets=[
                    ("Apply to runtime",
                     "Studio → backend → in-memory simulator."),
                    ("Pull from runtime",
                     "Reload what the controller currently enforces."),
                    ("Live schematic",
                     "Real-time aspect + cycle ring from backend."),
                    ("Event log",
                     "Every transition recorded in the side panel."),
                ],
                pagenum=14)

    image_slide(prs, total_slides,
                eyebrow="Engineering · Conflicts overlay",
                title="Every incompatible movement, in one view",
                kicker=None,
                image="11-engineering-conflicts-overlay.png",
                bullets=[
                    ("All-pairs arcs",
                     "Dashed red arcs between conflicting movements."),
                    ("Hover focus",
                     "Hover a single movement to see only its conflicts."),
                    ("No surprises",
                     "Caught at design time, never at runtime."),
                ],
                pagenum=15)

    control_hero(prs, total_slides, 16)

    image_slide(prs, total_slides,
                eyebrow="Control mode · Conflicts",
                title="Operators can see conflicts live too",
                kicker="Same overlay as Engineering — available as an "
                       "optional toggle in the operator console.",
                image="13-control-mode-conflicts.png",
                bullets=[
                    ("One-click toggle",
                     "Never obstructs the default clean view."),
                    ("Context when it matters",
                     "Verify before forcing a direction or phase."),
                ],
                pagenum=17)

    image_slide(prs, total_slides,
                eyebrow="Control mode · Light theme",
                title="Readable in a bright control room",
                kicker="Engineering-CAD aesthetic — white asphalt, dark "
                       "lane markings.",
                image="14-control-mode-light.png",
                bullets=[
                    ("Industrial contrast",
                     "No candy colours; stays serious."),
                    ("Same semantics",
                     "Every signal colour keeps its meaning."),
                    ("Persisted preference",
                     "Theme is remembered per operator."),
                ],
                pagenum=18)

    theme_architecture(prs, total_slides, 19)
    stack_slide(prs, total_slides, 20)
    roadmap(prs, total_slides, 21)
    closing(prs, total_slides, 22)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    print("✓ Deck written to", OUT)
    print("  Slides:", len(prs.slides.__iter__.__self__._sldIdLst))
    return OUT


if __name__ == "__main__":
    build()
