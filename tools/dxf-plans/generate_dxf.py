"""
generate_dxf.py  -  Generate an editable, layered SLT intersection plan (DXF)
from a JSON description.  This is the "AI authors a new plan" direction:
an AI fills in the JSON (supports, signals, loops, chambers, ducts, streets),
and this renders a clean AutoCAD/LibreCAD-editable DXF in the same style as the
"Plan Reseaux Secondaires SLT" sheets (A3, mm), with an SLT symbol library,
title block (cartouche) and legend.

Usage:
    py -3.11 generate_dxf.py "<intersection.json>"  [--out "<file.dxf>"]

Schema: see sample_intersection.json and the README. All positions are in
millimetres on the A3 sheet (0..420 x 0..297). The drawing area is the sheet
minus the legend (bottom-left) and cartouche (bottom-right).
"""
from __future__ import annotations
import sys, os, json, argparse, math
import ezdxf
from ezdxf.enums import TextEntityAlignment

# ---- sheet ----
A3_W, A3_H = 420.0, 297.0

# ---- true colors (R,G,B) ----
RED        = (220, 0, 0)
GREEN      = (0, 148, 0)
BRIGHTGRN  = (56, 222, 0)
BLUE       = (0, 128, 255)
DARKBLUE   = (0, 0, 255)
MAGENTA    = (184, 0, 138)
ORANGE     = (255, 128, 0)
YELLOW     = (184, 184, 0)
GRAY       = (120, 120, 120)
DKGREEN    = (0, 90, 0)
BROWN      = (150, 75, 0)
BLACK      = (0, 0, 0)

# ---- layer table: name -> (rgb, linetype) ----
LAYERS = {
    "ARMOIRE":              (RED,       "CONTINUOUS"),
    "SUPPORTS_MASSIFS":     (GRAY,      "CONTINUOUS"),
    "SUPPORT_POTENCE":      (BRIGHTGRN, "CONTINUOUS"),
    "SIGNAUX":              (RED,       "CONTINUOUS"),
    "SIG_PIETON":           (DKGREEN,   "CONTINUOUS"),
    "ANTICIPATION":         (BLUE,      "CONTINUOUS"),
    "BAP":                  (MAGENTA,   "CONTINUOUS"),
    "BOUCLE_DETECTION":     (BLUE,      "DASHED"),
    "BOUCLE_SATURATION":    (YELLOW,    "DASHED"),
    "CHAMBRES":             (BROWN,     "CONTINUOUS"),
    "FOURREAU_CEINTURAGE":  (MAGENTA,   "DASHED"),
    "FOURREAU_FIBRE_MULTI": (DARKBLUE,  "DASHED"),
    "FOURREAU_SUPPORT":     (GREEN,     "DASHED"),
    "FOURREAU_BOUCLE":      (ORANGE,    "DASHED"),
    "FLECHES_CIRCULATION":  (BLUE,      "CONTINUOUS"),
    "VOIRIE":               (RED,       "CONTINUOUS"),
    "TEXTE":                (BLACK,     "CONTINUOUS"),
    "CARTOUCHE":            (BLACK,     "CONTINUOUS"),
    "LEGENDE":              (BLACK,     "CONTINUOUS"),
}

DUCT_LAYER = {
    "ceinturage": "FOURREAU_CEINTURAGE",
    "fibre":      "FOURREAU_FIBRE_MULTI",
    "multi":      "FOURREAU_FIBRE_MULTI",
    "support":    "FOURREAU_SUPPORT",
    "boucle":     "FOURREAU_BOUCLE",
}


def aci_none():
    return None


