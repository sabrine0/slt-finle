"use client";

/**
 * Workspace for a locally-saved zone proposal.
 *
 * The proposal isn't a real intersection in the backend yet — it lives
 * in localStorage under `stls.zone-builder.proposals`. This page is
 * the operator's "I just saved it, show me what's there" landing:
 * a Google map preview of the zone, the geocoded identity, and a set
 * of next-step actions.
 */

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleMap,
  RectangleF,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useState } from "react";

import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import { useStudioThemeContext } from "@/components/studio-landing/theme-context";

interface ZoneBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface ZoneProposal {
  id: string;
  code: string;
  name: string;
  street: string;
  bounds: ZoneBounds;
  centre: { lat: number; lng: number };
  widthMetres: number;
  heightMetres: number;
  savedAt: string;
  syncedToAudit: boolean;
}

const STORAGE_KEY = "stls.zone-builder.proposals";

function loadProposals(): ZoneProposal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ZoneProposal[];
  } catch {
    return [];
  }
}

function saveProposals(list: ZoneProposal[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0c1214" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a978d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c1214" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1d2a2f" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#071016" }],
  },
];

const LIGHT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5f3ee" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a4a44" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bcd9e1" }],
  },
];

interface ProposalWorkspaceProps {
  proposalId: string;
  apiKey?: string;
}

