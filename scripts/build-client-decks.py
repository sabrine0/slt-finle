"""
Generate two bilingual executive pitch decks with engineering diagrams.

Outputs:
  1. STLS-Police-DGSN.pptx
  2. STLS-BureauEtudes.pptx

All visuals drawn with native pptx shapes (no bitmaps) so they stay
crisp when projected. Style: dark navy for cover/dividers/closing,
cream for content slides, orange + green accents.
"""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

DESKTOP = Path(r"C:\Users\pc\OneDrive - Tomorrow\Bureau")

# --- palette -----------------------------------------------------------------
NAVY      = RGBColor(0x14, 0x1C, 0x28)
NAVY_2    = RGBColor(0x0F, 0x19, 0x23)
NAVY_3    = RGBColor(0x1F, 0x2A, 0x3B)
CREAM     = RGBColor(0xF3, 0xEE, 0xE6)
CARD_BG   = RGBColor(0xEA, 0xE3, 0xD3)
CARD_BG_2 = RGBColor(0xDE, 0xD5, 0xC2)
ORANGE    = RGBColor(0xC2, 0x5E, 0x2E)
ORANGE_L  = RGBColor(0xE0, 0x8A, 0x5F)
GREEN     = RGBColor(0x1F, 0x3B, 0x37)
GREEN_L   = RGBColor(0x3F, 0x7A, 0x6E)
GREY      = RGBColor(0x6A, 0x65, 0x5B)
GREY_2    = RGBColor(0x97, 0x91, 0x86)
RULE      = RGBColor(0xCD, 0xC6, 0xB7)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
NAVY_DIM  = RGBColor(0x55, 0x5F, 0x70)
NAVY_RULE = RGBColor(0x2A, 0x33, 0x42)
SIGNAL_R  = RGBColor(0xD9, 0x3A, 0x3A)
SIGNAL_Y  = RGBColor(0xE6, 0xB9, 0x2A)
SIGNAL_G  = RGBColor(0x3E, 0xAE, 0x6D)
ASPHALT   = RGBColor(0x3A, 0x3F, 0x49)
ASPHALT_L = RGBColor(0x4E, 0x55, 0x60)
LANE_LINE = RGBColor(0xE6, 0xDF, 0xCE)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
M_L = Inches(0.7)
M_R = Inches(0.7)
CONTENT_W = SLIDE_W - M_L - M_R
TITLE_Y = Inches(0.85)
FOOTER_RULE_Y = Inches(7.10)
FOOTER_TEXT_Y = Inches(7.20)


# =============================================================================
# PRIMITIVES
# =============================================================================
def new_deck():
    p = Presentation()
    p.slide_width = SLIDE_W
    p.slide_height = SLIDE_H
    return p


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def bg(slide, color):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    s.line.fill.background()
    s.fill.solid(); s.fill.fore_color.rgb = color
    s.shadow.inherit = False
    return s


def rect(slide, x, y, w, h, fill, line=None, line_weight=0.5):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_weight)
    s.shadow.inherit = False
    return s


def rounded(slide, x, y, w, h, fill, line=None, line_weight=0.5, radius=0.07):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    s.adjustments[0] = radius
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_weight)
    s.shadow.inherit = False
    return s


def oval(slide, x, y, w, h, fill, line=None, line_weight=0.5):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y, w, h)
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_weight)
    s.shadow.inherit = False
    return s


def hline(slide, x, y, w, color=RULE, weight_emu=6350):
    return rect(slide, x, y, w, Emu(weight_emu), fill=color)


def vline(slide, x, y, h, color=RULE, weight_emu=6350):
    return rect(slide, x, y, Emu(weight_emu), h, fill=color)


def text(slide, x, y, w, h, txt, *,
         size=14, bold=False, italic=False, color=NAVY_2,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         font="Calibri", line_spacing=1.0, space_after=0):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.02)
    tf.margin_right = Inches(0.02)
    tf.margin_top = Inches(0.0)
    tf.margin_bottom = Inches(0.0)
    tf.vertical_anchor = anchor
    lines = txt.split("\n") if isinstance(txt, str) else txt
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        if space_after:
            p.space_after = Pt(space_after)
        r = p.add_run()
        r.text = ln
        r.font.name = font
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = color
    return tb


def kicker(slide, x, y, w, txt, color=ORANGE, size=10):
    return text(slide, x, y, w, Inches(0.3),
                txt.upper(), size=size, bold=True, color=color)


def arrow_right(slide, x, y, w, color=ORANGE, h=None):
    if h is None:
        h = Inches(0.2)
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, h)
    a.adjustments[0] = 0.5
    a.adjustments[1] = 0.35
    a.fill.solid(); a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def arrow_down(slide, x, y, h, color=ORANGE, w=None):
    if w is None:
        w = Inches(0.2)
    a = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, x, y, w, h)
    a.adjustments[0] = 0.5
    a.adjustments[1] = 0.35
    a.fill.solid(); a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def chevron(slide, x, y, w, h, fill, txt=None, txt_color=WHITE, txt_size=12):
    s = slide.shapes.add_shape(MSO_SHAPE.CHEVRON, x, y, w, h)
    s.fill.solid(); s.fill.fore_color.rgb = fill
    s.line.fill.background()
    s.shadow.inherit = False
    if txt:
        tf = s.text_frame
        tf.margin_left = Inches(0.05); tf.margin_right = Inches(0.05)
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = txt
        r.font.name = "Calibri"
        r.font.size = Pt(txt_size)
        r.font.bold = True
        r.font.color.rgb = txt_color
    return s


def line_seg(slide, x1, y1, x2, y2, color=GREY_2, weight=1.0, dashed=False):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, x1, y1, x2, y2)
    c.line.color.rgb = color
    c.line.width = Pt(weight)
    if dashed:
        from pptx.oxml.ns import qn
        ln = c.line._get_or_add_ln()
        prstDash = ln.makeelement(qn('a:prstDash'), {'val': 'dash'})
        ln.append(prstDash)
    return c


# =============================================================================
# CHROME (cover / agenda / section / closing / footer)
# =============================================================================
def logo_block(slide, x, y, dark=True):
    m = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y + Inches(0.04),
                               Inches(0.55), Inches(0.55))
    m.fill.background(); m.line.color.rgb = ORANGE; m.line.width = Pt(1.75)
    m.shadow.inherit = False
    inner = slide.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.13),
                                   y + Inches(0.17), Inches(0.29), Inches(0.29))
    inner.fill.background(); inner.line.color.rgb = GREEN; inner.line.width = Pt(1.75)
    inner.shadow.inherit = False
    text(slide, x + Inches(0.75), y - Inches(0.02), Inches(4.5), Inches(0.4),
         "Tomorrow Systems", size=18, bold=True,
         color=WHITE if dark else NAVY_2)
    tb = slide.shapes.add_textbox(x + Inches(0.75), y + Inches(0.36),
                                  Inches(5.0), Inches(0.3))
    p = tb.text_frame.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    sep_color = GREY_2 if dark else GREY
    for t, c in [("D A T A", ORANGE), ("   |   ", sep_color),
                 ("E N G I N E E R I N G", GREEN), ("   |   ", sep_color),
                 ("T E R R I T O R Y", ORANGE)]:
        r = p.add_run()
        r.text = t
        r.font.name = "Calibri"; r.font.size = Pt(8.5)
        r.font.bold = True; r.font.color.rgb = c


def footer(slide, page, total, ref, dark=False):
    rule_c = NAVY_RULE if dark else RULE
    hline(slide, M_L, FOOTER_RULE_Y, CONTENT_W, color=rule_c)
    text(slide, M_L, FOOTER_TEXT_Y, Inches(3), Inches(0.22),
         "Tomorrow Systems", size=9, italic=True,
         color=GREY_2 if dark else GREY)
    text(slide, Inches(3.5), FOOTER_TEXT_Y, Inches(6.3), Inches(0.22),
         f"CONFIDENTIEL  ·  {ref}", size=8.5,
         color=NAVY_DIM if dark else GREY_2, align=PP_ALIGN.CENTER)
    text(slide, SLIDE_W - M_R - Inches(1.3), FOOTER_TEXT_Y,
         Inches(1.3), Inches(0.22),
         f"{page:02d} / {total:02d}", size=9, bold=True,
         color=WHITE if dark else NAVY_2, align=PP_ALIGN.RIGHT)


def header(slide, kicker_txt, title):
    kicker(slide, M_L, Inches(0.55), CONTENT_W, kicker_txt)
    text(slide, M_L, TITLE_Y, CONTENT_W, Inches(0.85),
         title, size=30, bold=True, color=NAVY_2, line_spacing=1.05)
    hline(slide, M_L, Inches(1.85), Inches(0.6), color=ORANGE, weight_emu=22000)


def cover(prs, kicker_txt, title_lines, subtitle, ref, date_loc):
    s = blank(prs); bg(s, NAVY)
    logo_block(s, M_L, Inches(0.55), dark=True)
    # subtle decorative rule
    hline(s, M_L, Inches(2.7), Inches(0.5), color=ORANGE, weight_emu=25000)

    kicker(s, M_L, Inches(2.9), Inches(11), kicker_txt, size=12)
    y = Inches(3.3)
    for ln in title_lines:
        text(s, M_L, y, Inches(11), Inches(1.05),
             ln, size=60, bold=True, color=WHITE, line_spacing=1.0)
        y += Inches(1.0)
    text(s, M_L, y + Inches(0.1), Inches(11.5), Inches(0.55),
         subtitle, size=17, color=GREY_2, line_spacing=1.15)

    rx = SLIDE_W - M_R - Inches(3.3)
    text(s, rx, Inches(6.25), Inches(3.3), Inches(0.3),
         "R É F É R E N C E", size=9, bold=True, color=ORANGE,
         align=PP_ALIGN.RIGHT)
    text(s, rx, Inches(6.55), Inches(3.3), Inches(0.4),
         ref, size=12, bold=True, color=WHITE, align=PP_ALIGN.RIGHT)
    text(s, rx, Inches(6.90), Inches(3.3), Inches(0.3),
         date_loc, size=10, color=GREY_2, align=PP_ALIGN.RIGHT)
    return s


def agenda(prs, items, ref, page, total):
    s = blank(prs); bg(s, CREAM)
    n = len(items)
    header(s, "A G E N D A", f"{n} sections, un fil narratif")
    two_col = n > 10
    y_start = Inches(2.25)
    avail_h = Inches(7.5) - y_start - Inches(0.7)
    if two_col:
        per_col = (n + 1) // 2
        col_w = (CONTENT_W - Inches(0.6)) / 2
        row_h = Emu(int(avail_h / per_col))
        for i, (fr, en) in enumerate(items):
            c = i // per_col; r = i % per_col
            x = M_L + (col_w + Inches(0.6)) * c
            y = y_start + row_h * r
            text(s, x, y + Inches(0.05), Inches(0.9), Inches(0.4),
                 f"{i+1:02d}", size=22, color=ORANGE,
                 anchor=MSO_ANCHOR.MIDDLE)
            text(s, x + Inches(0.95), y + Inches(0.05),
                 col_w - Inches(1.0), Inches(0.32),
                 fr, size=14, bold=True, color=NAVY_2)
            text(s, x + Inches(0.95), y + Inches(0.38),
                 col_w - Inches(1.0), Inches(0.28),
                 en, size=9, italic=True, color=GREY)
            if r < per_col - 1:
                hline(s, x + Inches(0.95), y + row_h - Inches(0.05),
                      col_w - Inches(1.0))
    else:
        row_h = Emu(int(avail_h / n))
        for i, (fr, en) in enumerate(items):
            y = y_start + row_h * i
            text(s, M_L, y + Inches(0.05), Inches(1.0), Inches(0.45),
                 f"{i+1:02d}", size=28, color=ORANGE,
                 anchor=MSO_ANCHOR.MIDDLE)
            text(s, M_L + Inches(1.1), y + Inches(0.08),
                 CONTENT_W - Inches(1.2), Inches(0.36),
                 fr, size=16, bold=True, color=NAVY_2)
            text(s, M_L + Inches(1.1), y + Inches(0.46),
                 CONTENT_W - Inches(1.2), Inches(0.3),
                 en, size=10, italic=True, color=GREY)
            if i < n - 1:
                hline(s, M_L + Inches(1.1), y + row_h - Inches(0.05),
                      CONTENT_W - Inches(1.1))
    footer(s, page, total, ref)
    return s


