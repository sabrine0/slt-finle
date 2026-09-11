"""Validate every DXF in one or more folders: load + structural audit.

Usage: py -3.11 validate_all.py "<folder>" ["<folder2>" ...]
"""
import sys, os, glob, traceback
import ezdxf
from ezdxf import bbox
from collections import Counter

folders = sys.argv[1:]
total = ok = warn = fail = 0
worst = []

for folder in folders:
    files = sorted(glob.glob(os.path.join(folder, "*.dxf")))
    print(f"\n=== {folder}  ({len(files)} files) ===")
    for f in files:
        total += 1
        name = os.path.basename(f)
        try:
            doc = ezdxf.readfile(f)
            auditor = doc.audit()              # structural check + auto-fix
            msp = doc.modelspace()
            n = sum(1 for _ in msp)
            errs = len(auditor.errors)
            fixes = len(auditor.fixes)
            try:
                ext = bbox.extents(msp)
                w = round(ext.extmax.x - ext.extmin.x, 1)
                h = round(ext.extmax.y - ext.extmin.y, 1)
                dims = f"{w}x{h}mm"
            except Exception:
                dims = "no-extents"
            if errs:
                fail += 1
                status = f"FAIL errors={errs}"
                worst.append((name, errs))
            elif fixes:
                warn += 1
                status = f"ok (auto-fixed {fixes})"
            else:
                ok += 1
                status = "ok"
            print(f"  [{status:22}] {name:48} ents={n:>7} {dims} layers={len(doc.layers)}")
        except Exception as e:
            fail += 1
            print(f"  [LOAD-FAIL           ] {name}: {e}")
            traceback.print_exc()

print(f"\n==== SUMMARY ====")
print(f"total={total}  clean={ok}  auto-fixed={warn}  failed={fail}")
if worst:
    print("files with errors:", worst)
