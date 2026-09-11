import type { SelectionPath } from "@/components/command-platform/types";
import type {
  AlertSnapshot,
  IntersectionMode,
  IntersectionSnapshot,
  OperatorDirection,
  ScenarioId,
} from "@/types/command-platform";

export type IntersectionPatch = Partial<
  Pick<IntersectionSnapshot, "manualOverride" | "forcedDirection" | "mode">
>;

export interface DemoContext {
  setSelection: (selection: SelectionPath) => void;
  setScenarioId: (scenarioId: ScenarioId) => void;
  addDemoAlert: (
    alert: Omit<AlertSnapshot, "id" | "timestamp"> & { id?: string },
  ) => void;
  patchIntersection: (intersectionId: string, patch: IntersectionPatch) => void;
  flashIntersection: (intersectionId: string) => void;
  clearDemoOverrides: () => void;
}

export interface DemoStep {
  id: string;
  hold: number;
  narrative: string;
  narrativeAr?: string;
  action?: (ctx: DemoContext) => void | Promise<void>;
}

export interface DemoScenario {
  id: "heavy-casa" | "accident-maarif" | "emergency-priority";
  title: string;
  titleAr?: string;
  subtitle: string;
  steps: DemoStep[];
}

const CASA_REGION: SelectionPath = {
  level: "region",
  regionId: "reg-casablanca-settat",
};
const CASA_CITY: SelectionPath = {
  level: "city",
  regionId: "reg-casablanca-settat",
  cityId: "city-casablanca",
};
const MAARIF_DISTRICT: SelectionPath = {
  level: "district",
  regionId: "reg-casablanca-settat",
  cityId: "city-casablanca",
  districtId: "dist-cas-maarif",
};

const intersectionSelection = (intersectionId: string): SelectionPath => ({
  level: "intersection",
  regionId: "reg-casablanca-settat",
  cityId: "city-casablanca",
  intersectionId,
});

// Demo drills point at real carrefours from the Tomorrow Systems
// inventory (carfmap) so the "go deeper" narration lands on nodes
// that exist in the live data.
const MAARIF_ZERKTOUNI = "CAR-0147"; // Tram T3 — Bd MED 6 / Bd Abbasside
const HASSAN_II = "CAR-0169"; // Tram T4 — Rahal Meskini / Abou bakr Essedik
const ANFA_FINANCE = "CAR-0226"; // BHNS L5 — Mohammed VI / Cdt Driss Al Harti

