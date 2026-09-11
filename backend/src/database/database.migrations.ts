import { ProductionFoundationPhase320260415000100 } from './migrations/20260415000100-production-foundation-phase3';
import { ControllerRuntimePhase420260415000200 } from './migrations/20260415000200-controller-runtime-phase4';
import { IntersectionRuntimeConfig20260420000100 } from './migrations/20260420000100-intersection-runtime-config';
import { ProjectsAndOverrides20260422000100 } from './migrations/20260422000100-projects-and-overrides';
import { Corridors20260422000200 } from './migrations/20260422000200-corridors';
import { TrafficGraph20260427000100 } from './migrations/20260427000100-traffic-graph';
import { PredictionSnapshots20260429000100 } from './migrations/20260429000100-prediction-snapshots';
import { AgentRuns20260501000100 } from './migrations/20260501000100-agent-runs';
import { TrafficCommands20260502000100 } from './migrations/20260502000100-traffic-commands';
import { Etudes20260508000100 } from './migrations/20260508000100-etudes';
import { EngineeringDocuments20260513000100 } from './migrations/20260513000100-engineering-documents';
import { ProgrammePackages20260513000200 } from './migrations/20260513000200-programme-packages';
import { DocumentIngestRuns20260513000300 } from './migrations/20260513000300-document-ingest-runs';

export const databaseMigrations = [
  ProductionFoundationPhase320260415000100,
  ControllerRuntimePhase420260415000200,
  IntersectionRuntimeConfig20260420000100,
  ProjectsAndOverrides20260422000100,
  Corridors20260422000200,
  TrafficGraph20260427000100,
  PredictionSnapshots20260429000100,
  AgentRuns20260501000100,
  TrafficCommands20260502000100,
  Etudes20260508000100,
  // Engineering reference layer (additive — read-only relative to
  // live runtime). FKs to intersections/controllers use SET NULL.
  EngineeringDocuments20260513000100,
  ProgrammePackages20260513000200,
  DocumentIngestRuns20260513000300,
];
