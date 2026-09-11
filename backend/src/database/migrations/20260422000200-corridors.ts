import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Corridors20260422000200 implements MigrationInterface {
  name = 'Corridors20260422000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corridors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "description" varchar(255) NULL,
        "city" varchar(120) NULL,
        "region" varchar(120) NULL,
        "projectId" uuid NULL,
        "activeScenarioCode" varchar(64) NOT NULL DEFAULT 'normal_traffic',
        "activeScenarioActivatedAt" timestamptz NULL,
        "activeScenarioActivatedByUserId" uuid NULL,
        CONSTRAINT "PK_corridors" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_corridors_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corridor_intersections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "corridorId" uuid NOT NULL,
        "orderIndex" integer NOT NULL,
        "intersectionCode" varchar(64) NOT NULL,
        "intersectionId" uuid NULL,
        "plannedOffsetSeconds" integer NOT NULL DEFAULT 0,
        "primaryBearing" varchar(1) NULL,
        CONSTRAINT "PK_corridor_intersections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_corridor_intersections_corridor_order" UNIQUE ("corridorId", "orderIndex"),
        CONSTRAINT "UQ_corridor_intersections_corridor_code" UNIQUE ("corridorId", "intersectionCode"),
        CONSTRAINT "FK_corridor_intersections_corridor"
          FOREIGN KEY ("corridorId") REFERENCES "corridors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_corridor_intersections_intersection"
          FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_corridor_intersections_corridor"
      ON "corridor_intersections" ("corridorId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corridor_scenario_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "corridorId" uuid NOT NULL,
        "scenarioCode" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "lastActivatedAt" timestamptz NULL,
        CONSTRAINT "PK_corridor_scenario_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_corridor_scenario_assignments_code" UNIQUE ("corridorId", "scenarioCode"),
        CONSTRAINT "FK_corridor_scenario_assignments_corridor"
          FOREIGN KEY ("corridorId") REFERENCES "corridors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_corridor_scenario_assignments_corridor"
      ON "corridor_scenario_assignments" ("corridorId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corridor_control_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "corridorId" uuid NOT NULL,
        "controlKind" varchar(64) NOT NULL,
        "targetIntersectionCode" varchar(64) NULL,
        "targetBearing" varchar(1) NULL,
        "scenarioCode" varchar(64) NULL,
        "reasonCode" varchar(64) NOT NULL,
        "note" varchar(500) NULL,
        "releaseNote" varchar(500) NULL,
        "status" varchar(64) NOT NULL DEFAULT 'active',
        "dispatchLog" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "startedAt" timestamptz NOT NULL,
        "expectedEndAt" timestamptz NULL,
        "releasedAt" timestamptz NULL,
        "durationSeconds" integer NULL,
        "outranksAi" boolean NOT NULL DEFAULT false,
        "operatorUserId" uuid NULL,
        "releasedByUserId" uuid NULL,
        CONSTRAINT "PK_corridor_control_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_corridor_control_sessions_corridor"
          FOREIGN KEY ("corridorId") REFERENCES "corridors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_corridor_control_sessions_operator"
          FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_corridor_control_sessions_released_by"
          FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_corridor_control_sessions_corridor"
      ON "corridor_control_sessions" ("corridorId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_corridor_control_sessions_status"
      ON "corridor_control_sessions" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_corridor_control_sessions_started_at"
      ON "corridor_control_sessions" ("startedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_corridor_control_sessions_started_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_corridor_control_sessions_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_corridor_control_sessions_corridor"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "corridor_control_sessions"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_corridor_scenario_assignments_corridor"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "corridor_scenario_assignments"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_corridor_intersections_corridor"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "corridor_intersections"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "corridors"`);
  }
}
