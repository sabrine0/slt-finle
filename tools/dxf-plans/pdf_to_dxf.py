"""
pdf_to_dxf.py  -  Convert AutoCAD-exported SLT plan PDFs into editable, layered DXF.

The "Plan Reseaux Secondaires SLT" PDFs are pure vector (lines / curves / rects /
quads + text). Each stroke color in the source maps onto a legend category, so we
convert color -> named AutoCAD layer. The result opens in AutoCAD fully editable,
organized by category (you can freeze/recolor/edit a whole category at once), and
can be re-saved as .dwg from AutoCAD if needed.

Usage:
    py -3.11 pdf_to_dxf.py "<file.pdf>"                  # one file -> out/
    py -3.11 pdf_to_dxf.py "<folder>"                    # every *.pdf in folder
    py -3.11 pdf_to_dxf.py "<src>" --out "<dir>"         # custom output dir
    py -3.11 pdf_to_dxf.py "<src>" --no-hatch            # skip solid fills (lighter)

Units: millimetres, A3 sheet (PDF points * 25.4/72).
"""
from __future__ import annotations
import sys, os, math, argparse, glob

import fitz                       # PyMuPDF
import ezdxf
from ezdxf.math import Vec2, Bezier4P

PT_TO_MM = 25.4 / 72.0            # PDF point -> millimetre

# --- color (R,G,B floats 0..1) -> (layer name, draw it?) ----------------------
# Colors observed across the Fes plan set; mapped to legend semantics.
COLOR_LAYERS = {
    (0.00, 0.00, 0.00): "TEXTE_TRAITS",
    (0.00, 0.50, 1.00): "FLECHES_CIRCULATION",
    (0.60, 0.60, 0.60): "SUPPORTS_MASSIFS",
    (0.73, 0.73, 0.73): "SUPPORTS_MASSIFS",
    (0.86, 0.86, 0.86): "SUPPORTS_MASSIFS",
    (0.33, 0.33, 0.33): "SUPPORTS_MASSIFS",
    (0.00, 0.58, 0.00): "FOURREAU_SUPPORT",
    (0.22, 0.87, 0.00): "SUPPORT_POTENCE",
    (0.00, 1.00, 0.00): "SUPPORT_POTENCE",
    (1.00, 0.00, 0.00): "BORD_CHAUSSEE_SIGNAUX",
    (0.72, 0.00, 0.54): "FOURREAU_CEINTURAGE",
    (0.58, 0.00, 0.29): "FOURREAU_CEINTURAGE",
    (1.00, 0.50, 0.00): "FOURREAU_BOUCLE",
    (0.72, 0.72, 0.00): "BOUCLE_SATURATION",
    (0.00, 0.00, 1.00): "FOURREAU_FIBRE_MULTI",
}

# Layer the duct colors are *displayed* with (kept distinct above for clarity).
# Map several near-identical greys/greens to one logical layer; threshold below
# controls how aggressively unknown colors are folded into a known category.


def nearest_layer(rgb):
    """Map an arbitrary stroke/fill color to the closest known legend layer."""
    if rgb is None:
        return None, None
    best, bestd = None, 1e9
    for c in COLOR_LAYERS:
        d = sum((a - b) ** 2 for a, b in zip(rgb, c))
        if d < bestd:
            bestd, best = d, c
    if bestd <= 0.05:                       # close enough to a known category
        return COLOR_LAYERS[best], best
    # otherwise keep its own color on a generic layer
    name = "RVB_%02X%02X%02X" % tuple(int(round(v * 255)) for v in rgb)
    return name, rgb


def rgb255(rgb):
    return tuple(max(0, min(255, int(round(v * 255)))) for v in rgb)


def ensure_layer(doc, name, rgb):
    if name in doc.layers:
        return
    lay = doc.layers.add(name)
    if rgb is not None:
        lay.rgb = rgb255(rgb)


def tp(p, h):
    """PDF point (x, y from top) -> DXF mm (x, y from bottom)."""
    return (p.x * PT_TO_MM, (h - p.y) * PT_TO_MM)


def fully_outside(pts, wmm, hmm, margin):
    """True only if EVERY point lies beyond the sheet+margin on the same side
    (so entities that merely touch/cross the sheet are always kept)."""
    if not pts:
        return False
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (all(x < -margin for x in xs) or all(x > wmm + margin for x in xs) or
            all(y < -margin for y in ys) or all(y > hmm + margin for y in ys))


