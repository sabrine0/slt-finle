import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PredictionSnapshots20260429000100 implements MigrationInterface {
  name = 'PredictionSnapshots20260429000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "scopeType" varchar(24) NOT NULL,
        "scopeRef" varchar(80) NOT NULL,
        "label" varchar(160) NOT NULL,
        "horizon" varchar(8) NOT NULL,
        "nodeCount" integer NOT NULL DEFAULT 0,
        "averageSaturation" numeric(6,3) NULL,
        "totalQueueMetres" numeric(10,2) NULL,
        "averageDelaySeconds" numeric(10,2) NULL,
        "averageConfidence" numeric(5,3) NULL,
        "congestionLevel" varchar(24) NOT NULL DEFAULT 'smooth',
        "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "generatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_prediction_snapshots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_snapshots_scope_time"
        ON "prediction_snapshots" ("scopeType", "scopeRef", "generatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_prediction_snapshots_scope_time"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "prediction_snapshots"
    `);
  }
}
