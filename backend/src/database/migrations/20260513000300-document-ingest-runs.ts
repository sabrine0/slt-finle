import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Engineering reference layer — table 3/3.
 *
 * Audit row per document-ingest scan: counters, status,
 * per-file errors. No FK to runtime entities — these rows are an
 * operator-facing audit log and outlive the documents they index.
 */
export class DocumentIngestRuns20260513000300 implements MigrationInterface {
  name = 'DocumentIngestRuns20260513000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_ingest_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "startedAt" timestamptz NOT NULL DEFAULT now(),
        "finishedAt" timestamptz NULL,
        "status" varchar(16) NOT NULL DEFAULT 'running',
        "rootPath" varchar(1024) NOT NULL,
        "filesScanned" integer NOT NULL DEFAULT 0,
        "documentsCreated" integer NOT NULL DEFAULT 0,
        "documentsUpdated" integer NOT NULL DEFAULT 0,
        "programmePackagesCreated" integer NOT NULL DEFAULT 0,
        "programmePackagesUpdated" integer NOT NULL DEFAULT 0,
        "skipped" integer NOT NULL DEFAULT 0,
        "errored" integer NOT NULL DEFAULT 0,
        "errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "notes" text NULL,
        CONSTRAINT "PK_document_ingest_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_document_ingest_runs_started"
        ON "document_ingest_runs" ("startedAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_document_ingest_runs_status"
        ON "document_ingest_runs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_document_ingest_runs_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_document_ingest_runs_started"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "document_ingest_runs"`);
  }
}
