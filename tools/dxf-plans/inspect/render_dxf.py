"""Render a single DXF to PNG. Usage: render_dxf.py <dxf> <out.png>"""
import sys
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib.pyplot as plt

dxf, out = sys.argv[1], sys.argv[2]
doc = ezdxf.readfile(dxf)
fig = plt.figure(figsize=(16, 11.3))
ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor("white")
Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(doc.modelspace(), finalize=True)
fig.savefig(out, dpi=120, facecolor="white")
print("rendered", out)
