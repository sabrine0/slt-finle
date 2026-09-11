import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IntersectionRuntimeConfig20260420000100 implements MigrationInterface {
  name = 'IntersectionRuntimeConfig20260420000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "intersection_runtime_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "intersectionCode" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "schemaVersion" integer NOT NULL DEFAULT 1,
        "appliedAt" timestamptz NOT NULL,
        "appliedBy" varchar(128) NULL,
        CONSTRAINT "PK_intersection_runtime_configs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intersection_runtime_configs_intersectionCode"
      ON "intersection_runtime_configs" ("intersectionCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_intersection_runtime_configs_intersectionCode"
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "intersection_runtime_configs"`,
    );
  }
}
