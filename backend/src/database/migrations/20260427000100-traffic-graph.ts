import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TrafficGraph20260427000100 implements MigrationInterface {
  name = 'TrafficGraph20260427000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "region" varchar(120) NULL,
        "countryIso" varchar(8) NOT NULL DEFAULT 'MA',
        "centroidLat" numeric(10,6) NULL,
        "centroidLng" numeric(10,6) NULL,
        CONSTRAINT "PK_cities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cities_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "carrefours" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(200) NOT NULL,
        "cityId" uuid NULL,
        "engineeringIntersectionId" uuid NULL,
        "primaryControllerId" uuid NULL,
        "lat" numeric(10,6) NOT NULL,
        "lng" numeric(10,6) NOT NULL,
        "intersectionType" varchar(64) NOT NULL DEFAULT 'cross',
        "regulationType" varchar(32) NOT NULL DEFAULT 'signalized',
        "saturationScore" numeric(6,3) NULL,
        "criticalityScore" numeric(6,3) NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_carrefours" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carrefours_code" UNIQUE ("code"),
        CONSTRAINT "FK_carrefours_city"
          FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_carrefours_engineering_intersection"
          FOREIGN KEY ("engineeringIntersectionId") REFERENCES "intersections"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_carrefours_primary_controller"
          FOREIGN KEY ("primaryControllerId") REFERENCES "controllers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_carrefours_city" ON "carrefours" ("cityId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "intersection_branches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "carrefourId" uuid NOT NULL,
        "direction" varchar(4) NOT NULL,
        "label" varchar(200) NULL,
        "isIncoming" boolean NOT NULL DEFAULT true,
        "isOutgoing" boolean NOT NULL DEFAULT true,
        "laneCount" integer NULL,
        "widthMetres" numeric(7,2) NULL,
        "lengthMetres" numeric(8,2) NULL,
        "storageLengthMetres" numeric(8,2) NULL,
        "branchClass" varchar(64) NULL,
        CONSTRAINT "PK_intersection_branches" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branches_carrefour_direction" UNIQUE ("carrefourId", "direction"),
        CONSTRAINT "FK_branches_carrefour"
          FOREIGN KEY ("carrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branches_carrefour" ON "intersection_branches" ("carrefourId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lane_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "branchId" uuid NOT NULL,
        "laneIndex" integer NOT NULL,
        "widthMetres" numeric(6,2) NULL,
        "allowedMovements" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reservedMode" varchar(32) NULL,
        "hourlyCapacity" integer NULL,
        CONSTRAINT "PK_lane_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lanes_branch_index" UNIQUE ("branchId", "laneIndex"),
        CONSTRAINT "FK_lanes_branch"
          FOREIGN KEY ("branchId") REFERENCES "intersection_branches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_lanes_branch" ON "lane_details" ("branchId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "movements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "carrefourId" uuid NOT NULL,
        "fromDirection" varchar(4) NOT NULL,
        "toDirection" varchar(4) NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'allowed',
        "protected" boolean NOT NULL DEFAULT false,
        "priorityLevel" integer NULL,
        "hasConflict" boolean NOT NULL DEFAULT false,
        "conflictMovementIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT "PK_movements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_movements_carrefour_pair" UNIQUE ("carrefourId", "fromDirection", "toDirection"),
        CONSTRAINT "FK_movements_carrefour"
          FOREIGN KEY ("carrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_movements_carrefour" ON "movements" ("carrefourId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connected_intersections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "fromCarrefourId" uuid NOT NULL,
        "toCarrefourId" uuid NOT NULL,
        "relationKind" varchar(32) NOT NULL DEFAULT 'corridor',
        "distanceMetres" numeric(9,2) NULL,
        "travelTimeSeconds" numeric(8,2) NULL,
        "queueSpillbackRisk" numeric(5,3) NULL,
        "geometry" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_connected_intersections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_connected_pair_kind" UNIQUE ("fromCarrefourId", "toCarrefourId", "relationKind"),
        CONSTRAINT "FK_connected_from"
          FOREIGN KEY ("fromCarrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_connected_to"
          FOREIGN KEY ("toCarrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connected_from" ON "connected_intersections" ("fromCarrefourId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connected_to" ON "connected_intersections" ("toCarrefourId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "traffic_observations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "carrefourId" uuid NOT NULL,
        "branchId" uuid NULL,
        "observedAt" timestamptz NOT NULL,
        "flowVehiclesPerHour" numeric(8,2) NULL,
        "averageSpeedKph" numeric(6,2) NULL,
        "queueLengthMetres" numeric(8,2) NULL,
        "delaySeconds" numeric(8,2) NULL,
        "sourceType" varchar(32) NOT NULL DEFAULT 'derived',
        "confidence" numeric(5,3) NULL,
        CONSTRAINT "PK_traffic_observations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_observations_carrefour"
          FOREIGN KEY ("carrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_observations_branch"
          FOREIGN KEY ("branchId") REFERENCES "intersection_branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_observations_carrefour_time" ON "traffic_observations" ("carrefourId", "observedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_observations_branch_time" ON "traffic_observations" ("branchId", "observedAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mirofish_agent_outputs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "carrefourId" uuid NOT NULL,
        "branchId" uuid NULL,
        "agentName" varchar(80) NOT NULL,
        "impactScore" numeric(6,3) NOT NULL,
        "confidence" numeric(5,3) NOT NULL,
        "detectedIssue" varchar(200) NULL,
        "affectedMovements" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "recommendation" text NULL,
        "producedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_mirofish_agent_outputs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mirofish_carrefour"
          FOREIGN KEY ("carrefourId") REFERENCES "carrefours"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mirofish_branch"
          FOREIGN KEY ("branchId") REFERENCES "intersection_branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mirofish_carrefour_time" ON "mirofish_agent_outputs" ("carrefourId", "producedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mirofish_agent_time" ON "mirofish_agent_outputs" ("agentName", "producedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mirofish_agent_outputs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "traffic_observations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connected_intersections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lane_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "intersection_branches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carrefours"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cities"`);
  }
}
