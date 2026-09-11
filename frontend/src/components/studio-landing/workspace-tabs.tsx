"use client";

import Link from "next/link";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { useCallback, useMemo, useState } from "react";

import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import { createEtude } from "@/lib/etudes-api";
import type {
  EngineeringControllerRecord,
  EngineeringIntersectionRecord,
} from "@/types/engineering-studio";

interface BaseTabProps {
  intersection: EngineeringIntersectionRecord;
  isDark: boolean;
}

interface ControllerAwareProps extends BaseTabProps {
  controller: EngineeringControllerRecord | null;
}

// ---------------------------------------------------------------
// 1. Overview
// ---------------------------------------------------------------

export function WorkspaceOverviewTab({
  intersection,
  controller,
  isDark,
}: ControllerAwareProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Overview"
        subtitle="Fiche d’identité du carrefour et de son contrôleur principal."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Carrefour" isDark={isDark}>
          <Field label="Nom" value={intersection.name} />
          <Field label="Code" value={intersection.code} mono />
          <Field label="Quartier" value={intersection.district || "—"} />
          <Field label="Adresse" value={intersection.address || "—"} />
          <Field
            label="Coordonnées"
            value={`${toFixedSafe(intersection.latitude, 6)}, ${toFixedSafe(intersection.longitude, 6)}`}
            mono
          />
          <Field label="Mode de contrôle" value={intersection.controlMode} />
        </Card>
        <Card title="Contrôleur principal" isDark={isDark}>
          {controller ? (
            <>
              <Field label="Code" value={controller.code} mono />
              <Field label="Type" value={controller.controllerType ?? "—"} />
              <Field
                label="Firmware"
                value={controller.firmwareVersion ?? "—"}
                mono
              />
              <Field label="État" value={controller.connectionState} />
              <Field
                label="Environnement"
                value={controller.operatingEnvironment}
              />
              <Field
                label="Dernière télémétrie"
                value={formatDateTime(controller.lastTelemetryAt)}
              />
            </>
          ) : (
            <p className="text-sm opacity-70">
              Aucun contrôleur n’est encore associé à ce carrefour.
            </p>
          )}
        </Card>
        <Card title="Trafic temps réel" isDark={isDark}>
          <Field
            label="Statut"
            value={intersection.status}
            tone={
              intersection.status === "critical"
                ? "critical"
                : intersection.status === "watch"
                  ? "watch"
                  : "healthy"
            }
            isDark={isDark}
          />
          <Field
            label="File d’attente"
            value={`${intersection.queueLength} véh.`}
          />
          <Field
            label="Délai moyen"
            value={`${toFixedSafe(intersection.averageDelaySeconds, 0)} s`}
          />
          <Field
            label="Incidents en cours"
            value={String(intersection.incidents)}
            tone={intersection.incidents > 0 ? "watch" : undefined}
            isDark={isDark}
          />
          <Field
            label="Dernier heartbeat"
            value={formatDateTime(intersection.lastHeartbeat)}
          />
        </Card>
        <Card title="Inventaire" isDark={isDark}>
          <Field
            label="Contrôleurs"
            value={String(intersection.controllers.length)}
          />
          <Field
            label="Détecteurs"
            value={String(intersection.detectors.length)}
          />
          <Field label="Phases" value={String(intersection.phases.length)} />
          <Field
            label="Plans de feux"
            value={String(intersection.timingPlans.length)}
          />
          <Field
            label="Déploiements"
            value={String(intersection.deployments?.length ?? 0)}
          />
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 2. Map / Location
// ---------------------------------------------------------------

export function WorkspaceMapTab({
  intersection,
  apiKey,
  isDark,
}: BaseTabProps & { apiKey?: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });
  const lat = Number(intersection.latitude);
  const lng = Number(intersection.longitude);
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);
  const valid = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Map / Location"
        subtitle="Position GPS, vue satellite, repérage urbain."
      />
      {!valid ? (
        <p className="text-sm text-red-400">Coordonnées invalides.</p>
      ) : !apiKey ? (
        <p className="text-sm opacity-70">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY non configurée — la carte ne peut pas
          être chargée.
        </p>
      ) : loadError ? (
        <p className="text-sm text-red-400">
          Échec du chargement de Google Maps : {loadError.message}
        </p>
      ) : !isLoaded ? (
        <p className="text-sm opacity-70">Chargement de la carte…</p>
      ) : (
        <div
          className={`overflow-hidden rounded-[12px] border ${
            isDark ? "border-white/10" : "border-black/10"
          }`}
          style={{ height: "420px" }}
        >
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={18}
            options={{
              mapTypeId: "hybrid",
              disableDefaultUI: false,
              streetViewControl: true,
            }}
          >
            <MarkerF position={center} title={intersection.name} />
          </GoogleMap>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Latitude" isDark={isDark}>
          <p className="font-mono text-sm">{lat.toFixed(6)}</p>
        </Card>
        <Card title="Longitude" isDark={isDark}>
          <p className="font-mono text-sm">{lng.toFixed(6)}</p>
        </Card>
        <Card title="Quartier" isDark={isDark}>
          <p className="text-sm">{intersection.district || "—"}</p>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 3. AutoCAD / Plan
// ---------------------------------------------------------------

export function WorkspaceAutocadTab({ intersection, isDark }: BaseTabProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="AutoCAD / Plan"
        subtitle="Importer un plan civil (DXF, SVG, GeoJSON, TopoExport) ou éditer le plan existant."
      />
      <Card title="Plan civil" isDark={isDark}>
        <p className="text-sm opacity-80">
          L’éditeur AutoCAD complet (couches voirie, marquage, supports,
          chambres, câbles) est hébergé sur sa propre page pour exploiter au
          mieux la surface d’écran.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/studio/autocad/${intersection.id}`}
            className="rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-1.5 text-[0.72rem] font-semibold text-[#120a02] transition hover:brightness-110"
          >
            ▭ Ouvrir l’éditeur AutoCAD
          </Link>
          <Link
            href={`/studio/autocad/${intersection.id}/dossier`}
            className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
              isDark
                ? "border-white/15 hover:border-white/30"
                : "border-black/15 hover:bg-black/5"
            }`}
          >
            📑 Dossier câblage
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 4. AI Traffic Study (étude carrefour)
// ---------------------------------------------------------------

export function WorkspaceEtudeTab({ intersection, isDark }: BaseTabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectId, setRedirectId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createEtude({
        intersectionCode: intersection.code,
        intersectionLabel: intersection.name,
        latitude: intersection.latitude,
        longitude: intersection.longitude,
        scope: "standard",
      });
      setRedirectId(created.id);
      window.location.href = `/studio/etude/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [intersection, busy]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="AI Traffic Study"
        subtitle="Génère une étude carrefour complète (plan de situation, matrice de conflit, plans de feux, affectations)."
      />
      <Card title="Étude carrefour" isDark={isDark}>
        <p className="text-sm opacity-80">
          L’étude reprend la structure des dossiers de référence (Casablanca
          tramway, Fès) : 16 sections, génération automatique, édition
          opérateur, verrouillage et historique.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || redirectId != null}
            className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold transition ${
              isDark
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
            } disabled:opacity-50`}
          >
            {busy
              ? "Création…"
              : redirectId
                ? "Redirection…"
                : "📝 Générer une nouvelle étude"}
          </button>
          <Link
            href="/studio"
            className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
              isDark
                ? "border-white/15 hover:border-white/30"
                : "border-black/15 hover:bg-black/5"
            }`}
          >
            Voir toutes les études
          </Link>
        </div>
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      </Card>
      <Card title="Sections couvertes" isDark={isDark}>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.78rem] opacity-90">
          <li>• Plan de situation</li>
          <li>• Présentation du carrefour</li>
          <li>• Matrice de conflit</li>
          <li>• Tableau de dégagement</li>
          <li>• Micro-régulation</li>
          <li>• Plans de feux HPM / HPS / HC / HM</li>
          <li>• Phasage</li>
          <li>• Fonctionnements manuels</li>
          <li>• Affectation des lignes de feux</li>
          <li>• Affectation des entrées DIASER</li>
          <li>• Cahier de recettes</li>
          <li>• Annexes</li>
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 5. Lanes & Movements
// ---------------------------------------------------------------

export function WorkspaceLanesTab({ intersection, isDark }: BaseTabProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Lanes & Movements"
        subtitle="Branches d’entrée, voies, mouvements VP / TC / piéton, traversées."
      />
      <Card title="Inventaire" isDark={isDark}>
        <Field label="Détecteurs" value={String(intersection.detectors.length)} />
        <Field label="Phases configurées" value={String(intersection.phases.length)} />
      </Card>
      <Card title="Détecteurs" isDark={isDark}>
        {intersection.detectors.length === 0 ? (
          <p className="text-sm opacity-70">
            Aucun détecteur enregistré. À renseigner dans l’éditeur dédié.
          </p>
        ) : (
          <div
            className={`overflow-hidden rounded-[10px] border ${
              isDark ? "border-white/10" : "border-black/10"
            }`}
          >
            <table className="min-w-full text-[0.78rem]">
              <thead className={isDark ? "bg-white/5" : "bg-black/5"}>
                <tr>
                  <Th>Code</Th>
                  <Th>Nom</Th>
                  <Th>Type</Th>
                  <Th>Voie</Th>
                  <Th>Actif</Th>
                </tr>
              </thead>
              <tbody>
                {intersection.detectors.map((det) => (
                  <tr key={det.id}>
                    <Td mono>{det.code}</Td>
                    <Td>{det.name}</Td>
                    <Td>{det.type}</Td>
                    <Td>{det.laneReference ?? "—"}</Td>
                    <Td>{det.isActive ? "oui" : "non"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="À venir" isDark={isDark}>
        <p className="text-sm opacity-80">
          L’éditeur de voies / mouvements (canevas SVG, mapping branche →
          mouvements) est en cours de migration depuis le Workbench. En
          attendant, utilisez le Workbench Studio pour saisir la géométrie.
        </p>
        <Link
          href="/studio"
          className={`mt-2 inline-block rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
            isDark
              ? "border-white/15 hover:border-white/30"
              : "border-black/15 hover:bg-black/5"
          }`}
        >
          Ouvrir le Workbench
        </Link>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 6. Phases & Timing
// ---------------------------------------------------------------

export function WorkspacePhasesTab({
  intersection,
  controller,
  isDark,
}: ControllerAwareProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Phases & Timing"
        subtitle="Cycle, splits, all-red, plans HPM / HPS / HC."
      />
      <Card title="Phases" isDark={isDark}>
        {intersection.phases.length === 0 ? (
          <p className="text-sm opacity-70">
            Aucune phase configurée. Utilisez le Programmer pour les créer.
          </p>
        ) : (
          <div
            className={`overflow-hidden rounded-[10px] border ${
              isDark ? "border-white/10" : "border-black/10"
            }`}
          >
            <table className="min-w-full text-[0.78rem]">
              <thead className={isDark ? "bg-white/5" : "bg-black/5"}>
                <tr>
                  <Th>#</Th>
                  <Th>Nom</Th>
                  <Th>Approche</Th>
                  <Th>Type</Th>
                  <Th>Vert min</Th>
                  <Th>Jaune</Th>
                  <Th>All-red</Th>
                </tr>
              </thead>
              <tbody>
                {intersection.phases.map((phase) => (
                  <tr key={phase.id}>
                    <Td mono>{phase.sequenceNumber}</Td>
                    <Td>{phase.name}</Td>
                    <Td>{phase.approach}</Td>
                    <Td>{phase.phaseType}</Td>
                    <Td mono>{phase.minGreenSeconds}s</Td>
                    <Td mono>{phase.yellowSeconds}s</Td>
                    <Td mono>{phase.redClearanceSeconds}s</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Plans de feux" isDark={isDark}>
        {intersection.timingPlans.length === 0 ? (
          <p className="text-sm opacity-70">Aucun plan de feux pour ce carrefour.</p>
        ) : (
          <ul className="space-y-1 text-[0.78rem]">
            {intersection.timingPlans.map((plan) => (
              <li key={plan.id}>
                <span className="font-mono">{plan.code}</span> — {plan.name} ·
                cycle {plan.cycleLengthSeconds}s · offset {plan.offsetSeconds}s
                · {plan.status}
                {plan.simulationOnly ? " · simulation" : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {controller ? (
        <Link
          href={`/studio/programmer/${controller.id}`}
          className="inline-block rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-1.5 text-[0.72rem] font-semibold text-[#120a02] transition hover:brightness-110"
        >
          ⌨ Ouvrir le Programmer
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------
// 7. Simulation
// ---------------------------------------------------------------

export function WorkspaceSimulationTab({ intersection, isDark }: BaseTabProps) {
  const cycle =
    intersection.timingPlans[0]?.cycleLengthSeconds ??
    intersection.phases.reduce(
      (sum, phase) =>
        sum +
        phase.minGreenSeconds +
        phase.yellowSeconds +
        phase.redClearanceSeconds,
      0,
    );
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Simulation"
        subtitle="Aperçu temporel de la séquence des feux."
      />
      <Card title="Aperçu cycle" isDark={isDark}>
        <Field label="Durée cycle estimée" value={`${cycle}s`} mono />
        <Field
          label="Phases"
          value={`${intersection.phases.length} configurée(s)`}
        />
      </Card>
      <Card title="Visualisation" isDark={isDark}>
        {intersection.phases.length === 0 ? (
          <p className="text-sm opacity-70">
            Aucune phase à simuler — configurez d’abord les phases dans
            l’onglet 6.
          </p>
        ) : (
          <div className="space-y-2">
            {intersection.phases.map((phase) => {
              const total =
                phase.minGreenSeconds +
                phase.yellowSeconds +
                phase.redClearanceSeconds;
              return (
                <div key={phase.id}>
                  <div className="flex items-center justify-between text-[0.7rem]">
                    <span className="font-semibold">
                      Phase {phase.sequenceNumber} · {phase.name}
                    </span>
                    <span className="font-mono opacity-70">{total}s</span>
                  </div>
                  <div
                    className={`mt-1 flex h-3 w-full overflow-hidden rounded-full ${
                      isDark ? "bg-white/10" : "bg-black/10"
                    }`}
                  >
                    <span
                      className="bg-emerald-500"
                      style={{
                        width: `${(phase.minGreenSeconds / Math.max(total, 1)) * 100}%`,
                      }}
                    />
                    <span
                      className="bg-amber-400"
                      style={{
                        width: `${(phase.yellowSeconds / Math.max(total, 1)) * 100}%`,
                      }}
                    />
                    <span
                      className="bg-red-500"
                      style={{
                        width: `${(phase.redClearanceSeconds / Math.max(total, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="mt-3 text-[0.65rem] uppercase tracking-[0.2em] opacity-60">
              ▮ vert min · ▮ jaune · ▮ rouge dégagement
            </p>
          </div>
        )}
      </Card>
      <Card title="À venir" isDark={isDark}>
        <p className="text-sm opacity-80">
          Le simulateur interactif (animation 2D, vue de la chaussée, scénarios
          de trafic) sera intégré ici. Pour l’instant, la barre temporelle
          ci-dessus donne une lecture rapide du cycle.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 8. Controller Program
// ---------------------------------------------------------------

export function WorkspaceProgramTab({
  intersection,
  controller,
  isDark,
}: ControllerAwareProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Controller Program"
        subtitle="Génère le payload téléchargeable vers le contrôleur (firmware-ready)."
      />
      <Card title="Cible" isDark={isDark}>
        <Field label="Carrefour" value={intersection.code} mono />
        {controller ? (
          <>
            <Field label="Contrôleur" value={controller.code} mono />
            <Field label="Type" value={controller.controllerType ?? "—"} />
            <Field
              label="Schema déploiement"
              value={
                controller.supportedPackageSchemaVersion
                  ? `v${controller.supportedPackageSchemaVersion}`
                  : "—"
              }
            />
            <Field
              label="Dernier déploiement"
              value={
                controller.lastDeploymentAt
                  ? `${formatDateTime(controller.lastDeploymentAt)} (${
                      controller.lastDeploymentState ?? "?"
                    })`
                  : "—"
              }
            />
          </>
        ) : (
          <p className="text-sm opacity-70">Aucun contrôleur cible.</p>
        )}
      </Card>
      <Card title="Génération" isDark={isDark}>
        <p className="text-sm opacity-80">
          La génération se fait depuis le module de déploiement (compose les
          phases, plans, affectations DIASER en un package signé). Cette vue
          servira de point de lancement et de prévisualisation.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold opacity-50 ${
              isDark ? "border-white/20" : "border-black/20"
            }`}
            title="Disponible quand le générateur est wiré"
          >
            Générer le package
          </button>
          {controller ? (
            <Link
              href={`/studio/controllers/${controller.id}`}
              className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
                isDark
                  ? "border-white/15 hover:border-white/30"
                  : "border-black/15 hover:bg-black/5"
              }`}
            >
              Ouvrir la fiche contrôleur
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 9. Validation
// ---------------------------------------------------------------

export function WorkspaceValidationTab({
  intersection,
  controller,
  isDark,
}: ControllerAwareProps) {
  const issues = useMemo(() => {
    const list: Array<{
      level: "error" | "warning" | "info";
      message: string;
    }> = [];
    if (!controller) {
      list.push({
        level: "error",
        message: "Aucun contrôleur n’est associé à ce carrefour.",
      });
    } else {
      if (controller.connectionState === "offline") {
        list.push({
          level: "error",
          message: `Contrôleur ${controller.code} hors-ligne.`,
        });
      } else if (controller.connectionState === "degraded") {
        list.push({
          level: "warning",
          message: `Contrôleur ${controller.code} en état dégradé.`,
        });
      }
      if (!controller.lastTelemetryAt) {
        list.push({
          level: "warning",
          message: "Aucune télémétrie reçue récemment du contrôleur.",
        });
      }
    }
    if (intersection.phases.length === 0) {
      list.push({ level: "error", message: "Aucune phase configurée." });
    }
    if (intersection.timingPlans.length === 0) {
      list.push({
        level: "warning",
        message: "Aucun plan de feux défini.",
      });
    }
    if (intersection.detectors.length === 0) {
      list.push({
        level: "info",
        message: "Aucun détecteur — la régulation reste en cycle fixe.",
      });
    }
    if (intersection.incidents > 0) {
      list.push({
        level: "warning",
        message: `${intersection.incidents} incident(s) en cours sur le carrefour.`,
      });
    }
    if (
      !Number.isFinite(Number(intersection.latitude)) ||
      !Number.isFinite(Number(intersection.longitude))
    ) {
      list.push({
        level: "error",
        message: "Coordonnées GPS invalides.",
      });
    }
    if (list.length === 0) {
      list.push({
        level: "info",
        message: "Aucun problème détecté — prêt pour génération du dossier.",
      });
    }
    return list;
  }, [intersection, controller]);

  const counts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.level] += 1;
        return acc;
      },
      { error: 0, warning: 0, info: 0 },
    );
  }, [issues]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Validation"
        subtitle="Conflits, données manquantes, alertes sécurité."
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Erreurs" isDark={isDark} accent="error">
          <p className="text-3xl font-semibold">{counts.error}</p>
        </Card>
        <Card title="Avertissements" isDark={isDark} accent="warning">
          <p className="text-3xl font-semibold">{counts.warning}</p>
        </Card>
        <Card title="Infos" isDark={isDark}>
          <p className="text-3xl font-semibold">{counts.info}</p>
        </Card>
      </div>
      <Card title="Détail" isDark={isDark}>
        <ul className="space-y-2">
          {issues.map((issue, idx) => (
            <li
              key={idx}
              className={`flex items-start gap-2 rounded-[8px] border px-3 py-2 text-[0.78rem] ${
                issue.level === "error"
                  ? isDark
                    ? "border-red-400/40 bg-red-500/10 text-red-100"
                    : "border-red-700/30 bg-red-50 text-red-900"
                  : issue.level === "warning"
                    ? isDark
                      ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                      : "border-amber-700/30 bg-amber-50 text-amber-900"
                    : isDark
                      ? "border-white/10 bg-white/5"
                      : "border-black/10 bg-black/5"
              }`}
            >
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em]">
                {issue.level}
              </span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 10. Reports
// ---------------------------------------------------------------

export function WorkspaceReportsTab({ intersection, isDark }: BaseTabProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Reports"
        subtitle="Export du dossier d’ingénierie au format PDF / archive."
      />
      <Card title="Dossier de régulation" isDark={isDark}>
        <p className="text-sm opacity-80">
          Le dossier complet (étude carrefour + plans de feux + affectations +
          recette) est généré à partir de l’étude AI. Lancez-la depuis l’onglet{" "}
          <strong>4. AI Traffic Study</strong> puis exportez-la en PDF depuis
          la page de l’étude.
        </p>
      </Card>
      <Card title="Dossier câblage" isDark={isDark}>
        <p className="text-sm opacity-80">
          Le dossier câblage (DXF, schémas, nomenclature) est généré depuis
          l’éditeur AutoCAD.
        </p>
        <Link
          href={`/studio/autocad/${intersection.id}/dossier`}
          className="mt-2 inline-block rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-1.5 text-[0.72rem] font-semibold text-[#120a02] transition hover:brightness-110"
        >
          📑 Ouvrir le dossier câblage
        </Link>
      </Card>
      <Card title="Snapshot trafic" isDark={isDark}>
        <Field label="Statut" value={intersection.status} />
        <Field label="File d’attente" value={`${intersection.queueLength} véh.`} />
        <Field
          label="Délai moyen"
          value={`${toFixedSafe(intersection.averageDelaySeconds, 0)} s`}
        />
        <Field label="Incidents" value={String(intersection.incidents)} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  subtitle: string;
}

function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm opacity-80">{subtitle}</p>
    </div>
  );
}

