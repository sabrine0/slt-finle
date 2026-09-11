import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ControllerType,
  DetectorType,
  PhaseType,
} from '../database/entities/enums';
import type { ProposalGeneratorAdapter } from './proposal-generator.adapter';
import type {
  ApproachBearing,
  EngineeringProposal,
  ProposalBranch,
  ProposalCapacityEstimate,
  ProposalConflict,
  ProposalDetector,
  ProposalGenerationInput,
  ProposalPedestrianCrossing,
  ProposalPhase,
  ProposalReasoning,
  ProposalSet,
  ProposalSignalGroup,
} from './proposal-types';

/**
 * Heuristic engineering-grade proposal generator. Inspired by the
 * reference Casablanca tramway and Fès dossiers : every variant
 * produces realistic phase counts, signal-group catalogues, detector
 * positions, conflict matrices and Webster-style capacity estimates.
 *
 * The generator is intentionally template-driven (no LLM call) so
 * the AI étude workflow ships today without a Claude key. The same
 * `ProposalGeneratorAdapter` surface will be implemented by
 * `ClaudeProposalGenerator` once @anthropic-ai/sdk is installed.
 */
@Injectable()
export class OfflineProposalGenerator implements ProposalGeneratorAdapter {
  readonly mode = 'offline' as const;

  generate(input: ProposalGenerationInput): Promise<ProposalSet> {
    const setId = `set_${randomUUID().slice(0, 8)}`;
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + 30 * 60 * 1000);

    const proposals: EngineeringProposal[] = [];

    proposals.push(this.compactTwoPhase(input, generatedAt));
    proposals.push(this.standardThreePhase(input, generatedAt));
    proposals.push(this.protectedFourPhase(input, generatedAt));
    proposals.push(this.adaptiveSmart(input, generatedAt));
    if (input.scope === 'tram') {
      proposals.push(this.tramPriority(input, generatedAt));
    }
    proposals.push(this.pedestrianPriority(input, generatedAt));

    // Roundabout-family variants — surfaced by the study analyzer
    // when classification = mini-roundabout / plaza.
    proposals.push(this.unsignalizedMiniRoundabout(input, generatedAt));
    proposals.push(this.signalizedRoundabout(input, generatedAt));
    proposals.push(this.meteredRoundabout(input, generatedAt));
    proposals.push(this.pedestrianControlledEntries(input, generatedAt));

