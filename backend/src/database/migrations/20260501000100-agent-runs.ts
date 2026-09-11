import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentRuns20260501000100 implements MigrationInterface {
  name = 'AgentRuns20260501000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "scope" varchar(16) NOT NULL,
        "scopeRef" varchar(80) NOT NULL,
        "horizon" varchar(8) NOT NULL,
        "generatedAt" timestamptz NOT NULL,
        "durationMs" integer NOT NULL DEFAULT 0,
        "agentCount" integer NOT NULL DEFAULT 0,
        "aggregatedSeverity" varchar(16) NOT NULL DEFAULT 'info',
        "finalKind" varchar(64) NULL,
        "finalSeverity" varchar(16) NULL,
        "finalOverride" boolean NOT NULL DEFAULT false,
        "trigger" varchar(16) NOT NULL DEFAULT 'scheduled',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_agent_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_runs_scope_time"
        ON "agent_runs" ("scope", "scopeRef", "generatedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_runs_severity_time"
        ON "agent_runs" ("aggregatedSeverity", "generatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agent_runs_severity_time"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_runs_scope_time"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runs"`);
  }
}
