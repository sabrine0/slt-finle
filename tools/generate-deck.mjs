/**
 * Generate the STLS overview deck as a real .pptx with embedded
 * screenshots captured by capture-screenshots.mjs.
 *
 *   node tools/capture-screenshots.mjs
 *   node tools/generate-deck.mjs
 *   (or: npm --prefix tools run all)
 *
 * Output: docs/STLS-Overview.pptx
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import PptxGenJS from "pptxgenjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "docs", "STLS-Overview.pptx");
const CAPTURES_DIR = path.join(ROOT, "tools", "captures");
mkdirSync(path.dirname(OUT_PATH), { recursive: true });

// ──────────────────────────────────────────────────────────────────────
// Palette
// ──────────────────────────────────────────────────────────────────────

const ink = "0F1A12";
const inkMuted = "4A5660";
const accent = "C38A29";
const accentLight = "FFC45C";
const accentBg = "FFF4DB";
const greenInk = "0A5732";
const greenBg = "E4F7EC";
const yellowInk = "7A5010";
const yellowBg = "FFF1CF";
const redInk = "9A1C1C";
const redBg = "FDE9E9";
const surface = "0A0D10";
const surfaceLight = "F6F8FA";
const border = "C4CCD4";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pptx.title = "STLS — Smart Traffic Light System";
pptx.author = "STLS Studio";
pptx.company = "Tomorrow Morocco";

// ──────────────────────────────────────────────────────────────────────
// Master slide
// ──────────────────────────────────────────────────────────────────────

pptx.defineSlideMaster({
  title: "STLS_MASTER",
  background: { color: "FFFFFF" },
  objects: [
    {
      rect: { x: 0, y: 7.15, w: 13.33, h: 0.35, fill: { color: surface } },
    },
    {
      text: {
        text: "STLS — Smart Traffic Light System",
        options: {
          x: 0.3,
          y: 7.18,
          w: 10,
          h: 0.3,
          fontSize: 9,
          color: "BFD7D0",
          fontFace: "Calibri",
        },
      },
    },
    {
      text: {
        text: "Tomorrow Morocco",
        options: {
          x: 11.5,
          y: 7.18,
          w: 1.7,
          h: 0.3,
          align: "right",
          fontSize: 9,
          color: accentLight,
          bold: true,
          fontFace: "Calibri",
        },
      },
    },
    { rect: { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: accent } } },
  ],
  slideNumber: {
    x: 12.7,
    y: 7.18,
    fontSize: 9,
    color: "FFFFFF",
    fontFace: "Calibri",
  },
});

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function captureFor(slug) {
  const file = path.join(CAPTURES_DIR, `${slug}.png`);
  return existsSync(file) ? file : null;
}

function addInterfaceSlide({
  number,
  total,
  title,
  subtitle,
  route,
  bullets,
  captureSlug,
  badge,
}) {
  const slide = pptx.addSlide({ masterName: "STLS_MASTER" });

  slide.addText(`INTERFACE ${number}/${total}`, {
    x: 0.7,
    y: 0.3,
    w: 6,
    h: 0.35,
    fontSize: 11,
    bold: true,
    color: accent,
    charSpacing: 4,
    fontFace: "Calibri",
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.65,
    w: 10.5,
    h: 0.75,
    fontSize: 30,
    bold: true,
    color: ink,
    fontFace: "Calibri",
  });

  if (badge) {
    slide.addShape("roundRect", {
      x: 11.4,
      y: 0.55,
      w: 1.5,
      h: 0.45,
      fill: { color: badge.bg },
      line: { color: badge.fg, width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(badge.text, {
      x: 11.4,
      y: 0.55,
      w: 1.5,
      h: 0.45,
      fontSize: 10,
      bold: true,
      color: badge.fg,
      align: "center",
      fontFace: "Calibri",
    });
  }

  slide.addText(subtitle, {
    x: 0.7,
    y: 1.35,
    w: 12,
    h: 0.45,
    fontSize: 14,
    italic: true,
    color: inkMuted,
    fontFace: "Calibri",
  });
  slide.addShape("line", {
    x: 0.7,
    y: 1.95,
    w: 12,
    h: 0,
    line: { color: border, width: 0.5 },
  });

  // Left column — route + bullets
  slide.addText(`Route  ${route}`, {
    x: 0.7,
    y: 2.1,
    w: 5.2,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: accent,
    fontFace: "Consolas",
  });
  slide.addText(
    bullets.map((t) => ({ text: t, options: { bullet: { code: "25AA" } } })),
    {
      x: 0.7,
      y: 2.5,
      w: 5.2,
      h: 4.4,
      fontSize: 12,
      color: ink,
      paraSpaceAfter: 4,
      fontFace: "Calibri",
    },
  );

  // Right side — screenshot frame
  const capture = captureFor(captureSlug);
  slide.addShape("roundRect", {
    x: 6.1,
    y: 2.1,
    w: 6.6,
    h: 4.75,
    fill: { color: surfaceLight },
    line: { color: border, width: 0.5 },
    rectRadius: 0.1,
  });
  if (capture) {
    slide.addImage({
      path: capture,
      x: 6.2,
      y: 2.2,
      w: 6.4,
      h: 4.55,
      sizing: { type: "contain", w: 6.4, h: 4.55 },
    });
  } else {
    slide.addText(`screenshot missing: ${captureSlug}.png`, {
      x: 6.1,
      y: 2.1,
      w: 6.6,
      h: 4.75,
      fontSize: 11,
      italic: true,
      color: inkMuted,
      align: "center",
      valign: "middle",
      fontFace: "Calibri",
    });
  }
}

function addColumnsSlide({ eyebrow, title, subtitle, columns }) {
  const slide = pptx.addSlide({ masterName: "STLS_MASTER" });
  slide.addText(eyebrow.toUpperCase(), {
    x: 0.7,
    y: 0.35,
    w: 12,
    h: 0.35,
    fontSize: 11,
    bold: true,
    color: accent,
    charSpacing: 4,
    fontFace: "Calibri",
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.7,
    w: 12,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: ink,
    fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.7,
      y: 1.5,
      w: 12,
      h: 0.4,
      fontSize: 14,
      italic: true,
      color: inkMuted,
      fontFace: "Calibri",
    });
  }
  slide.addShape("line", {
    x: 0.7,
    y: subtitle ? 2.0 : 1.65,
    w: 12,
    h: 0,
    line: { color: border, width: 0.5 },
  });
  const topY = subtitle ? 2.2 : 1.85;
  const colW = 12 / columns.length - 0.2;
  columns.forEach((col, index) => {
    const xStart = 0.7 + index * (colW + 0.2);
    slide.addText(col.heading.toUpperCase(), {
      x: xStart,
      y: topY,
      w: colW,
      h: 0.4,
      fontSize: 11,
      bold: true,
      color: accent,
      charSpacing: 3,
      fontFace: "Calibri",
    });
    slide.addText(
      col.items.map((t) => ({
        text: t,
        options: { bullet: { code: "25AA" } },
      })),
      {
        x: xStart,
        y: topY + 0.45,
        w: colW,
        h: 4.5,
        fontSize: 13,
        color: ink,
        paraSpaceAfter: 4,
        fontFace: "Calibri",
      },
    );
  });
}

// ──────────────────────────────────────────────────────────────────────
// Slide 1 — Cover
// ──────────────────────────────────────────────────────────────────────

{
  const slide = pptx.addSlide({ masterName: "STLS_MASTER" });
  slide.background = { color: surface };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.35,
    h: 7.5,
    fill: { color: accent },
    line: { color: accent },
  });
  slide.addText("STLS", {
    x: 0.7,
    y: 1.3,
    w: 12,
    h: 1.5,
    fontSize: 76,
    bold: true,
    color: accentLight,
    fontFace: "Calibri",
  });
  slide.addText("Smart Traffic Light System", {
    x: 0.7,
    y: 2.8,
    w: 12,
    h: 0.7,
    fontSize: 30,
    color: "EDF3EE",
    fontFace: "Calibri",
  });
  slide.addText(
    "Traffic supervision, engineering and AI assistance platform",
    {
      x: 0.7,
      y: 3.5,
      w: 12,
      h: 0.45,
      fontSize: 16,
      italic: true,
      color: "8FA39A",
      fontFace: "Calibri",
    },
  );
  slide.addShape("line", {
    x: 0.7,
    y: 4.3,
    w: 6,
    h: 0,
    line: { color: accentLight, width: 2 },
  });
  slide.addText(
    [
      { text: "Pilot project   ", options: { color: "8FA39A" } },
      { text: "STLS Pilot — Casablanca\n", options: { color: "EDF3EE", bold: true } },
      { text: "Client                ", options: { color: "8FA39A" } },
      { text: "Société Région Aménagement\n", options: { color: "EDF3EE", bold: true } },
      { text: "Version              ", options: { color: "8FA39A" } },
      { text: "2026-04-24\n", options: { color: "EDF3EE", bold: true } },
      { text: "Contact            ", options: { color: "8FA39A" } },
      { text: "akarim@tomorrow.ma", options: { color: "EDF3EE", bold: true } },
    ],
    {
      x: 0.7,
      y: 4.5,
      w: 12,
      h: 2,
      fontSize: 14,
      fontFace: "Calibri",
    },
  );
}

// ──────────────────────────────────────────────────────────────────────
// Slide 2 — Agenda
// ──────────────────────────────────────────────────────────────────────

addColumnsSlide({
  eyebrow: "Agenda",
  title: "12 interfaces · one deck",
  subtitle: "Each section covers one screen with role, user persona and route",
  columns: [
    {
      heading: "Supervision",
      items: [
        "Command Platform",
        "AI Assist panel",
        "Override reason-coded flow",
        "Projects",
      ],
    },
    {
      heading: "Engineering",
      items: [
        "Studio Landing",
        "Studio Workbench",
        "Controller Workspace",
        "AutoCAD Plan",
        "Dossiers (Régulation / Câblage)",
      ],
    },
    {
      heading: "Prospection",
      items: [
        "Zone Builder",
        "Proposal Workspace",
        "Engineering Inventory",
        "Controller Inventory",
      ],
    },
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Slide 3 — Architecture
// ──────────────────────────────────────────────────────────────────────

{
  const slide = pptx.addSlide({ masterName: "STLS_MASTER" });
  slide.addText("ARCHITECTURE", {
    x: 0.7,
    y: 0.35,
    w: 12,
    h: 0.35,
    fontSize: 11,
    bold: true,
    color: accent,
    charSpacing: 4,
    fontFace: "Calibri",
  });
  slide.addText("Stack overview", {
    x: 0.7,
    y: 0.7,
    w: 12,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: ink,
    fontFace: "Calibri",
  });
  slide.addShape("line", {
    x: 0.7,
    y: 1.55,
    w: 12,
    h: 0,
    line: { color: border, width: 0.5 },
  });

  const tier = (x, y, w, h, title, lines, fg, bg) => {
    slide.addShape("roundRect", {
      x,
      y,
      w,
      h,
      fill: { color: bg },
      line: { color: fg, width: 1.5 },
      rectRadius: 0.1,
    });
    slide.addText(title, {
      x,
      y,
      w,
      h: 0.45,
      fontSize: 13,
      bold: true,
      color: fg,
      align: "center",
      fontFace: "Calibri",
    });
    slide.addText(
      lines.map((l) => ({ text: l, options: { bullet: false } })),
      {
        x: x + 0.2,
        y: y + 0.5,
        w: w - 0.4,
        h: h - 0.6,
        fontSize: 12,
        color: ink,
        fontFace: "Calibri",
      },
    );
  };

  tier(0.7, 1.9, 5.8, 1.4, "CLIENTS (Next.js 16 · React 19)", [
    "Command Platform — real-time operator",
    "Studio — engineering + AutoCAD + dossiers",
  ], accent, accentBg);
  tier(6.8, 1.9, 5.8, 1.4, "BACKEND (NestJS 11)", [
    "auth · traffic · intersection-runtime · engineering",
    "controller-manager · overrides · projects · audit",
    "traffic-intelligence (Gemini + Google Traffic)",
  ], greenInk, greenBg);
  tier(0.7, 3.5, 5.8, 1.3, "PERSISTENCE", [
    "PostgreSQL 14 · TypeORM 0.3 (4 migrations)",
    "Override audit · projects · deployments · runtime configs",
  ], inkMuted, "F4F6F8");
  tier(6.8, 3.5, 5.8, 1.3, "EXTERNAL APIS (server-side keys)", [
    "Gemini 1.5 Flash — JSON mode, T=0.2",
    "Google Distance Matrix — 4 corridors / zone",
  ], yellowInk, yellowBg);
  tier(3.7, 5.0, 5.8, 1.6, "CONTROLLER RUNTIME (Go, per cabinet)", [
    "HMAC-signed config packages",
    "JWT refresh · offline mode",
    "Fail-safe flashing amber on comms loss",
    "I/O → signal heads · detectors · buttons",
  ], redInk, redBg);

  slide.addText("AI never commands the field directly — every action goes through the reason-coded override gate.", {
    x: 0.7,
    y: 6.75,
    w: 12,
    h: 0.3,
    fontSize: 11,
    italic: true,
    color: inkMuted,
    align: "center",
    fontFace: "Calibri",
  });
}

// ──────────────────────────────────────────────────────────────────────
// Interface slides — all 12, English, with embedded captures
// ──────────────────────────────────────────────────────────────────────

const ifaces = [
  {
    title: "Command Platform",
    subtitle: "24/7 operator console — Morocco map, alerts, override controls",
    route: "/",
    badge: { text: "OPERATOR", fg: redInk, bg: redBg },
    captureSlug: "command-platform",
    bullets: [
      "Morocco map with regional ADM1 polygons colored by health (green / yellow / red)",
      "Drill-down: country → region → city → district → intersection",
      "KPI hero cards: incidents · nodes · controllers · throughput (vph)",
      "Alerts feed with critical-alert sound toggle",
      "Selected-area panel: operator controls + AI Assist panel",
      "Environment badge · theme toggle · scenario selector (Normal / Peak / Emergency)",
    ],
  },
  {
    title: "Projects",
    subtitle: "Project catalogue per organization",
    route: "/projects",
    badge: { text: "PM / BE", fg: greenInk, bg: greenBg },
    captureSlug: "projects",
    bullets: [
      "Hierarchy Organization → Project → Site → Intersection",
      "Seeded: Tomorrow Morocco → STLS Pilot — Casablanca",
      "Each card: client ref · status · sites count · intersection count",
      "Quick navigation to Command / Studio / Engineering",
    ],
  },
  {
    title: "Studio Landing",
    subtitle: "Google-Maps atlas of every controller in the project",
    route: "/studio",
    badge: { text: "ENGINEER", fg: yellowInk, bg: yellowBg },
    captureSlug: "studio-landing",
    bullets: [
      "Full-screen Google Map · dark & light themes",
      "Each controller = circular marker colored by connection state",
      "Corridor lines between controllers in the same district",
      "ADM1 polygons covering Morocco's 12 regions",
      "Top-right: health filter · theme · + Zone · Workbench",
      "Legend VIEW / ZONES / FLOW top-left",
    ],
  },
  {
    title: "Studio Workbench",
    subtitle: "Engineering IDE to configure an intersection end-to-end",
    route: "/studio/workbench",
    badge: { text: "ENGINEER", fg: yellowInk, bg: yellowBg },
    captureSlug: "studio-workbench",
    bullets: [
      "3-panel IDE: Project Explorer · Editor Workspace · Control Panel",
      "11 editor tabs: Diagram · Live · Identity · Approaches · Lanes · Signal groups · Movements · Phases & Stages · Detectors · Modes · Controller",
      "Project Explorer shows local proposals under their matched city (Prop tag)",
      "Collapsible side panels via the ⟨ Explorer / ⟩ Panel toggles",
      "Export Régulation / Câblage → PDF via @react-pdf/renderer",
    ],
  },
  {
    title: "Controller Workspace",
    subtitle: "Live feed per controller — chip strip + live signal flow",
    route: "/studio/controllers/[id]  ·  /studio/programmer/[id]",
    badge: { text: "TECH", fg: greenInk, bg: greenBg },
    captureSlug: "controller-workspace",
    bullets: [
      "Top chip strip: EVERY controller in the project with live state",
      "Controller details: mode · env · runtime · active plan · uptime",
      "Live signal flow: N/E/S/W lights + cycle timeline",
      "Force-phase buttons per phase + Release button",
      "Polls /intersections/:code/state every 1 s",
    ],
  },
  {
    title: "AutoCAD Plan",
    subtitle: "Vector topographic plan · GroupéRyX style",
    route: "/studio/autocad/[intersectionId]",
    badge: { text: "BE TOPO", fg: yellowInk, bg: yellowBg },
    captureSlug: "autocad-plan",
    bullets: [
      "Full SVG render — no Google tiles in the exported drawing",
      "Data model: CivilPlan · RoadArm · Lane · Crosswalk · SignalSupport · DetectorLoop · CableChamber · CableRun · ControllerCabinet",
      "Sample INT-CAS-006: 16 supports (A-P) · 6 loops · 8 chambers · 22 cable runs · cabinet C04",
      "8 layer toggles: Roads · Lanes · Crosswalks · Supports · Loops · Chambers · Cables · Labels",
      "North arrow · scale bar 0-5-10 m · 1:200 · dark & light",
      "Three export buttons: Plan PDF · Dossier Régulation · Dossier Câblage",
    ],
  },
  {
    title: "Dossier Régulation",
    subtitle: "Regulation dossier — PDF output matching GroupéRyX format",
    route: "/studio/autocad/[id]/dossier/regulation",
    badge: { text: "DELIVERABLE", fg: accent, bg: accentBg },
    captureSlug: "autocad-dossier-regulation",
    bullets: [
      "Cover page + revision table (préparé / vérifié)",
      "Intersection identity (code, GPS, controller, firmware)",
      "Signal equipment inventory (R11v / R12 / R14 counts, supports)",
      "Controller inputs table",
      "Vector plan d'aménagement (A3 landscape)",
      "Phasing: Min green / Yellow / Red-clearance / Green groups",
      "Signal plans — Code / Name / Status / Cycle / Offset",
      "Observations & assumptions",
    ],
  },
  {
    title: "Dossier Câblage",
    subtitle: "Wiring dossier — carnet de câblage + cable schedule",
    route: "/studio/autocad/[id]/dossier/cablage",
    badge: { text: "DELIVERABLE", fg: accent, bg: accentBg },
    captureSlug: "autocad-dossier-cablage",
    bullets: [
      "Cover page + revision table",
      "Vector cabling plan (A3 landscape)",
      "Cabling detail: Departure · Support · Type · Equipment · Cable · Tag · Length · Path",
      "Detection loop wiring",
      "Cable quantity roll-up (U1000 R2v, Blindé LIYCY, Fibre)",
      "Pulling chambers inventory",
      "Controller I/O mapping (Bornier, Mnemonic, Cable ref)",
    ],
  },
  {
    title: "Zone Builder",
    subtitle: "Draw a new intersection zone on Google Maps",
    route: "/studio/zones",
    badge: { text: "PROSPECTION", fg: accent, bg: accentBg },
    captureSlug: "studio-zones",
    bullets: [
      "Draggable rectangle with 4 corner handles on Google Maps",
      "Live dimensions (width × height × km²) via haversine math",
      "TopoExport-style right panel: 3D modeling (DXF / IFC+ / OBJ / glTF / STL) + layers",
      "+ Add controller → auto-fills from Google Maps Geocoder",
      "Intersection name ← route / sublocality · Code ← INT-CITY-STREET",
      "Visualiser: fit-bounds + pulse animation",
      "Saved proposals appear in the Workbench tree under their city",
    ],
  },
  {
    title: "Engineering Studio",
    subtitle: "Engineering inventory of every intersection",
    route: "/engineering",
    badge: { text: "BE", fg: yellowInk, bg: yellowBg },
    captureSlug: "engineering",
    bullets: [
      "Grid of intersection cards with code · name · district · control mode",
      "Phase count · timing plan count · controllers (real / sim)",
      "Deployment status per intersection",
      "Drill-down to /engineering/intersections/[id] for full details",
    ],
  },
  {
    title: "Engineering — Intersection detail",
    subtitle: "Full engineering record of one intersection",
    route: "/engineering/intersections/[id]",
    badge: { text: "BE", fg: yellowInk, bg: yellowBg },
    captureSlug: "engineering-intersection",
    bullets: [
      "Identity, coordinates, control mode, status, queue length",
      "Attached controllers with hardware details",
      "Detection loops + phase sequence table",
      "Timing plans (active / draft / retired)",
      "Deployment history with signed package versions",
    ],
  },
  {
    title: "Controller Inventory",
    subtitle: "Hardware inventory across the fleet",
    route: "/engineering/controllers",
    badge: { text: "OPS", fg: greenInk, bg: greenBg },
    captureSlug: "engineering-controllers",
    bullets: [
      "Listing: code · controller type · firmware · runtime version",
      "Connection state · environment · battery-backed flag",
      "Detector / signal-group capacity per unit",
      "Last seen · last deployed package · deployment state",
      "Click-through to each controller's detail view",
    ],
  },
];

ifaces.forEach((iface, index) => {
  addInterfaceSlide({
    number: index + 1,
    total: ifaces.length,
    ...iface,
  });
});

// ──────────────────────────────────────────────────────────────────────
// Cross-cutting slides
// ──────────────────────────────────────────────────────────────────────

addColumnsSlide({
  eyebrow: "AI Assist",
  title: "Traffic intelligence — advisory, auditable, safe",
  subtitle: "Backend module traffic-intelligence · 3 services · 15 unit tests",
  columns: [
    {
      heading: "Pipeline",
      items: [
        "GoogleTrafficService — Distance Matrix for N/E/S/W corridors",
        "AiRecommendationService — Gemini 1.5 Flash JSON, T=0.2",
        "Fallback: deterministic rule-based if GEMINI_API_KEY is missing",
        "AiSafetyValidatorService — final exit gate",
      ],
    },
    {
      heading: "Safety rules",
      items: [
        "Advisory mode forces requiresHumanApproval=true",
        "Real-mode intersections always need human approval",
        "Operator override (manual / emergency / flash / fail-safe) = no_action",
        "Unknown phase id → no_action",
        "Duration clamped to [minGreen, 60s]",
        "Conflict matrix checked before accepting",
      ],
    },
    {
      heading: "UX",
      items: [
        "3 tabs: Recommendation · Context · History",
        "Chip badges for action · risk · source · approval",
        "Apply via override → reuses reason-coded modal",
        "History keeps last 25 recommendations per intersection",
      ],
    },
  ],
});

addColumnsSlide({
  eyebrow: "Security",
  title: "Defence in depth",
  subtitle: "No command reaches the field without an audit trail",
  columns: [
    {
      heading: "Identity",
      items: [
        "JWT required outside dev mode",
        "Fine-grained permissions (read / control / author / approve)",
        "Project-scoped roles",
      ],
    },
    {
      heading: "Commands",
      items: [
        "Reason code mandatory on every override",
        "Operator · IP · timestamp persisted",
        "Triple validation: UI · AI safety · runtime service",
      ],
    },
    {
      heading: "AI",
      items: [
        "Advisory only (AI_CONTROL_MODE env)",
        "Real-mode = human approval always",
        "Any operator override suppresses AI suggestion",
      ],
    },
  ],
});

addColumnsSlide({
  eyebrow: "Stack",
  title: "Technologies in use",
  columns: [
    {
      heading: "Frontend",
      items: [
        "Next.js 16 · React 19",
        "Tailwind v4 · TypeScript 5",
        "@react-google-maps/api",
        "@react-pdf/renderer",
      ],
    },
    {
      heading: "Backend",
      items: [
        "NestJS 11 · TypeORM 0.3",
        "PostgreSQL 14",
        "Passport JWT",
        "Gemini 1.5 · Google Distance Matrix",
      ],
    },
    {
      heading: "Field runtime",
      items: [
        "Go runtime per cabinet",
        "HMAC package signing",
        "JWT refresh + offline mode",
        "Fail-safe flashing amber",
      ],
    },
  ],
});

addColumnsSlide({
  eyebrow: "Roadmap",
  title: "Done · in progress · next",
  columns: [
    {
      heading: "Sprint 1 — done",
      items: [
        "Projects / sites / intersections",
        "Reason-coded override",
        "Environment badge · audit logs",
        "Frontend route groups",
      ],
    },
    {
      heading: "Sprint 2 — done",
      items: [
        "AutoCAD SVG plan",
        "PDF dossiers (régulation + câblage)",
        "Zone builder + Google geocoder",
      ],
    },
    {
      heading: "Sprint 3 — in progress",
      items: [
        "AI Assist advisory + safety",
        "Gemini + fallback rules",
        "Override audit integration",
      ],
    },
    {
      heading: "Next",
      items: [
        "POST /engineering/intersections",
        "Conflict matrix editor UI",
        "Simulation dry-run",
        "SSO / LDAP in production",
        "Fleet rollout with OTA HMAC",
      ],
    },
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Closing
// ──────────────────────────────────────────────────────────────────────

{
  const slide = pptx.addSlide({ masterName: "STLS_MASTER" });
  slide.background = { color: surface };
  slide.addText("Thank you", {
    x: 0.7,
    y: 2.6,
    w: 12,
    h: 1.2,
    fontSize: 72,
    bold: true,
    color: accentLight,
    align: "center",
    fontFace: "Calibri",
  });
  slide.addText("Questions · live demo · code walkthrough", {
    x: 0.7,
    y: 3.9,
    w: 12,
    h: 0.5,
    fontSize: 18,
    italic: true,
    color: "8FA39A",
    align: "center",
    fontFace: "Calibri",
  });
  slide.addText("akarim@tomorrow.ma", {
    x: 0.7,
    y: 4.6,
    w: 12,
    h: 0.4,
    fontSize: 16,
    color: "EDF3EE",
    align: "center",
    fontFace: "Calibri",
  });
}

await pptx.writeFile({ fileName: OUT_PATH });
console.log(`Deck written → ${OUT_PATH}`);
