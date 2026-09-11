"""Render a DXF and the source PDF page to PNGs for visual comparison."""
import sys, os
import fitz
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib.pyplot as plt

dxf_path = sys.argv[1]
pdf_path = sys.argv[2]
outdir = sys.argv[3]
os.makedirs(outdir, exist_ok=True)
base = os.path.splitext(os.path.basename(dxf_path))[0]

# --- DXF -> PNG ---
doc = ezdxf.readfile(dxf_path)
msp = doc.modelspace()
fig = plt.figure(figsize=(16, 11.3))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_facecolor("white")
ctx = RenderContext(doc)
Frontend(ctx, MatplotlibBackend(ax)).draw_layout(msp, finalize=True)
dxf_png = os.path.join(outdir, base + "_DXF.png")
fig.savefig(dxf_png, dpi=110, facecolor="white")
plt.close(fig)
print("DXF render:", dxf_png)

# --- PDF -> PNG ---
pd = fitz.open(pdf_path)
pix = pd[0].get_pixmap(dpi=110)
pdf_png = os.path.join(outdir, base + "_PDF.png")
pix.save(pdf_png)
print("PDF render:", pdf_png)