# --------------------------------------------------------------------------
# Symbol blocks (drawn in mm, origin at insertion point). Colors are fixed
# per entity so a symbol always reads correctly regardless of insert layer.
# --------------------------------------------------------------------------
def build_blocks(doc):
    def tc(rgb):
        return ezdxf.colors.rgb2int(rgb)

    # Signal tricolore R11v 222 + repetiteur  (red filled head + small repeater)
    b = doc.blocks.new("SIG_R11V_222")
    h = b.add_hatch(color=1); h.rgb = RED
    h.paths.add_polyline_path(_circle_pts(0, 0, 1.8), is_closed=True)
    b.add_circle((0, 0), 1.8, dxfattribs={"true_color": tc(RED)})
    b.add_circle((2.4, 1.4), 0.7, dxfattribs={"true_color": tc(RED)})   # repetiteur

    # Signal tricolore R11v 333 (haut de potence) - larger head
    b = doc.blocks.new("SIG_R11V_333")
    h = b.add_hatch(color=1); h.rgb = RED
    h.paths.add_polyline_path(_circle_pts(0, 0, 2.4), is_closed=True)
    b.add_circle((0, 0), 2.4, dxfattribs={"true_color": tc(RED)})

    # Signal pieton R12
    b = doc.blocks.new("SIG_PIETON_R12")
    b.add_lwpolyline([(-1.4, -2), (1.4, -2), (1.4, 2), (-1.4, 2)], close=True,
                     dxfattribs={"true_color": tc(DKGREEN)})
    b.add_circle((0, 1), 0.6, dxfattribs={"true_color": tc(DKGREEN)})
    b.add_circle((0, -1), 0.6, dxfattribs={"true_color": tc(DKGREEN)})

    # Anticipation (directional arrow head)
    b = doc.blocks.new("ANTICIPATION")
    b.add_lwpolyline([(-1.6, -1.6), (1.6, 0), (-1.6, 1.6), (-0.6, 0)], close=True,
                     dxfattribs={"true_color": tc(BLUE)})

    # Croix grecque
    b = doc.blocks.new("CROIX_GRECQUE")
    b.add_lwpolyline([(-0.6, -2), (0.6, -2), (0.6, -0.6), (2, -0.6), (2, 0.6),
                      (0.6, 0.6), (0.6, 2), (-0.6, 2), (-0.6, 0.6), (-2, 0.6),
                      (-2, -0.6), (-0.6, -0.6)], close=True,
                     dxfattribs={"true_color": tc(RED)})

    # BAP (boitier appel pieton)
    b = doc.blocks.new("BAP")
    b.add_lwpolyline([(-1, -1), (1, -1), (1, 1), (-1, 1)], close=True,
                     dxfattribs={"true_color": tc(MAGENTA)})

    # Poteau (pole) - circle + massif square
    b = doc.blocks.new("POTEAU")
    b.add_lwpolyline([(-2, -2), (2, -2), (2, 2), (-2, 2)], close=True,
                     dxfattribs={"true_color": tc(GRAY)})        # massif 50x50
    b.add_circle((0, 0), 1.0, dxfattribs={"true_color": tc(GRAY)})

    # Potelet (bollard)
    b = doc.blocks.new("POTELET")
    b.add_lwpolyline([(-1.6, -1.6), (1.6, -1.6), (1.6, 1.6), (-1.6, 1.6)],
                     close=True, dxfattribs={"true_color": tc(GRAY)})
    b.add_circle((0, 0), 0.7, dxfattribs={"true_color": tc(GRAY)})

    # Potence (gantry, 4.5 m arm) - mast + arm, bright green
    b = doc.blocks.new("POTENCE")
    b.add_lwpolyline([(-2.5, -2.5), (2.5, -2.5), (2.5, 2.5), (-2.5, 2.5)],
                     close=True, dxfattribs={"true_color": tc(GRAY)})   # massif 100x100
    b.add_circle((0, 0), 1.3, dxfattribs={"true_color": tc(BRIGHTGRN)})
    b.add_line((0, 0), (18, 0), dxfattribs={"true_color": tc(BRIGHTGRN)})  # 4.5m @1/250

    # Armoire + massif
    b = doc.blocks.new("ARMOIRE")
    h = b.add_hatch(color=1); h.rgb = RED
    h.paths.add_polyline_path([(-3, -2), (3, -2), (3, 2), (-3, 2)], is_closed=True)
    b.add_lwpolyline([(-3, -2), (3, -2), (3, 2), (-3, 2)], close=True,
                     dxfattribs={"true_color": tc(RED)})

    # Detection loops (rectangles). Drawn unit 1x1, scaled by insert.
    b = doc.blocks.new("BOUCLE_VP1")
    b.add_lwpolyline([(0, 0), (1, 0), (1, 1), (0, 1)], close=True,
                     dxfattribs={"true_color": tc(BLUE)})
    b = doc.blocks.new("BOUCLE_VP2")
    b.add_lwpolyline([(0, 0), (1, 0), (1, 1), (0, 1)], close=True,
                     dxfattribs={"true_color": tc(BLUE)})
    b.add_line((0, 0.5), (1, 0.5), dxfattribs={"true_color": tc(BLUE)})
    b = doc.blocks.new("BOUCLE_SAT")
    b.add_lwpolyline([(0, 0), (1, 0), (1, 1), (0, 1)], close=True,
                     dxfattribs={"true_color": tc(YELLOW)})

    # Chambers
    b = doc.blocks.new("CHAMBRE_TIRAGE")
    h = b.add_hatch(color=1); h.rgb = BROWN
    h.paths.add_polyline_path([(-1.3, -1.3), (1.3, -1.3), (1.3, 1.3), (-1.3, 1.3)],
                              is_closed=True)
    b.add_lwpolyline([(-1.3, -1.3), (1.3, -1.3), (1.3, 1.3), (-1.3, 1.3)], close=True,
                     dxfattribs={"true_color": tc(BROWN)})
    b = doc.blocks.new("CHAMBRE_RACC")
    b.add_lwpolyline([(-1.1, -1.1), (1.1, -1.1), (1.1, 1.1), (-1.1, 1.1)], close=True,
                     dxfattribs={"true_color": tc(BROWN)})