export function ProposalWorkspace({ proposalId, apiKey }: ProposalWorkspaceProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";
  const router = useRouter();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const [proposal, setProposal] = useState<ZoneProposal | null | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ code: string; name: string; street: string }>({
    code: "",
    name: "",
    street: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const list = loadProposals();
    const match = list.find((p) => p.id === proposalId) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProposal(match);
    if (match) {
      setDraft({ code: match.code, name: match.name, street: match.street });
    }
  }, [proposalId]);

  const persistEdits = useCallback(() => {
    if (!proposal) return;
    const list = loadProposals();
    const next = list.map((p) =>
      p.id === proposal.id
        ? { ...p, code: draft.code, name: draft.name, street: draft.street }
        : p,
    );
    saveProposals(next);
    setProposal({ ...proposal, ...draft });
    setEditing(false);
  }, [proposal, draft]);

  const deleteProposal = useCallback(() => {
    if (!proposal) return;
    const list = loadProposals();
    const next = list.filter((p) => p.id !== proposal.id);
    saveProposals(next);
    router.push("/studio/zones");
  }, [proposal, router]);

  const createIntersection = useCallback(async () => {
    if (!proposal || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      // Derive district + address from the proposal: name often reads
      // "<area> / <city>" — split on "/" when present so the city ends
      // up in district and the area in address. Fall back to street.
      const nameParts = proposal.name.split("/").map((s) => s.trim()).filter(Boolean);
      const area = nameParts[0] ?? proposal.name.trim();
      const city = nameParts[1] ?? area;
      const district = (city || area || proposal.street || proposal.name).slice(0, 120);
      const address = (proposal.street || area || proposal.name).slice(0, 255);

      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
        "http://localhost:4010";
      const res = await fetch(`${apiBase}/engineering/intersections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          code: proposal.code,
          name: proposal.name,
          district,
          address,
          latitude: proposal.centre.lat,
          longitude: proposal.centre.lng,
          controlMode: "adaptive",
        }),
      });
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const body = (await res.json()) as
            | { message?: string | string[] }
            | undefined;
          const msg = body?.message;
          if (Array.isArray(msg)) detail = msg.join("; ");
          else if (typeof msg === "string" && msg) detail = msg;
        } catch {
          /* not json */
        }
        throw new Error(detail);
      }
      const intersection = (await res.json()) as { id: string };
      const list = loadProposals();
      saveProposals(list.filter((p) => p.id !== proposal.id));
      router.push(`/studio/autocad/${intersection.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erreur inconnue");
      setCreating(false);
    }
  }, [proposal, creating, router]);

  const shellClass = isDark
    ? "bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
    : "bg-[#f3f1ea] text-[#1b2322]";
  const panelBg = isDark
    ? "border-white/10 bg-[#0a1014]/95 text-[#edf3ee]"
    : "border-black/10 bg-white text-[#1b2322]";
  const muted = isDark ? "text-[#8fa39a]" : "text-[#56605b]";
  const mapStyles = isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES;

  if (proposal === undefined) {
    return (
      <main
        className={clsx(
          "grid min-h-screen place-items-center text-center",
          shellClass,
        )}
      >
        <p className={muted}>Chargement de la proposition…</p>
      </main>
    );
  }

  if (proposal === null) {
    return (
      <main
        className={clsx(
          "grid min-h-screen place-items-center px-5 text-center",
          shellClass,
        )}
      >
        <div className="max-w-md space-y-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ff9a9a]">
            Proposition introuvable
          </p>
          <p className="text-[0.88rem]">
            La proposition <span className="font-mono">{proposalId}</span> n&apos;est
            pas enregistrée dans ce navigateur. Elle a peut-être été supprimée,
            ou sauvegardée sur un autre poste.
          </p>
          <Link
            href="/studio/zones"
            className="inline-block rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.78rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            ← Zone builder
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen ${shellClass}`}>
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col gap-4 px-5 py-5">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/8 pb-4">
          <Link
            href="/studio/zones"
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition hover:brightness-110",
              panelBg,
            )}
          >
            ← Zone builder
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.28em] text-[#ffb547]">
              Proposition carrefour · espace de travail
            </p>
            <h1 className="mt-0.5 truncate text-[1.25rem] font-semibold">
              {proposal.name}
            </h1>
            <p className={clsx("mt-0.5 truncate text-[0.76rem]", muted)}>
              <span className="font-mono">{proposal.code}</span>
              {proposal.street ? ` · ${proposal.street}` : ""}
              {" · "}
              <span className="font-mono">
                {proposal.centre.lat.toFixed(5)}, {proposal.centre.lng.toFixed(5)}
              </span>
            </p>
          </div>
          <span
            className={clsx(
              "rounded-full px-2.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.22em]",
              proposal.syncedToAudit
                ? "bg-[#39d98a]/20 text-[#39d98a]"
                : "bg-[#ffb547]/20 text-[#ffb547]",
            )}
          >
            {proposal.syncedToAudit ? "Audit sync" : "Local"}
          </span>
          <button
            type="button"
            onClick={toggle}
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition hover:brightness-110",
              panelBg,
            )}
          >
            {isDark ? "☀ Light" : "☾ Dark"}
          </button>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div
            className={clsx(
              "relative overflow-hidden rounded-[14px] border",
              panelBg,
            )}
            style={{ minHeight: 520 }}
          >
            {!apiKey ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <p className={muted}>
                  Set <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span>{" "}
                  to preview this zone on the map.
                </p>
              </div>
            ) : loadError ? (
              <div className="grid h-full place-items-center text-[#ff6363]">
                Google Maps failed to load.
              </div>
            ) : !isLoaded ? (
              <div className={clsx("grid h-full place-items-center", muted)}>
                Loading map…
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={proposal.centre}
                zoom={16}
                options={{
                  disableDefaultUI: true,
                  gestureHandling: "greedy",
                  backgroundColor: isDark ? "#0c1214" : "#eceae1",
                  styles: mapStyles,
                }}
              >
                <RectangleF
                  bounds={proposal.bounds}
                  options={{
                    strokeColor: "#ffb547",
                    strokeWeight: 2,
                    strokeOpacity: 0.95,
                    fillColor: "#ffb547",
                    fillOpacity: 0.1,
                    clickable: false,
                  }}
                />
                <MarkerF
                  position={proposal.centre}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: "#ffb547",
                    fillOpacity: 1,
                    strokeColor: isDark ? "#05070a" : "#ffffff",
                    strokeWeight: 2.5,
                  }}
                />
              </GoogleMap>
            )}
          </div>

          <aside className="flex flex-col gap-3">
            <div className={clsx("rounded-[14px] border p-4", panelBg)}>
              <div className="flex items-center justify-between">
                <p
                  className={clsx(
                    "text-[0.6rem] font-semibold uppercase tracking-[0.22em]",
                    muted,
                  )}
                >
                  Identité
                </p>
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className={clsx(
                    "rounded-[6px] border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] transition",
                    isDark
                      ? "border-white/10 text-[#c3cdc6] hover:border-white/20 hover:text-[#edf3ee]"
                      : "border-black/10 text-[#1b2322] hover:border-black/20",
                  )}
                >
                  {editing ? "Annuler" : "Modifier"}
                </button>
              </div>

              {editing ? (
                <div className="mt-3 space-y-2">
                  <EditField
                    label="Code"
                    value={draft.code}
                    onChange={(v) => setDraft((d) => ({ ...d, code: v }))}
                    mono
                  />
                  <EditField
                    label="Nom du carrefour"
                    value={draft.name}
                    onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
                  />
                  <EditField
                    label="Rue principale"
                    value={draft.street}
                    onChange={(v) => setDraft((d) => ({ ...d, street: v }))}
                  />
                  <button
                    type="button"
                    onClick={persistEdits}
                    className="mt-2 w-full rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.2em] text-[#120a02] transition hover:brightness-110"
                  >
                    Enregistrer
                  </button>
                </div>
              ) : (
                <dl className="mt-3 space-y-2 text-[0.78rem]">
                  <Row label="Code" value={proposal.code} mono />
                  <Row label="Nom" value={proposal.name} />
                  <Row label="Rue principale" value={proposal.street || "—"} />
                  <Row
                    label="Coordonnées"
                    value={`${proposal.centre.lat.toFixed(5)}, ${proposal.centre.lng.toFixed(5)}`}
                    mono
                  />
                  <Row
                    label="Zone"
                    value={`${proposal.widthMetres.toFixed(0)} × ${proposal.heightMetres.toFixed(0)} m`}
                    mono
                  />
                  <Row
                    label="Enregistré"
                    value={new Date(proposal.savedAt).toLocaleString("fr-FR")}
                  />
                </dl>
              )}
            </div>

            <div className={clsx("rounded-[14px] border p-4", panelBg)}>
              <p
                className={clsx(
                  "text-[0.6rem] font-semibold uppercase tracking-[0.22em]",
                  muted,
                )}
              >
                Prochaines étapes
              </p>
              <ol className="mt-3 space-y-2 text-[0.74rem]">
                <Step
                  index={1}
                  label="Valider la zone avec le BE"
                  helper="Géométrie + position GPS approuvées"
                  done={proposal.syncedToAudit}
                />
                <Step
                  index={2}
                  label="Créer le carrefour réel"
                  helper={
                    createError
                      ? `Erreur : ${createError}`
                      : creating
                        ? "Création en cours…"
                        : proposal.syncedToAudit
                          ? "POST /engineering/intersections → atelier AutoCAD"
                          : "Validez la zone à l'étape 1 d'abord"
                  }
                  onClick={
                    proposal.syncedToAudit ? createIntersection : undefined
                  }
                  disabled={!proposal.syncedToAudit}
                  busy={creating}
                  error={!!createError}
                />
                <Step
                  index={3}
                  label="Ouvrir l'atelier AutoCAD"
                  helper="Dessiner supports, boucles, chambres"
                />
                <Step
                  index={4}
                  label="Générer dossiers régulation & câblage"
                  helper="Export PDF depuis l'atelier"
                />
              </ol>
            </div>

            <div className={clsx("rounded-[14px] border p-4", panelBg)}>
              <p
                className={clsx(
                  "text-[0.6rem] font-semibold uppercase tracking-[0.22em]",
                  muted,
                )}
              >
                Actions
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/studio/zones?centreLat=${proposal.centre.lat}&centreLng=${proposal.centre.lng}`}
                  className="rounded-[8px] border border-white/10 bg-[#0b1014] px-3 py-2 text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
                >
                  Revenir au Zone builder
                </Link>
                <button
                  type="button"
                  onClick={deleteProposal}
                  className="rounded-[8px] border border-[#5a1d1d]/60 bg-[#180d0d]/60 px-3 py-2 text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a] transition hover:brightness-110"
                >
                  Supprimer la proposition
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[#8fa39a]">{label}</dt>
      <dd className={clsx("text-right", mono ? "font-mono" : "font-semibold")}>
        {value}
      </dd>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "mt-1 w-full rounded-[8px] border border-white/10 bg-[#070b0e] px-3 py-2 text-[0.8rem] text-[#edf3ee] outline-none focus:border-[#ffb547]",
          mono ? "font-mono" : "",
        )}
      />
    </label>
  );
}

