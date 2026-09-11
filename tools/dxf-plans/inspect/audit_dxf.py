import sys
import ezdxf
from ezdxf import bbox
from collections import Counter

path = sys.argv[1]
doc = ezdxf.readfile(path)
msp = doc.modelspace()
print("DXF version:", doc.dxfversion, "  INSUNITS:", doc.header.get("$INSUNITS"))
print("layers:")
for l in sorted(doc.layers, key=lambda x: x.dxf.name):
    print(f"   {l.dxf.name:24} rgb={l.rgb}")
ext = bbox.extents(msp)
print("extents mm:", tuple(round(v, 1) for v in ext.extmin), "->", tuple(round(v, 1) for v in ext.extmax))
print("entities:", dict(Counter(e.dxftype() for e in msp)))
