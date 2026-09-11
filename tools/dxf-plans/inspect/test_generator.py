"""Automated test for generate_dxf.py: build several intersections, audit each,
assert the expected blocks/layers/text are present. Exits non-zero on failure.
"""
import os, sys, json, tempfile, importlib.util
import ezdxf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("gen", os.path.join(HERE, "generate_dxf.py"))
gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)

OUT = os.environ.get("TMP", tempfile.gettempdir())
passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1; print(f"  PASS  {name}")
    else:
        failed += 1; print(f"  FAIL  {name}  {detail}")


def gen_and_audit(data, tag):
    path = os.path.join(OUT, f"test_{tag}.dxf")
    gen.generate(data, path)
    doc = ezdxf.readfile(path)
    a = doc.audit()
    check(f"{tag}: audit clean", len(a.errors) == 0, f"{len(a.errors)} errors")
    return doc


# 1) full sample
with open(os.path.join(HERE, "sample_intersection.json"), encoding="utf-8") as f:
    sample = json.load(f)
doc = gen_and_audit(sample, "full")
msp = doc.modelspace()
inserts = [e for e in msp if e.dxftype() == "INSERT"]
names = [e.dxf.name for e in inserts]
texts = [e.dxf.text for e in msp if e.dxftype() == "TEXT"]
check("full: has armoire", "ARMOIRE" in names)
check("full: 4 supports placed", sum(n in ("POTEAU", "POTELET", "POTENCE") for n in names) >= 4)
check("full: signals placed", any(n.startswith("SIG_") for n in names))
check("full: loops placed", any(n.startswith("BOUCLE_") for n in names))
check("full: legend present", any("Legende" in t for t in texts))
check("full: cartouche carrefour", any("C99" in t for t in texts))
check("full: ref label kept", any("C99-A-3.6" in t for t in texts))
check("full: duct layers used",
      any(e.dxf.layer.startswith("FOURREAU_") for e in msp if e.dxftype() == "LWPOLYLINE"))

# 2) minimal: one support, nothing else
gen_and_audit({"carrefour": "C01", "title": "T",
               "supports": [{"id": "P1", "type": "poteau", "pos": [200, 150],
                             "signals": ["R11v_222"]}]}, "minimal")

# 3) metadata only (no elements) -> still border + legend + cartouche
doc = gen_and_audit({"carrefour": "CXX", "title": "Empty"}, "empty")
texts = [e.dxf.text for e in doc.modelspace() if e.dxftype() == "TEXT"]
check("empty: cartouche still drawn", any("CXX" in t for t in texts))

# 4) every signal/support/loop type at once
allkinds = {"carrefour": "CALL", "title": "all kinds",
            "supports": [{"id": f"P{i}", "type": t, "pos": [100 + i * 20, 150],
                          "signals": ["R11v_222", "R11v_333", "R12", "anticipation",
                                      "croix_grecque", "bap"]}
                         for i, t in enumerate(["poteau", "potelet", "potence"])],
            "loops": [{"id": "B1", "type": "vp1", "pos": [120, 100], "size": [8, 8]},
                      {"id": "B2", "type": "vp2", "pos": [140, 100], "size": [16, 8]},
                      {"id": "B3", "type": "saturation", "pos": [160, 100], "size": [10, 8]}],
            "chambers": [{"type": "tirage", "pos": [180, 120]},
                         {"type": "raccordement", "pos": [200, 120]}]}
gen_and_audit(allkinds, "allkinds")

print(f"\n==== {passed} passed, {failed} failed ====")
sys.exit(1 if failed else 0)
