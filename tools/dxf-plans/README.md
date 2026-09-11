# SLT Plan → editable AutoCAD (DXF)

Converts the **Plan Réseaux Secondaires SLT** PDFs (AutoCAD-exported vector plans
of the Fès intersections) into **editable, layered DXF** files that open directly
in AutoCAD / BricsCAD / QGIS / LibreCAD. In AutoCAD you can `SAVEAS → .dwg` if you
need the binary format.

> Why DXF, not DWG: DWG is Autodesk's closed binary format and cannot be generated
> reliably by code. DXF is the open AutoCAD interchange format — plain text, fully
> editable, and scriptable (so an AI/script can generate new plans). AutoCAD treats
> DXF and DWG as equivalent on open/save.

## What you get

- **A3 sheet, millimetres** (`$INSUNITS = mm`), 1 PDF point → 25.4/72 mm, so the
  drawing is true A3 (420 × 297 mm).
- Geometry split onto **named layers by legend category**, each with its source
  color, so you can freeze / recolor / edit a whole category at once:

  | Layer | Legend meaning |
  |-------|----------------|
  | `FOURREAU_CEINTURAGE` | Fourreaux Liaison Chambre Ceinturage (magenta) |
  | `FOURREAU_FIBRE_MULTI` | Fourreaux Liaison Fibre Optique / Multi (blue) |
  | `FOURREAU_SUPPORT` | Fourreaux Liaison Support (green) |
  | `FOURREAU_BOUCLE` | Fourreaux Liaison Boucle (orange) |
  | `BOUCLE_SATURATION` | Boucle saturation (yellow) |
  | `SUPPORT_POTENCE` | Supports type potence (bright green) |
  | `SUPPORTS_MASSIFS` | Poteaux / potelets / massifs (grey) |
  | `BORD_CHAUSSEE_SIGNAUX` | Bord de chaussée + signaux (red) |
  | `FLECHES_CIRCULATION` | Flèches de circulation (blue) |
  | `TEXTE_TRAITS` | Labels (Cxx-Y-z.z), street names, title block, legend |

- **Text** kept as editable TEXT entities at correct position, rotation and size
  (street names stay angled; element refs like `C01-A-3.6` are searchable).
- Lines → `LINE`, Bézier curves → flattened `LWPOLYLINE`, rectangles/quads →
  closed `LWPOLYLINE`, solid fills → `HATCH` (toggle with `--no-hatch`).

## Usage

```powershell
# IMPORTANT: keep temp off the C: drive (it fills up; dense plans need temp space)
$env:TEMP="D:\tmp"; $env:TMP="D:\tmp"

# one file
py -3.11 pdf_to_dxf.py "D:\sabrine\OneDrive_2026-04-14\PLans RS Fès\Plan_RS_SLT_Car01_Chaouki_Far_A.pdf"

# whole folder, custom output dir (recommend writing output to D:)
py -3.11 pdf_to_dxf.py "D:\sabrine\OneDrive_2026-04-14\PLans RS Fès" --out "D:\sabrine\DXF_editable_AutoCAD"
py -3.11 pdf_to_dxf.py "D:\RS\RS"                                   --out "D:\RS\RS_DXF_editable"

# skip solid fills (lighter files)
py -3.11 pdf_to_dxf.py "<src>" --out "D:\dxf" --no-hatch
```

Default output is `out/` next to the script. Files starting with `._` (macOS
junk) are skipped automatically.

### Converted so far

| Dataset | Source | Output | Files |
|---------|--------|--------|-------|
| Fès "Plan_RS_SLT" (vector) | `D:\sabrine\OneDrive_2026-04-14\PLans RS Fès\` | `D:\sabrine\DXF_editable_AutoCAD\` | 42 (~31 MB) |
| Casablanca tramway as-built (DOE-09, dense) | `D:\RS\RS\` | `D:\RS\RS_DXF_editable\` | 35 (~150 MB) |

The as-built plans carry the full road/cadastral background, so they have far more
geometry (up to ~240k lines) and use ~28 colors; colors without a legend match land
on `RVB_RRGGBB` layers that keep their exact source color (rename in AutoCAD as
needed).

## Dependencies

```powershell
py -3.11 -m pip install ezdxf pymupdf
# matplotlib only needed for the preview renderer in inspect/
```

## Layout

```
tools/dxf-plans/
  pdf_to_dxf.py        # the converter (batch-capable)
  README.md
  out/                 # generated .dxf files
  inspect/
    inspect_pdf.py     # report a PDF's vector content (paths, colors, text)
    audit_dxf.py       # report a DXF's layers / extents / entity counts
    render.py          # render DXF + source PDF to PNG for visual diff
    preview/           # comparison PNGs
