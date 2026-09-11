/**
 * STLS UI tokens — single source of truth for operational colour
 * semantics. Replaces the inlined hex literals scattered across
 * command-platform / studio surfaces.
 *
 * Rule of thumb when editing this file: same operational meaning →
 * same colour, everywhere.
 */

import type {
  ConnectionState,
  IntersectionHealth,
  TrafficFlowState,
} from "@/types/command-platform";

/** Health: how an intersection is performing right now. */
export const healthColor: Record<IntersectionHealth, string> = {
  healthy: "#39d98a",
  watch: "#ffb547",
  critical: "#ff5f5f",
};

/** Connection: is the controller actually reachable. */
export const connectionColor: Record<ConnectionState, string> = {
  online: "#39d98a",
  degraded: "#ffb547",
  offline: "#ff5f5f",
};

/** Traffic flow: smooth / pressure / congestion. */
export const flowColor: Record<TrafficFlowState, string> = {
  smooth: "#39d98a",
  pressure: "#ffb547",
  congestion: "#ff5f5f",
};

/** Bridge between flow and health (they share the same tones). */
export const flowToHealth: Record<TrafficFlowState, IntersectionHealth> = {
  smooth: "healthy",
  pressure: "watch",
  congestion: "critical",
};

/** Equipment status colour — shared across panels and tables. */
export const equipmentColor = {
  "Équipé en service": "#39d98a",
  "Équipé hors service": "#ff5f5f",
  "Non régulé": "#ffb547",
  "Non spécifié": "#8fa39a",
} as const;

/** Operator-action accent (gold) — used for primary, selected, focus. */
export const accent = {
  ink: "#ffb547",
  border: "#3c2e10",
  bg: "#14100a",
  bgHover: "#1c1612",
} as const;

/** Surface tones — backgrounds and borders that build the page. */
export const surface = {
  page: "#030405",
  panel: "#0a1014",
  panelMuted: "#0b1115",
  panelInset: "#0c1216",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
} as const;

/** Text tones — three-step ramp keeps hierarchy obvious. */
export const text = {
  primary: "#edf3ee",
  secondary: "#cdd7d0",
  muted: "#8fa39a",
  faint: "#6b7c74",
} as const;

/** Light-theme equivalents for surfaces / text. */
export const lightSurface = {
  page: "#eff2f5",
  panel: "#ffffff",
  panelMuted: "#f6f8fa",
  panelInset: "#eef1f4",
  border: "rgba(15,30,40,0.10)",
  borderStrong: "rgba(15,30,40,0.18)",
} as const;

export const lightText = {
  primary: "#0f1f2a",
  secondary: "#314556",
  muted: "#5a6c79",
  faint: "#7d8d97",
} as const;