    return Promise.resolve({
      id: setId,
      input,
      proposals,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: 'offline:heuristic-v1',
    });
  }

  // =================================================================
  // Common building blocks
  // =================================================================

  private fourBranchGeometry(
    laneCount: { ew: number; ns: number },
    dedicatedLeftsOn: 'none' | 'ew' | 'all',
  ): ProposalBranch[] {
    return [
      {
        bearing: 'E',
        name: 'Branche Est',
        laneCount: laneCount.ew,
        hasDedicatedLeft:
          dedicatedLeftsOn === 'ew' || dedicatedLeftsOn === 'all',
        approachSpeedKph: 50,
        laneWidthMeters: 3.5,
      },
      {
        bearing: 'W',
        name: 'Branche Ouest',
        laneCount: laneCount.ew,
        hasDedicatedLeft:
          dedicatedLeftsOn === 'ew' || dedicatedLeftsOn === 'all',
        approachSpeedKph: 50,
        laneWidthMeters: 3.5,
      },
      {
        bearing: 'N',
        name: 'Branche Nord',
        laneCount: laneCount.ns,
        hasDedicatedLeft: dedicatedLeftsOn === 'all',
        approachSpeedKph: 50,
        laneWidthMeters: 3.5,
      },
      {
        bearing: 'S',
        name: 'Branche Sud',
        laneCount: laneCount.ns,
        hasDedicatedLeft: dedicatedLeftsOn === 'all',
        approachSpeedKph: 50,
        laneWidthMeters: 3.5,
      },
    ];
  }

  private standardPedestrianCrossings(): ProposalPedestrianCrossing[] {
    return [
      {
        branchBearing: 'E',
        type: 'standard',
        widthMeters: 10.5,
        zebraWidthMeters: 3,
      },
      {
        branchBearing: 'W',
        type: 'standard',
        widthMeters: 10.5,
        zebraWidthMeters: 3,
      },
      {
        branchBearing: 'N',
        type: 'standard',
        widthMeters: 7,
        zebraWidthMeters: 3,
      },
      {
        branchBearing: 'S',
        type: 'standard',
        widthMeters: 7,
        zebraWidthMeters: 3,
      },
    ];
  }

  private vehicleSignalGroups(
    branches: ProposalBranch[],
  ): ProposalSignalGroup[] {
    const groups: ProposalSignalGroup[] = [];
    let index = 1;
    for (const branch of branches) {
      const code = `V${index}`;
      groups.push({
        code,
        label: `${code} — ${branch.bearing} tout droit + droite`,
        approachBearing: branch.bearing,
        kind: 'vehicle',
        turning: 'through-right',
        laneReference: `${branch.bearing}1`,
      });
      index += 1;
      if (branch.hasDedicatedLeft) {
        const leftCode = `V${index}`;
        groups.push({
          code: leftCode,
          label: `${leftCode} — ${branch.bearing} tourne-à-gauche`,
          approachBearing: branch.bearing,
          kind: 'vehicle',
          turning: 'left',
          laneReference: `${branch.bearing}2`,
        });
        index += 1;
      }
    }
    return groups;
  }

  private pedestrianSignalGroups(): ProposalSignalGroup[] {
    return [
      {
        code: 'P1',
        label: 'P1 — Traversée Est',
        approachBearing: 'E',
        kind: 'pedestrian',
      },
      {
        code: 'P2',
        label: 'P2 — Traversée Ouest',
        approachBearing: 'W',
        kind: 'pedestrian',
      },
      {
        code: 'P3',
        label: 'P3 — Traversée Nord',
        approachBearing: 'N',
        kind: 'pedestrian',
      },
      {
        code: 'P4',
        label: 'P4 — Traversée Sud',
        approachBearing: 'S',
        kind: 'pedestrian',
      },
    ];
  }

  private vehicleDetectors(branches: ProposalBranch[]): ProposalDetector[] {
    const detectors: ProposalDetector[] = [];
    for (const branch of branches) {
      detectors.push({
        code: `BCL-${branch.bearing}1`,
        label: `Boucle présence ${branch.bearing} TD+D`,
        kind: DetectorType.LOOP,
        approachBearing: branch.bearing,
        positionMetersFromStopLine: 25,
        laneReference: `${branch.bearing}1`,
        assignedPhaseSequenceNumbers: [],
      });
      if (branch.hasDedicatedLeft) {
        detectors.push({
          code: `BCL-${branch.bearing}2`,
          label: `Boucle gauche ${branch.bearing}`,
          kind: DetectorType.LOOP,
          approachBearing: branch.bearing,
          positionMetersFromStopLine: 25,
          laneReference: `${branch.bearing}2`,
          assignedPhaseSequenceNumbers: [],
        });
      }
    }
    return detectors;
  }

  private pedestrianButtons(): ProposalDetector[] {
    return [
      {
        code: 'BP-P1',
        label: 'BP piéton Est',
        kind: DetectorType.PEDESTRIAN_BUTTON,
        approachBearing: 'E',
        positionMetersFromStopLine: 0,
        assignedPhaseSequenceNumbers: [],
      },
      {
        code: 'BP-P2',
        label: 'BP piéton Ouest',
        kind: DetectorType.PEDESTRIAN_BUTTON,
        approachBearing: 'W',
        positionMetersFromStopLine: 0,
        assignedPhaseSequenceNumbers: [],
      },
      {
        code: 'BP-P3',
        label: 'BP piéton Nord',
        kind: DetectorType.PEDESTRIAN_BUTTON,
        approachBearing: 'N',
        positionMetersFromStopLine: 0,
        assignedPhaseSequenceNumbers: [],
      },
      {
        code: 'BP-P4',
        label: 'BP piéton Sud',
        kind: DetectorType.PEDESTRIAN_BUTTON,
        approachBearing: 'S',
        positionMetersFromStopLine: 0,
        assignedPhaseSequenceNumbers: [],
      },
    ];
  }

  /**
   * Compute conflict pairs between signal groups whose movements
   * geometrically cross. Conservative rule of thumb : different
   * bearings (E vs N etc.) always conflict; same-bearing through vs
   * left conflict only if the left is permissive (handled outside via
   * dedicated left phases).
   */
  private buildConflicts(groups: ProposalSignalGroup[]): ProposalConflict[] {
    const conflicts: ProposalConflict[] = [];
    const opposite: Record<ApproachBearing, ApproachBearing> = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E',
      NE: 'SW',
      SW: 'NE',
      NW: 'SE',
      SE: 'NW',
    };
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i];
        const b = groups[j];
        if (a.kind === 'pedestrian' || b.kind === 'pedestrian') {
          // Pedestrian conflicts are derived from the crossing bearing.
          if (a.approachBearing !== b.approachBearing) {
            conflicts.push({
              fromSignalGroupCode: a.code,
              toSignalGroupCode: b.code,
              reason: 'Mouvements piétons / véhicules sur axes orthogonaux',
            });
          }
          continue;
        }
        const sameAxis =
          a.approachBearing === b.approachBearing ||
          opposite[a.approachBearing] === b.approachBearing;
        if (!sameAxis) {
          conflicts.push({
            fromSignalGroupCode: a.code,
            toSignalGroupCode: b.code,
            reason: 'Axes orthogonaux — mouvements croisés',
          });
        } else if (a.turning === 'left' || b.turning === 'left') {
          conflicts.push({
            fromSignalGroupCode: a.code,
            toSignalGroupCode: b.code,
            reason: 'Tourne-à-gauche en conflit avec le tout droit opposé',
          });
        }
      }
    }
    return conflicts;
  }

  /**
   * Webster capacity estimator. Used to fill the capacity card on
   * each proposal — purely indicative for the operator (real values
   * require terrain comptages). Assumptions documented inline.
   */
  private estimateCapacity(
    cycleSeconds: number,
    branches: ProposalBranch[],
    greenSecondsByApproach: Record<ApproachBearing, number>,
    saturationFlowVehHourLane = 1800,
    demandFraction = 0.7,
  ): ProposalCapacityEstimate {
    let weightedSat = 0;
    let totalDemand = 0;
    let maxDelay = 0;
    let maxQueue = 0;
    for (const branch of branches) {
      const greenSeconds = greenSecondsByApproach[branch.bearing] ?? 0;
      const capacity =
        (greenSeconds / cycleSeconds) *
        saturationFlowVehHourLane *
        Math.max(1, branch.laneCount);
      // Synthetic demand = demandFraction * capacity (so saturations land 60-80%)
      const demand = capacity * demandFraction;
      const sat = capacity > 0 ? demand / capacity : 0;
      weightedSat += sat * demand;
      totalDemand += demand;
      // Webster average delay approximation:
      // d = 0.5 * C * (1 - g/C)^2 / (1 - min(0.95, sat)*g/C)
      const gOverC = greenSeconds / cycleSeconds;
      const denom = 1 - Math.min(0.95, sat) * gOverC;
      const delay =
        denom > 0 ? (0.5 * cycleSeconds * Math.pow(1 - gOverC, 2)) / denom : 60;
      if (delay > maxDelay) maxDelay = delay;
      // Rough queue estimate (95th percentile, m) :
      //   q ≈ demand_veh_per_second * red_seconds * 7m (CIPRC rule of thumb)
      const queue = (demand / 3600) * (cycleSeconds - greenSeconds) * 7;
      if (queue > maxQueue) maxQueue = queue;
    }
    const sat = totalDemand > 0 ? weightedSat / totalDemand : 0;
    return {
      cycleSeconds,
      saturationHPM: Math.round(sat * 1000) / 1000,
      averageDelaySeconds: Math.round(maxDelay),
      queueLength95thMeters: Math.round(maxQueue),
      capacityReservePercent: Math.round((1 - sat) * 100),
      notes:
        'Estimation Webster sur débit de saturation 1 800 véh/h/voie. ' +
        'Demande synthétique 70 % de la capacité offerte. ' +
        'À recalculer après campagne de comptages.',
    };
  }

  // =================================================================
  // Variants
  // =================================================================

  private compactTwoPhase(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    const vehicleGroups = this.vehicleSignalGroups(branches);
    const pedGroups = this.pedestrianSignalGroups();
    const signalGroups = [...vehicleGroups, ...pedGroups];

    const cycleSeconds = 70;
    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — Axe E/W (tout droit + droite)',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 22,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V1', 'V2', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [2],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: 'Pietons N/S concomitants',
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — Axe N/S (tout droit + droite)',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 18,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V3', 'V4', 'P1', 'P2'],
        conflictingPhaseSequenceNumbers: [1],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: 'Pietons E/W concomitants',
      },
    ];

    const detectors: ProposalDetector[] = [
      ...this.vehicleDetectors(branches).map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [1] : [2],
      })),
      ...this.pedestrianButtons().map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [2] : [1],
      })),
    ];

    const greenByApproach: Record<ApproachBearing, number> = {
      N: 18,
      S: 18,
      E: 22,
      W: 22,
      NE: 0,
      SE: 0,
      SW: 0,
      NW: 0,
    };

    const reasoning: ProposalReasoning = {
      advantages: [
        "Cycle court (70 s) — délais piétons réduits, temps d'attente moyen minimisé.",
        'Phasage simple : maintenance et formation opérateur faciles.',
        'Aucun mouvement protégé — minimise les pertes inter-phase (10 s par cycle).',
      ],
      disadvantages: [
        'Pas de protection pour les tourne-à-gauche : capacité réduite quand demande gauche > 150 véh/h.',
        "Pas d'extension adaptative — sous-utilisation possible en heures creuses.",
      ],
      expectedBehavior:
        'Régulation à cycle fixe 70 s. Chaque axe reçoit ~22 s de vert utile. ' +
        'Bon comportement sur trafic urbain équilibré (<800 véh/h/branche). ' +
        'Tourne-à-gauche en mode permissif lors du vert opposé.',
      engineeringReasoning:
        'Variante recommandée pour les carrefours secondaires à trafic modéré, ' +
        'lorsque les demandes gauche sont faibles (<10 % du trafic axial) et que ' +
        'la priorité opérationnelle est la fluidité piétonne. Référence métier : ' +
        'CERTU Guide de la signalisation tricolore, chapitre carrefours bi-phase.',
      estimatedComplexity: 'low',
      operationalQuality: 72,
    };

    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      greenByApproach,
      1800,
      0.55, // demande modérée — carrefour secondaire sous-saturé
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'compact-2-phase',
      title: 'Variante A — Carrefour bi-phase compact',
      shortDescription:
        '2 phases, cycle 70 s, tourne-à-gauche permissif. Trafic urbain modéré.',
      intersectionShape: 'cruciform',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'fixed',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'HC',
          name: 'Plan Heures Creuses',
          cycleSeconds,
          offsetSeconds: 0,
          status: 'draft',
        },
        {
          code: 'HPM',
          name: 'Plan Heure de Pointe Matin',
          cycleSeconds: 80,
          offsetSeconds: 0,
          status: 'draft',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning,
      warnings: [
        'Sans protection gauche, prévoir une étude sécurité si demande gauche > 150 véh/h.',
        "Cycle fixe : ne s'adapte pas aux variations de demande infra-horaires.",
      ],
      assumptions: [
        '4 branches à géométrie symétrique, 1 voie par sens.',
        'Demande équilibrée entre axes (±20 %).',
        'Vitesse approche 50 km/h pour le dimensionnement des dégagements.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private standardThreePhase(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 2, ns: 1 }, 'ew');
    const peds = this.standardPedestrianCrossings();
    const vehicleGroups = this.vehicleSignalGroups(branches);
    const pedGroups = this.pedestrianSignalGroups();
    const signalGroups = [...vehicleGroups, ...pedGroups];
    const cycleSeconds = 90;

    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — E/W tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 32,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V1', 'V3', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [2, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: 'Vert piéton N/S concomitant en phase 1.',
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — E/W tourne-à-gauche (protégé)',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'L',
        isProtected: true,
        minGreenSeconds: 12,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V2', 'V4'],
        conflictingPhaseSequenceNumbers: [1, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 3,
        name: 'Phase 3 — N/S tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 26,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V5', 'V6', 'P1', 'P2'],
        conflictingPhaseSequenceNumbers: [1, 2],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: 'Vert piéton E/W concomitant en phase 3.',
      },
    ];

    const detectors: ProposalDetector[] = [
      ...this.vehicleDetectors(branches).map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers: d.code.endsWith('2')
          ? [2]
          : d.approachBearing === 'E' || d.approachBearing === 'W'
            ? [1]
            : [3],
      })),
      ...this.pedestrianButtons().map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [3] : [1],
      })),
    ];

    const greenByApproach: Record<ApproachBearing, number> = {
      N: 26,
      S: 26,
      E: 32,
      W: 32,
      NE: 0,
      SE: 0,
      SW: 0,
      NW: 0,
    };

    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      greenByApproach,
      1800,
      0.7, // demande nominale axe principal urbain
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'standard-3-phase',
      title: 'Variante B — 3 phases avec tourne-à-gauche protégé E/W',
      shortDescription:
        "Phasage urbain standard : 3 phases, cycle 90 s, gauches protégées sur l'axe principal.",
      intersectionShape: 'cruciform',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'fixed',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'HC',
          name: 'Plan Heures Creuses (cycle 90 s)',
          cycleSeconds: 90,
          offsetSeconds: 0,
          status: 'draft',
        },
        {
          code: 'HPM',
          name: 'Plan Heure de Pointe Matin (cycle 120 s)',
          cycleSeconds: 120,
          offsetSeconds: 0,
          status: 'draft',
        },
        {
          code: 'HPS',
          name: 'Plan Heure de Pointe Soir (cycle 120 s)',
          cycleSeconds: 120,
          offsetSeconds: 0,
          status: 'draft',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning: {
        advantages: [
          "Protection complète des tourne-à-gauche E/W — sécurité optimale sur l'axe principal.",
          'Phasage extensible (HPM/HPS/HC/HM) — bonne base pour la coordination corridor.',
          'Cycle 90 s : compromis fluidité véhicule / délais piétons.',
        ],
        disadvantages: [
          'N/S tourne-à-gauche reste permissif — pas adapté si demande gauche N/S > 100 véh/h.',
          'Cycle plus long que la variante bi-phase : délai piéton 95e percentile ~75 s.',
        ],
        expectedBehavior:
          "Régulation à 3 phases en cycle fixe. Phase 1 (32 s) sert l'axe principal en tout droit + droite. " +
          'Phase 2 (12 s) libère les tourne-à-gauche E et W simultanément (mouvements opposés non conflictuels). ' +
          "Phase 3 (26 s) sert l'axe secondaire N/S avec gauches permissives.",
        engineeringReasoning:
          'Variante de référence pour les carrefours urbains arteriels en milieu marocain. ' +
          "Recommandée quand l'axe principal porte > 1 000 véh/h et présente une demande gauche structurelle (> 150 véh/h/branche). " +
          'Référence métier : CERTU + dossiers Casablanca tramway (3 phases + protection E/W).',
        estimatedComplexity: 'medium',
        operationalQuality: 84,
      },
      warnings: [
        'Demande N/S gauche à mesurer — bascule vers Variante C recommandée si > 100 véh/h.',
      ],
      assumptions: [
        '4 branches symétriques, 2x2 voies sur axe principal, 1+1 sur axe secondaire.',
        'Tourne-à-gauche E/W structurels (10-15 % du trafic axial).',
        'Vitesse approche 50 km/h, dégagements 5 s (3 j + 2 ar).',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private protectedFourPhase(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 2, ns: 2 }, 'all');
    const peds = this.standardPedestrianCrossings();
    const vehicleGroups = this.vehicleSignalGroups(branches);
    const pedGroups = this.pedestrianSignalGroups();
    const signalGroups = [...vehicleGroups, ...pedGroups];
    const cycleSeconds = 120;

    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — E/W tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 36,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V1', 'V3', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [2, 3, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — E/W tourne-à-gauche (protégé)',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'L',
        isProtected: true,
        minGreenSeconds: 14,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V2', 'V4'],
        conflictingPhaseSequenceNumbers: [1, 3, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 3,
        name: 'Phase 3 — N/S tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 28,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V5', 'V7', 'P1', 'P2'],
        conflictingPhaseSequenceNumbers: [1, 2, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 4,
        name: 'Phase 4 — N/S tourne-à-gauche (protégé)',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'L',
        isProtected: true,
        minGreenSeconds: 10,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V6', 'V8'],
        conflictingPhaseSequenceNumbers: [1, 2, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
    ];

    const detectors: ProposalDetector[] = [
      ...this.vehicleDetectors(branches).map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers: d.code.endsWith('2')
          ? d.approachBearing === 'E' || d.approachBearing === 'W'
            ? [2]
            : [4]
          : d.approachBearing === 'E' || d.approachBearing === 'W'
            ? [1]
            : [3],
      })),
      ...this.pedestrianButtons().map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [3] : [1],
      })),
    ];

    const greenByApproach: Record<ApproachBearing, number> = {
      N: 28,
      S: 28,
      E: 36,
      W: 36,
      NE: 0,
      SE: 0,
      SW: 0,
      NW: 0,
    };

    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      greenByApproach,
      1800,
      0.78, // fort trafic + lefts protégés — vise saturation 75-85%
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'protected-4-phase',
      title: 'Variante C — 4 phases protégées (E/W + N/S)',
      shortDescription:
        'Tourne-à-gauche protégés sur les 4 branches. Cycle 120 s. Recommandé pour grandes intersections urbaines.',
      intersectionShape: 'cruciform',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'fixed',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'HC',
          name: 'Plan Heures Creuses',
          cycleSeconds: 100,
          offsetSeconds: 0,
          status: 'draft',
        },
        {
          code: 'HPM',
          name: 'Plan Heure de Pointe Matin',
          cycleSeconds: 120,
          offsetSeconds: 0,
          status: 'draft',
        },
        {
          code: 'HPS',
          name: 'Plan Heure de Pointe Soir',
          cycleSeconds: 120,
          offsetSeconds: 0,
          status: 'draft',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning: {
        advantages: [
          'Sécurité maximale : tourne-à-gauche protégés sur les 4 branches.',
          'Adapté aux fortes demandes gauche sur les deux axes.',
          'Phasage compatible avec coordination corridor (offsets dédiés).',
        ],
        disadvantages: [
          'Cycle 120 s — délais piétons élevés (95e percentile ~95 s).',
          'Pertes inter-phase importantes (20 s/cycle) — capacité totale réduite vs bi-phase.',
          'Complexité ingénierie + maintenance contrôleur supérieure.',
        ],
        expectedBehavior:
          'Régulation à 4 phases véhicules + traversées piétonnes concomitantes. ' +
          "Chaque axe reçoit un vert TD+D (28-36 s) suivi d'un vert gauche protégé (10-14 s). " +
          'Aucun conflit véhicule-véhicule en phase active.',
        engineeringReasoning:
          'Variante recommandée pour les carrefours majeurs à fortes demandes gauche multi-axiales ' +
          '(> 200 véh/h par mouvement gauche). Conforme aux pratiques tramway (Casablanca Al Mansour) ' +
          'et grandes intersections périphériques (Bd Mohammed VI / autoroute).',
        estimatedComplexity: 'high',
        operationalQuality: 88,
      },
      warnings: [
        'Cycle long : impacts négatifs piétons et délais HC. Activer mode adaptatif si possible.',
        'Vérifier l\'absence de phase critique en demande zéro — sinon prévoir un mode "phase à la demande".',
      ],
      assumptions: [
        '4 branches symétriques, 2+2 voies sur chaque axe avec dédication gauche.',
        'Demande gauche structurelle sur tous les axes (>150 véh/h).',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private adaptiveSmart(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const base = this.standardThreePhase(input, now);
    return {
      ...base,
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'adaptive-smart',
      title: 'Variante D — Adaptive intelligent (STLS IA)',
      shortDescription:
        'Phasage 3-phase avec prolongation détecteur, micro-régulation IA, priorité urgence.',
      recommendedControlMode: 'adaptive',
      timingPlans: base.timingPlans.map((plan) => ({
        ...plan,
        notes:
          plan.notes ?? "Cycle nominal — adaptation ±20 % par l'agent IA STLS.",
      })),
      reasoning: {
        ...base.reasoning,
        advantages: [
          'Adaptation continue : agent IA `IntersectionManagerAgent` ajuste les splits selon la demande temps-réel.',
          'Priorité urgence + véhicules prioritaires intégrée nativement (API HMAC).',
          'Coordination corridor optionnelle (`CityTrafficManagerAgent`).',
          'Recettes piéton garanties (vert piéton appelé à chaque cycle).',
        ],
        disadvantages: [
          'Dépend de la disponibilité des boucles de détection (fallback HC en cas de panne).',
          'Complexité opérateur : nécessite formation sur le tableau de bord STLS.',
        ],
        expectedBehavior:
          "Cycle adaptatif 80-110 s autour d'un nominal 90 s. Prolongation +2 s par activation boucle " +
          "sur les voies actives jusqu'à `maxGreen`. Raccourcissement de phase si voie idle > 4 s consécutives. " +
          'Décisions IA validées contre matrice de conflit + grille opérateur avant application.',
        engineeringReasoning:
          'Variante recommandée pour les carrefours connectés au backend STLS. Capacité supérieure ' +
          'de 8-15 % vs cycle fixe équivalent, et délais HC ajustés au plus juste. La régulation IA ' +
          'reste contrainte par les seuils sécurité (vert min, all-red, matrice de conflit).',
        estimatedComplexity: 'high',
        operationalQuality: 92,
      },
      warnings: [
        ...base.warnings,
        'Nécessite un contrôleur compatible STLS Runtime + lien backend stable.',
        'Détecteurs en panne : bascule automatique sur Variante B (cycle fixe 90 s).',
      ],
      assumptions: [
        ...base.assumptions,
        "Détection sur chaque voie d'entrée (6 boucles minimum).",
        'Connexion permanente au backend STLS (HMAC + tunnel WireGuard).',
      ],
    };
  }

  private tramPriority(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 2, ns: 1 }, 'ew');
    const peds = this.standardPedestrianCrossings();
    const vehicleGroups = this.vehicleSignalGroups(branches);
    const pedGroups = this.pedestrianSignalGroups();
    const tramGroup: ProposalSignalGroup = {
      code: 'T1',
      label: 'T1 — Tramway (priorité SigFer)',
      approachBearing: 'E',
      kind: 'tram',
      turning: 'through',
    };
    const signalGroups = [...vehicleGroups, ...pedGroups, tramGroup];
    const cycleSeconds = 100;

    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — E/W tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 30,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V1', 'V3', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [2, 3, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — E/W tourne-à-gauche (protégé)',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'L',
        isProtected: true,
        minGreenSeconds: 12,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V2', 'V4'],
        conflictingPhaseSequenceNumbers: [1, 3, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 3,
        name: 'Phase 3 — N/S tout droit + droite',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 24,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V5', 'V6', 'P1', 'P2'],
        conflictingPhaseSequenceNumbers: [1, 2, 4],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 4,
        name: 'Phase 4 — Priorité Tramway (appel SigFer)',
        phaseType: PhaseType.TRANSIT,
        approach: 'Tram axe E/W',
        movementGroup: 'TC',
        isProtected: true,
        minGreenSeconds: 10,
        yellowSeconds: 3,
        redClearanceSeconds: 3,
        greenSignalGroupCodes: ['T1', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [1, 2, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes:
          'Phase appelée sur évènement SigFer AT-IN. Tronque la phase véhicule en cours. ' +
          'Retour automatique au cycle nominal après libération AT-OUT.',
      },
    ];

    const detectors: ProposalDetector[] = [
      ...this.vehicleDetectors(branches).map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers: d.code.endsWith('2')
          ? [2]
          : d.approachBearing === 'E' || d.approachBearing === 'W'
            ? [1]
            : [3],
      })),
      ...this.pedestrianButtons().map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [3] : [1],
      })),
      {
        code: 'SIG-AT-IN',
        label: 'SigFer Annonce Tram entrée',
        kind: DetectorType.LOOP,
        approachBearing: 'E',
        positionMetersFromStopLine: 120,
        assignedPhaseSequenceNumbers: [4],
        laneReference: 'TRAM',
      },
      {
        code: 'SIG-AT-OUT',
        label: 'SigFer Annonce Tram sortie',
        kind: DetectorType.LOOP,
        approachBearing: 'W',
        positionMetersFromStopLine: 20,
        assignedPhaseSequenceNumbers: [4],
        laneReference: 'TRAM',
      },
    ];

    const greenByApproach: Record<ApproachBearing, number> = {
      N: 24,
      S: 24,
      E: 30,
      W: 30,
      NE: 0,
      SE: 0,
      SW: 0,
      NW: 0,
    };

    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      greenByApproach,
      1800,
      0.65, // VP modéré + priorité TC ; demande sous saturation
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'tram-priority',
      title: 'Variante E — Priorité Tramway (SigFer)',
      shortDescription:
        '3 phases véhicules + 1 phase tram à la demande. Annonces SigFer AT-IN/OUT.',
      intersectionShape: 'cruciform',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'adaptive',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'NOM',
          name: 'Plan nominal — cycle 100 s',
          cycleSeconds: 100,
          offsetSeconds: 0,
          status: 'draft',
          notes: 'Phase 4 (tram) appelée sur demande SigFer uniquement.',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning: {
        advantages: [
          'Priorité absolue tramway via SigFer — réduction du temps de parcours TC.',
          "Compatible avec la convention SigFer (AT-IN / AT-OUT) déjà utilisée par l'exploitant.",
          'Vert piéton transversal à la phase tram (sécurité quai).',
        ],
        disadvantages: [
          "Coût d'intégration SigFer (boucles annonce + protocole contrôleur).",
          'Variation cyclique : difficile à coordonner en corridor sans STLS IA.',
        ],
        expectedBehavior:
          "Cycle nominal 100 s en l'absence de tram. Sur appel AT-IN, la phase véhicule en cours est " +
          "tronquée (min green respecté), l'interphase complète est servie, puis la phase tram (P4) est jouée. " +
          'Libération AT-OUT déclenche le retour au cycle nominal.',
        engineeringReasoning:
          'Recommandation pour les carrefours du parcours tramway. Le couplage SigFer est la pratique ' +
          "normative au Maroc (lignes de Casablanca, Rabat-Salé). Le surcoût d'intégration est " +
          'rapidement amorti par la régularité TC.',
        estimatedComplexity: 'high',
        operationalQuality: 90,
      },
      warnings: [
        "Vérifier que le contrôleur cible supporte l'interface SigFer (protocole + tension).",
        'Phase 4 minimum 10 s — si trafic VP forte demande, prévoir une troncature plafond.',
      ],
      assumptions: [
        'Tramway en site propre axe E/W.',
        'Annonces SigFer disponibles 120 m avant carrefour (AT-IN) et 20 m après (AT-OUT).',
        'Voie tram dédiée traversant le carrefour sans conflit véhicule.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private pedestrianPriority(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    const vehicleGroups = this.vehicleSignalGroups(branches);
    const pedGroups = this.pedestrianSignalGroups();
    const signalGroups = [...vehicleGroups, ...pedGroups];
    const cycleSeconds = 80;

    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — E/W véhicules + piétons N/S',
        phaseType: PhaseType.VEHICLE,
        approach: 'E + W',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 22,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V1', 'V2', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [2, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — N/S véhicules + piétons E/W',
        phaseType: PhaseType.VEHICLE,
        approach: 'N + S',
        movementGroup: 'TD+D',
        isProtected: false,
        minGreenSeconds: 18,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['V3', 'V4', 'P1', 'P2'],
        conflictingPhaseSequenceNumbers: [1, 3],
        allowedConcurrentPhaseSequenceNumbers: [],
      },
      {
        sequenceNumber: 3,
        name: 'Phase 3 — Piéton diagonal (Barnes Dance) à la demande',
        phaseType: PhaseType.PEDESTRIAN,
        approach: 'Toutes',
        movementGroup: 'PIE',
        isProtected: true,
        // Vert piéton = walk + clear (utilise pour la duree de phase)
        minGreenSeconds: 26,
        yellowSeconds: 3,
        redClearanceSeconds: 3,
        pedestrianWalkSeconds: 18,
        pedestrianClearSeconds: 8,
        greenSignalGroupCodes: ['P1', 'P2', 'P3', 'P4'],
        conflictingPhaseSequenceNumbers: [1, 2],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes:
          'Phase tout-piéton appelée par BP (toute branche). 4 traversées simultanées + diagonales.',
      },
    ];

    const detectors: ProposalDetector[] = [
      ...this.vehicleDetectors(branches).map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers:
          d.approachBearing === 'E' || d.approachBearing === 'W' ? [1] : [2],
      })),
      ...this.pedestrianButtons().map((d) => ({
        ...d,
        assignedPhaseSequenceNumbers: [3],
      })),
    ];

    const greenByApproach: Record<ApproachBearing, number> = {
      N: 18,
      S: 18,
      E: 22,
      W: 22,
      NE: 0,
      SE: 0,
      SW: 0,
      NW: 0,
    };

    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      greenByApproach,
      1800,
      0.5, // trafic VP faible / centre-ville piéton dominant
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'pedestrian-priority',
      title: 'Variante F — Priorité piétonne (Barnes Dance)',
      shortDescription:
        '2 phases véhicules + 1 phase tout-piéton à la demande (diagonales autorisées).',
      intersectionShape: 'cruciform',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'adaptive',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'NOM',
          name: 'Plan nominal — cycle 80 s',
          cycleSeconds: 80,
          offsetSeconds: 0,
          status: 'draft',
          notes: 'Phase 3 piétonne diagonale appelée par BP.',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning: {
        advantages: [
          'Priorité piétonne maximale — diagonale autorisée en phase dédiée.',
          'Adapté aux centres-villes commerçants, écoles, places piétonnes.',
          'Sécurité optimale : aucun conflit véhicule-piéton en phase active.',
        ],
        disadvantages: [
          'Cycle 80 s + phase 3 à la demande : peut allonger le délai véhicule HC.',
          'Pas adapté aux carrefours de transit (axes > 800 véh/h).',
        ],
        expectedBehavior:
          "Cycle nominal 60 s (2 phases véhicules) en l'absence d'appel piéton. Sur appel BP, " +
          "insertion d'une phase 3 de 29 s (vert piéton 18 s + dégagement 8 s + 3 s rouge). " +
          'Traversées diagonales autorisées en phase 3.',
        engineeringReasoning:
          'Variante pour carrefours en milieu commerçant/scolaire ou place publique. ' +
          'Référence métier : Barnes Dance (Denver, NYC) — adapté aux espaces piétons denses du Maroc ' +
          '(médinas, abords mosquées, gares routières).',
        estimatedComplexity: 'medium',
        operationalQuality: 80,
      },
      warnings: [
        'Vérifier la signalétique horizontale (zébrures diagonales à matérialiser).',
        'Cadence appel piéton à observer en exploitation — si > 1 appel par 3 cycles, basculer Variante B.',
      ],
      assumptions: [
        'Demande piétonne intermittente (< 1 appel / 3 cycles en exploitation moyenne).',
        'Géométrie cruciforme compatible avec traversée diagonale.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  // =================================================================
  // Roundabout-family variants
  //
  // These variants apply to mini-giratoire / plaza topologies. The
  // engineering logic is fundamentally different from signalised
  // intersections — capacity is modelled via entry/circulating gap
  // acceptance, conflict points are radial, and the priority debate
  // is geometric (deflection, splitter islands, pedestrian setback).
  // =================================================================

  private unsignalizedMiniRoundabout(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    const signalGroups: ProposalSignalGroup[] = [];
    const phases: ProposalPhase[] = [];
    const detectors: ProposalDetector[] = [];

    // Capacity estimate uses an HCM-inspired gap-acceptance proxy
    // rather than Webster. We re-use the existing estimator but tag
    // it as advisory only.
    const capacity = this.estimateCapacity(
      30, // virtual "cycle" — used only for ratio math
      branches,
      Object.fromEntries(
        branches.map((b) => [b.bearing, 20]),
      ) as Record<ApproachBearing, number>,
      1400, // entry-capacity proxy (veh/h/voie pour un anneau circulant à 25 km/h)
      0.55,
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'unsignalized-mini-roundabout',
      title: 'Variante R1 — Mini-giratoire (non signalisé)',
      shortDescription:
        'Conservation du giratoire existant : déflection, îlots séparateurs, traversées en retrait.',
      intersectionShape: 'mini-roundabout',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'fixed',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [],
      conflicts: [],
      capacity,
      reasoning: {
        advantages: [
          "Réduction du nombre de points de conflit de ~32 à ~8 vs carrefour à 4 phases (HCM 2010).",
          "Délai moyen plus faible que la signalisation sous 1 800 véh/h totaux entrants.",
          "Pas d'alimentation contrôleur ni de maintenance signalisation.",
          'Apaisement de vitesse par la déflection (typique 25-30 km/h dans l\'anneau).',
        ],
        disadvantages: [
          "Capacité plafonnée — au-delà de ~2 400 véh/h totaux, les délais explosent (loi exponentielle).",
          'Traversées piétonnes en retrait du céder-le-passage : marche supplémentaire 5-7 m.',
          "Géométrie défavorable aux poids lourds (rayon de giration limité)",
        ],
        expectedBehavior:
          "Fonctionnement par cession au véhicule circulant. Capacité d'entrée définie par les gaps " +
          "disponibles dans l'anneau ; capacité totale ~2 000-2 400 véh/h pour un mini-giratoire " +
          "à 4 branches. Aucun arrêt obligatoire en l'absence de circulant.",
        engineeringReasoning:
          "Variante recommandée comme statu quo pour les giratoires existants à trafic modéré " +
          "(< 1 600 véh/h totaux), géométrie conforme (déflection >= 4°, îlots séparateurs présents). " +
          "Référence métier : SETRA Guide carrefours giratoires + HCM 2010 §22.",
        estimatedComplexity: 'low',
        operationalQuality: 78,
      },
      warnings: [
        'Vérifier déflection >= 4° sur toutes les entrées.',
        'Confirmer présence des îlots séparateurs (anti-débord).',
        "Étude poids lourds nécessaire si % PL > 5 %.",
      ],
      assumptions: [
        'Géométrie roundabout existante conforme aux préconisations SETRA.',
        'Trafic total < 2 400 véh/h tous mouvements confondus.',
        'Exposition piétonne modérée.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private signalizedRoundabout(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    const signalGroups: ProposalSignalGroup[] = branches.map((b, idx) => ({
      code: `R${idx + 1}`,
      label: `R${idx + 1} — Entrée ${b.bearing}`,
      approachBearing: b.bearing,
      kind: 'vehicle',
      turning: 'through',
      laneReference: `${b.bearing}1`,
    }));
    // Per-entry phases : on bascule la priorité d'entrée par rotation.
    const cycleSeconds = 60;
    const phases: ProposalPhase[] = branches.map((b, idx) => ({
      sequenceNumber: idx + 1,
      name: `Phase ${idx + 1} — Entrée ${b.bearing}`,
      phaseType: PhaseType.VEHICLE,
      approach: b.bearing,
      movementGroup: 'Entrée',
      isProtected: true,
      minGreenSeconds: 8,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
      greenSignalGroupCodes: [`R${idx + 1}`],
      conflictingPhaseSequenceNumbers: branches
        .map((_, j) => j + 1)
        .filter((seq) => seq !== idx + 1),
      allowedConcurrentPhaseSequenceNumbers: [],
      notes: 'Signalisation d\'entrée — les autres entrées restent en rouge fixe.',
    }));
    const detectors: ProposalDetector[] = branches.flatMap((b) => [
      {
        code: `BCL-${b.bearing}-ENTREE`,
        label: `Boucle file entrée ${b.bearing}`,
        kind: DetectorType.LOOP,
        approachBearing: b.bearing,
        positionMetersFromStopLine: 0,
        laneReference: `${b.bearing}1`,
        assignedPhaseSequenceNumbers: [
          branches.findIndex((entry) => entry.bearing === b.bearing) + 1,
        ],
      },
      {
        code: `BCL-${b.bearing}-AMONT`,
        label: `Boucle amont ${b.bearing} (40 m)`,
        kind: DetectorType.LOOP,
        approachBearing: b.bearing,
        positionMetersFromStopLine: 40,
        laneReference: `${b.bearing}1`,
        assignedPhaseSequenceNumbers: [
          branches.findIndex((entry) => entry.bearing === b.bearing) + 1,
        ],
      },
    ]);
    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      Object.fromEntries(
        branches.map((b) => [b.bearing, 12]),
      ) as Record<ApproachBearing, number>,
      1800,
      0.75,
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'signalized-roundabout',
      title: 'Variante R2 — Giratoire signalisé',
      shortDescription:
        "Feux sur chaque entrée du giratoire avec rotation cyclique. Régule au-delà de 2 400 véh/h.",
      intersectionShape: 'mini-roundabout',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'adaptive',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'GIR',
          name: 'Plan giratoire signalisé — cycle 60 s',
          cycleSeconds: 60,
          offsetSeconds: 0,
          status: 'draft',
          notes: 'Rotation par entrée. Adaptable en cycle 75-90 s en HPM.',
        },
      ],
      conflicts: this.buildConflicts(signalGroups),
      capacity,
      reasoning: {
        advantages: [
          'Capacité supérieure au giratoire non signalisé en saturation (>2 400 véh/h).',
          "Évite l'effet de blocage par une entrée dominante.",
          'Permet la coordination avec d\'autres carrefours du corridor.',
          'Conserve la géométrie roundabout (apaisement vitesse).',
        ],
        disadvantages: [
          "Double-coût : géométrie roundabout + équipement signalisation complet.",
          "Maintenance contrôleur + alimentation requise.",
          "Pertes inter-phase importantes (~20-30 s/cycle pour 4 entrées).",
        ],
        expectedBehavior:
          "Cycle 60-75 s avec rotation par entrée. Chaque entrée reçoit 8-15 s de vert. Les autres " +
          "entrées sont en rouge ; le tourner-à-droite peut être autorisé en permissif via flèche " +
          "dédiée. Les piétons traversent en interphase ou phase dédiée selon demande.",
        engineeringReasoning:
          "Variante recommandée si la mesure de débit total dépasse 2 200 véh/h ou si une " +
          "entrée dominante crée une remontée de file sur les autres branches. Préserve la " +
          "géométrie existante. Référence : SETRA + Yunex Sitraffic guidelines.",
        estimatedComplexity: 'high',
        operationalQuality: 86,
      },
      warnings: [
        'Études capacité indispensables — la signalisation peut DÉGRADER les performances < 1 800 véh/h.',
        "Réviser la déflection : peut devenir excessive avec des arrêts répétés.",
        "Coordonner avec carrefours amont pour éviter remontée jusqu'à l'anneau.",
      ],
      assumptions: [
        'Anneau existant à 1 voie circulante.',
        "Débit total mesuré >= 2 200 véh/h.",
        'Alimentation 230 V AC disponible sur site.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private meteredRoundabout(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    // Un seul feu d'entrée — sur l'entrée dominante — en mode metering
    // (pulses rouges pendant la pointe pour créer des gaps dans le circulant).
    const signalGroups: ProposalSignalGroup[] = [
      {
        code: 'M1',
        label: 'M1 — Meter entrée dominante',
        approachBearing: 'E',
        kind: 'vehicle',
        turning: 'through',
        laneReference: 'E1',
      },
    ];
    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — Meter actif (HPM/HPS)',
        phaseType: PhaseType.VEHICLE,
        approach: 'E',
        movementGroup: 'Entrée meter',
        isProtected: false,
        minGreenSeconds: 10,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: ['M1'],
        conflictingPhaseSequenceNumbers: [],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes:
          'Phase pulsée — typique 10 s vert, 4-6 s rouge, sur appel de queue. Désactivée HC.',
      },
    ];
    const detectors: ProposalDetector[] = [
      {
        code: 'BCL-FILE-CIRC',
        label: "Boucle file dans l'anneau",
        kind: DetectorType.LOOP,
        approachBearing: 'E',
        positionMetersFromStopLine: -5, // dans l'anneau, en aval
        assignedPhaseSequenceNumbers: [1],
      },
      {
        code: 'BCL-FILE-ENT',
        label: 'Boucle file entrée dominante',
        kind: DetectorType.LOOP,
        approachBearing: 'E',
        positionMetersFromStopLine: 25,
        laneReference: 'E1',
        assignedPhaseSequenceNumbers: [1],
      },
    ];
    const capacity = this.estimateCapacity(
      30,
      branches,
      Object.fromEntries(
        branches.map((b) => [b.bearing, 22]),
      ) as Record<ApproachBearing, number>,
      1500,
      0.62,
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'metered-roundabout',
      title: 'Variante R3 — Giratoire à régulation par pulsation (metering)',
      shortDescription:
        "Un seul feu pulsé sur l'entrée dominante en pointe — crée des gaps pour les autres entrées.",
      intersectionShape: 'mini-roundabout',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'adaptive',
      branches,
      pedestrianCrossings: peds,
      signalGroups,
      phases,
      detectors,
      timingPlans: [
        {
          code: 'METER',
          name: 'Plan meter HPM/HPS',
          cycleSeconds: 25,
          offsetSeconds: 0,
          status: 'draft',
          notes:
            "Pulsations 10/15 s. Désactivé en HC (boucle anneau gère). Cycle court.",
        },
      ],
      conflicts: [],
      capacity,
      reasoning: {
        advantages: [
          'Coût réduit vs giratoire signalisé complet (1 feu au lieu de 4).',
          "Résout le blocage par entrée dominante sans toucher aux autres entrées.",
          'Désactivable automatiquement en HC (giratoire libre).',
          'Préserve la fluidité < 1 800 véh/h totaux.',
        ],
        disadvantages: [
          'Strictement adapté à une seule entrée dominante (E ou W typique sur boulevard).',
          "Calibrage délicat — boucle anneau + entrée + algorithme adaptatif requis.",
          'Effet limité si la dominance change selon HPM vs HPS.',
        ],
        expectedBehavior:
          "Le feu d'entrée passe au rouge dès qu'une file est détectée sur les autres entrées et " +
          "que l'anneau est saturé. Cycle pulsé typique 10 s vert + 4-6 s rouge. Pendant les " +
          "rouges, des gaps se forment dans l'anneau permettant aux autres entrées de s'insérer. " +
          "Désactivé en HC pour retour à fonctionnement libre.",
        engineeringReasoning:
          "Variante recommandée quand un giratoire existant est saturé par une entrée dominante " +
          "uniquement en heure de pointe. Compromis coût / efficacité : préserve le confort HC " +
          "tout en réglant le pic. Référence : Yunex metering ; appliqué à Doubs (FR), Cardiff (UK).",
        estimatedComplexity: 'medium',
        operationalQuality: 82,
      },
      warnings: [
        "Mesure préalable des débits HPM/HPS pour identifier l'entrée dominante.",
        "Si dominance change selon créneau, prévoir 2 feux meter (Variante R2 plus simple).",
        'Coordonner avec carrefours amont pour éviter remontée jusqu\'à l\'anneau.',
      ],
      assumptions: [
        "Entrée dominante identifiée (E ou W) avec >55 % du débit total.",
        'Giratoire à 1 voie circulante.',
        'Présence boucle anneau possible (modification chaussée).',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }

  private pedestrianControlledEntries(
    input: ProposalGenerationInput,
    now: Date,
  ): EngineeringProposal {
    const branches = this.fourBranchGeometry({ ew: 1, ns: 1 }, 'none');
    const peds = this.standardPedestrianCrossings();
    // Feux dormants sur chaque entrée, passent au rouge sur appel BP piéton.
    const signalGroups: ProposalSignalGroup[] = branches.map((b, idx) => ({
      code: `RV${idx + 1}`,
      label: `RV${idx + 1} — Entrée ${b.bearing} (dormant)`,
      approachBearing: b.bearing,
      kind: 'vehicle',
      turning: 'through',
    }));
    const pedGroups: ProposalSignalGroup[] = peds.map((p, idx) => ({
      code: `PR${idx + 1}`,
      label: `PR${idx + 1} — Traversée ${p.branchBearing}`,
      approachBearing: p.branchBearing,
      kind: 'pedestrian',
    }));
    const cycleSeconds = 40; // sur appel
    const phases: ProposalPhase[] = [
      {
        sequenceNumber: 1,
        name: 'Phase 1 — Dormante (anneau libre)',
        phaseType: PhaseType.VEHICLE,
        approach: 'Toutes entrées',
        movementGroup: 'Veille',
        isProtected: false,
        minGreenSeconds: 30,
        yellowSeconds: 3,
        redClearanceSeconds: 2,
        greenSignalGroupCodes: signalGroups.map((g) => g.code),
        conflictingPhaseSequenceNumbers: [2],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: "Tous feux d'entrée verts, BP piétons en veille.",
      },
      {
        sequenceNumber: 2,
        name: 'Phase 2 — Appel piéton',
        phaseType: PhaseType.PEDESTRIAN,
        approach: 'Tous piétons',
        movementGroup: 'Pieton',
        isProtected: true,
        minGreenSeconds: 18,
        yellowSeconds: 3,
        redClearanceSeconds: 4,
        pedestrianWalkSeconds: 12,
        pedestrianClearSeconds: 6,
        greenSignalGroupCodes: pedGroups.map((g) => g.code),
        conflictingPhaseSequenceNumbers: [1],
        allowedConcurrentPhaseSequenceNumbers: [],
        notes: "Toutes entrées rouge, piétons servis. Recouvre 4 traversées d'un coup.",
      },
    ];
    const detectors: ProposalDetector[] = peds.map((p, idx) => ({
      code: `BP-${p.branchBearing}-${idx}`,
      label: `BP piéton ${p.branchBearing}`,
      kind: DetectorType.PEDESTRIAN_BUTTON,
      approachBearing: p.branchBearing,
      positionMetersFromStopLine: 0,
      assignedPhaseSequenceNumbers: [2],
    }));
    const capacity = this.estimateCapacity(
      cycleSeconds,
      branches,
      Object.fromEntries(
        branches.map((b) => [b.bearing, 30]),
      ) as Record<ApproachBearing, number>,
      1500,
      0.45,
    );

    return {
      id: `prop_${randomUUID().slice(0, 8)}`,
      variantCode: 'pedestrian-controlled-entries',
      title: 'Variante R4 — Entrées giratoire à la demande piétonne',
      shortDescription:
        "Feux dormants au vert ; passent au rouge sur appel piéton pour servir toutes les traversées en sécurité.",
      intersectionShape: 'mini-roundabout',
      scope: input.scope,
      recommendedControllerType: ControllerType.ATC,
      recommendedControlMode: 'adaptive',
      branches,
      pedestrianCrossings: peds,
      signalGroups: [...signalGroups, ...pedGroups],
      phases,
      detectors,
      timingPlans: [
        {
          code: 'BP',
          name: 'Plan sur appel piéton',
          cycleSeconds: 0, // pas de cycle nominal
          offsetSeconds: 0,
          status: 'draft',
          notes:
            "Pas de cycle fixe — déclenché par BP. Garantie maximale 90 s entre 2 services.",
        },
      ],
      conflicts: [],
      capacity,
      reasoning: {
        advantages: [
          'Fluidité véhicule maximale en l\'absence de piétons.',
          "Sécurité piétons garantie sur appel (rouge sur toutes entrées simultanément).",
          'Adapté aux sites à forte exposition piétonne intermittente (sortie école, mosquée, marché).',
          "Évite le « giratoire dangereux pour piétons » sans dégrader le trafic VP.",
        ],
        disadvantages: [
          'Délai piéton variable selon la régulation (8-20 s typique).',
          "Coût équipement complet + 4 BP + 4 feux véhicules + 4 feux piétons.",
          'Risque de fraude piéton (traversée hors phase) si attente trop longue.',
        ],
        expectedBehavior:
          "Anneau fonctionne en libre 95 % du temps (phase 1 dormante). Sur appel BP, toutes les " +
          "entrées passent au rouge après un dégagement court (3 s jaune + 4 s all-red), puis " +
          "phase 2 sert le vert piéton (12 s + 6 s clignotant). Retour automatique au giratoire libre.",
        engineeringReasoning:
          "Variante recommandée pour les giratoires à forte exposition piétonne intermittente : sortie " +
          "d'école, abord de mosquée, gare routière. Préserve le bénéfice trafic du giratoire en " +
          "permettant la régulation piéton à la demande. Référence : pratique scandinave + " +
          "Yunex Sitraffic pedestrian-on-demand.",
        estimatedComplexity: 'medium',
        operationalQuality: 84,
      },
      warnings: [
        "Études exposition piétonne préalables — pas adapté si demande continue (> 1 appel / 2 min).",
        "Si demande continue, basculer vers giratoire signalisé (R2) ou conversion intersection.",
        'Garantir un délai piéton plafond (90 s entre 2 services) pour éviter la fraude.',
      ],
      assumptions: [
        'Exposition piétonne intermittente (< 1 appel toutes les 90 s en moyenne).',
        "Anneau à 1 voie, géométrie roundabout existante.",
        'Demande véhicule modérée à élevée mais < 2 200 véh/h.',
      ],
      source: 'offline:heuristic-v1',
      generatedAt: now.toISOString(),
    };
  }
}
