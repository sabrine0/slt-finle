import type { ProposalGenerationInput, ProposalSet } from './proposal-types';

/**
 * Pluggable proposal generator. The current default is
 * `OfflineProposalGenerator` — a heuristic, scope-aware template
 * engine that produces engineering-grade drafts without external
 * services. Future implementations will plug in here :
 *
 *   - `ClaudeProposalGenerator` — uses @anthropic-ai/sdk to ask Claude
 *     for reasoning-grade proposals on top of the same data shape.
 *   - `DxfBackedGenerator` — extracts real geometry from an uploaded
 *     DXF and feeds it to the engine.
 *   - `PdfBackedGenerator` — same idea for engineering PDFs.
 *
 * The interface is intentionally narrow so the AiEngineeringService
 * remains adapter-agnostic.
 */
export interface ProposalGeneratorAdapter {
  readonly mode: 'offline' | 'claude' | 'dxf' | 'pdf' | 'satellite';
  generate(input: ProposalGenerationInput): Promise<ProposalSet>;
}

export const PROPOSAL_GENERATOR = Symbol('PROPOSAL_GENERATOR');
