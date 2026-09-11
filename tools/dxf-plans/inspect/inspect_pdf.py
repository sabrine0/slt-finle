"""Inspect a vector PDF (AutoCAD export) to gauge what geometry/data is recoverable.

Usage: py -3.11 inspect_pdf.py "<path-to.pdf>"
"""
import sys, collections, json
import fitz  # PyMuPDF

path = sys.argv[1]
doc = fitz.open(path)
print(f"FILE: {path}")
print(f"pages: {len(doc)}  page0 size(pt): {doc[0].rect}")

page = doc[0]

# --- vector drawings ---
drawings = page.get_drawings()
n_paths = len(drawings)
item_counts = collections.Counter()
color_counts = collections.Counter()
width_counts = collections.Counter()
for d in drawings:
    for it in d["items"]:
        item_counts[it[0]] += 1
    stroke = d.get("color")
    if stroke:
        color_counts[tuple(round(c, 2) for c in stroke)] += 1
    w = d.get("width")
    if w:
        width_counts[round(w, 2)] += 1

print(f"\n=== VECTOR DRAWINGS ===")
print(f"path objects: {n_paths}")
print(f"item types: {dict(item_counts)}  (l=line, c=curve, re=rect, qu=quad)")
print(f"distinct stroke colors: {len(color_counts)}")
for col, cnt in color_counts.most_common(12):
    print(f"   color {col}: {cnt}")
print(f"line widths: {dict(width_counts)}")

# --- text ---
td = page.get_text("dict")
spans = []
for block in td["blocks"]:
    for line in block.get("lines", []):
        for span in line["spans"]:
            t = span["text"].strip()
            if t:
                spans.append((t, span["bbox"], round(span["size"], 1)))
print(f"\n=== TEXT ===")
print(f"text spans: {len(spans)}")
# sample labels that look like element refs
import re
refs = [s for s in spans if re.match(r"^C\d{2}-[A-Z]", s[0])]
print(f"element-ref labels (Cxx-Y-..): {len(refs)}  e.g. {[r[0] for r in refs[:10]]}")
streets = [s for s in spans if any(k in s[0] for k in ("Av ", "Rue ", "Rte ", "Bd ", "Boulevard"))]
print(f"street labels: {[s[0] for s in streets[:12]]}")

# --- images (raster) check: if mostly raster, extraction is harder ---
print(f"\n=== IMAGES ===")
print(f"raster images on page: {len(page.get_images(full=True))}")