interface CardProps {
  title: string;
  isDark: boolean;
  accent?: "error" | "warning";
  children: React.ReactNode;
}

function Card({ title, isDark, accent, children }: CardProps) {
  const accentClass =
    accent === "error"
      ? isDark
        ? "border-red-400/30"
        : "border-red-700/30"
      : accent === "warning"
        ? isDark
          ? "border-amber-400/30"
          : "border-amber-700/30"
        : isDark
          ? "border-white/10"
          : "border-black/10";
  return (
    <section
      className={`rounded-[12px] border p-4 ${accentClass} ${
        isDark ? "bg-[#07100d]" : "bg-white"
      }`}
    >
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-70">
        {title}
      </p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "healthy" | "watch" | "critical";
  isDark?: boolean;
}

function Field({ label, value, mono, tone, isDark }: FieldProps) {
  const toneClass = tone
    ? tone === "critical"
      ? isDark
        ? "text-red-300"
        : "text-red-700"
      : tone === "watch"
        ? isDark
          ? "text-amber-300"
          : "text-amber-700"
        : isDark
          ? "text-emerald-300"
          : "text-emerald-700"
    : "";
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.78rem]">
      <span className="opacity-70">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${toneClass}`}>{value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold uppercase tracking-[0.14em] opacity-70">
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return <td className={`px-3 py-2 ${mono ? "font-mono" : ""}`}>{children}</td>;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

/**
 * The backend's numeric columns (lat, lng, averageDelaySeconds…)
 * arrive as strings via TypeORM's default `numeric` mapping. Always
 * coerce before calling number methods so a stringy value can't
 * crash the page.
 */
function toFixedSafe(value: unknown, digits: number): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}
