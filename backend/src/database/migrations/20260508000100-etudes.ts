import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Etudes20260508000100 implements MigrationInterface {
  name = 'Etudes20260508000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "etudes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "intersectionCode" varchar(80) NULL,
        "intersectionLabel" varchar(200) NOT NULL,
        "latitude" numeric(10, 7) NULL,
        "longitude" numeric(10, 7) NULL,
        "scope" varchar(16) NOT NULL DEFAULT 'standard',
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "generationMode" varchar(16) NOT NULL DEFAULT 'offline',
        "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_etudes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_etudes_intersection_code"
        ON "etudes" ("intersectionCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_etudes_status"
        ON "etudes" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_etudes_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_etudes_intersection_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "etudes"`);
  }
}