def section(prs, num, kicker_txt, title, tagline, ref, page, total):
    s = blank(prs); bg(s, NAVY)
    text(s, M_L, Inches(1.55), Inches(5), Inches(2.4),
         f"{num:02d}", size=140, bold=True, color=ORANGE)
    kicker(s, M_L + Inches(0.05), Inches(4.0), Inches(11),
           f"PARTIE   {num:02d}", color=ORANGE, size=11)
    text(s, M_L, Inches(4.4), Inches(12), Inches(0.5),
         kicker_txt, size=12, bold=True, color=GREY_2)
    text(s, M_L, Inches(4.95), Inches(12), Inches(1.0),
         title, size=42, bold=True, color=WHITE, line_spacing=1.05)
    text(s, M_L, Inches(5.95), Inches(11.5), Inches(0.7),
         tagline, size=15, color=GREY_2, line_spacing=1.3)
    footer(s, page, total, ref, dark=True)
    return s


def closing(prs, big_title, kicker_txt, address, contact, online, ref):
    s = blank(prs); bg(s, NAVY)
    logo_block(s, M_L, Inches(0.55), dark=True)
    hline(s, M_L, Inches(2.4), Inches(0.5), color=ORANGE, weight_emu=25000)
    kicker(s, M_L, Inches(2.6), Inches(8), kicker_txt, size=13)
    y = Inches(3.0)
    for ln in big_title:
        text(s, M_L, y, Inches(12), Inches(1.05),
             ln, size=56, bold=True, color=WHITE, line_spacing=1.0)
        y += Inches(1.0)
    y = Inches(5.9)
    hline(s, M_L, y, CONTENT_W, color=NAVY_RULE)
    cols_data = [("A D R E S S E", address),
                 ("C O N T A C T", contact),
                 ("E N   L I G N E", online)]
    col_w = (CONTENT_W - Inches(0.4)) / 3
    for i, (lbl, lines) in enumerate(cols_data):
        cx = M_L + (col_w + Inches(0.2)) * i
        text(s, cx, y + Inches(0.18), col_w, Inches(0.3),
             lbl, size=10, bold=True, color=ORANGE)
        for j, ln in enumerate(lines):
            text(s, cx, y + Inches(0.5) + Inches(0.28 * j), col_w, Inches(0.28),
                 ln, size=11, color=WHITE, line_spacing=1.25)
    text(s, M_L, FOOTER_TEXT_Y, CONTENT_W, Inches(0.25),
         f"CONFIDENTIEL  ·  {ref}  ·  © 2026 Tomorrow Systems",
         size=8.5, color=NAVY_DIM, align=PP_ALIGN.CENTER)
    return s


# =============================================================================
# REUSABLE DIAGRAM BLOCKS
# =============================================================================
def node(slide, x, y, w, h, kicker_t, title, sub=None,
         color=ORANGE, fill=CARD_BG, accent_top=True):
    """A labelled diagram node with coloured edge accent."""
    rounded(slide, x, y, w, h, fill=fill, radius=0.06)
    if accent_top:
        rounded(slide, x, y, w, Inches(0.10), fill=color, radius=0.4)
    else:
        rect(slide, x, y, Inches(0.06), h, fill=color)
    py = y + Inches(0.22 if accent_top else 0.15)
    text(slide, x + Inches(0.25), py, w - Inches(0.4), Inches(0.25),
         kicker_t.upper(), size=8.5, bold=True, color=color)
    text(slide, x + Inches(0.25), py + Inches(0.28), w - Inches(0.4),
         Inches(0.4), title, size=13, bold=True, color=NAVY_2,
         line_spacing=1.1)
    if sub:
        text(slide, x + Inches(0.25), py + Inches(0.68), w - Inches(0.4),
             Inches(0.55), sub, size=9, italic=True, color=GREY,
             line_spacing=1.25)


def signal_head(slide, cx, cy, r=Inches(0.1), state="green"):
    """Tiny 3-light signal head, vertical."""
    bg_w = r * 2.4; bg_h = r * 6.4
    bx = cx - bg_w / 2; by = cy - bg_h / 2
    rounded(slide, bx, by, bg_w, bg_h, fill=NAVY_2, radius=0.25)
    for i, lamp in enumerate(["red", "yellow", "green"]):
        on = (lamp == state)
        c = {"red": SIGNAL_R, "yellow": SIGNAL_Y, "green": SIGNAL_G}[lamp]
        oval(slide, cx - r * 0.7, by + Inches(0.07) + r * 1.9 * i,
             r * 1.4, r * 1.4,
             fill=c if on else NAVY_3)


def vehicle_arrow(slide, x, y, w=Inches(0.5), h=Inches(0.25), color=ORANGE):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, h)
    a.adjustments[0] = 0.4; a.adjustments[1] = 0.3
    a.fill.solid(); a.fill.fore_color.rgb = color
    a.line.fill.background(); a.shadow.inherit = False
    return a


# =============================================================================
# DIAGRAM SLIDES — POLICE DECK
# =============================================================================
def slide_constat(prs, ref, page, total):
    """4 tensions as icon-card grid."""
    s = blank(prs); bg(s, CREAM)
    header(s, "C O N S T A T   ·   T E R R A I N",
           "Quatre tensions opérationnelles à résoudre")
    cards = [
        ("01", "Interventions ralenties",
         "Police interventions slowed by uncoordinated lights.", ORANGE,
         "feux non coordonnés"),
        ("02", "Couloirs d'urgence",
         "Emergency corridors must be secured in real time.", ORANGE,
         "à sécuriser temps réel"),
        ("03", "Aucune action sans trace",
         "No command without a coded reason and audit.", GREEN,
         "audit immuable"),
        ("04", "Continuité offline",
         "Each intersection must keep running offline.", GREEN,
         "souveraineté & uptime"),
    ]
    y0 = Inches(2.2); avail = FOOTER_RULE_Y - y0 - Inches(0.25)
    card_w = (CONTENT_W - Inches(0.4)) / 2
    card_h = (avail - Inches(0.3)) / 2
    for i, (num, title, en, col, hint) in enumerate(cards):
        r = i // 2; c = i % 2
        x = M_L + (card_w + Inches(0.4)) * c
        y = y0 + (card_h + Inches(0.3)) * r
        rounded(s, x, y, card_w, card_h, fill=CARD_BG, radius=0.04)
        rect(s, x, y, Inches(0.08), card_h, fill=col)
        text(s, x + Inches(0.4), y + Inches(0.3), Inches(1), Inches(0.5),
             num, size=34, bold=True, color=col)
        text(s, x + Inches(1.4), y + Inches(0.35), card_w - Inches(1.6),
             Inches(0.5), title, size=20, bold=True, color=NAVY_2)
        text(s, x + Inches(1.4), y + Inches(0.85), card_w - Inches(1.6),
             Inches(0.3), hint, size=11, color=col, italic=True)
        text(s, x + Inches(1.4), y + Inches(1.2), card_w - Inches(1.6),
             Inches(0.3), en, size=9.5, italic=True, color=GREY)
    footer(s, page, total, ref)
    return s


def slide_promesse(prs, ref, page, total):
    """4 stat cards — verifiable promises."""
    s = blank(prs); bg(s, CREAM)
    header(s, "P R O M E S S E   ·   S T L S",
           "Quatre garanties, vérifiables dans le code")
    cards = [
        ("MODES DE CONTRÔLE", "6", ORANGE,
         "Adaptive · Fixed · Manual · Emergency · Flash · Fail-safe.",
         "Six control modes, exposed end-to-end."),
        ("CODES RAISON", "9", GREEN,
         "Codes prédéfinis pour tout override opérateur.",
         "Nine preset reason codes for every override."),
        ("DÉFENSE CONFLITS", "×3", ORANGE,
         "Conflict matrix : UI · validator IA · runtime.",
         "Triple-validated conflict matrix."),
        ("RUNTIME", "Offline", GREEN,
         "Go runtime signé HMAC, par carrefour.",
         "Per-intersection HMAC-signed Go runtime."),
    ]
    y0 = Inches(2.2); avail = FOOTER_RULE_Y - y0 - Inches(0.25)
    card_w = (CONTENT_W - Inches(0.4)) / 2
    card_h = (avail - Inches(0.3)) / 2
    for i, (label, value, col, fr, en) in enumerate(cards):
        r = i // 2; c = i % 2
        x = M_L + (card_w + Inches(0.4)) * c
        y = y0 + (card_h + Inches(0.3)) * r
        rounded(s, x, y, card_w, card_h, fill=CARD_BG, radius=0.04)
        rect(s, x, y, Emu(50000), card_h, fill=col)
        text(s, x + Inches(0.45), y + Inches(0.3), card_w - Inches(0.6),
             Inches(0.3), label, size=10, bold=True, color=col)
        text(s, x + Inches(0.45), y + Inches(0.65), card_w - Inches(0.6),
             Inches(1.1), value, size=48, bold=True, color=NAVY_2)
        hline(s, x + Inches(0.45), y + Inches(1.85), Inches(0.6),
              color=col, weight_emu=18000)
        text(s, x + Inches(0.45), y + Inches(2.05), card_w - Inches(0.8),
             Inches(0.6), fr, size=12, color=NAVY_2, line_spacing=1.25)
        text(s, x + Inches(0.45), y + Inches(2.55), card_w - Inches(0.8),
             Inches(0.5), en, size=9, italic=True, color=GREY)
    footer(s, page, total, ref)
    return s


def slide_console_mockup(prs, ref, page, total):
    """Wireframe operator console: map + side panels."""
    s = blank(prs); bg(s, CREAM)
    header(s, "C O N S O L E   ·   P O L I C E",
           "Le poste opérateur — une seule vue, toute la ville")

    # browser/app frame
    fx, fy, fw, fh = M_L, Inches(2.2), CONTENT_W, Inches(4.7)
    rounded(s, fx, fy, fw, fh, fill=NAVY_2, radius=0.02)
    rect(s, fx, fy, fw, Inches(0.32), fill=NAVY_3)
    # window dots
    for i, c in enumerate([SIGNAL_R, SIGNAL_Y, SIGNAL_G]):
        oval(s, fx + Inches(0.12 + i * 0.18), fy + Inches(0.10),
             Inches(0.13), Inches(0.13), fill=c)
    text(s, fx + Inches(0.8), fy + Inches(0.07), Inches(6), Inches(0.2),
         "stls.tomorrow-systems.com / command", size=9, color=GREY_2)
    text(s, fx + fw - Inches(2.5), fy + Inches(0.07), Inches(2.3),
         Inches(0.2), "Casablanca · Centre · 24/7",
         size=9, bold=True, color=ORANGE, align=PP_ALIGN.RIGHT)

    # map area (left ~62%)
    mx = fx + Inches(0.15); my = fy + Inches(0.47)
    mw = Inches(7.7); mh = fh - Inches(0.62)
    rounded(s, mx, my, mw, mh, fill=NAVY_3, radius=0.02)
    # grid lines
    for gx in range(1, 5):
        line_seg(s, mx + mw * gx / 5, my, mx + mw * gx / 5, my + mh,
                 color=NAVY_RULE, weight=0.5)
    for gy in range(1, 4):
        line_seg(s, mx, my + mh * gy / 4, mx + mw, my + mh * gy / 4,
                 color=NAVY_RULE, weight=0.5)

    # corridor lines (light orange)
    nodes_pts = [(0.18, 0.30), (0.42, 0.30), (0.70, 0.42), (0.85, 0.62),
                 (0.55, 0.72), (0.30, 0.60)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0), (1, 5)]
    pts_xy = [(mx + mw * px, my + mh * py) for px, py in nodes_pts]
    for a, b in edges:
        line_seg(s, pts_xy[a][0], pts_xy[a][1],
                 pts_xy[b][0], pts_xy[b][1], color=ORANGE_L, weight=1.5)

    # nodes
    states = [SIGNAL_G, SIGNAL_G, SIGNAL_Y, SIGNAL_R, SIGNAL_G, SIGNAL_Y]
    for (px, py), c in zip(pts_xy, states):
        r = Inches(0.13)
        oval(s, px - r, py - r, r * 2, r * 2, fill=c)
        oval(s, px - r * 0.55, py - r * 0.55, r * 1.1, r * 1.1, fill=NAVY_2)
    # selected ring
    sx, sy = pts_xy[2]
    rr = Inches(0.25)
    oval(s, sx - rr, sy - rr, rr * 2, rr * 2,
         fill=NAVY_3, line=ORANGE, line_weight=1.5)
    oval(s, sx - Inches(0.1), sy - Inches(0.1), Inches(0.2), Inches(0.2),
         fill=SIGNAL_Y)

    # KPI strip bottom of map
    kpi_y = my + mh - Inches(0.5)
    kpi_x = mx + Inches(0.2)
    for i, (lbl, val, col) in enumerate([
            ("INCIDENTS", "03", SIGNAL_R),
            ("NODES", "12", SIGNAL_G),
            ("CONTROLLERS", "10", ORANGE_L),
            ("THROUGHPUT", "1.4k", GREEN_L)]):
        kx = kpi_x + Inches(1.8) * i
        rounded(s, kx, kpi_y, Inches(1.6), Inches(0.42),
                fill=NAVY_2, radius=0.15)
        text(s, kx + Inches(0.15), kpi_y + Inches(0.04),
             Inches(1.0), Inches(0.18), lbl, size=7, bold=True, color=GREY_2)
        text(s, kx + Inches(0.15), kpi_y + Inches(0.18),
             Inches(1.2), Inches(0.25), val, size=13, bold=True, color=col)

    # right side panels
    rx = mx + mw + Inches(0.2)
    rw = fw - (rx - fx) - Inches(0.2)
    ry = my; rh = mh
    panels = [
        ("ALERTS", [
            ("Carrefour A04 · Conflit signal", SIGNAL_R),
            ("Détecteur D12 · Hors-ligne", SIGNAL_Y),
            ("INT-CAS-006 · Override actif", ORANGE_L),
        ]),
        ("ZONE SÉLECTIONNÉE", [
            ("Mode : ADAPTIVE → MANUAL", ORANGE_L),
            ("Force-green NS · 60 s", GREEN_L),
            ("Reason : Emergency vehicle", ORANGE_L),
        ]),
    ]
    panel_h = (rh - Inches(0.2)) / 2
    for i, (ptitle, rows) in enumerate(panels):
        py = ry + (panel_h + Inches(0.2)) * i
        rounded(s, rx, py, rw, panel_h, fill=NAVY_2, radius=0.04)
        text(s, rx + Inches(0.2), py + Inches(0.12), rw - Inches(0.4),
             Inches(0.25), ptitle, size=9, bold=True, color=ORANGE)
        for j, (label, col) in enumerate(rows):
            ry_row = py + Inches(0.4) + Inches(0.42) * j
            oval(s, rx + Inches(0.2), ry_row + Inches(0.13),
                 Inches(0.12), Inches(0.12), fill=col)
            text(s, rx + Inches(0.45), ry_row + Inches(0.05),
                 rw - Inches(0.6), Inches(0.3),
                 label, size=10, color=WHITE)

    # bottom caption
    text(s, M_L, Inches(7.0), CONTENT_W, Inches(0.2),
         "Carte temps réel · alertes · zone sélectionnée  ·  Live map · alerts · selected area",
         size=10, italic=True, color=GREY, align=PP_ALIGN.CENTER)
    footer(s, page, total, ref)
    return s


