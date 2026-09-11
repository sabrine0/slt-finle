import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Engineering reference layer — table 1/3.
 *
 * Stores indexed metadata for real-world Plan RS / Dossier
 * Régulation / Plan Filaire PDFs that live on disk under
 * STLS_ENGINEERING_REFERENCES_ROOT. The reference layer is
 * strictly read-only relative to live runtime; nothing in this
 * table is ever pushed to a controller.
 *
 * FKs to intersections / controllers use ON DELETE SET NULL so a
 * controller cleanup never cascades and deletes a reference index
 * record.
 */
export class EngineeringDocuments20260513000100 implements MigrationInterface {
  name = 'EngineeringDocuments20260513000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "engineering_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "documentType" varchar(32) NOT NULL,
        "city" varchar(64) NOT NULL DEFAULT 'unknown',
        "corridor" varchar(120) NOT NULL DEFAULT 'unknown',
        "shortCode" varchar(16) NULL,
        "carrefourLabel" varchar(16) NULL,
        "title" varchar(255) NOT NULL,
        "revision" varchar(8) NULL,
        "sourcePath" varchar(1024) NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "fileSizeBytes" bigint NOT NULL DEFAULT 0,
        "sha256" varchar(64) NULL,
        "sourceLastModified" timestamptz NULL,
        "ingestedAt" timestamptz NOT NULL DEFAULT now(),
        "intersectionId" uuid NULL,
        "controllerId" uuid NULL,
        "parseNotes" text NULL,
        CONSTRAINT "PK_engineering_documents" PRIMARY KEY ("id"),
        CONSTRAINT "uq_engineering_doc_source_path" UNIQUE ("sourcePath")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_engineering_doc_short_code"
        ON "engineering_documents" ("shortCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_engineering_doc_intersection"
        ON "engineering_documents" ("intersectionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_engineering_doc_controller"
        ON "engineering_documents" ("controllerId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_engineering_doc_type"
        ON "engineering_documents" ("documentType")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "engineering_documents"
          ADD CONSTRAINT "FK_engineering_doc_intersection"
          FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "engineering_documents"
          ADD CONSTRAINT "FK_engineering_doc_controller"
          FOREIGN KEY ("controllerId") REFERENCES "controllers"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "engineering_documents"
        DROP CONSTRAINT IF EXISTS "FK_engineering_doc_controller"
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "engineering_documents"
        DROP CONSTRAINT IF EXISTS "FK_engineering_doc_intersection"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_engineering_doc_type"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_engineering_doc_controller"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_engineering_doc_intersection"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_engineering_doc_short_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "engineering_documents"`);
  }
}
