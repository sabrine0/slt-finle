/**
 * Domain-level validation for an intersection configuration.
 *
 * Pure function — takes a normalised config and returns a list of
 * human-readable issues.  The editor surfaces them in a badge +
 * popover so operators can catch modelling mistakes early without
 * having to wait for the backend to reject a phase at runtime.
 *
 * Categories:
 *   • error   — modelling mistake that breaks the phase engine
 *                (e.g., two conflicting SGs green in the same phase)
 *   • warning — correctable issue that doesn't break the engine
 *                (orphaned SGs, missing signal coverage for tram, ...)
 */

import type {
  IntersectionConfig,
  Lane,
  Movement,
  OperatingMode,
  SignalGroup,
  SignalGroupKind,
} from "@/components/studio/state/types";
import {
  defaultAllowedTurnings,
  laneKind,
} from "@/components/studio/state/types";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  category:
    | "signal-group"
    | "movement"
    | "phase"
    | "mode"
    | "conflict"
    | "lane";
  message: string;
  /** Optional id(s) the issue refers to — used by UI to deep-link. */
  subjectId?: string;
}

export interface ValidationReport {
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

export function validateIntersection(
  config: IntersectionConfig,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const signalGroups = config.signalGroups;
  const movements = config.movements ?? [];
  const modes = config.modes ?? [];
  const phases = config.phases;
  const conflicts = config.conflicts;
  const lanes = config.lanes ?? [];
  const phaseIds = new Set(phases.map((p) => p.id));
  const sgById = new Map<string, SignalGroup>(
    signalGroups.map((sg) => [sg.id, sg]),
  );
  const approachIds = new Set(config.approaches.map((a) => a.id));
  const detectorIds = new Set(config.detectors.map((d) => d.id));
  const laneById = new Map<string, Lane>(lanes.map((l) => [l.id, l]));

  // ────────────────── Conflict matrix violations (errors)
  for (const phase of phases) {
    const ids = phase.greenSignalGroupIds;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        const hit = conflicts.find(
          (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
        );
        if (hit) {
          const ka = sgById.get(a)?.kind ?? "vehicle";
          const kb = sgById.get(b)?.kind ?? "vehicle";
          issues.push({
            severity: "error",
            category: "conflict",
            message: `Phase ${phase.id}: ${a} (${ka}) and ${b} (${kb}) are both green but marked conflicting.`,
            subjectId: phase.id,
          });
        }
      }
    }
  }

  // ────────────────── Orphaned signal groups (warning)
  const sgsReferencedByPhase = new Set<string>();
  for (const phase of phases) {
    for (const id of phase.greenSignalGroupIds) sgsReferencedByPhase.add(id);
  }
  const sgsReferencedByMovement = new Set<string>();
  for (const mv of movements) {
    for (const id of mv.signalGroupIds) sgsReferencedByMovement.add(id);
  }
  for (const sg of signalGroups) {
    if (
      !sgsReferencedByPhase.has(sg.id) &&
      !sgsReferencedByMovement.has(sg.id)
    ) {
      issues.push({
        severity: "warning",
        category: "signal-group",
        message: `Signal group ${sg.id} is orphaned — not referenced by any phase or movement.`,
        subjectId: sg.id,
      });
    }
  }

  // ────────────────── Per-kind coverage warnings
  for (const mv of movements) {
    if (mv.enabled === false) continue;
    if (mv.signalGroupIds.length === 0) {
      issues.push({
        severity: "warning",
        category: "movement",
        message: `Movement ${mv.id} (${mv.kind}) has no signal group — it will never be given green.`,
        subjectId: mv.id,
      });
    }
  }

  // Trams / buses / pedestrians that are declared as SG but never
  // appear in a phase would run permanently red.  Flag it.
  for (const sg of signalGroups) {
    const k: SignalGroupKind = sg.kind ?? "vehicle";
    if (k === "vehicle") continue; // default kind, not worth flagging
    const seenInPhase = phases.some((p) =>
      p.greenSignalGroupIds.includes(sg.id),
    );
    if (!seenInPhase) {
      const kindLabel =
        k === "tram"
          ? "tram"
          : k === "busway"
            ? "busway"
            : k === "pedestrian"
              ? "pedestrian crossing"
              : "emergency";
      issues.push({
        severity: "warning",
        category: "signal-group",
        message: `Signal group ${sg.id} (${kindLabel}) is not green in any phase — it will stay red forever.`,
        subjectId: sg.id,
      });
    }
  }

  // ────────────────── Modes referencing missing phases (error)
  for (const mode of modes) {
    for (const phaseId of mode.enabledPhaseIds) {
      if (!phaseIds.has(phaseId)) {
        issues.push({
          severity: "error",
          category: "mode",
          message: `Mode ${mode.id} references phase "${phaseId}" which does not exist.`,
          subjectId: mode.id,
        });
      }
    }
    if (mode.enabledPhaseIds.length === 0 && phases.length > 0) {
      issues.push({
        severity: "warning",
        category: "mode",
        message: `Mode ${mode.id} enables no phases — the controller will stall while this mode is active.`,
        subjectId: mode.id,
      });
    }
  }