def slide_override_flow(prs, ref, page, total):
    """5-step horizontal flow for override raisonné."""
    s = blank(prs); bg(s, CREAM)
    header(s, "O V E R R I D E   ·   R A I S O N N É",
           "Le chemin d'une commande, du clic au runtime")

    steps = [
        ("INTENT",   "Force phase",       "L'opérateur déclenche", ORANGE),
        ("REASON",   "Modal raison",      "9 codes · durée · note", ORANGE),
        ("VALIDATE", "Conflict matrix",   "UI · IA · runtime",      GREEN),
        ("PERSIST",  "Audit log",         "OverrideCommandEntity",  GREEN),
        ("EXECUTE",  "Runtime",           "Carrefour ack < 1 s",    ORANGE),
    ]
    n = len(steps)
    y0 = Inches(2.6); h = Inches(2.2)
    total_w = CONTENT_W
    gap = Inches(0.18)
    node_w = Emu(int((total_w - gap * (n - 1)) / n))

    for i, (k, title, sub, col) in enumerate(steps):
        x = M_L + (node_w + gap) * i
        rounded(s, x, y0, node_w, h, fill=CARD_BG, radius=0.05)
        rect(s, x, y0, node_w, Inches(0.10), fill=col)
        text(s, x + Inches(0.2), y0 + Inches(0.3),
             node_w - Inches(0.4), Inches(0.3),
             k, size=10, bold=True, color=col)
        # big number
        text(s, x + Inches(0.2), y0 + Inches(0.6),
             node_w - Inches(0.4), Inches(0.5),
             f"{i+1:02d}", size=24, bold=True, color=NAVY_DIM)
        text(s, x + Inches(0.2), y0 + Inches(1.1),
             node_w - Inches(0.4), Inches(0.5),
             title, size=14, bold=True, color=NAVY_2)
        text(s, x + Inches(0.2), y0 + Inches(1.55),
             node_w - Inches(0.4), Inches(0.5),
             sub, size=9, italic=True, color=GREY, line_spacing=1.2)
        if i < n - 1:
            arrow_right(s, x + node_w + Emu(2000),
                        y0 + h / 2 - Inches(0.12),
                        gap - Emu(4000), color=ORANGE, h=Inches(0.24))

    # bottom annotation strip
    y_an = Inches(5.4)
    rounded(s, M_L, y_an, CONTENT_W, Inches(1.4), fill=CARD_BG_2, radius=0.03)
    kicker(s, M_L + Inches(0.4), y_an + Inches(0.18), Inches(6),
           "POURQUOI  ·  WHY")
    text(s, M_L + Inches(0.4), y_an + Inches(0.5),
         CONTENT_W - Inches(0.8), Inches(0.4),
         "Chaque action est tracée — opérateur · IP · timestamp · raison · note.",
         size=14, bold=True, color=NAVY_2)
    text(s, M_L + Inches(0.4), y_an + Inches(0.95),
         CONTENT_W - Inches(0.8), Inches(0.3),
         "Every action is traced — operator · IP · timestamp · reason · note.",
         size=10, italic=True, color=GREY)
    footer(s, page, total, ref)
    return s


def slide_emergency_corridor(prs, ref, page, total):
    """Green-wave visual: 3 intersections + vehicle."""
    s = blank(prs); bg(s, CREAM)
    header(s, "P R I O R I T É   ·   U R G E N C E",
           "Couloir vert pour véhicule prioritaire")

    # canvas for road
    road_y = Inches(3.6); road_h = Inches(1.2)
    road_x = M_L + Inches(0.3); road_w = CONTENT_W - Inches(0.6)
    rect(s, road_x, road_y, road_w, road_h, fill=ASPHALT)
    # center dashed line
    dash_y = road_y + road_h / 2 - Emu(8000)
    dash_w = Inches(0.4); dash_gap = Inches(0.25)
    x_cur = road_x
    while x_cur < road_x + road_w:
        rect(s, x_cur, dash_y, dash_w, Emu(16000), fill=LANE_LINE)
        x_cur += dash_w + dash_gap

    # intersection cross-streets — 3 cross roads
    int_centers_pct = [0.18, 0.50, 0.82]
    cross_w = Inches(0.9)
    for px in int_centers_pct:
        cx = road_x + road_w * px
        # vertical crossroad
        rect(s, cx - cross_w / 2, road_y - Inches(0.7),
             cross_w, Inches(0.7), fill=ASPHALT)
        rect(s, cx - cross_w / 2, road_y + road_h,
             cross_w, Inches(0.7), fill=ASPHALT)
        # crosswalk strips at each side of the intersection
        for ox in [-cross_w / 2 - Inches(0.05), cross_w / 2 + Inches(0.05) - Inches(0.05)]:
            for k in range(4):
                rect(s, cx + ox + Inches(0.02) * (1 if ox > 0 else 0),
                     road_y + Inches(0.1) + Inches(0.25) * k,
                     Inches(0.05), Inches(0.15), fill=LANE_LINE)

    # signal heads at each intersection (showing E-W green, N-S red)
    for px in int_centers_pct:
        cx = road_x + road_w * px
        signal_head(s, cx - cross_w / 2 - Inches(0.18),
                    road_y - Inches(0.35), state="green")
        signal_head(s, cx + cross_w / 2 + Inches(0.18),
                    road_y + road_h + Inches(0.35), state="green")

    # vehicle (ambulance arrow) at left, with motion blur trails
    veh_y = road_y + road_h / 2 - Inches(0.16)
    for tr in range(3):
        vehicle_arrow(s, road_x + Inches(0.15) - Inches(0.4 * tr),
                      veh_y, w=Inches(0.4), h=Inches(0.3),
                      color=RGBColor(0xE0, 0x8A, 0x5F))
    vehicle_arrow(s, road_x + Inches(0.4), veh_y,
                  w=Inches(0.7), h=Inches(0.32), color=ORANGE)
    text(s, road_x + Inches(0.4), veh_y - Inches(0.35), Inches(2.4),
         Inches(0.25), "VÉHICULE PRIORITAIRE", size=8, bold=True,
         color=ORANGE)

    # time labels above each intersection
    for i, px in enumerate(int_centers_pct):
        cx = road_x + road_w * px
        t_lbl = f"T + {0 if i == 0 else (15 * i)} s"
        text(s, cx - Inches(0.8), road_y - Inches(1.05), Inches(1.6),
             Inches(0.3), t_lbl, size=11, bold=True, color=NAVY_2,
             align=PP_ALIGN.CENTER)
        rounded(s, cx - Inches(0.5), road_y - Inches(0.75),
                Inches(1.0), Inches(0.22), fill=SIGNAL_G, radius=0.4)
        text(s, cx - Inches(0.5), road_y - Inches(0.74), Inches(1.0),
             Inches(0.2), "GREEN", size=8, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER)

    # caption row below road
    y_cap = road_y + road_h + Inches(1.0)
    cards = [
        ("CONFLITS", "Triple-validés", "UI · IA · runtime"),
        ("DURÉE", "Préréglée", "60 s · 2 / 5 / 10 / 30 min"),
        ("RETOUR", "Auto", "Plan normal après timeout"),
    ]
    card_w = (CONTENT_W - Inches(0.4)) / 3
    for i, (k, t, sub) in enumerate(cards):
        x = M_L + (card_w + Inches(0.2)) * i
        rounded(s, x, y_cap, card_w, Inches(0.95), fill=CARD_BG, radius=0.04)
        rect(s, x, y_cap, Inches(0.06), Inches(0.95), fill=ORANGE)
        text(s, x + Inches(0.25), y_cap + Inches(0.12), card_w - Inches(0.4),
             Inches(0.22), k, size=9, bold=True, color=ORANGE)
        text(s, x + Inches(0.25), y_cap + Inches(0.34), card_w - Inches(0.4),
             Inches(0.32), t, size=14, bold=True, color=NAVY_2)
        text(s, x + Inches(0.25), y_cap + Inches(0.65), card_w - Inches(0.4),
             Inches(0.28), sub, size=9, italic=True, color=GREY)
    footer(s, page, total, ref)
    return s


def slide_ai_safety(prs, ref, page, total):
    """AI advisory pipeline — vertical flow with human gate."""
    s = blank(prs); bg(s, CREAM)
    header(s, "I A   ·   S A F E T Y",
           "L'IA conseille — la décision reste humaine")

    # left: pipeline
    px = M_L
    pw = Inches(6.2)
    py0 = Inches(2.3)
    steps = [
        ("INPUT",       "État trafic + contexte opérateur", ORANGE),
        ("AI",          "Gemini 1.5 Flash · ou rule-based fallback", ORANGE),
        ("VALIDATOR",   "Conflict matrix · phase cible · durée clampée", GREEN),
        ("HUMAN GATE",  "Approbation opérateur OBLIGATOIRE", ORANGE),
        ("RUNTIME",     "Exécution carrefour", GREEN),
    ]
    step_h = Inches(0.75)
    gap = Inches(0.15)
    for i, (k, title, col) in enumerate(steps):
        y = py0 + (step_h + gap) * i
        highlight = (i == 3)
        rounded(s, px, y, pw, step_h,
                fill=NAVY_2 if highlight else CARD_BG, radius=0.06)
        rect(s, px, y, Inches(0.08), step_h, fill=col)
        text(s, px + Inches(0.25), y + Inches(0.13), Inches(1.5), Inches(0.2),
             k, size=9, bold=True, color=col)
        text(s, px + Inches(0.25), y + Inches(0.36), pw - Inches(0.5),
             Inches(0.32), title, size=13, bold=True,
             color=WHITE if highlight else NAVY_2)
        if highlight:
            text(s, px + pw - Inches(0.8), y + Inches(0.22), Inches(0.7),
                 Inches(0.4), "★", size=22, bold=True, color=ORANGE,
                 align=PP_ALIGN.CENTER)
        if i < len(steps) - 1:
            arrow_down(s, px + Inches(0.4), y + step_h + Emu(2000),
                       gap - Emu(4000), color=ORANGE, w=Inches(0.2))

    # right: rules cards
    rx = px + pw + Inches(0.4)
    rw = SLIDE_W - M_R - rx
    text(s, rx, Inches(2.3), rw, Inches(0.3),
         "RÈGLES DE SÉCURITÉ  ·  SAFETY RULES",
         size=10, bold=True, color=ORANGE)
    rules = [
        ("Aucune auto-application en mode réel",
         "No auto-apply in real mode"),
        ("Override · Urgence · Flash · Fail-safe → IA suppressed",
         "Override · Emergency · Flash · Fail-safe → AI suppressed"),
        ("Durée clampée [min_green, 60 s]",
         "Duration clamped [min_green, 60 s]"),
        ("Conflict matrix vérifiée 3 fois",
         "Conflict matrix checked three times"),
        ("Cible inconnue → no_action",
         "Unknown target phase → no_action"),
    ]
    ry = Inches(2.65); row_h = Inches(0.78)
    for i, (fr, en) in enumerate(rules):
        y = ry + row_h * i
        oval(s, rx, y + Inches(0.18), Inches(0.18), Inches(0.18), fill=GREEN)
        text(s, rx + Inches(0.06), y + Inches(0.16), Inches(0.18),
             Inches(0.18), "✓", size=9, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER)
        text(s, rx + Inches(0.35), y + Inches(0.08), rw - Inches(0.5),
             Inches(0.3), fr, size=12, bold=True, color=NAVY_2)
        text(s, rx + Inches(0.35), y + Inches(0.38), rw - Inches(0.5),
             Inches(0.25), en, size=9, italic=True, color=GREY)
    footer(s, page, total, ref)
    return s