def _circle_pts(cx, cy, r, n=24):
    return [(cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


# --- signal placement: which block for a signal keyword ---
SIGNAL_BLOCK = {
    "R11v_222": ("SIG_R11V_222", "SIGNAUX"),
    "R11v_333": ("SIG_R11V_333", "SIGNAUX"),
    "R12":      ("SIG_PIETON_R12", "SIG_PIETON"),
    "anticipation": ("ANTICIPATION", "ANTICIPATION"),
    "croix_grecque": ("CROIX_GRECQUE", "SIGNAUX"),
    "bap":      ("BAP", "BAP"),
}
SUPPORT_BLOCK = {"poteau": ("POTEAU", "SUPPORTS_MASSIFS"),
                 "potelet": ("POTELET", "SUPPORTS_MASSIFS"),
                 "potence": ("POTENCE", "SUPPORT_POTENCE")}


def add_text(msp, txt, pos, height, layer="TEXTE", rotation=0.0, rgb=None,
             align=TextEntityAlignment.LEFT):
    attribs = {"layer": layer, "height": height, "rotation": rotation}
    if rgb:
        attribs["true_color"] = ezdxf.colors.rgb2int(rgb)
    t = msp.add_text(txt, dxfattribs=attribs)
    t.set_placement(pos, align=align)
    return t


# --------------------------------------------------------------------------
def generate(data: dict, out_path: str):
    doc = ezdxf.new("R2010", setup=True)
    doc.units = 4
    doc.header["$INSUNITS"] = 4
    doc.header["$LTSCALE"] = 0.4
    msp = doc.modelspace()

    for name, (rgb, lt) in LAYERS.items():
        lay = doc.layers.add(name, linetype=lt if lt in doc.linetypes else "CONTINUOUS")
        lay.rgb = rgb
    build_blocks(doc)

    # sheet border
    msp.add_lwpolyline([(0, 0), (A3_W, 0), (A3_W, A3_H), (0, A3_H)], close=True,
                       dxfattribs={"layer": "CARTOUCHE"})

    # ---- ducts (fourreaux) ----
    for duct in data.get("ducts", []):
        layer = DUCT_LAYER.get(duct.get("type", "support"), "FOURREAU_SUPPORT")
        pts = [tuple(p) for p in duct["points"]]
        if len(pts) >= 2:
            msp.add_lwpolyline(pts, dxfattribs={"layer": layer})

    # ---- detection / saturation loops ----
    for lp in data.get("loops", []):
        t = lp.get("type", "vp1")
        block = {"vp1": "BOUCLE_VP1", "vp2": "BOUCLE_VP2",
                 "saturation": "BOUCLE_SAT"}.get(t, "BOUCLE_VP1")
        layer = "BOUCLE_SATURATION" if t == "saturation" else "BOUCLE_DETECTION"
        w, hh = lp.get("size", [8, 8])
        ins = msp.add_blockref(block, tuple(lp["pos"]), dxfattribs={
            "layer": layer, "rotation": lp.get("angle", 0),
            "xscale": w, "yscale": hh})
        if lp.get("id"):
            add_text(msp, lp["id"], (lp["pos"][0], lp["pos"][1] - 2), 2.0,
                     layer=layer, rgb=LAYERS[layer][0])

    # ---- chambers ----
    for ch in data.get("chambers", []):
        block = "CHAMBRE_TIRAGE" if ch.get("type") == "tirage" else "CHAMBRE_RACC"
        msp.add_blockref(block, tuple(ch["pos"]), dxfattribs={"layer": "CHAMBRES"})

    # ---- armoire ----
    if data.get("armoire"):
        msp.add_blockref("ARMOIRE", tuple(data["armoire"]["pos"]),
                         dxfattribs={"layer": "ARMOIRE"})

    # ---- supports + attached signals ----
    for sup in data.get("supports", []):
        stype = sup.get("type", "poteau")
        block, layer = SUPPORT_BLOCK.get(stype, SUPPORT_BLOCK["poteau"])
        x, y = sup["pos"]
        ang = sup.get("angle", 0)
        msp.add_blockref(block, (x, y), dxfattribs={"layer": layer, "rotation": ang})
        if sup.get("id"):
            add_text(msp, sup["id"], (x + 2.5, y + 2.5), 2.4, layer="TEXTE")
        if sup.get("ref"):
            add_text(msp, sup["ref"], (x + 2.5, y - 4), 1.8, layer="TEXTE",
                     rgb=GREEN)
        # stack attached signals around the support
        for i, sig in enumerate(sup.get("signals", [])):
            blk = SIGNAL_BLOCK.get(sig)
            if not blk:
                continue
            sb, sl = blk
            offx = math.cos(math.radians(ang)) * (4 + i * 3)
            offy = math.sin(math.radians(ang)) * (4 + i * 3)
            msp.add_blockref(sb, (x + offx, y + offy),
                             dxfattribs={"layer": sl, "rotation": ang})

    # ---- street names ----
    for st in data.get("streets", []):
        add_text(msp, st["name"], tuple(st["pos"]), st.get("height", 5.0),
                 layer="TEXTE", rotation=st.get("angle", 0), rgb=BROWN)

    # ---- circulation arrows (optional simple arrows) ----
    for ar in data.get("arrows", []):
        p0 = tuple(ar["from"]); p1 = tuple(ar["to"])
        msp.add_line(p0, p1, dxfattribs={"layer": "FLECHES_CIRCULATION"})
        _arrow_head(msp, p0, p1, "FLECHES_CIRCULATION")

    draw_legend(msp)
    draw_title_block(msp, data)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    doc.saveas(out_path)
    print(f"  OK  {os.path.basename(out_path)}  "
          f"supports={len(data.get('supports', []))} "
          f"loops={len(data.get('loops', []))} "
          f"ducts={len(data.get('ducts', []))} layers={len(doc.layers)}")
    return out_path


def _arrow_head(msp, p0, p1, layer):
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    L = 2.5
    for da in (math.radians(150), math.radians(-150)):
        msp.add_line(p1, (p1[0] + L * math.cos(ang + da),
                          p1[1] + L * math.sin(ang + da)),
                     dxfattribs={"layer": layer})


# --------------------------------------------------------------------------
def draw_title_block(msp, data):
    """Cartouche bottom-right, A3."""
    x0, y0, w, h = 250, 4, 166, 40
    msp.add_lwpolyline([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)],
                       close=True, dxfattribs={"layer": "CARTOUCHE"})
    # horizontal split
    msp.add_line((x0, y0 + 28), (x0 + w, y0 + 28), dxfattribs={"layer": "CARTOUCHE"})
    msp.add_line((x0, y0 + 8), (x0 + w, y0 + 8), dxfattribs={"layer": "CARTOUCHE"})
    add_text(msp, "FES REGION AMENAGEMENT", (x0 + 3, y0 + 33), 3.0, layer="CARTOUCHE")
    add_text(msp, "Travaux de Signalisation Lumineuse Tricolore - Ville de Fes",
             (x0 + 3, y0 + 29.5), 2.0, layer="CARTOUCHE")
    title = data.get("title", "")
    add_text(msp, f"Vue en plan carrefour {data.get('carrefour','')}",
             (x0 + 3, y0 + 23), 3.0, layer="CARTOUCHE")
    add_text(msp, title, (x0 + 3, y0 + 19), 2.4, layer="CARTOUCHE")
    add_text(msp, "Plan Reseaux Secondaires SLT", (x0 + 3, y0 + 14), 2.4,
             layer="CARTOUCHE")
    # identification line  Zone Phase Discipline Document Emetteur Numero Indice
    ident = "  ".join([data.get("zone", "Cha"), data.get("phase", "EXE"),
                        data.get("discipline", "SLT"), "PLN",
                        data.get("emetteur", "TOM"),
                        data.get("numero", "00000"), data.get("indice", "A")])
    add_text(msp, ident, (x0 + 3, y0 + 9.5), 2.6, layer="CARTOUCHE")
    add_text(msp, f"Echelle: {data.get('echelle','1/250')} - A3", (x0 + 3, y0 + 4),
             2.2, layer="CARTOUCHE")
    add_text(msp, f"Date: {data.get('date','')}", (x0 + 3, y0 + 1), 2.2,
             layer="CARTOUCHE")
    add_text(msp, f"Indice: {data.get('indice','A')}", (x0 + w - 30, y0 + 4),
             2.2, layer="CARTOUCHE")


LEGEND_ITEMS = [
    ("POTEAU", "SUPPORTS_MASSIFS", "Support Poteau"),
    ("POTELET", "SUPPORTS_MASSIFS", "Support Potelet"),
    ("POTENCE", "SUPPORT_POTENCE", "Support Potence 4,5m"),
    ("SIG_R11V_222", "SIGNAUX", "Signal R11v 222 + repetiteur"),
    ("SIG_R11V_333", "SIGNAUX", "Signal R11v 333 haut de potence"),
    ("ANTICIPATION", "ANTICIPATION", "Signal anticipation"),
    ("SIG_PIETON_R12", "SIG_PIETON", "Signal pieton R12"),
    ("CROIX_GRECQUE", "SIGNAUX", "Croix Grecque"),
    ("BAP", "BAP", "Boitier appel pieton (BAP)"),
    ("ARMOIRE", "ARMOIRE", "Armoire carrefour + Massif"),
    ("CHAMBRE_TIRAGE", "CHAMBRES", "Chambre de tirage SLT"),
]


def draw_legend(msp):
    x0, y0 = 6, 6
    w, h = 92, 78
    msp.add_lwpolyline([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)],
                       close=True, dxfattribs={"layer": "LEGENDE"})
    add_text(msp, "Legende :", (x0 + 3, y0 + h - 5), 3.0, layer="LEGENDE")
    yy = y0 + h - 11
    for block, layer, label in LEGEND_ITEMS:
        msp.add_blockref(block, (x0 + 6, yy + 1), dxfattribs={"layer": layer})
        add_text(msp, label, (x0 + 14, yy), 2.2, layer="LEGENDE")
        yy -= 6
    # duct line samples
    ducts = [("FOURREAU_CEINTURAGE", "Fourreau Ceinturage"),
             ("FOURREAU_FIBRE_MULTI", "Fourreau Fibre/Multi"),
             ("FOURREAU_SUPPORT", "Fourreau Support"),
             ("FOURREAU_BOUCLE", "Fourreau Boucle")]
    # (kept short; duct legend can be extended)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json", help="intersection JSON")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    with open(args.json, encoding="utf-8") as f:
        data = json.load(f)
    here = os.path.dirname(os.path.abspath(__file__))
    out = args.out or os.path.join(here, "generated",
                                   f"{data.get('carrefour','plan')}_generated.dxf")
    generate(data, out)


if __name__ == "__main__":
    main()