  // ────────────────── Lane-level validation
  //
  // These rules are scoped to the lane model.  They only fire when the
  // intersection opts into lane-level modelling (i.e. config.lanes is
  // non-empty) — legacy approach-level configs stay silent.
  if (lanes.length > 0) {
    const lanesByApproach = new Map<string, Lane[]>();
    for (const lane of lanes) {
      const list = lanesByApproach.get(lane.approachId) ?? [];
      list.push(lane);
      lanesByApproach.set(lane.approachId, list);
    }

    for (const lane of lanes) {
      if (lane.enabled === false) continue;

      // Lane references an approach that doesn't exist.
      if (!approachIds.has(lane.approachId)) {
        issues.push({
          severity: "error",
          category: "lane",
          message: `Lane ${lane.id} references approach "${lane.approachId}" which does not exist.`,
          subjectId: lane.id,
        });
      }

      // Lane SG links resolve + kind agrees with lane type.
      const expectedKind = laneKind(lane.type);
      for (const sgId of lane.signalGroupIds ?? []) {
        const sg = sgById.get(sgId);
        if (!sg) {
          issues.push({
            severity: "error",
            category: "lane",
            message: `Lane ${lane.id} references signal group "${sgId}" which does not exist.`,
            subjectId: lane.id,
          });
          continue;
        }
        const sgKind: SignalGroupKind = sg.kind ?? "vehicle";
        if (sgKind !== expectedKind) {
          issues.push({
            severity: "warning",
            category: "lane",
            message: `Lane ${lane.id} (${lane.type}) is linked to signal group ${sgId} of kind "${sgKind}" — expected "${expectedKind}".`,
            subjectId: lane.id,
          });
        }
      }

      // Lane detector links resolve.
      for (const detId of lane.detectorIds ?? []) {
        if (!detectorIds.has(detId)) {
          issues.push({
            severity: "warning",
            category: "lane",
            message: `Lane ${lane.id} references detector "${detId}" which does not exist.`,
            subjectId: lane.id,
          });
        }
      }

      // Allowed turnings must be compatible with the lane type.  A
      // left-turn lane may not declare "right" as an allowed turning.
      const allowed = lane.allowedTurnings ?? defaultAllowedTurnings(lane.type);
      const permitted = new Set(defaultAllowedTurnings(lane.type));
      for (const t of allowed) {
        // "pedestrian-crossing" lanes have empty default permitted set;
        // tolerate them since they're non-vehicle and the turning model
        // doesn't apply.
        if (lane.type === "pedestrian-crossing") break;
        // Non-turn-restricted lane types (general, tram, busway, bike,
        // emergency, taxi) accept any vehicle turning — skip the check.
        if (
          lane.type === "general" ||
          lane.type === "tram" ||
          lane.type === "busway" ||
          lane.type === "bike" ||
          lane.type === "emergency" ||
          lane.type === "taxi"
        ) {
          break;
        }
        if (!permitted.has(t)) {
          issues.push({
            severity: "warning",
            category: "lane",
            message: `Lane ${lane.id} (${lane.type}) permits "${t}" — inconsistent with its type.`,
            subjectId: lane.id,
          });
        }
      }

      // Priority / dedicated lanes without a signal group of the right
      // kind will never get green.  Trams, buses, emergency, pedestrian
      // crossings all need dedicated phase coverage.
      const needsSg =
        lane.type === "tram" ||
        lane.type === "busway" ||
        lane.type === "emergency" ||
        lane.type === "pedestrian-crossing";
      if (needsSg && (lane.signalGroupIds ?? []).length === 0) {
        const label =
          lane.type === "pedestrian-crossing"
            ? "pedestrian crossing"
            : lane.type;
        issues.push({
          severity: "warning",
          category: "lane",
          message: `Lane ${lane.id} (${label}) has no signal group linked — it cannot be safely served by any phase.`,
          subjectId: lane.id,
        });
      }

      // Dedicated-transit lanes need phase coverage on at least one
      // linked SG — otherwise the lane will always be red.
      if (
        (lane.type === "tram" ||
          lane.type === "busway" ||
          lane.type === "pedestrian-crossing") &&
        (lane.signalGroupIds ?? []).length > 0
      ) {
        const covered = (lane.signalGroupIds ?? []).some((sgId) =>
          phases.some((p) => p.greenSignalGroupIds.includes(sgId)),
        );
        if (!covered) {
          const label =
            lane.type === "pedestrian-crossing"
              ? "pedestrian crossing"
              : lane.type;
          issues.push({
            severity: "warning",
            category: "lane",
            message: `Lane ${lane.id} (${label}) has signal groups but none appear green in any phase — add a phase that serves it.`,
            subjectId: lane.id,
          });
        }
      }
    }

    // Approaches that declare vehicle lanes but zero signal groups are
    // usually modelling mistakes — nothing will ever be green there.
    for (const approach of config.approaches) {
      const approachLanes = lanesByApproach.get(approach.id) ?? [];
      const hasVehicleLane = approachLanes.some(
        (l) =>
          l.enabled !== false &&
          l.type !== "pedestrian-crossing" &&
          l.type !== "bike" &&
          l.type !== "tram" &&
          l.type !== "busway",
      );
      if (!hasVehicleLane) continue;
      const hasVehicleSg = signalGroups.some(
        (sg) =>
          sg.approachId === approach.id &&
          (sg.kind ?? "vehicle") === "vehicle",
      );
      if (!hasVehicleSg) {
        issues.push({
          severity: "warning",
          category: "lane",
          message: `Approach ${approach.id} has vehicle lanes but no vehicle signal group — those lanes will never be given green.`,
          subjectId: approach.id,
        });
      }
    }

    // Conflicting lane flows active in the same phase.  Two movements
    // whose fromLanes sit on the same approach and whose SGs conflict
    // cannot safely share a phase.
    for (const phase of phases) {
      const phaseMovements = movements.filter(
        (mv) =>
          (mv.enabled ?? true) &&
          mv.signalGroupIds.some((sg) =>
            phase.greenSignalGroupIds.includes(sg),
          ),
      );
      for (let i = 0; i < phaseMovements.length; i += 1) {
        for (let j = i + 1; j < phaseMovements.length; j += 1) {
          const a = phaseMovements[i];
          const b = phaseMovements[j];
          if (!a.fromLaneId || !b.fromLaneId) continue;
          if (a.fromLaneId === b.fromLaneId) {
            // Two movements sharing the same source lane — always fine,
            // the driver picks one.
            continue;
          }
          const la = laneById.get(a.fromLaneId);
          const lb = laneById.get(b.fromLaneId);
          if (!la || !lb) continue;
          // Only flag if both come from the same approach — cross-approach
          // conflicts are already caught by the SG conflict matrix.
          if (la.approachId !== lb.approachId) continue;
          if (movementsShareAnyConflict(a, b, conflicts)) {
            issues.push({
              severity: "warning",
              category: "lane",
              message: `Phase ${phase.id}: movements ${a.id} (from ${la.id}) and ${b.id} (from ${lb.id}) share an approach but their signal groups conflict.`,
              subjectId: phase.id,
            });
          }
        }
      }
    }
  }