def slide_audit_flow(prs, ref, page, total):
    """Audit trail horizontal flow + metadata chips."""
    s = blank(prs); bg(s, CREAM)
    header(s, "A U D I T   ·   T R A Ç A B I L I T É",
           "Du clic à l'archive : la chaîne d'évidence")

    steps = [
        ("COMMAND",  "Force phase",       ORANGE),
        ("CAPTURE",  "Metadata", ORANGE),
        ("SIGN",     "HMAC-SHA256", GREEN),
        ("STORE",    "OverrideCommandEntity", GREEN),
        ("EXPORT",   "CSV · PDF hiérarchie", ORANGE),
    ]
    n = len(steps)
    y0 = Inches(2.4); h = Inches(1.6)
    gap = Inches(0.16)
    node_w = Emu(int((CONTENT_W - gap * (n - 1)) / n))
    for i, (k, title, col) in enumerate(steps):
        x = M_L + (node_w + gap) * i
        rounded(s, x, y0, node_w, h, fill=CARD_BG, radius=0.05)
        rect(s, x, y0, node_w, Inches(0.08), fill=col)
        text(s, x + Inches(0.2), y0 + Inches(0.25), node_w - Inches(0.4),
             Inches(0.3), k, size=10, bold=True, color=col)
        text(s, x + Inches(0.2), y0 + Inches(0.6), node_w - Inches(0.4),
             Inches(0.4), title, size=14, bold=True, color=NAVY_2,
             line_spacing=1.15)
        text(s, x + Inches(0.2), y0 + Inches(1.1), node_w - Inches(0.4),
             Inches(0.35), f"{i+1:02d}", size=14, bold=True, color=NAVY_DIM)
        if i < n - 1:
            arrow_right(s, x + node_w + Emu(1500), y0 + h / 2 - Inches(0.11),
                        gap - Emu(3000), color=ORANGE, h=Inches(0.22))

    # metadata chips strip
    y_c = Inches(4.55)
    text(s, M_L, y_c, CONTENT_W, Inches(0.3),
         "METADATA CAPTURÉE  ·  CAPTURED METADATA",
         size=10, bold=True, color=ORANGE)
    chips = ["operator-id", "ip", "timestamp", "reason-code",
             "duration", "note", "intersection-code", "session-id"]
    chip_y = y_c + Inches(0.45)
    cx = M_L
    for c in chips:
        cw = Inches(0.15 * len(c) + 0.5)
        rounded(s, cx, chip_y, cw, Inches(0.4), fill=NAVY_2, radius=0.4)
        text(s, cx + Inches(0.1), chip_y + Inches(0.08), cw - Inches(0.2),
             Inches(0.25), c, size=10, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER)
        cx += cw + Inches(0.15)

    # RBAC strip
    y_r = Inches(5.7)
    rounded(s, M_L, y_r, CONTENT_W, Inches(1.2), fill=CARD_BG_2, radius=0.04)
    kicker(s, M_L + Inches(0.35), y_r + Inches(0.15), Inches(6),
           "RBAC GRANULAIRE  ·  GRANULAR ROLES")
    perms = [("command-platform.read", GREEN),
             ("command-platform.control", ORANGE),
             ("engineering.author", GREEN),
             ("engineering.approve", ORANGE)]
    px = M_L + Inches(0.35); py = y_r + Inches(0.55)
    for name, col in perms:
        cw = Inches(2.7)
        rounded(s, px, py, cw, Inches(0.45), fill=NAVY_2, radius=0.1)
        oval(s, px + Inches(0.18), py + Inches(0.15), Inches(0.15),
             Inches(0.15), fill=col)
        text(s, px + Inches(0.45), py + Inches(0.1), cw - Inches(0.5),
             Inches(0.3), name, size=10, bold=True, color=WHITE)
        px += cw + Inches(0.18)
    footer(s, page, total, ref)
    return s


