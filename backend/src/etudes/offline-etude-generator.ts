import { Injectable } from '@nestjs/common';

import { dossierFor } from './dossier-templates';
import type {
  EtudeGenerationContext,
  EtudeGenerationResult,
  EtudeGeneratorAdapter,
} from './etude-generator.adapter';
import type { EtudeSectionId } from './etude-sections';

/**
 * Offline generator — produces dossier-style content for every
 * section in the catalogue, derived from the structure of the
 * Casablanca + Fès reference dossiers. When the catalog already
 * holds detectors, phases or timing plans for the target carrefour
 * they are surfaced verbatim ; otherwise the generator emits a
 * prescriptive template (à valider terrain), matching the dossier
 * voice of "premier indice A".
 *
 * Every generated content is a structured-block document — the
 * shape `{ kind: 'blocks', blocks: [...] }` — consumed both by the
 * web preview and by the PDF renderer.
 */
@Injectable()
export class OfflineEtudeGenerator implements EtudeGeneratorAdapter {
  readonly mode = 'offline' as const;

  generateSection(
    sectionId: EtudeSectionId,
    context: EtudeGenerationContext,
  ): Promise<EtudeGenerationResult> {
    const envelope = dossierFor(sectionId, context);
    return Promise.resolve({
      sectionId,
      content: envelope.content as unknown as Record<string, unknown>,
      source: envelope.source,
      rationale: envelope.rationale,
    });
  }
}