const modeHelper = (mode: IntersectionMode): IntersectionPatch => ({ mode });
const directionHelper = (
  direction: OperatorDirection | null,
): IntersectionPatch => ({ forcedDirection: direction });

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "heavy-casa",
    title: "Heavy traffic in Casablanca",
    titleAr: "ازدحام في الدار البيضاء",
    subtitle: "Peak-hour congestion response",
    steps: [
      {
        id: "heavy-1",
        hold: 3200,
        narrative: "Casablanca network is entering peak-hour load.",
        action: (ctx) => ctx.setSelection({ level: "country" }),
      },
      {
        id: "heavy-2",
        hold: 3800,
        narrative:
          "Aggregate congestion rising across Casablanca-Settat region.",
        action: (ctx) => ctx.setSelection(CASA_REGION),
      },
      {
        id: "heavy-3",
        hold: 3800,
        narrative: "Flow deteriorating in central corridors.",
        action: (ctx) => ctx.setSelection(CASA_CITY),
      },
      {
        id: "heavy-4",
        hold: 4200,
        narrative: "Hassan II / Résistance is the dominant pressure point.",
        action: (ctx) => {
          ctx.setSelection(intersectionSelection(HASSAN_II));
          ctx.addDemoAlert({
            level: "warning",
            title: "Queue growth on CBD Core",
            detail: "Queue up 45% in the last 3 minutes on the northbound approach.",
          });
        },
      },
      {
        id: "heavy-5",
        hold: 4800,
        narrative: "Operator deploys the Peak-Traffic plan.",
        action: (ctx) => {
          ctx.setScenarioId("peak_traffic");
          ctx.addDemoAlert({
            level: "info",
            title: "Scenario switched → Peak traffic",
            detail: "Longer green waves authorised on pressured corridors.",
          });
        },
      },
      {
        id: "heavy-6",
        hold: 4600,
        narrative: "Adaptive timing active — flow stabilising.",
        action: (ctx) =>
          ctx.addDemoAlert({
            level: "info",
            title: "CBD Core downgraded: congestion → pressure",
            detail: "Average corridor travel time reduced by ~1.4 min.",
          }),
      },
    ],
  },
  {
    id: "accident-maarif",
    title: "Accident in Maarif",
    titleAr: "حادث في المعاريف",
    subtitle: "Incident response playback",
    steps: [
      {
        id: "accident-1",
        hold: 2800,
        narrative: "Normal operations across the network.",
        action: (ctx) => ctx.setSelection({ level: "country" }),
      },
      {
        id: "accident-2",
        hold: 3800,
        narrative: "Incident report — Maarif district.",
        action: (ctx) =>
          ctx.addDemoAlert({
            level: "critical",
            title: "Accident reported — Maarif",
            detail: "Two vehicles involved at Bd Zerktouni × Rue Socrate.",
          }),
      },
      {
        id: "accident-3",
        hold: 3200,
        narrative: "Zooming to the affected area.",
        action: (ctx) => ctx.setSelection(CASA_CITY),
      },
      {
        id: "accident-4",
        hold: 3400,
        narrative: "Maarif district under assessment.",
        action: (ctx) => ctx.setSelection(MAARIF_DISTRICT),
      },
      {
        id: "accident-5",
        hold: 4200,
        narrative: "Maarif / Zerktouni intersection directly impacted.",
        action: (ctx) => {
          ctx.setSelection(intersectionSelection(MAARIF_ZERKTOUNI));
          ctx.addDemoAlert({
            level: "warning",
            title: "Queue forming on northbound approach",
            detail: "ETA for emergency responders: 4 minutes.",
          });
        },
      },
      {
        id: "accident-6",
        hold: 4400,
        narrative: "Operator engages manual override.",
        action: (ctx) => {
          ctx.patchIntersection(MAARIF_ZERKTOUNI, { manualOverride: true });
          ctx.flashIntersection(MAARIF_ZERKTOUNI);
          ctx.addDemoAlert({
            level: "info",
            title: "Override engaged at Maarif / Zerktouni",
            detail: "Operator took manual control of this intersection.",
          });
        },
      },
      {
        id: "accident-7",
        hold: 4400,
        narrative: "Force green · N to clear the incident lane.",
        action: (ctx) => {
          ctx.patchIntersection(MAARIF_ZERKTOUNI, directionHelper("N"));
          ctx.flashIntersection(MAARIF_ZERKTOUNI);
          ctx.addDemoAlert({
            level: "warning",
            title: "Force green N — Maarif / Zerktouni",
            detail: "Northbound cleared for emergency responders.",
          });
        },
      },
      {
        id: "accident-8",
        hold: 3800,
        narrative: "Traffic being redirected — responders on scene.",
      },
    ],
  },
  {
    id: "emergency-priority",
    title: "Emergency vehicle priority",
    titleAr: "أولوية مركبة الطوارئ",
    subtitle: "Green-wave ambulance routing",
    steps: [
      {
        id: "emergency-1",
        hold: 3000,
        narrative: "Normal operations in Casablanca.",
        action: (ctx) => ctx.setSelection(CASA_CITY),
      },
      {
        id: "emergency-2",
        hold: 3600,
        narrative: "Priority request — ambulance en route to CHU Ibn Rochd.",
        action: (ctx) =>
          ctx.addDemoAlert({
            level: "critical",
            title: "Priority vehicle request",
            detail: "Ambulance inbound via Anfa Finance City corridor.",
          }),
      },
      {
        id: "emergency-3",
        hold: 3800,
        narrative: "Locking Anfa Finance City intersection.",
        action: (ctx) => {
          ctx.setSelection(intersectionSelection(ANFA_FINANCE));
          ctx.patchIntersection(ANFA_FINANCE, { manualOverride: true });
          ctx.flashIntersection(ANFA_FINANCE);
        },
      },
      {
        id: "emergency-4",
        hold: 4200,
        narrative: "Switching to Emergency mode.",
        action: (ctx) => {
          ctx.patchIntersection(ANFA_FINANCE, modeHelper("emergency"));
          ctx.flashIntersection(ANFA_FINANCE);
          ctx.addDemoAlert({
            level: "critical",
            title: "Mode → Emergency · Anfa Finance City",
            detail: "All phases preempted; corridor reserved for priority vehicle.",
          });
        },
      },
      {
        id: "emergency-5",
        hold: 4200,
        narrative: "Force green · E to clear ambulance path.",
        action: (ctx) => {
          ctx.patchIntersection(ANFA_FINANCE, directionHelper("E"));
          ctx.flashIntersection(ANFA_FINANCE);
        },
      },
      {
        id: "emergency-6",
        hold: 4400,
        narrative: "Green wave established — ETA to hospital reduced by 2 min.",
        action: (ctx) =>
          ctx.addDemoAlert({
            level: "info",
            title: "Green wave active",
            detail: "Anfa corridor locked for ambulance transit.",
          }),
      },
      {
        id: "emergency-7",
        hold: 4200,
        narrative: "Priority complete — restoring adaptive control.",
        action: (ctx) => {
          ctx.patchIntersection(ANFA_FINANCE, {
            manualOverride: false,
            forcedDirection: null,
            mode: "adaptive",
          });
          ctx.flashIntersection(ANFA_FINANCE);
          ctx.addDemoAlert({
            level: "info",
            title: "Override released at Anfa Finance City",
            detail: "Intersection back to adaptive mode.",
          });
        },
      },
    ],
  },
];

export const DEMO_SPEED_MULTIPLIER: Record<"slow" | "normal" | "fast", number> = {
  slow: 1.6,
  normal: 1,
  fast: 0.55,
};