def slide_architecture_stack(prs, ref, page, total):
    """Layered architecture stack with arrows between layers."""
    s = blank(prs); bg(s, CREAM)
    header(s, "A R C H I T E C T U R E   ·   S O U V E R A I N E",
           "Six couches, du capteur au superviseur")

    layers = [
        ("USERS",       "Opérateur · Ingénieur · Police",
         "Operator · Engineer · Police radio", ORANGE),
        ("APPLICATION", "Next.js 16 · React 19 · @react-google-maps",
         "Frontend & dashboards", ORANGE),
        ("SERVICES",    "NestJS 11 · auth · traffic · overrides · audit · AI",
         "Business services", GREEN),
        ("DATA",        "PostgreSQL · NATS events · object store",
         "Persistance & messaging", GREEN),
        ("EDGE",        "Go runtime · HMAC · JWT · offline cache",
         "Per-intersection cabinet", ORANGE),
        ("FIELD",       "Signal heads · loop detectors · ped buttons",
         "Hardware sur le terrain", GREEN),
    ]
    y0 = Inches(2.2); avail = FOOTER_RULE_Y - y0 - Inches(0.3)
    n = len(layers)
    gap = Inches(0.08)
    layer_h = Emu(int((avail - gap * (n - 1)) / n))
    for i, (k, fr, en, col) in enumerate(layers):
        y = y0 + (layer_h + gap) * i
        rounded(s, M_L, y, CONTENT_W, layer_h, fill=CARD_BG, radius=0.04)
        rect(s, M_L, y, Inches(0.1), layer_h, fill=col)
        # number circle
        oval(s, M_L + Inches(0.35), y + Inches(0.15),
             Inches(0.5), Inches(0.5), fill=col)
        text(s, M_L + Inches(0.35), y + Inches(0.2), Inches(0.5),
             Inches(0.35), f"{i+1:02d}", size=12, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        # label
        text(s, M_L + Inches(1.05), y + Inches(0.13), Inches(2.3),
             Inches(0.3), k, size=11, bold=True, color=col)
        text(s, M_L + Inches(1.05), y + Inches(0.42), Inches(2.3),
             Inches(0.3), "Layer " + str(i + 1), size=8, italic=True, color=GREY)
        # contents
        text(s, M_L + Inches(3.5), y + Inches(0.13),
             CONTENT_W - Inches(3.8), Inches(0.35),
             fr, size=13, bold=True, color=NAVY_2)
        text(s, M_L + Inches(3.5), y + Inches(0.45),
             CONTENT_W - Inches(3.8), Inches(0.3),
             en, size=9, italic=True, color=GREY)
        # vertical connector between layers (small triangle)
        if i < n - 1:
            cx = M_L + Inches(2.2)
            arrow_down(s, cx, y + layer_h + Emu(2000),
                       gap - Emu(4000), color=GREY_2, w=Inches(0.18))
    footer(s, page, total, ref)
    return s


def slide_roadmap(prs, ref, page, total, kicker_t, title, columns):
    s = blank(prs); bg(s, CREAM)
    header(s, kicker_t, title)
    n = len(columns)
    gap = Inches(0.4)
    col_w = Emu(int((CONTENT_W - gap * (n - 1)) / n))
    y = Inches(2.3)
    palette = [ORANGE, NAVY_2, GREEN]
    for i, col in enumerate(columns):
        x = M_L + (col_w + gap) * i
        c = palette[i % len(palette)]
        rect(s, x, y, col_w, Inches(0.07), fill=c)
        text(s, x, y + Inches(0.22), col_w, Inches(0.32),
             col["label"].upper(), size=11, bold=True, color=c)
        text(s, x, y + Inches(0.55), col_w, Inches(0.32),
             col["range"], size=10.5, color=GREY, italic=True)
        ty = y + Inches(1.20)
        for j, (fr, en) in enumerate(col["items"]):
            num = col.get("start", 1) + j
            text(s, x, ty, Inches(0.8), Inches(0.4),
                 f"{num:02d}", size=18, color=c)
            text(s, x + Inches(0.85), ty + Inches(0.04),
                 col_w - Inches(0.95), Inches(0.4),
                 fr, size=13, bold=True, color=NAVY_2, line_spacing=1.2)
            text(s, x + Inches(0.85), ty + Inches(0.45),
                 col_w - Inches(0.95), Inches(0.45),
                 en, size=9, italic=True, color=GREY, line_spacing=1.25)
            ty += Inches(1.15)
    footer(s, page, total, ref)
    return s


# =============================================================================
# DIAGRAM SLIDES — BE DECK
# =============================================================================
def slide_three_plane(prs, ref, page, total):
    """3-plane architecture: Authoring | Operating | Edge over shared data."""
    s = blank(prs); bg(s, CREAM)
    header(s, "A R C H I T E C T U R E   ·   S T L S",
           "Trois plans de travail, une seule plateforme")

    y0 = Inches(2.3)
    planes_h = Inches(3.0)
    planes = [
        ("AUTHORING", "Studio",
         ["Workbench IDE", "AutoCAD vectoriel", "Dossiers PDF"],
         "Ingénieur trafic / BE", ORANGE),
        ("OPERATING", "Command",
         ["Carte temps réel", "Alertes & KPI", "Override raisonné"],
         "Opérateur 24/7 / Police", GREEN),
        ("EDGE", "Runtime Go",
         ["HMAC + JWT", "Offline cache", "Fail-safe modes"],
         "Carrefour cabinet", ORANGE),
    ]
    n = len(planes)
    gap = Inches(0.3)
    col_w = Emu(int((CONTENT_W - gap * (n - 1)) / n))
    for i, (k, name, items, persona, col) in enumerate(planes):
        x = M_L + (col_w + gap) * i
        rounded(s, x, y0, col_w, planes_h, fill=CARD_BG, radius=0.04)
        rounded(s, x, y0, col_w, Inches(0.10), fill=col, radius=0.4)
        text(s, x + Inches(0.3), y0 + Inches(0.25), col_w - Inches(0.4),
             Inches(0.3), k, size=10, bold=True, color=col)
        text(s, x + Inches(0.3), y0 + Inches(0.55), col_w - Inches(0.4),
             Inches(0.6), name, size=28, bold=True, color=NAVY_2)
        text(s, x + Inches(0.3), y0 + Inches(1.15), col_w - Inches(0.4),
             Inches(0.25), persona, size=9, italic=True, color=GREY)
        hline(s, x + Inches(0.3), y0 + Inches(1.5), Inches(0.5),
              color=col, weight_emu=18000)
        for j, item in enumerate(items):
            iy = y0 + Inches(1.7) + Inches(0.35) * j
            rect(s, x + Inches(0.32), iy + Inches(0.13),
                 Inches(0.08), Inches(0.08), fill=col)
            text(s, x + Inches(0.5), iy + Inches(0.04),
                 col_w - Inches(0.7), Inches(0.3),
                 item, size=12, color=NAVY_2)

    # shared data layer at bottom
    y_data = y0 + planes_h + Inches(0.35)
    data_h = Inches(1.4)
    rounded(s, M_L, y_data, CONTENT_W, data_h, fill=NAVY_2, radius=0.04)
    text(s, M_L + Inches(0.4), y_data + Inches(0.18), Inches(8),
         Inches(0.3), "SHARED DATA LAYER", size=10, bold=True, color=ORANGE)
    text(s, M_L + Inches(0.4), y_data + Inches(0.5), Inches(8), Inches(0.4),
         "PostgreSQL  ·  TypeORM  ·  audit logs  ·  object store",
         size=16, bold=True, color=WHITE)
    text(s, M_L + Inches(0.4), y_data + Inches(0.95), CONTENT_W - Inches(0.8),
         Inches(0.3),
         "Single source of truth — intersections, phases, plans, audits.",
         size=10, italic=True, color=GREY_2)
    # connectors from each plane down to data layer
    for i in range(n):
        x = M_L + (col_w + gap) * i + col_w / 2
        arrow_down(s, x - Inches(0.1), y0 + planes_h + Emu(2000),
                   Inches(0.35) - Emu(4000), color=GREY_2, w=Inches(0.2))
    footer(s, page, total, ref)
    return s


def slide_studio_map(prs, ref, page, total):
    """Morocco map mockup with city dots and right-side legend."""
    s = blank(prs); bg(s, CREAM)
    header(s, "S T U D I O   L A N D I N G   ·   / s t u d i o",
           "L'atlas interactif de tous les contrôleurs")

    # map canvas
    mx = M_L; my = Inches(2.3); mw = Inches(8.4); mh = Inches(4.4)
    rounded(s, mx, my, mw, mh, fill=NAVY_2, radius=0.02)
    # subtle grid
    for gx in range(1, 8):
        line_seg(s, mx + mw * gx / 8, my, mx + mw * gx / 8, my + mh,
                 color=NAVY_RULE, weight=0.5)
    for gy in range(1, 5):
        line_seg(s, mx, my + mh * gy / 5, mx + mw, my + mh * gy / 5,
                 color=NAVY_RULE, weight=0.5)

    # MAROC label faintly behind
    text(s, mx + Inches(0.5), my + mh - Inches(0.65), Inches(3),
         Inches(0.5), "M A R O C", size=22, bold=True, color=NAVY_3)

    # Stylised country shape (rounded polygon approx via rounded rect)
    country_x = mx + mw * 0.18; country_y = my + mh * 0.18
    country_w = mw * 0.62; country_h = mh * 0.62
    rounded(s, country_x, country_y, country_w, country_h,
            fill=NAVY_3, line=NAVY_RULE, line_weight=0.75, radius=0.15)

    # cities (relative positions)
    cities = [
        ("Tanger",    0.32, 0.10, True),
        ("Rabat",     0.42, 0.22, True),
        ("Casablanca", 0.40, 0.31, True),  # highlighted
        ("Fès",       0.60, 0.22, False),
        ("Marrakech", 0.50, 0.45, True),
        ("Agadir",    0.40, 0.60, False),
        ("Laâyoune",  0.30, 0.85, False),
    ]
    for name, px, py, active in cities:
        cx = mx + mw * px; cy = my + mh * py
        if name == "Casablanca":
            oval(s, cx - Inches(0.25), cy - Inches(0.25), Inches(0.5),
                 Inches(0.5), fill=NAVY_3, line=ORANGE, line_weight=2)
            oval(s, cx - Inches(0.13), cy - Inches(0.13), Inches(0.26),
                 Inches(0.26), fill=ORANGE)
        else:
            r = Inches(0.13) if active else Inches(0.10)
            oval(s, cx - r, cy - r, r * 2, r * 2,
                 fill=ORANGE if active else NAVY_DIM)
        text(s, cx + Inches(0.22), cy - Inches(0.13), Inches(1.6),
             Inches(0.25),
             name, size=10, bold=active, color=WHITE if active else GREY_2)

    # corridor lines between cities
    corridor_pairs = [(0, 1), (1, 2), (1, 3), (2, 4), (4, 5)]
    for a, b in corridor_pairs:
        ax = mx + mw * cities[a][1]; ay = my + mh * cities[a][2]
        bx = mx + mw * cities[b][1]; by = my + mh * cities[b][2]
        line_seg(s, ax, ay, bx, by, color=ORANGE_L, weight=1, dashed=True)

    # right-side legend / counters
    rx = mx + mw + Inches(0.3)
    rw = SLIDE_W - M_R - rx
    text(s, rx, my, rw, Inches(0.3),
         "ÉTAT FLOTTE  ·  FLEET STATE", size=10, bold=True, color=ORANGE)
    stats = [
        ("Online",    "08", SIGNAL_G),
        ("Degraded",  "02", SIGNAL_Y),
        ("Offline",   "01", SIGNAL_R),
        ("Proposals", "03", ORANGE_L),
    ]
    sy = my + Inches(0.4); row_h = Inches(0.62)
    for i, (lbl, val, col) in enumerate(stats):
        y = sy + row_h * i
        rounded(s, rx, y, rw, Inches(0.55), fill=CARD_BG, radius=0.06)
        oval(s, rx + Inches(0.18), y + Inches(0.18),
             Inches(0.2), Inches(0.2), fill=col)
        text(s, rx + Inches(0.5), y + Inches(0.13), Inches(2.5),
             Inches(0.32), lbl, size=12, bold=True, color=NAVY_2)
        text(s, rx + rw - Inches(0.9), y + Inches(0.08), Inches(0.7),
             Inches(0.4), val, size=22, bold=True, color=col,
             align=PP_ALIGN.RIGHT)

    # filters chip
    fy = sy + row_h * len(stats) + Inches(0.15)
    text(s, rx, fy, rw, Inches(0.25),
         "FILTRES", size=10, bold=True, color=ORANGE)
    chips = [("ALL", True), ("ONLINE", False),
             ("DEGRADED", False), ("OFFLINE", False)]
    cy = fy + Inches(0.35)
    cx = rx
    for name, active in chips:
        cw = Inches(0.15 * len(name) + 0.45)
        rounded(s, cx, cy, cw, Inches(0.32),
                fill=ORANGE if active else CARD_BG, radius=0.5)
        text(s, cx, cy + Inches(0.06), cw, Inches(0.22),
             name, size=8, bold=True,
             color=WHITE if active else GREY,
             align=PP_ALIGN.CENTER)
        cx += cw + Inches(0.1)
        if cx > rx + rw - Inches(0.5):
            cx = rx
            cy += Inches(0.4)
    footer(s, page, total, ref)
    return s


def slide_workbench_ide(prs, ref, page, total):
    """3-panel IDE wireframe: Explorer | Editor | Control."""
    s = blank(prs); bg(s, CREAM)
    header(s, "W O R K B E N C H   ·   / s t u d i o / w o r k b e n c h",
           "IDE d'ingénierie en trois panneaux")

    fx = M_L; fy = Inches(2.25); fw = CONTENT_W; fh = Inches(4.7)
    rounded(s, fx, fy, fw, fh, fill=NAVY_2, radius=0.02)
    # title bar
    rect(s, fx, fy, fw, Inches(0.32), fill=NAVY_3)
    for i, c in enumerate([SIGNAL_R, SIGNAL_Y, SIGNAL_G]):
        oval(s, fx + Inches(0.12 + i * 0.18), fy + Inches(0.10),
             Inches(0.13), Inches(0.13), fill=c)
    text(s, fx + Inches(0.8), fy + Inches(0.07), Inches(7), Inches(0.2),
         "stls.tomorrow-systems.com / studio / workbench / INT-CAS-006",
         size=9, color=GREY_2)

    # split columns
    bx = fx + Inches(0.1); by = fy + Inches(0.42)
    bw = fw - Inches(0.2); bh = fh - Inches(0.52)

    # column widths: 25 / 50 / 25
    cw1 = bw * 0.24; cw2 = bw * 0.50; cw3 = bw * 0.26
    gap = Inches(0.06)
    cx1 = bx
    cx2 = cx1 + cw1 + gap
    cx3 = cx2 + cw2 + gap

    # --- Project Explorer ---
    rounded(s, cx1, by, cw1, bh, fill=NAVY_3, radius=0.02)
    text(s, cx1 + Inches(0.18), by + Inches(0.12), cw1, Inches(0.22),
         "PROJECT EXPLORER", size=8, bold=True, color=ORANGE)
    tree = [
        ("Morocco",        0, False),
        (" Casablanca",    1, False),
        ("  · INT-CAS-001", 2, False),
        ("  · INT-CAS-006", 2, True),   # selected
        ("  · INT-CAS-009", 2, False),
        ("  · Prop · ZN-04", 2, False),
        (" Rabat",         1, False),
        ("  · INT-RBT-002", 2, False),
    ]
    for i, (name, lvl, selected) in enumerate(tree):
        ry = by + Inches(0.4) + Inches(0.28) * i
        if selected:
            rect(s, cx1 + Inches(0.08), ry - Inches(0.02),
                 cw1 - Inches(0.16), Inches(0.27), fill=ORANGE)
        text(s, cx1 + Inches(0.15) + Inches(0.1) * lvl, ry,
             cw1 - Inches(0.3), Inches(0.25), name, size=9, bold=selected,
             color=WHITE if selected else GREY_2)

    # --- Editor Workspace ---
    rounded(s, cx2, by, cw2, bh, fill=NAVY_3, radius=0.02)
    # tab bar
    tab_y = by + Inches(0.08)
    tabs = ["Diagram", "Live", "Identity", "Approaches",
            "Lanes", "Signal grps", "Phases", "Detectors",
            "Modes", "Controller"]
    tx = cx2 + Inches(0.1)
    for j, name in enumerate(tabs):
        tw = Inches(0.15 * len(name) + 0.3)
        active = (j == 0)
        rounded(s, tx, tab_y, tw, Inches(0.26),
                fill=ORANGE if active else NAVY_2, radius=0.2)
        text(s, tx, tab_y + Inches(0.04), tw, Inches(0.2),
             name, size=7, bold=active,
             color=WHITE if active else GREY_2, align=PP_ALIGN.CENTER)
        tx += tw + Inches(0.04)
        if tx > cx2 + cw2 - Inches(0.2):
            break
    # canvas: mini intersection schematic
    canvas_y = by + Inches(0.5)
    canvas_h = bh - Inches(0.6)
    rounded(s, cx2 + Inches(0.15), canvas_y, cw2 - Inches(0.3),
            canvas_h, fill=NAVY_2, radius=0.02)
    ccx = cx2 + cw2 / 2; ccy = canvas_y + canvas_h / 2
    # cross roads
    rect(s, ccx - cw2 * 0.35, ccy - Inches(0.25),
         cw2 * 0.7, Inches(0.5), fill=ASPHALT)
    rect(s, ccx - Inches(0.25), ccy - canvas_h * 0.4,
         Inches(0.5), canvas_h * 0.8, fill=ASPHALT)
    # signals at corners
    signal_head(s, ccx - Inches(0.4), ccy - Inches(0.5), state="green")
    signal_head(s, ccx + Inches(0.4), ccy + Inches(0.5), state="green")
    signal_head(s, ccx - Inches(0.55), ccy + Inches(0.4), state="red")
    signal_head(s, ccx + Inches(0.55), ccy - Inches(0.4), state="red")
    text(s, cx2 + Inches(0.2), canvas_y + canvas_h - Inches(0.3),
         Inches(3), Inches(0.25),
         "INT-CAS-006 · diagram view", size=8, italic=True, color=GREY_2)

    # --- Control Panel ---
    rounded(s, cx3, by, cw3, bh, fill=NAVY_3, radius=0.02)
    text(s, cx3 + Inches(0.18), by + Inches(0.12), cw3, Inches(0.22),
         "CONTROL PANEL", size=8, bold=True, color=GREEN_L)
    controls = [
        ("Mode",          "ADAPTIVE", GREEN_L),
        ("Force phase",   "—",         GREY_2),
        ("Force green",   "—",         GREY_2),
        ("Override",      "ACTIVE",    ORANGE_L),
        ("Action log",    "12 entries", GREY_2),
    ]
    for i, (label, value, vcol) in enumerate(controls):
        ry = by + Inches(0.4) + Inches(0.58) * i
        rounded(s, cx3 + Inches(0.12), ry, cw3 - Inches(0.24),
                Inches(0.5), fill=NAVY_2, radius=0.1)
        text(s, cx3 + Inches(0.22), ry + Inches(0.06), cw3, Inches(0.2),
             label, size=8, bold=True, color=GREY_2)
        text(s, cx3 + Inches(0.22), ry + Inches(0.23), cw3 - Inches(0.4),
             Inches(0.25), value, size=10, bold=True, color=vcol)
    footer(s, page, total, ref)
    return s


def slide_signal_cycle(prs, ref, page, total):
    """Signal cycle timing diagram + small intersection."""
    s = blank(prs); bg(s, CREAM)
    header(s, "C Y C L E   ·   I N G É N I E R I E",
           "Construire un plan de feux : phases, stages, timings")

    # left: timing chart
    tx = M_L; ty = Inches(2.4); tw = Inches(8.2); th = Inches(3.8)
    rounded(s, tx, ty, tw, th, fill=CARD_BG, radius=0.03)
    text(s, tx + Inches(0.3), ty + Inches(0.18), Inches(5), Inches(0.3),
         "CYCLE  ·  90 s", size=10, bold=True, color=ORANGE)
    text(s, tx + Inches(0.3), ty + Inches(0.45), Inches(5), Inches(0.3),
         "Plan de feux type — 3 phases", size=14, bold=True, color=NAVY_2)

    # time axis
    chart_x = tx + Inches(1.5); chart_y = ty + Inches(1.1)
    chart_w = tw - Inches(1.8); chart_h = Inches(2.4)
    rect(s, chart_x, chart_y + chart_h + Inches(0.05), chart_w,
         Emu(8000), fill=NAVY_DIM)
    for t in [0, 30, 45, 60, 90]:
        tx_pos = chart_x + chart_w * t / 90
        line_seg(s, tx_pos, chart_y, tx_pos,
                 chart_y + chart_h + Inches(0.1),
                 color=NAVY_DIM, weight=0.5, dashed=True)
        text(s, tx_pos - Inches(0.3), chart_y + chart_h + Inches(0.15),
             Inches(0.6), Inches(0.25), f"{t}s",
             size=9, color=GREY, align=PP_ALIGN.CENTER)
    # groups
    groups = [
        ("N-S véh.", [(0, 27, "green"), (27, 30, "yellow"), (30, 90, "red")]),
        ("E-W véh.", [(0, 33, "red"), (33, 57, "green"), (57, 60, "yellow"), (60, 90, "red")]),
        ("PIÉTONS", [(0, 60, "red"), (60, 84, "green"), (84, 90, "red")]),
    ]
    row_h = chart_h / 3
    state_colors = {"green": SIGNAL_G, "yellow": SIGNAL_Y, "red": SIGNAL_R}
    for i, (g_name, slots) in enumerate(groups):
        gy = chart_y + row_h * i + Inches(0.05)
        text(s, tx + Inches(0.3), gy + row_h / 2 - Inches(0.18),
             Inches(1.1), Inches(0.3),
             g_name, size=10, bold=True, color=NAVY_2)
        for t0, t1, st in slots:
            sx = chart_x + chart_w * t0 / 90
            sw = chart_w * (t1 - t0) / 90
            rect(s, sx, gy + Inches(0.08), sw, row_h - Inches(0.25),
                 fill=state_colors[st])

    # right: mini intersection live preview
    rx = tx + tw + Inches(0.3); ry = ty
    rw = SLIDE_W - M_R - rx; rh = th
    rounded(s, rx, ry, rw, rh, fill=NAVY_2, radius=0.03)
    text(s, rx + Inches(0.25), ry + Inches(0.18), rw, Inches(0.3),
         "LIVE PREVIEW", size=10, bold=True, color=ORANGE)
    text(s, rx + Inches(0.25), ry + Inches(0.45), rw, Inches(0.3),
         "Phase 1 · T+12 s", size=12, bold=True, color=WHITE)

    # tiny intersection
    icx = rx + rw / 2; icy = ry + rh / 2 + Inches(0.3)
    rect(s, icx - rw * 0.35, icy - Inches(0.3), rw * 0.7, Inches(0.6),
         fill=ASPHALT)
    rect(s, icx - Inches(0.3), icy - rh * 0.32, Inches(0.6), rh * 0.45,
         fill=ASPHALT)
    signal_head(s, icx - Inches(0.55), icy - Inches(0.55), state="green")
    signal_head(s, icx + Inches(0.55), icy + Inches(0.55), state="green")
    signal_head(s, icx - Inches(0.7), icy + Inches(0.45), state="red")
    signal_head(s, icx + Inches(0.7), icy - Inches(0.45), state="red")
    text(s, rx + Inches(0.25), ry + rh - Inches(0.5), rw - Inches(0.5),
         Inches(0.3), "N-S vert · E-W rouge",
         size=10, italic=True, color=GREY_2, align=PP_ALIGN.CENTER)
    footer(s, page, total, ref)
    return s


def slide_controller_polling(prs, ref, page, total):
    """Live polling diagram: 4 nodes with annotated arrows."""
    s = blank(prs); bg(s, CREAM)
    header(s, "C O N T R O L L E R   W O R K S P A C E",
           "Flux temps réel — du clic au feu, en moins d'une seconde")

    # 4 horizontal nodes
    nodes = [
        ("OPERATOR",  "Console", "Next.js · React 19",  ORANGE),
        ("BACKEND",   "API",     "NestJS · TypeORM",    GREEN),
        ("RUNTIME",   "Go agent", "HMAC · offline",     ORANGE),
        ("HARDWARE",  "Cabinet",  "Signal heads · loops", GREEN),
    ]
    n = len(nodes)
    y0 = Inches(3.0); h = Inches(1.7)
    gap = Inches(0.5)
    node_w = Emu(int((CONTENT_W - gap * (n - 1)) / n))

    for i, (k, title, sub, col) in enumerate(nodes):
        x = M_L + (node_w + gap) * i
        rounded(s, x, y0, node_w, h, fill=CARD_BG, radius=0.05)
        rounded(s, x, y0, node_w, Inches(0.10), fill=col, radius=0.4)
        text(s, x + Inches(0.25), y0 + Inches(0.25), node_w - Inches(0.4),
             Inches(0.3), k, size=10, bold=True, color=col)
        text(s, x + Inches(0.25), y0 + Inches(0.6), node_w - Inches(0.4),
             Inches(0.5), title, size=22, bold=True, color=NAVY_2)
        text(s, x + Inches(0.25), y0 + Inches(1.15), node_w - Inches(0.4),
             Inches(0.4), sub, size=10, italic=True, color=GREY)
        if i < n - 1:
            ax = x + node_w + Emu(4000); ay = y0 + h / 2
            # right arrow (operator → backend etc.)
            arrow_right(s, ax, ay - Inches(0.30),
                        gap - Emu(8000), color=ORANGE, h=Inches(0.18))
            # left arrow (response)
            a2 = slide.shapes.add_shape if False else None  # no-op
            la = s.shapes.add_shape(MSO_SHAPE.LEFT_ARROW, ax,
                                    ay + Inches(0.10),
                                    gap - Emu(8000), Inches(0.18))
            la.fill.solid(); la.fill.fore_color.rgb = GREEN
            la.line.fill.background(); la.shadow.inherit = False

    # annotations under each arrow
    labels = [
        ("POST /overrides", "GET /state · 1 s"),
        ("HTTPS + JWT",     "WebSocket events"),
        ("HMAC signed",     "Telemetry up"),
    ]
    for i, (req, resp) in enumerate(labels):
        x = M_L + (node_w + gap) * i + node_w
        # request label (top)
        text(s, x, y0 + h / 2 - Inches(0.55), gap, Inches(0.22),
             req, size=8, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)
        # response label (bottom)
        text(s, x, y0 + h / 2 + Inches(0.30), gap, Inches(0.22),
             resp, size=8, bold=True, color=GREEN, align=PP_ALIGN.CENTER)

    # bottom timing strip
    y_b = Inches(5.4)
    rounded(s, M_L, y_b, CONTENT_W, Inches(1.4), fill=NAVY_2, radius=0.04)
    text(s, M_L + Inches(0.4), y_b + Inches(0.18), Inches(8),
         Inches(0.3), "TIMING TYPIQUE  ·  TYPICAL TIMING",
         size=10, bold=True, color=ORANGE)
    tt = [
        ("Refresh /state",  "1 s",       ORANGE_L),
        ("Override → ack",  "< 1 s",     GREEN_L),
        ("Heartbeat up",    "30 s",      ORANGE_L),
        ("Failover offline", "Immediat", GREEN_L),
    ]
    item_w = (CONTENT_W - Inches(0.8)) / 4
    for i, (label, val, col) in enumerate(tt):
        ix = M_L + Inches(0.4) + item_w * i
        text(s, ix, y_b + Inches(0.5), item_w, Inches(0.4),
             val, size=20, bold=True, color=col)
        text(s, ix, y_b + Inches(0.95), item_w, Inches(0.3),
             label, size=9, italic=True, color=GREY_2)
    footer(s, page, total, ref)
    return s


def slide_autocad_plan(prs, ref, page, total):
    """Top-down vectorial intersection plan with labels."""
    s = blank(prs); bg(s, CREAM)
    header(s, "A U T O C A D   ·   P L A N   V E C T O R I E L",
           "Le plan d'aménagement — modèle pur vecteur")

    # plan canvas
    cx = M_L; cy = Inches(2.25); cw = Inches(8.5); ch = Inches(4.7)
    rounded(s, cx, cy, cw, ch, fill=CREAM, line=NAVY_DIM,
            line_weight=1.0, radius=0.01)

    icx = cx + cw / 2; icy = cy + ch / 2 + Inches(0.1)

    # roads — wide cross
    road_thick = Inches(1.0)
    rect(s, cx + Inches(0.3), icy - road_thick / 2,
         cw - Inches(0.6), road_thick, fill=ASPHALT_L)
    rect(s, icx - road_thick / 2, cy + Inches(0.3),
         road_thick, ch - Inches(0.6), fill=ASPHALT_L)

    # lane lines
    for sx in [icx - Inches(0.5) - cw * 0.35 / 2 - cw * 0.05,
               icx - cw * 0.35 / 2,
               icx + cw * 0.35 / 2,
               icx + cw * 0.35 / 2 + cw * 0.05 + Inches(0.5)]:
        pass  # skip, complex
    # center dashed lines horizontal
    for x0 in range(0, 7):
        sx = cx + Inches(0.4) + Inches(1.1) * x0
        if abs(sx - icx) > road_thick * 0.6:
            rect(s, sx, icy - Emu(8000), Inches(0.3), Emu(16000),
                 fill=LANE_LINE)
    for y0 in range(0, 4):
        sy = cy + Inches(0.4) + Inches(1.0) * y0
        if abs(sy - icy) > road_thick * 0.6:
            rect(s, icx - Emu(8000), sy, Emu(16000), Inches(0.25),
                 fill=LANE_LINE)

    # crosswalks (zebra)
    cw_w = Inches(0.6); zebra_thick = Inches(0.08)
    # north crosswalk
    for k in range(6):
        rect(s, icx - road_thick / 2 + Inches(0.1) * k,
             icy - road_thick / 2 - Inches(0.4),
             Inches(0.07), Inches(0.35), fill=LANE_LINE)
    # south
    for k in range(6):
        rect(s, icx - road_thick / 2 + Inches(0.1) * k,
             icy + road_thick / 2 + Inches(0.05),
             Inches(0.07), Inches(0.35), fill=LANE_LINE)
    # west
    for k in range(6):
        rect(s, icx - road_thick / 2 - Inches(0.4),
             icy - road_thick / 2 + Inches(0.1) * k,
             Inches(0.35), Inches(0.07), fill=LANE_LINE)
    # east
    for k in range(6):
        rect(s, icx + road_thick / 2 + Inches(0.05),
             icy - road_thick / 2 + Inches(0.1) * k,
             Inches(0.35), Inches(0.07), fill=LANE_LINE)

    # stop lines (thick white)
    rect(s, icx - road_thick / 2, icy - road_thick / 2 - Inches(0.05),
         road_thick / 2, Inches(0.05), fill=WHITE)
    rect(s, icx, icy + road_thick / 2, road_thick / 2,
         Inches(0.05), fill=WHITE)
    rect(s, icx - road_thick / 2 - Inches(0.05),
         icy, Inches(0.05), road_thick / 2, fill=WHITE)
    rect(s, icx + road_thick / 2, icy - road_thick / 2,
         Inches(0.05), road_thick / 2, fill=WHITE)

    # 4 signal supports (corner posts)
    corners = [
        (icx - road_thick / 2 - Inches(0.45),
         icy - road_thick / 2 - Inches(0.45), "A"),
        (icx + road_thick / 2 + Inches(0.25),
         icy - road_thick / 2 - Inches(0.45), "B"),
        (icx + road_thick / 2 + Inches(0.25),
         icy + road_thick / 2 + Inches(0.25), "C"),
        (icx - road_thick / 2 - Inches(0.45),
         icy + road_thick / 2 + Inches(0.25), "D"),
    ]
    for (sx, sy, lbl) in corners:
        oval(s, sx, sy, Inches(0.2), Inches(0.2),
             fill=ORANGE, line=NAVY_2, line_weight=0.5)
        text(s, sx + Inches(0.25), sy, Inches(0.4), Inches(0.2),
             lbl, size=8, bold=True, color=NAVY_2)

    # loop detectors (rectangles in road approach)
    for (dx, dy, lbl) in [
        (icx - road_thick / 2 - Inches(0.9),
         icy - road_thick / 4, "L1"),
        (icx + road_thick / 2 + Inches(0.4),
         icy + Inches(0.05), "L2"),
        (icx - road_thick / 4, icy - road_thick / 2 - Inches(0.9), "L3"),
        (icx + Inches(0.05), icy + road_thick / 2 + Inches(0.4), "L4"),
    ]:
        rect(s, dx, dy, Inches(0.32), Inches(0.14),
             fill=ORANGE_L)
        text(s, dx, dy + Inches(0.16), Inches(0.4), Inches(0.18),
             lbl, size=7, bold=True, color=NAVY_2)

    # controller cabinet
    cab_x = cx + cw - Inches(0.8); cab_y = cy + Inches(0.4)
    rect(s, cab_x, cab_y, Inches(0.45), Inches(0.6),
         fill=GREEN, line=NAVY_2, line_weight=0.5)
    text(s, cab_x - Inches(0.4), cab_y + Inches(0.15), Inches(1.2),
         Inches(0.2), "Cabinet", size=8, bold=True, color=GREEN,
         align=PP_ALIGN.RIGHT)
    text(s, cab_x, cab_y + Inches(0.65), Inches(0.5), Inches(0.2),
         "C04", size=7, color=GREY, align=PP_ALIGN.CENTER)

    # north arrow
    nx = cx + Inches(0.3); ny = cy + Inches(0.3)
    arrow = s.shapes.add_shape(MSO_SHAPE.UP_ARROW, nx, ny,
                               Inches(0.3), Inches(0.5))
    arrow.fill.solid(); arrow.fill.fore_color.rgb = NAVY_2
    arrow.line.fill.background(); arrow.shadow.inherit = False
    text(s, nx - Inches(0.05), ny + Inches(0.55), Inches(0.4), Inches(0.2),
         "N", size=10, bold=True, color=NAVY_2, align=PP_ALIGN.CENTER)

    # scale bar
    sb_x = cx + Inches(0.4); sb_y = cy + ch - Inches(0.4)
    for k in range(5):
        rect(s, sb_x + Inches(0.15) * k, sb_y, Inches(0.15),
             Inches(0.08), fill=NAVY_2 if k % 2 == 0 else CREAM,
             line=NAVY_2, line_weight=0.5)
    text(s, sb_x, sb_y + Inches(0.12), Inches(2), Inches(0.2),
         "0    5    10 m  ·  1:200", size=7, color=GREY)

    # right legend
    rx = cx + cw + Inches(0.3)
    rw = SLIDE_W - M_R - rx
    text(s, rx, cy, rw, Inches(0.3),
         "MODÈLE  ·  ELEMENTS", size=10, bold=True, color=ORANGE)
    items = [
        ("Supports",      "16", ORANGE),
        ("Loop detectors", "6", GREEN),
        ("Chambers",      "8",  ORANGE),
        ("Cable runs",   "22",  GREEN),
        ("Layers UI",     "8",  ORANGE),
        ("Exports PDF",   "3",  GREEN),
    ]
    row_h = Inches(0.55)
    for i, (lbl, val, col) in enumerate(items):
        y = cy + Inches(0.4) + row_h * i
        rounded(s, rx, y, rw, Inches(0.48), fill=CARD_BG, radius=0.06)
        text(s, rx + Inches(0.18), y + Inches(0.13), Inches(2.5),
             Inches(0.25), lbl, size=11, color=NAVY_2)
        text(s, rx + rw - Inches(0.7), y + Inches(0.08), Inches(0.6),
             Inches(0.35), val, size=18, bold=True, color=col,
             align=PP_ALIGN.RIGHT)
    text(s, rx, cy + ch - Inches(0.3), rw, Inches(0.3),
         "INT-CAS-006 · plan vectoriel",
         size=9, italic=True, color=GREY, align=PP_ALIGN.CENTER)
    footer(s, page, total, ref)
    return s


def slide_dossier_layout(prs, ref, page, total):
    """8-page PDF dossier layout thumbnails."""
    s = blank(prs); bg(s, CREAM)
    header(s, "D O S S I E R   R É G U L A T I O N",
           "Livrable PDF pur vecteur — A4 + plan A3")

    pages = [
        ("01", "Page de garde",     "Cover sheet",         "rev · prep · ver"),
        ("02", "Identité carrefour", "Identity",           "code · GPS · firmware"),
        ("03", "Inventaire",         "Signalling inventory", "potences · poteaux"),
        ("04", "Entrées contrôleur", "Controller inputs",  "I/O mapping"),
        ("05", "Plan A3 vectoriel",  "Vector A3 plan",     "1:200 landscape"),
        ("06", "Phasage",            "Phasing",            "min vert · jaune · rouge"),
        ("07", "Plans de feux",      "Signal plans",       "code · cycle · décalage"),
        ("08", "Observations",       "Observations",       "hypothèses & notes"),
    ]
    cols = 4; rows = 2
    avail_y0 = Inches(2.2); avail = FOOTER_RULE_Y - avail_y0 - Inches(0.7)
    gap = Inches(0.22)
    pw = Emu(int((CONTENT_W - gap * (cols - 1)) / cols))
    ph = Emu(int((avail - gap * (rows - 1)) / rows))
    for i, (num, fr, en, hint) in enumerate(pages):
        r = i // cols; c = i % cols
        x = M_L + (pw + gap) * c
        y = avail_y0 + (ph + gap) * r
        # page paper shadow
        rect(s, x + Inches(0.05), y + Inches(0.05), pw, ph, fill=GREY_2)
        # page
        rect(s, x, y, pw, ph, fill=WHITE, line=NAVY_DIM, line_weight=0.5)
        # corner accent
        rect(s, x, y, pw, Inches(0.08), fill=ORANGE)
        # page header (mini lines)
        text(s, x + Inches(0.18), y + Inches(0.22), pw - Inches(0.4),
             Inches(0.22), num, size=9, bold=True, color=ORANGE)
        text(s, x + Inches(0.18), y + Inches(0.45), pw - Inches(0.4),
             Inches(0.35), fr, size=12, bold=True, color=NAVY_2,
             line_spacing=1.1)
        # decorative content lines (placeholder)
        for k in range(5):
            line_seg(s, x + Inches(0.18), y + Inches(1.05) + Inches(0.18) * k,
                     x + pw - Inches(0.3),
                     y + Inches(1.05) + Inches(0.18) * k,
                     color=GREY_2, weight=0.5)
        text(s, x + Inches(0.18), y + ph - Inches(0.55),
             pw - Inches(0.4), Inches(0.22), en, size=8.5,
             italic=True, color=GREY, line_spacing=1.1)
        text(s, x + Inches(0.18), y + ph - Inches(0.3),
             pw - Inches(0.4), Inches(0.2), hint, size=7.5,
             color=ORANGE, line_spacing=1.1)

    text(s, M_L, FOOTER_RULE_Y - Inches(0.4), CONTENT_W, Inches(0.25),
         "Generated by @react-pdf/renderer — aucune tuile bitmap, 100 % vectoriel.",
         size=10, italic=True, color=GREY, align=PP_ALIGN.CENTER)
    footer(s, page, total, ref)
    return s


def slide_cabling_schema(prs, ref, page, total):
    """Wiring schema: cabinet → field elements."""
    s = blank(prs); bg(s, CREAM)
    header(s, "D O S S I E R   C Â B L A G E",
           "Du cabinet C04 vers chaque élément du carrefour")

    # cabinet on the left
    box_x = M_L; box_y = Inches(2.6)
    box_w = Inches(2.0); box_h = Inches(3.2)
    rounded(s, box_x, box_y, box_w, box_h, fill=GREEN, radius=0.04)
    text(s, box_x, box_y + Inches(0.2), box_w, Inches(0.3),
         "CABINET", size=10, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    text(s, box_x, box_y + Inches(0.55), box_w, Inches(0.5),
         "C04", size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    text(s, box_x, box_y + Inches(1.2), box_w, Inches(0.3),
         "INT-CAS-006", size=10, color=WHITE, align=PP_ALIGN.CENTER)
    # terminals row
    for i, lbl in enumerate(["T1", "T2", "T3", "T4", "T5", "T6"]):
        rounded(s, box_x + Inches(0.15) + Inches(0.3) * i,
                box_y + Inches(1.7), Inches(0.26), Inches(0.26),
                fill=NAVY_2, radius=0.5)
        text(s, box_x + Inches(0.15) + Inches(0.3) * i,
             box_y + Inches(1.74), Inches(0.26), Inches(0.2),
             lbl, size=7, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    # bottom info
    text(s, box_x, box_y + Inches(2.4), box_w, Inches(0.25),
         "I/O CONTROLLER", size=9, bold=True, color=ORANGE,
         align=PP_ALIGN.CENTER)
    text(s, box_x, box_y + Inches(2.7), box_w, Inches(0.3),
         "24 in · 16 out", size=10, color=WHITE, align=PP_ALIGN.CENTER)

    # destinations on the right (5 elements)
    rx = box_x + box_w + Inches(2.0)
    rw = SLIDE_W - M_R - rx
    dests = [
        ("Signal heads",      "4 × NEMA",     "U1000 R2v · 3×2.5",  ORANGE),
        ("Loop detectors",    "6 boucles",    "LIYCY blindé · 4×0.5", GREEN),
        ("Ped buttons",       "8 boutons",    "U1000 R2v · 2×1.5",  ORANGE),
        ("Pedestrian heads",  "4 × R/G",      "U1000 R2v · 3×2.5",  GREEN),
        ("Fibre uplink",      "1 × backbone", "Fibre G.652 · 4 brins", ORANGE),
    ]
    n = len(dests)
    row_h = Inches(0.65); y_d_start = Inches(2.5)
    for i, (name, count, cable, col) in enumerate(dests):
        y = y_d_start + row_h * i
        rounded(s, rx, y, rw, Inches(0.55), fill=CARD_BG, radius=0.06)
        rect(s, rx, y, Inches(0.08), Inches(0.55), fill=col)
        text(s, rx + Inches(0.25), y + Inches(0.07), Inches(3),
             Inches(0.25), name, size=12, bold=True, color=NAVY_2)
        text(s, rx + Inches(0.25), y + Inches(0.32), Inches(3),
             Inches(0.25), count, size=9, italic=True, color=col)
        text(s, rx + Inches(3.2), y + Inches(0.18),
             rw - Inches(3.4), Inches(0.3),
             cable, size=11, bold=True, color=NAVY_DIM,
             align=PP_ALIGN.RIGHT)
        # cable from cabinet to here
        start_x = box_x + box_w
        start_y = box_y + Inches(0.6) + (box_h * (i + 0.5) / n)
        # midpoint
        mid_x = (start_x + rx) / 2
        line_seg(s, start_x, start_y, mid_x, start_y,
                 color=col, weight=2)
        line_seg(s, mid_x, start_y, mid_x, y + Inches(0.28),
                 color=col, weight=2)
        line_seg(s, mid_x, y + Inches(0.28), rx, y + Inches(0.28),
                 color=col, weight=2)
    footer(s, page, total, ref)
    return s


def slide_zone_workflow(prs, ref, page, total):
    """5-step workflow: Draw → Auto-fill → Save → Workspace → Promote."""
    s = blank(prs); bg(s, CREAM)
    header(s, "Z O N E   B U I L D E R   ·   / s t u d i o / z o n e s",
           "Du clic sur la carte au carrefour réel")

    steps = [
        ("DRAW",       "Tracer zone",      "Rectangle 4 poignées",   ORANGE),
        ("AUTO-FILL",  "Géocoder Google",  "Rue · nom · code généré", ORANGE),
        ("SAVE",       "Proposition",      "localStorage + audit",   GREEN),
        ("WORKSPACE",  "Suivi proposal",   "Étapes & validation",    GREEN),
        ("PROMOTE",    "Carrefour réel",   "POST /engineering/...",  ORANGE),
    ]
    n = len(steps)
    y0 = Inches(2.4); h = Inches(2.5)
    gap = Inches(0.15)
    node_w = Emu(int((CONTENT_W - gap * (n - 1)) / n))

    for i, (k, title, sub, col) in enumerate(steps):
        x = M_L + (node_w + gap) * i
        rounded(s, x, y0, node_w, h, fill=CARD_BG, radius=0.05)
        rect(s, x, y0, node_w, Inches(0.10), fill=col)
        # icon area (top, illustrative)
        icon_y = y0 + Inches(0.25); icon_h = Inches(0.9)
        if k == "DRAW":
            rect(s, x + node_w / 2 - Inches(0.55),
                 icon_y + Inches(0.15), Inches(1.1), Inches(0.65),
                 fill=NAVY_3)
            rect(s, x + node_w / 2 - Inches(0.5),
                 icon_y + Inches(0.2), Inches(1.0), Inches(0.55),
                 fill=NAVY_2, line=ORANGE, line_weight=1.5)
            # corner handles
            for hx, hy in [(-0.5, 0.2), (0.5, 0.2), (-0.5, 0.75), (0.5, 0.75)]:
                rect(s, x + node_w / 2 + Inches(hx) - Inches(0.05),
                     icon_y + Inches(hy) - Inches(0.05),
                     Inches(0.1), Inches(0.1), fill=ORANGE)
        elif k == "AUTO-FILL":
            for j in range(3):
                rounded(s, x + node_w / 2 - Inches(0.6),
                        icon_y + Inches(0.1) + Inches(0.27) * j,
                        Inches(1.2), Inches(0.18), fill=NAVY_3, radius=0.2)
                rect(s, x + node_w / 2 - Inches(0.55),
                     icon_y + Inches(0.14) + Inches(0.27) * j,
                     Inches(0.8 - 0.1 * j), Inches(0.1), fill=ORANGE_L)
        elif k == "SAVE":
            oval(s, x + node_w / 2 - Inches(0.35),
                 icon_y + Inches(0.15), Inches(0.7), Inches(0.7),
                 fill=NAVY_3)
            text(s, x + node_w / 2 - Inches(0.35), icon_y + Inches(0.3),
                 Inches(0.7), Inches(0.4),
                 "✓", size=26, bold=True, color=GREEN_L,
                 align=PP_ALIGN.CENTER)
        elif k == "WORKSPACE":
            rect(s, x + node_w / 2 - Inches(0.6),
                 icon_y + Inches(0.15), Inches(1.2), Inches(0.65),
                 fill=NAVY_3)
            for j in range(4):
                rect(s, x + node_w / 2 - Inches(0.5),
                     icon_y + Inches(0.27) + Inches(0.12) * j,
                     Inches(1.0 - 0.15 * j), Inches(0.05),
                     fill=GREEN_L if j < 2 else GREY_2)
        elif k == "PROMOTE":
            # circle → square
            oval(s, x + node_w / 2 - Inches(0.7),
                 icon_y + Inches(0.25), Inches(0.45), Inches(0.45),
                 fill=ORANGE_L)
            arrow_right(s, x + node_w / 2 - Inches(0.18),
                        icon_y + Inches(0.42),
                        Inches(0.35), color=ORANGE, h=Inches(0.15))
            rect(s, x + node_w / 2 + Inches(0.25),
                 icon_y + Inches(0.25), Inches(0.45), Inches(0.45),
                 fill=GREEN)

        # title
        text(s, x + Inches(0.15), y0 + Inches(1.4), node_w - Inches(0.3),
             Inches(0.3), k, size=10, bold=True, color=col,
             align=PP_ALIGN.CENTER)
        text(s, x + Inches(0.15), y0 + Inches(1.7), node_w - Inches(0.3),
             Inches(0.35), title, size=14, bold=True, color=NAVY_2,
             align=PP_ALIGN.CENTER, line_spacing=1.15)
        text(s, x + Inches(0.15), y0 + Inches(2.05), node_w - Inches(0.3),
             Inches(0.35), sub, size=9, italic=True, color=GREY,
             align=PP_ALIGN.CENTER, line_spacing=1.2)
        if i < n - 1:
            arrow_right(s, x + node_w + Emu(1500), y0 + h / 2 - Inches(0.12),
                        gap - Emu(3000), color=ORANGE, h=Inches(0.22))

    # bottom annotation
    y_an = Inches(5.4)
    rounded(s, M_L, y_an, CONTENT_W, Inches(1.4), fill=CARD_BG_2, radius=0.03)
    kicker(s, M_L + Inches(0.4), y_an + Inches(0.18), Inches(8),
           "EXPORTS DISPONIBLES  ·  AVAILABLE EXPORTS")
    formats = [("DXF", ORANGE), ("IFC+", GREEN), ("OBJ", ORANGE),
               ("glTF", GREEN), ("STL", ORANGE)]
    fx = M_L + Inches(0.4); fy = y_an + Inches(0.65)
    for name, col in formats:
        cw = Inches(0.9)
        rounded(s, fx, fy, cw, Inches(0.5), fill=NAVY_2, radius=0.1)
        text(s, fx, fy + Inches(0.13), cw, Inches(0.3),
             name, size=12, bold=True, color=col, align=PP_ALIGN.CENTER)
        fx += cw + Inches(0.15)
    text(s, fx + Inches(0.2), fy + Inches(0.15), Inches(7), Inches(0.3),
         "Modélisation 3D · Layers Routes · Bâtiments · Piétons · Rail · Hydro",
         size=11, color=NAVY_2, anchor=MSO_ANCHOR.MIDDLE)
    footer(s, page, total, ref)
    return s


# =============================================================================
# BUILDERS
# =============================================================================
def build_police_deck():
    prs = new_deck()
    REF = "TS-STLS-DGSN-PITCH-V01"
    TOTAL = 15

    police_items = [
        ("Le constat & la mission",     "Context & mission"),
        ("La promesse STLS",            "The STLS promise"),
        ("Vue opérateur / police",      "Police operator view"),
        ("Override raisonné",           "Reason-coded override"),
        ("Priorité véhicule d'urgence", "Emergency vehicle priority"),
        ("L'IA jamais au-dessus",       "AI never overrides authority"),
        ("Audit & traçabilité",         "Audit & traceability"),
        ("Architecture souveraine",     "Sovereign architecture"),
        ("Roadmap & décisions",         "Roadmap & decisions"),
    ]

    cover(prs,
          "S T L S   ·   P U B L I C   S A F E T Y   ·   v 1.0",
          ["Mobilité maîtrisée,", "intervention sécurisée."],
          "Le copilote opérationnel des feux tricolores pour la Sûreté Nationale.",
          REF, "15 mai 2026  ·  Casablanca")
    agenda(prs, police_items, REF, 2, TOTAL)
    section(prs, 1, "Le constat & la mission",
            "Pourquoi STLS pour la Sûreté Nationale",
            "Le trafic ralentit les interventions. L'IA conseille mais n'efface jamais\n"
            "la chaîne de commandement — la décision reste humaine et auditée.",
            REF, 3, TOTAL)
    slide_constat(prs, REF, 4, TOTAL)
    slide_promesse(prs, REF, 5, TOTAL)
    section(prs, 2, "Le poste opérateur",
            "Voir, comprendre, intervenir",
            "Une seule console pour superviser le réseau, lever une priorité\n"
            "véhicule d'urgence et tracer chaque décision.",
            REF, 6, TOTAL)
    slide_console_mockup(prs, REF, 7, TOTAL)
    slide_override_flow(prs, REF, 8, TOTAL)
    slide_emergency_corridor(prs, REF, 9, TOTAL)
    slide_ai_safety(prs, REF, 10, TOTAL)
    section(prs, 3, "Gouvernance & intégration",
            "Audit, sécurité, déploiement",
            "Une chaîne de commandement traçable, une architecture souveraine,\n"
            "un pilote prêt à étendre vers Rabat et Tanger.",
            REF, 11, TOTAL)
    slide_audit_flow(prs, REF, 12, TOTAL)
    slide_architecture_stack(prs, REF, 13, TOTAL)
    slide_roadmap(prs, REF, 14, TOTAL,
                  "F E U I L L E   D E   R O U T E",
                  "Trois horizons, six décisions à arbitrer",
                  [
                      {"label": "Court terme", "range": "0 — 3 mois", "start": 1,
                       "items": [
                           ("Étendre le pilote Casablanca", "Extend Casablanca pilot"),
                           ("Intégration radio police / DGSN", "Police radio / DGSN link"),
                       ]},
                      {"label": "Moyen terme", "range": "3 — 12 mois", "start": 3,
                       "items": [
                           ("Couloirs d'urgence pré-définis", "Pre-defined emergency corridors"),
                           ("Formation opérateurs · doc FR / AR", "Operator training · FR / AR docs"),
                       ]},
                      {"label": "Long terme", "range": "12 — 36 mois", "start": 5,
                       "items": [
                           ("SSO / LDAP officiel", "Official SSO / LDAP"),
                           ("OTA firmware signé · flotte nationale", "Signed OTA · nationwide fleet"),
                       ]},
                  ])
    closing(prs,
            ["Sécurisons la mobilité,", "ensemble."],
            "M E R C I",
            ["Lotissement Al Kadir N° 27",
             "2ᵉ étage, App. N° 11",
             "Casablanca, Maroc"],
            ["akarim@tomorrow.ma",
             "+212 X XX XX XX XX"],
            ["tomorrow-systems.com",
             "linkedin.com/company/tomorrow-systems"],
            REF)

    out = DESKTOP / "STLS-Police-DGSN.pptx"
    prs.save(out)
    print(f"Saved: {out}")
    return out


def build_be_deck():
    prs = new_deck()
    REF = "TS-STLS-BE-PITCH-V01"
    TOTAL = 16

    be_items = [
        ("L'atelier numérique",           "The digital studio"),
        ("Architecture STLS",             "STLS architecture"),
        ("Studio Landing",                "Studio Landing"),
        ("Workbench (IDE)",               "Workbench (IDE)"),
        ("Cycle & timing",                "Cycle & timing"),
        ("Controller workspace",          "Controller workspace"),
        ("AutoCAD Plan vectoriel",        "Vector AutoCAD plan"),
        ("Dossier Régulation",            "Regulation dossier"),
        ("Dossier Câblage",               "Cabling dossier"),
        ("Zone Builder & propositions",   "Zone Builder & proposals"),
        ("Roadmap & décisions",           "Roadmap & decisions"),
    ]

    cover(prs,
          "S T L S   ·   E N G I N E E R I N G   ·   v 1.0",
          ["Engineering,", "from atlas to plan."],
          "L'atelier numérique des ingénieurs trafic — Studio · Workbench · AutoCAD · Dossiers.",
          REF, "15 mai 2026  ·  Casablanca")
    agenda(prs, be_items, REF, 2, TOTAL)
    section(prs, 1, "L'atelier numérique",
            "Du jumeau territorial au plan d'aménagement",
            "Une console unique pour configurer un carrefour de bout en bout :\n"
            "atlas, IDE, plan vectoriel, dossiers PDF.",
            REF, 3, TOTAL)
    slide_three_plane(prs, REF, 4, TOTAL)
    slide_studio_map(prs, REF, 5, TOTAL)
    slide_workbench_ide(prs, REF, 6, TOTAL)
    section(prs, 2, "Configuration carrefour",
            "Phases, signaux, détecteurs, live",
            "Construire un cycle complet : phases, conflict matrix,\n"
            "détecteurs — puis vérifier en live sur le runtime.",
            REF, 7, TOTAL)
    slide_signal_cycle(prs, REF, 8, TOTAL)
    slide_controller_polling(prs, REF, 9, TOTAL)
    slide_autocad_plan(prs, REF, 10, TOTAL)
    section(prs, 3, "Livrables & déploiement",
            "Dossiers PDF, propositions, roadmap",
            "Livrables PDF style GroupéRyX (régulation, câblage),\n"
            "Zone Builder pour créer un carrefour, roadmap d'extension.",
            REF, 11, TOTAL)
    slide_dossier_layout(prs, REF, 12, TOTAL)
    slide_cabling_schema(prs, REF, 13, TOTAL)
    slide_zone_workflow(prs, REF, 14, TOTAL)
    slide_roadmap(prs, REF, 15, TOTAL,
                  "F E U I L L E   D E   R O U T E",
                  "Trois horizons, six décisions à arbitrer",
                  [
                      {"label": "Court terme", "range": "0 — 3 mois", "start": 1,
                       "items": [
                           ("Promotion proposal → carrefour réel",
                            "Promote proposal → real intersection"),
                           ("Conflict matrix editor (grille UI)",
                            "Conflict matrix editor (UI grid)"),
                       ]},
                      {"label": "Moyen terme", "range": "3 — 12 mois", "start": 3,
                       "items": [
                           ("Simulation dry-run avant déploiement",
                            "Dry-run simulation before deploy"),
                           ("Bibliothèque dossiers réutilisables",
                            "Reusable dossier library"),
                       ]},
                      {"label": "Long terme", "range": "12 — 36 mois", "start": 5,
                       "items": [
                           ("OTA firmware signé HMAC · fleet rollout",
                            "Signed OTA firmware · fleet rollout"),
                           ("SSO / LDAP · multi-tenant prod",
                            "SSO / LDAP · multi-tenant prod"),
                       ]},
                  ])
    closing(prs,
            ["Concevons les carrefours", "de demain."],
            "M E R C I",
            ["Lotissement Al Kadir N° 27",
             "2ᵉ étage, App. N° 11",
             "Casablanca, Maroc"],
            ["akarim@tomorrow.ma",
             "+212 X XX XX XX XX"],
            ["tomorrow-systems.com",
             "linkedin.com/company/tomorrow-systems"],
            REF)

    out = DESKTOP / "STLS-BureauEtudes.pptx"
    prs.save(out)
    print(f"Saved: {out}")
    return out


if __name__ == "__main__":
    DESKTOP.mkdir(parents=True, exist_ok=True)
    p1 = build_police_deck()
    p2 = build_be_deck()
    print("Done.")
