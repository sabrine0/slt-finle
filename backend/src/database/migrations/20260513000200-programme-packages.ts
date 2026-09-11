import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Engineering reference layer — table 2/3.
 *
 * Stores metadata for controller programme ZIP archives
 * (.clp9_9_* + .wpr + PDFs). These are reference-only — the
 * `isReferenceOnly` column is set to true on every row by the
 * ingest service and there is no path from this layer to a live
 * deployment.
 */
export class ProgrammePackages20260513000200 implements MigrationInterface {
  name = 'ProgrammePackages20260513000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "programme_packages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "packageName" varchar(255) NOT NULL,
        "city" varchar(64) NOT NULL DEFAULT 'unknown',
        "shortCode" varchar(16) NULL,
        "sourceZipPath" varchar(1024) NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "fileSizeBytes" bigint NOT NULL DEFAULT 0,
        "sha256" varchar(64) NULL,
        "sourceLastModified" timestamptz NULL,
        "ingestedAt" timestamptz NOT NULL DEFAULT now(),
        "contents" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "detectedVersion" varchar(64) NULL,
        "intersectionId" uuid NULL,
        "controllerId" uuid NULL,
        "isReferenceOnly" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_programme_packages" PRIMARY KEY ("id"),
        CONSTRAINT "uq_programme_pkg_source_path" UNIQUE ("sourceZipPath")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_programme_pkg_short_code"
        ON "programme_packages" ("shortCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_programme_pkg_intersection"
        ON "programme_packages" ("intersectionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_programme_pkg_controller"
        ON "programme_packages" ("controllerId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "programme_packages"
          ADD CONSTRAINT "FK_programme_pkg_intersection"
          FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "programme_packages"
          ADD CONSTRAINT "FK_programme_pkg_controller"
          FOREIGN KEY ("controllerId") REFERENCES "controllers"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "programme_packages"
        DROP CONSTRAINT IF EXISTS "FK_programme_pkg_controller"
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "programme_packages"
        DROP CONSTRAINT IF EXISTS "FK_programme_pkg_intersection"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_programme_pkg_controller"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_programme_pkg_intersection"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_programme_pkg_short_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_packages"`);
  }
}