  // Movement lane refs must resolve (independent of lane-level opt-in).
  for (const mv of movements) {
    if (mv.fromLaneId && !laneById.has(mv.fromLaneId)) {
      issues.push({
        severity: "error",
        category: "movement",
        message: `Movement ${mv.id} references from-lane "${mv.fromLaneId}" which does not exist.`,
        subjectId: mv.id,
      });
    }
    if (mv.toLaneId && !laneById.has(mv.toLaneId)) {
      issues.push({
        severity: "error",
        category: "movement",
        message: `Movement ${mv.id} references to-lane "${mv.toLaneId}" which does not exist.`,
        subjectId: mv.id,
      });
    }
  }

  // ────────────────── Two priority movements simultaneously
  // If two movements with `priority` flag are both active in the
  // same phase and they conflict, flag it — the controller cannot
  // serve both without breaking safety.
  const priorityMovements = movements.filter((m) => m.priority && (m.enabled ?? true));
  for (let i = 0; i < priorityMovements.length; i += 1) {
    for (let j = i + 1; j < priorityMovements.length; j += 1) {
      const a = priorityMovements[i];
      const b = priorityMovements[j];
      if (movementsShareAnyConflict(a, b, conflicts)) {
        issues.push({
          severity: "warning",
          category: "movement",
          message: `Priority movements ${a.id} and ${b.id} conflict — they can't be served together; consider splitting across modes.`,
          subjectId: a.id,
        });
      }
    }
  }

  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues,
  };
}

function movementsShareAnyConflict(
  a: Movement,
  b: Movement,
  conflicts: IntersectionConfig["conflicts"],
): boolean {
  for (const sa of a.signalGroupIds) {
    for (const sb of b.signalGroupIds) {
      if (
        conflicts.some(
          (p) => (p.a === sa && p.b === sb) || (p.a === sb && p.b === sa),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Handy helpers for the UI — nothing clever. */
export function isCleanReport(report: ValidationReport): boolean {
  return report.errors === 0 && report.warnings === 0;
}

export function groupIssuesByCategory(
  report: ValidationReport,
): Record<ValidationIssue["category"], ValidationIssue[]> {
  const out: Record<ValidationIssue["category"], ValidationIssue[]> = {
    "signal-group": [],
    movement: [],
    phase: [],
    mode: [],
    conflict: [],
    lane: [],
  };
  for (const issue of report.issues) out[issue.category].push(issue);
  return out;
}

// Avoid unused-import complaints from strict ESLint setups
export type {
  OperatingMode as _OperatingMode,
  IntersectionConfig as _IntersectionConfig,
};
