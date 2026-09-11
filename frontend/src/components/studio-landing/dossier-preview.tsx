"use client";

import { useEffect, useState } from "react";

import type { IntersectionConfig } from "@/components/studio/state/types";
import {
  readIntersectionConfig,
  subscribeToStudioStore,
} from "@/lib/civil-plan-store";
import type {
  EngineeringIntersectionRecord,
  EngineeringPhaseRecord,
  EngineeringTimingPlanRecord,
} from "@/types/engineering-studio";

export type DossierKind = "regulation" | "cablage";

interface DossierPreviewProps {
  kind: DossierKind;
  intersection: EngineeringIntersectionRecord;
  projectName?: string;
  clientName?: string;
}

const kindMeta: Record<
  DossierKind,
  { titleFr: string; subtitleFr: string; backHref: (id: string) => string }
> = {
  regulation: {
    titleFr: "Dossier de Régulation",
    subtitleFr: "Travaux de Signalisation Lumineuse Tricolore",
    backHref: (id) => `/studio/autocad/${id}`,
  },
  cablage: {
    titleFr: "Dossier de Câblage",
    subtitleFr: "Travaux de Signalisation Lumineuse Tricolore",
    backHref: (id) => `/studio/autocad/${id}`,
  },
};

export function DossierPreview({
  kind,
  intersection,
  projectName,
  clientName,
}: DossierPreviewProps) {
  const meta = kindMeta[kind];
  const controller = intersection.controllers[0];
  const today = new Date().toLocaleDateString("fr-FR");

  const [storedConfig, setStoredConfig] = useState<IntersectionConfig | null>(
    null,
  );
  useEffect(() => {
    const refresh = () =>
      setStoredConfig(readIntersectionConfig(intersection.id));
    refresh();
    return subscribeToStudioStore(refresh);
  }, [intersection.id]);

  const revision = storedConfig?.revision ?? "A";
  const observations = storedConfig?.regulationSettings?.observations;
  const linearDescription =
    storedConfig?.regulationSettings?.linearDescription;
  const cablageNotes = storedConfig?.cablageSettings?.notes;

  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.titleFr} — ${intersection.name}`;
    return () => {
      document.title = previous;
    };
  }, [meta.titleFr, intersection.name]);

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 20mm 18mm; }
        @media print {
          .dossier-toolbar { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="min-h-screen bg-[#eceae1] py-8 print:bg-white">
        <div className="dossier-toolbar mx-auto mb-4 flex max-w-[820px] flex-wrap items-center gap-2 px-4">
          <a
            href={meta.backHref(intersection.id)}
            className="rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#1b2322] transition hover:bg-[#f3f1ea]"
          >
            ← AutoCAD layout
          </a>
          <a
            href={`/studio/autocad/${intersection.id}/dossier/${
              kind === "regulation" ? "cablage" : "regulation"
            }`}
            className="rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#1b2322] transition hover:bg-[#f3f1ea]"
          >
            {kind === "regulation" ? "→ Dossier Câblage" : "→ Dossier Régulation"}
          </a>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#120a02] transition hover:brightness-110"
          >
            🖨 Print / Save as PDF
          </button>
        </div>

        <article className="mx-auto max-w-[820px] bg-white px-12 py-10 text-[#1b2322] shadow-[0_10px_30px_rgba(0,0,0,0.08)] print:shadow-none print:py-6">
          {/* Cover */}
          <header className="border-b-2 border-[#0e7c4f] pb-6 text-center">
            <div className="mx-auto mb-2 inline-block border border-[#1b2322] px-6 py-2">
              <p className="text-[1rem] font-bold tracking-wider">
                {clientName ?? "SOCIETE FES REGION"}
              </p>
              <p className="text-[1rem] font-bold tracking-wider">AMENAGEMENT</p>
            </div>
            <h1 className="mt-6 text-[1.4rem] font-semibold leading-tight text-[#1b2322]">
              {meta.titleFr} {intersection.code} : {intersection.name}
            </h1>
            <p className="mt-2 text-[0.9rem] text-[#3a4a44]">
              {intersection.district
                ? `${intersection.district} · ${intersection.address || ""}`
                : intersection.address || "—"}
            </p>
            <p className="mt-4 border-t border-[#0e7c4f] pt-3 text-[0.9rem] italic text-[#3a4a44]">
              {meta.subtitleFr}
            </p>
            <p className="mt-1 text-[0.8rem] text-[#56605b]">
              Projet{" "}
              <span className="font-semibold">
                {projectName ?? "STLS Pilot"}
              </span>
            </p>
          </header>

          {/* Revision table */}
          <section className="mt-8 border border-[#1b2322] text-[0.82rem]">
            <div className="grid grid-cols-3 border-b border-[#1b2322] bg-[#f3f1ea] font-semibold">
              <div className="px-3 py-2">Version</div>
              <div className="border-l border-[#1b2322] px-3 py-2">
                Date de révision
              </div>
              <div className="border-l border-[#1b2322] px-3 py-2">
                Objet de la Révision
              </div>
            </div>
            <div className="grid grid-cols-3">
              <div className="px-3 py-2">{revision}</div>
              <div className="border-l border-[#1b2322] px-3 py-2">{today}</div>
              <div className="border-l border-[#1b2322] px-3 py-2">
                {storedConfig?.civilPlan
                  ? "Généré depuis le plan édité dans le Workbench"
                  : "Génération automatique depuis STLS Studio (plan par défaut)"}
              </div>
            </div>
          </section>

          <section className="mt-3 border border-[#1b2322] text-[0.82rem]">
            <div className="grid grid-cols-2">
              <div className="px-3 py-2">Document — aperçu automatique</div>
              <div className="border-l border-[#1b2322] px-3 py-2">
                <p>
                  <span className="font-semibold">Établi par</span> STLS Studio
                </p>
                <p>
                  <span className="font-semibold">Vérifié par</span> Opérateur à
                  valider
                </p>
              </div>
            </div>
          </section>

          {/* Section router */}
          {kind === "regulation" ? (
            <RegulationSections
              intersection={intersection}
              observations={observations}
              linearDescription={linearDescription}
            />
          ) : (
            <CablageSections
              intersection={intersection}
              notes={cablageNotes}
            />
          )}

          <footer className="mt-10 border-t border-[#0e7c4f] pt-3 text-center text-[0.7rem] text-[#56605b]">
            <p>
              Aperçu généré par STLS Studio · {today} · Contrôleur{" "}
              {controller?.code ?? "—"}
            </p>
            <p className="mt-1 text-[0.62rem] italic">
              Ceci est un aperçu auto-généré. Les valeurs détaillées
              (matrices, plans de feux, quantités câbles) seront alimentées
              depuis la configuration approuvée à l&apos;itération suivante.
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}

function RegulationSections({
  intersection,
  observations,
  linearDescription,
}: {
  intersection: EngineeringIntersectionRecord;
  observations?: string;
  linearDescription?: string;
}) {
  const phases = intersection.phases ?? [];
  const timingPlans = intersection.timingPlans ?? [];

  return (
    <>
      <SectionTitle index="1" title="Situation du carrefour" />
      <div className="mt-2 rounded border border-[#b9bdb6] bg-[#f8f7f2] px-4 py-3 text-[0.85rem]">
        <p>
          <span className="font-semibold">Carrefour :</span>{" "}
          {intersection.name}
        </p>
        <p>
          <span className="font-semibold">Code :</span> {intersection.code}
        </p>
        <p>
          <span className="font-semibold">Coordonnées :</span>{" "}
          {intersection.latitude}, {intersection.longitude}
        </p>
        <p>
          <span className="font-semibold">Quartier :</span>{" "}
          {intersection.district || "—"}
        </p>
      </div>

      <SectionTitle index="2" title="Plan d’aménagement" />
      <p className="mt-2 text-[0.82rem] italic text-[#56605b]">
        Voir l&apos;atelier AutoCAD pour le schéma détaillé (supports,
        chambres, boucles).
      </p>

      <SectionTitle index="3" title="Entrées contrôleur" />
      <table className="mt-2 w-full border-collapse text-[0.78rem]">
        <thead>
          <tr className="bg-[#f3f1ea]">
            <Th>N° Entrée</Th>
            <Th>Adresse</Th>
            <Th>Mnémo</Th>
            <Th>Désignation</Th>
          </tr>
        </thead>
        <tbody>
          <Row cells={["0", "50.0", "C_JCM", "Cde Clignotant Manuelle"]} />
          <Row cells={["1", "50.1", "C_RIM", "Cde Mode Rouge Intégral"]} />
          <Row cells={["2", "50.2", "C_CM", "Cde Mode Manuel"]} />
          {phases.slice(0, 6).map((phase, index) => (
            <Row
              key={phase.id}
              cells={[
                String(3 + index),
                `50.${3 + index}`,
                `C_BP_Ph${index + 1}`,
                `Cde Manuel Ph${index + 1}`,
              ]}
            />
          ))}
        </tbody>
      </table>

      <SectionTitle index="4" title="Fonctionnement carrefour" />
      <SubsectionTitle subindex="4.1" title="Affectation lignes de feux" />
      <table className="mt-2 w-full border-collapse text-[0.78rem]">
        <thead>
          <tr className="bg-[#f3f1ea]">
            <Th>Appellation</Th>
            <Th>Type</Th>
            <Th>Fonctionnement</Th>
            <Th>Désignation</Th>
          </tr>
        </thead>
        <tbody>
          {(intersection.detectors ?? []).map((detector, index) => (
            <Row
              key={detector.id}
              cells={[
                `LF${index + 1}`,
                detector.type,
                detector.isActive ? "Actif" : "Inactif",
                detector.name ?? detector.code,
              ]}
            />
          ))}
          {phases.map((phase) => (
            <Row
              key={phase.id}
              cells={[
                `Ph${phase.sequenceNumber}`,
                phase.phaseType,
                `min ${phase.minGreenSeconds}s · J ${phase.yellowSeconds}s · RC ${phase.redClearanceSeconds}s`,
                phase.name,
              ]}
            />
          ))}
        </tbody>
      </table>

      <SubsectionTitle subindex="4.2" title="Phases" />
      <ul className="mt-2 list-disc pl-6 text-[0.82rem]">
        {phases.length === 0 ? (
          <li className="italic text-[#56605b]">
            Aucune phase configurée pour ce carrefour.
          </li>
        ) : (
          phases.map((phase: EngineeringPhaseRecord) => (
            <li key={phase.id}>
              <span className="font-semibold">Phase {phase.sequenceNumber}</span>{" "}
              — {phase.name} · min {phase.minGreenSeconds}s · J{" "}
              {phase.yellowSeconds}s · RC {phase.redClearanceSeconds}s
              {phase.isProtected ? " · protégée" : ""}
            </li>
          ))
        )}
      </ul>

      <SubsectionTitle subindex="4.3" title="Plans de feux" />
      <table className="mt-2 w-full border-collapse text-[0.78rem]">
        <thead>
          <tr className="bg-[#f3f1ea]">
            <Th>Code</Th>
            <Th>Nom</Th>
            <Th>Statut</Th>
            <Th>Cycle</Th>
            <Th>Décalage</Th>
          </tr>
        </thead>
        <tbody>
          {timingPlans.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="border border-[#b9bdb6] px-2 py-2 text-center italic text-[#56605b]"
              >
                Aucun plan de feux configuré.
              </td>
            </tr>
          ) : (
            timingPlans.map((plan: EngineeringTimingPlanRecord) => (
              <Row
                key={plan.id}
                cells={[
                  plan.code,
                  plan.name,
                  plan.status,
                  `${plan.cycleLengthSeconds}s`,
                  `${plan.offsetSeconds}s`,
                ]}
              />
            ))
          )}
        </tbody>
      </table>

      {linearDescription ? (
        <>
          <SubsectionTitle subindex="4.5" title="Description fonctionnement linéaire" />
          <p className="mt-2 whitespace-pre-line text-[0.82rem] text-[#1b2322]">
            {linearDescription}
          </p>
        </>
      ) : null}

      <SectionTitle index="5" title="Équipement" />
      <p className="mt-2 text-[0.82rem] italic text-[#56605b]">
        Voir le dossier de câblage pour l&apos;inventaire détaillé des
        supports, boucles et chambres de tirage.
      </p>

      {observations ? (
        <>
          <SectionTitle index="6" title="Observations / Hypothèses" />
          <p className="mt-2 whitespace-pre-line rounded border border-[#b9bdb6] bg-[#fbfaf4] px-4 py-3 text-[0.82rem] text-[#1b2322]">
            {observations}
          </p>
        </>
      ) : null}
    </>
  );
}

function CablageSections({
  intersection,
  notes,
}: {
  intersection: EngineeringIntersectionRecord;
  notes?: string;
}) {
  const controller = intersection.controllers[0];
  const detectors = intersection.detectors ?? [];

  return (
    <>
      <SectionTitle index="1" title="Plan réseaux SLT" />
      <p className="mt-2 text-[0.82rem] italic text-[#56605b]">
        Voir l&apos;atelier AutoCAD pour le plan détaillé. Cabinet contrôleur :{" "}
        <span className="font-semibold">{controller?.code ?? "—"}</span>.
      </p>

      <SectionTitle index="2" title="Plans tirage câbles" />
      <SubsectionTitle subindex="2.1" title="Plan câblage supports de feux" />
      <p className="mt-2 text-[0.82rem] text-[#1b2322]">
        Types utilisés : R11v, R12, R14dtd, R14tg — voir le schéma de
        cheminement sur l&apos;atelier AutoCAD.
      </p>

      <SubsectionTitle subindex="2.2" title="Plan câblage boucles" />
      <table className="mt-2 w-full border-collapse text-[0.78rem]">
        <thead>
          <tr className="bg-[#f3f1ea]">
            <Th>Boucle</Th>
            <Th>Code</Th>
            <Th>Type</Th>
            <Th>Voie</Th>
          </tr>
        </thead>
        <tbody>
          {detectors.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="border border-[#b9bdb6] px-2 py-2 text-center italic text-[#56605b]"
              >
                Aucune boucle de détection configurée.
              </td>
            </tr>
          ) : (
            detectors.map((detector, index) => (
              <Row
                key={detector.id}
                cells={[
                  `Bcl-${String(index + 1).padStart(2, "0")}`,
                  detector.code,
                  detector.type,
                  detector.laneReference ?? "—",
                ]}
              />
            ))
          )}
        </tbody>
      </table>

      <SectionTitle index="3" title="Carnet de câblage" />
      <SubsectionTitle subindex="3.1" title="Détail câblage — référentiel" />
      <table className="mt-2 w-full border-collapse text-[0.76rem]">
        <thead>
          <tr className="bg-[#f3f1ea]">
            <Th>Départ</Th>
            <Th>Support</Th>
            <Th>Type</Th>
            <Th>Équipement</Th>
            <Th>Câble</Th>
            <Th>Repère</Th>
            <Th>Long.</Th>
          </tr>
        </thead>
        <tbody>
          {supportTemplate.map((row) => (
            <Row
              key={row.ref}
              cells={[
                controller?.code ?? "CTRL",
                row.support,
                row.type,
                row.equipment,
                row.cable,
                `${controller?.code ?? "CTRL"}_${row.ref}`,
                row.length,
              ]}
            />
          ))}
        </tbody>
      </table>

      <SubsectionTitle subindex="3.2" title="Quantitatif câbles carrefour" />
      <table className="mt-2 w-[360px] border-collapse text-[0.82rem]">
        <tbody>
          <Row cells={["U1000 R2v · 5 G 1.5mm²", "≈ 270 m"]} />
          <Row cells={["U1000 R2v · 7 G 1.5mm²", "—"]} />
          <Row cells={["U1000 R2v · 12 G 1.5mm²", "≈ 400 m"]} />
          <Row cells={["Blindé · LIYCY 2 x 1.5mm²", "≈ 350 m"]} />
          <Row cells={["Fibre optique", "≈ 540 m"]} />
        </tbody>
      </table>

      <SectionTitle index="4" title="Principe de câblage des supports" />
      <SubsectionTitle subindex="4.1" title="Cas 1 — Poteau R11 + R12 / R14 + R12" />
      <p className="mt-2 text-[0.82rem]">
        Câble RO2V 12 G 1,5 mm². Fil 1 Neutre, Fil 2 Vert R11, Fil 3 Jaune R11,
        Fil 4 Rouge principal, Fil 5 Rouge secondaire, Fil 7 Neutre, Fil 8
        Vert piéton, Fil 9 Rouge piéton, V/J Terre.
      </p>
      <SubsectionTitle subindex="4.2" title="Cas 2 — Potelet R12 seul" />
      <p className="mt-2 text-[0.82rem]">
        Câble RO2V 5 G 1,5 mm². Bleu Neutre, Noir Vert piéton, Marron Rouge
        piéton, V/J Terre.
      </p>
      <SubsectionTitle subindex="4.3" title="Cas 3 — Poteau R11 seul / R14 seul" />
      <p className="mt-2 text-[0.82rem]">
        Câble RO2V 7 G 1,5 mm². Fil 1 Neutre, Fil 2 Vert R11, Fil 3 Jaune R11,
        Fil 4 Rouge principal, Fil 5 Rouge secondaire, V/J Terre.
      </p>

      {notes ? (
        <>
          <SectionTitle index="5" title="Notes de câblage" />
          <p className="mt-2 whitespace-pre-line rounded border border-[#b9bdb6] bg-[#fbfaf4] px-4 py-3 text-[0.82rem] text-[#1b2322]">
            {notes}
          </p>
        </>
      ) : null}
    </>
  );
}

const supportTemplate = [
  { ref: "A", support: "Potence", type: "R14dtd-R12", equipment: "V1-P3", cable: "12 G 1.5mm²", length: "41 m" },
  { ref: "B", support: "Poteau", type: "R14tg-R12", equipment: "V2-P3", cable: "12 G 1.5mm²", length: "65 m" },
  { ref: "C", support: "Potelet", type: "R12", equipment: "P8", cable: "5 G 1.5mm²", length: "55 m" },
  { ref: "E", support: "Poteau", type: "R11v-R12", equipment: "V12-P13", cable: "12 G 1.5mm²", length: "81 m" },
  { ref: "H", support: "Potelet", type: "R12", equipment: "P11", cable: "5 G 1.5mm²", length: "49 m" },
  { ref: "I", support: "Potence", type: "R14dtd-R12", equipment: "V5-P7", cable: "12 G 1.5mm²", length: "54 m" },
  { ref: "M", support: "Poteau", type: "R11v-R12", equipment: "V9-P10", cable: "12 G 1.5mm²", length: "19 m" },
];

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <h2 className="mt-8 text-[1.15rem] font-bold uppercase tracking-wider text-[#0e7c4f]">
      {index}. {title}
    </h2>
  );
}

function SubsectionTitle({
  subindex,
  title,
}: {
  subindex: string;
  title: string;
}) {
  return (
    <h3 className="mt-4 text-[0.95rem] font-bold text-[#0e7c4f]">
      {subindex}. {title}
    </h3>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-[#b9bdb6] px-2 py-1.5 text-left font-semibold">
      {children}
    </th>
  );
}

function Row({ cells }: { cells: Array<string | number> }) {
  return (
    <tr>
      {cells.map((cell, index) => (
        <td key={index} className="border border-[#b9bdb6] px-2 py-1.5">
          {cell}
        </td>
      ))}
    </tr>
  );
}