def convert(pdf_path: str, out_dir: str, do_hatch: bool = True,
            clip: bool = False, margin: float = 25.0) -> str:
    doc_pdf = fitz.open(pdf_path)
    page = doc_pdf[0]
    H = page.rect.height
    WMM, HMM = page.rect.width * PT_TO_MM, H * PT_TO_MM

    def keep(pts):
        return not (clip and fully_outside(pts, WMM, HMM, margin))

    out = ezdxf.new("R2010", setup=True)
    out.units = 4                               # millimetres
    out.header["$INSUNITS"] = 4
    msp = out.modelspace()

    # pre-create the known legend layers (stable order, even if some unused)
    for rgb, name in COLOR_LAYERS.items():
        ensure_layer(out, name, rgb)
    ensure_layer(out, "TEXTE_TRAITS", (0, 0, 0))

    stats = {"line": 0, "poly": 0, "hatch": 0, "text": 0}

    # ---------------- vector geometry ----------------
    for d in page.get_drawings():
        stroke = d.get("color")
        fill = d.get("fill")
        slayer, scol = nearest_layer(stroke) if stroke else (None, None)
        flayer, fcol = nearest_layer(fill) if fill else (None, None)
        if slayer:
            ensure_layer(out, slayer, scol)
        if flayer:
            ensure_layer(out, flayer, fcol)

        # collect closed loops in this path for optional hatching
        loops = []

        for it in d["items"]:
            kind = it[0]
            try:
                if kind == "l":
                    a, b = tp(it[1], H), tp(it[2], H)
                    if slayer and keep([a, b]):
                        msp.add_line(a, b, dxfattribs={"layer": slayer})
                        stats["line"] += 1
                elif kind == "c":
                    p0, p1, p2, p3 = it[1], it[2], it[3], it[4]
                    bez = Bezier4P((tp(p0, H), tp(p1, H), tp(p2, H), tp(p3, H)))
                    pts = [(v.x, v.y) for v in bez.approximate(8)]
                    if slayer and keep(pts):
                        msp.add_lwpolyline(pts, dxfattribs={"layer": slayer})
                        stats["poly"] += 1
                elif kind == "re":
                    r = it[1]
                    pts = [tp(fitz.Point(r.x0, r.y0), H), tp(fitz.Point(r.x1, r.y0), H),
                           tp(fitz.Point(r.x1, r.y1), H), tp(fitz.Point(r.x0, r.y1), H)]
                    if slayer and keep(pts):
                        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": slayer})
                        stats["poly"] += 1
                    if keep(pts):
                        loops.append(pts)
                elif kind == "qu":
                    q = it[1]
                    pts = [tp(q.ul, H), tp(q.ur, H), tp(q.lr, H), tp(q.ll, H)]
                    if slayer and keep(pts):
                        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": slayer})
                        stats["poly"] += 1
                    if keep(pts):
                        loops.append(pts)
            except Exception:
                continue

        # solid fills (e.g. the striped lane markings) -> hatch
        if do_hatch and fill is not None and loops:
            try:
                hatch = msp.add_hatch(dxfattribs={"layer": flayer})
                hatch.rgb = rgb255(fcol) if isinstance(fcol, tuple) else None
                for pts in loops:
                    hatch.paths.add_polyline_path(pts, is_closed=True)
                stats["hatch"] += 1
            except Exception:
                pass

    # ---------------- text ----------------
    td = page.get_text("dict")
    for block in td["blocks"]:
        for line in block.get("lines", []):
            dirx, diry = line.get("dir", (1.0, 0.0))
            angle = math.degrees(math.atan2(diry, dirx))
            for span in line["spans"]:
                t = span["text"].strip()
                if not t:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                ins = (x0 * PT_TO_MM, (H - y1) * PT_TO_MM)
                if not keep([ins]):
                    continue
                height = max(span["size"] * PT_TO_MM * 0.8, 0.5)
                col = span.get("color", 0)
                r = (col >> 16) & 255
                g = (col >> 8) & 255
                b = col & 255
                ent = msp.add_text(t, dxfattribs={
                    "layer": "TEXTE_TRAITS",
                    "height": height,
                    "rotation": angle,
                    "true_color": ezdxf.colors.rgb2int((r, g, b)),
                })
                ent.set_placement(ins)
                stats["text"] += 1

    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(out_dir, base + ".dxf")
    out.saveas(out_path)
    print(f"  OK  {base}.dxf  lines={stats['line']} polys={stats['poly']} "
          f"hatch={stats['hatch']} text={stats['text']} layers={len(out.layers)}")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="PDF file or folder of PDFs")
    ap.add_argument("--out", default=None, help="output dir (default: ./out)")
    ap.add_argument("--no-hatch", action="store_true", help="skip solid fills")
    ap.add_argument("--clip", action="store_true",
                    help="drop geometry lying entirely beyond the sheet (tidy A3)")
    ap.add_argument("--clip-margin", type=float, default=25.0,
                    help="margin in mm around the sheet for --clip (default 25)")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = args.out or os.path.join(here, "out")

    if os.path.isdir(args.src):
        pdfs = sorted(p for p in glob.glob(os.path.join(args.src, "*.pdf"))
                      if not os.path.basename(p).startswith("._"))
    else:
        pdfs = [args.src]
    if not pdfs:
        print("No PDFs found.")
        return
    print(f"Converting {len(pdfs)} file(s) -> {out_dir}")
    for p in pdfs:
        try:
            convert(p, out_dir, do_hatch=not args.no_hatch,
                    clip=args.clip, margin=args.clip_margin)
        except Exception as e:
            print(f"  FAIL {os.path.basename(p)}: {e}")


if __name__ == "__main__":
    main()
