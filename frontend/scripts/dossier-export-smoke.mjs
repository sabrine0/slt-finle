/**
 * Dossier-export render smoke.
 *
 * Renders the real <DossierPDF> (the component behind the Studio
 * workspace "Régulation" / "Câblage" export buttons) against a matrix
 * of *incomplete* configs and asserts each still produces a valid PDF.
 *
 * Guards the regression where a partially-configured intersection (e.g.
 * one scaffolded from "real geometry" before any import — null location
 * or undefined collections) made @react-pdf throw the cryptic
 * "Cannot read properties of null (reading 'props')" mid-render, so the
 * export silently failed with "Export PDF échoué".
 *
 * The component's only runtime dependency is @react-pdf/renderer, so we
 * transpile the .tsx on the fly and render it in Node — no browser, no
 * test framework. Run with: npm run test:dossier
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const root = path.resolve(import.meta.dirname, "..");
const componentPath = path.join(
  root,
  "src/components/studio/dossier/dossier-pdf.tsx",
);

const transpiled = ts.transpileModule(readFileSync(componentPath, "utf8"), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const genPath = path.join(root, ".dossier-smoke.gen.mjs");
writeFileSync(genPath, transpiled);

let DossierPDF;
try {
  ({ DossierPDF } = await import(pathToFileURL(genPath).href));
} finally {
  rmSync(genPath, { force: true });
}

function makeConfig(overrides = {}) {
  return {
    id: "CAR-SMOKE",
    identity: {
      name: "Carrefour test",
      district: "Casablanca",
      address: "Adresse",
      location: { lat: 33.59, lng: -7.61 },
    },
    controllerId: "CTRL-1",
    approaches: [],
    signalGroups: [],
    detectors: [],
    phases: [],
    stages: [],
    conflicts: [],
    ...overrides,
  };
}

// Each case is a config shape that has, at some point, reached the
// renderer from the workspace store. None may throw.
const cases = [
  ["complete (empty arrays) — regulation", makeConfig(), "regulation"],
  ["complete (empty arrays) — cablage", makeConfig(), "cablage"],
  ["null controllerId", makeConfig({ controllerId: null }), "regulation"],
  [
    "null location",
    makeConfig({
      identity: { name: "x", district: "y", address: "z", location: null },
    }),
    "regulation",
  ],
  [
    "undefined collections",
    {
      id: "C",
      identity: {
        name: "n",
        district: "d",
        address: "a",
        location: { lat: 1, lng: 2 },
      },
      controllerId: "c",
    },
    "cablage",
  ],
  [
    "undefined conflicts with signal groups",
    makeConfig({
      signalGroups: [{ id: "SG1", label: "Voie 1", aspects: ["red", "green"] }],
      conflicts: undefined,
    }),
    "regulation",
  ],
  // The real regression: backend serialises lat/lng as strings, so
  // `location.lat.toFixed()` blew up mid-render (masked as the
  // "reading 'props'" error) on every engineering-seeded intersection.
  [
    "string coordinates (backend decimal columns)",
    makeConfig({
      identity: {
        name: "Bd Moulay Abderrahman/ Accés ONCF",
        district: "Casablanca",
        address: "Bd Moulay Abderrahman",
        location: { lat: "33.597423", lng: "-7.611005" },
      },
    }),
    "regulation",
  ],
  [
    "string coordinates — cablage",
    makeConfig({
      identity: {
        name: "X",
        district: "Y",
        address: "Z",
        location: { lat: "33.597423", lng: "-7.611005" },
      },
    }),
    "cablage",
  ],
];

let failures = 0;
for (const [label, config, kind] of cases) {
  try {
    const buf = await renderToBuffer(
      React.createElement(DossierPDF, { config, kind }),
    );
    const ok = buf.length > 1000 && buf.subarray(0, 5).toString() === "%PDF-";
    if (!ok) throw new Error(`produced ${buf.length} bytes, not a valid PDF`);
    console.log(`  PASS  ${label} (${buf.length} B)`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}: ${err?.message ?? err}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} dossier-export case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} dossier-export cases passed.`);
