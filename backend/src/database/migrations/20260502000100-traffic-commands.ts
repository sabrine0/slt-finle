import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TrafficCommands20260502000100 implements MigrationInterface {
  name = 'TrafficCommands20260502000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "traffic_commands" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "intersectionCode" varchar(80) NULL,
        "scope" varchar(16) NOT NULL,
        "scopeRef" varchar(80) NOT NULL,
        "agentRunId" uuid NULL,
        "agentId" varchar(64) NOT NULL,
        "decisionKind" varchar(64) NOT NULL,
        "kind" varchar(32) NOT NULL,
        "severity" varchar(16) NOT NULL DEFAULT 'info',
        "override" boolean NOT NULL DEFAULT false,
        "status" varchar(16) NOT NULL DEFAULT 'queued',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "rationale" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "issuedAt" timestamptz NOT NULL,
        "resolvedAt" timestamptz NULL,
        "resolutionNote" varchar(256) NULL,
        CONSTRAINT "PK_traffic_commands" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_traffic_commands_target_time"
        ON "traffic_commands" ("intersectionCode", "issuedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_traffic_commands_status_time"
        ON "traffic_commands" ("status", "issuedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_traffic_commands_run_id"
        ON "traffic_commands" ("agentRunId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_traffic_commands_run_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_traffic_commands_status_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_traffic_commands_target_time"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "traffic_commands"`);
  }
}
