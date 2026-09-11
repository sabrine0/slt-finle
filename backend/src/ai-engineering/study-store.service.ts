import { Injectable, Logger } from '@nestjs/common';

import type { IntersectionStudy } from './study-types';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class StudyStoreService {
  private readonly logger = new Logger(StudyStoreService.name);
  private readonly entries = new Map<
    string,
    { study: IntersectionStudy; expiresAtMs: number }
  >();

  save(study: IntersectionStudy): void {
    this.entries.set(study.id, {
      study,
      expiresAtMs: Date.now() + DEFAULT_TTL_MS,
    });
    this.logger.debug(
      `Study ${study.id} stored — classification=${study.classification}, complexity=${study.complexityScore}`,
    );
  }

  get(studyId: string): IntersectionStudy | null {
    const entry = this.entries.get(studyId);
    if (!entry) return null;
    if (entry.expiresAtMs < Date.now()) {
      this.entries.delete(studyId);
      return null;
    }
    return entry.study;
  }
}
