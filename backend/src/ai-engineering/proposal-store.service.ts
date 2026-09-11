import { Injectable, Logger } from '@nestjs/common';

import type { ProposalSet } from './proposal-types';

/**
 * Ephemeral in-memory store for AI-generated proposal sets. Each set
 * lives for 30 minutes ; after that it is garbage collected on access
 * to keep memory bounded. Approval reads the set once and creates a
 * real STLS intersection — at which point the set is consumed and
 * removed from the store.
 *
 * Phase 2 will swap this for a small DB table so proposals survive
 * backend restarts and become auditable. The narrow interface
 * (get/save/consume) keeps that migration trivial.
 */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class ProposalStoreService {
  private readonly logger = new Logger(ProposalStoreService.name);
  private readonly entries = new Map<
    string,
    { set: ProposalSet; expiresAtMs: number }
  >();

  save(set: ProposalSet): void {
    const expiresAtMs = Date.now() + DEFAULT_TTL_MS;
    this.entries.set(set.id, { set, expiresAtMs });
    this.logger.debug(
      `Proposal set ${set.id} stored — ${set.proposals.length} proposal(s), expires in ${DEFAULT_TTL_MS / 60_000} min`,
    );
  }

  getSet(setId: string): ProposalSet | null {
    const entry = this.entries.get(setId);
    if (!entry) return null;
    if (entry.expiresAtMs < Date.now()) {
      this.entries.delete(setId);
      return null;
    }
    return entry.set;
  }

  findProposalById(
    proposalId: string,
  ): { set: ProposalSet; proposal: ProposalSet['proposals'][number] } | null {
    this.sweep();
    for (const entry of this.entries.values()) {
      const proposal = entry.set.proposals.find((p) => p.id === proposalId);
      if (proposal) return { set: entry.set, proposal };
    }
    return null;
  }

  /** Remove all expired entries — called lazily on read. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries.entries()) {
      if (entry.expiresAtMs < now) this.entries.delete(id);
    }
  }
}