```

## Notes / limits

- The 3 raster logos in each title block are **not** copied (DXF favours vector);
  re-insert as an image (`ATTACH`) in AutoCAD if you need them.
- Dashes in the duct lines are baked into the source geometry as short segments,
  so layers stay `CONTINUOUS` (no double-dashing).
- Geometry reproduces the PDF at **paper scale** (1/250–1/400 per sheet). To work
  in real-world metres, scale the model by the sheet's scale factor in AutoCAD.
- Some dense as-built plans contain a few stray entities placed outside the sheet
  frame (off-page PDF clip paths we don't apply). They're harmless — `Zoom Extents`
  will show them; select-and-delete or just ignore. Core content is unaffected.

### Tidy off-page geometry (`--clip`)

Some dense as-built plans carry a few entities far outside the A3 frame (off-page
PDF clip paths). `--clip` drops geometry that lies **entirely** beyond the sheet +
a margin, so it can never cut content near the edges:

```powershell
py -3.11 pdf_to_dxf.py "D:\RS\RS" --out "D:\RS\RS_DXF_clean" --clip --clip-margin 25
```

---

# Generating NEW plans (the "AI authors it" path)

`generate_dxf.py` builds a fresh, editable, layered SLT plan **from JSON** — an AI
fills in the description, the script renders an AutoCAD/LibreCAD-editable DXF in the
same style (A3, mm), with a built-in **symbol-block library**, **title block** and
**legend**.

```powershell
py -3.11 generate_dxf.py "sample_intersection.json" --out "D:\plans\C99.dxf"
```

## JSON schema

All positions are in **millimetres on the A3 sheet** (0–420 × 0–297). The drawing
area is the sheet minus the legend (bottom-left) and cartouche (bottom-right).

```jsonc
{
  "carrefour": "C99", "title": "Av X - Bd Y", "ville": "Fes",
  "echelle": "1/250", "date": "2026-05-21", "indice": "A",
  "zone": "Cha", "phase": "EXE", "discipline": "SLT",
  "emetteur": "TOM", "numero": "00099",

  "armoire": { "pos": [x, y] },

  "streets": [ { "name": "Av X", "pos": [x, y], "angle": 0, "height": 6 } ],

  "supports": [                       // poles & their attached signals
    { "id": "P1", "type": "poteau|potelet|potence", "pos": [x, y], "angle": deg,
      "ref": "C99-A-3.6",
      "signals": ["R11v_222","R11v_333","R12","anticipation","croix_grecque","bap"] }
  ],

  "loops": [                          // detection / saturation loops
    { "id": "Bcl_01", "type": "vp1|vp2|saturation", "pos": [x,y],
      "angle": 0, "size": [w, h] }    // size in mm
  ],

  "chambers": [ { "type": "tirage|raccordement", "pos": [x, y] } ],

  "ducts": [                          // fourreaux as polylines
    { "type": "ceinturage|fibre|support|boucle", "points": [[x,y], ...] }
  ],

  "arrows": [ { "from": [x,y], "to": [x,y] } ]   // optional circulation arrows
}
```

## Symbol library (reusable DXF blocks)

`POTEAU`, `POTELET`, `POTENCE` (4.5 m arm), `SIG_R11V_222` (+ répétiteur),
`SIG_R11V_333`, `SIG_PIETON_R12`, `ANTICIPATION`, `CROIX_GRECQUE`, `BAP`,
`ARMOIRE`, `BOUCLE_VP1/VP2/SAT`, `CHAMBRE_TIRAGE`, `CHAMBRE_RACC`.
Generated plans use the same legend layer names as the converter, plus
`SIGNAUX`, `SIG_PIETON`, `CHAMBRES`, `ARMOIRE`, `CARTOUCHE`, `LEGENDE`.

> Coordinates are sheet-mm in v1 (good enough to author/edit a plan). A future
> step can let the AI work in real-world metres and auto-fit to the sheet.
```