function Step({
  index,
  label,
  helper,
  done,
  onClick,
  disabled,
  busy,
  error,
}: {
  index: number;
  label: string;
  helper?: string;
  done?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  error?: boolean;
}) {
  const badge = (
    <span
      className={clsx(
        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.58rem] font-bold",
        done
          ? "border-[#39d98a]/60 bg-[#39d98a]/20 text-[#a8eac2]"
          : error
            ? "border-[#ff9a9a]/60 bg-[#ff9a9a]/15 text-[#ff9a9a]"
            : "border-white/10 bg-[#070b0e] text-[#8fa39a]",
      )}
    >
      {busy ? "…" : done ? "✓" : index}
    </span>
  );
  const body = (
    <div className="min-w-0">
      <p className="font-semibold">{label}</p>
      {helper ? (
        <p
          className={clsx(
            "text-[0.66rem]",
            error ? "text-[#ff9a9a]" : "text-[#8fa39a]",
          )}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );

  if (onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled || busy}
          className={clsx(
            "flex w-full items-start gap-2 rounded-[8px] px-1.5 py-1 text-left transition",
            disabled || busy
              ? "cursor-not-allowed opacity-70"
              : "hover:bg-white/5 hover:ring-1 hover:ring-[#ffb547]/40",
          )}
        >
          {badge}
          {body}
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2">
      {badge}
      {body}
    </li>
  );
}
