import type { ProposalGenerationInput } from './proposal-types';
import type { IntersectionStudy, ObservedGeometry } from './study-types';

/**
 * Pluggable study analyzer. Produces an `IntersectionStudy` from the
 * operator input + (optional) observed geometry. The current default
 * is `OfflineStudyAnalyzer` — a deterministic heuristic engine.
 * Phase 2 will plug in :
 *   - `ClaudeStudyAnalyzer` (LLM-backed reasoning on the geometry)
 *   - `SatelliteVisionAnalyzer` (image-based geometry extraction)
 *   - `DxfStudyAnalyzer` (parsed CAD drawings)
 */
export interface StudyAnalyzerAdapter {
  readonly mode: 'offline' | 'claude' | 'satellite-vision' | 'dxf';
  analyze(
    input: ProposalGenerationInput,
    geometry?: ObservedGeometry,
  ): Promise<IntersectionStudy>;
}

export const STUDY_ANALYZER = Symbol('STUDY_ANALYZER');
