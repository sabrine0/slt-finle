import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectsAndOverrides20260422000100 implements MigrationInterface {
  name = 'ProjectsAndOverrides20260422000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "organization_type" AS ENUM ('agency', 'contractor', 'ministry', 'operator');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "project_status" AS ENUM ('draft', 'active', 'sealed', 'deployed', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "override_action" AS ENUM (
          'force_phase',
          'force_green',
          'release',
          'mode_change',
          'emergency'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "override_reason_code" AS ENUM (
          'incident',
          'emergency_vehicle',
          'congestion_relief',
          'maintenance',
          'event',
          'pedestrian_safety',
          'fault_recovery',
          'drill',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "override_result" AS ENUM ('accepted', 'rejected', 'expired', 'released');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "type" "organization_type" NOT NULL DEFAULT 'agency',
        "description" varchar(255) NULL,
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "status" "project_status" NOT NULL DEFAULT 'draft',
        "clientReference" varchar(160) NULL,
        "description" varchar(255) NULL,
        "organizationId" uuid NOT NULL,
        CONSTRAINT "PK_projects" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_projects_organization_code" UNIQUE ("organizationId", "code"),
        CONSTRAINT "FK_projects_organization"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "city" varchar(120) NULL,
        "region" varchar(120) NULL,
        "latitude" numeric(10,6) NULL,
        "longitude" numeric(10,6) NULL,
        "projectId" uuid NOT NULL,
        CONSTRAINT "PK_sites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sites_project_code" UNIQUE ("projectId", "code"),
        CONSTRAINT "FK_sites_project"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "intersections"
        ADD COLUMN IF NOT EXISTS "projectId" uuid NULL,
        ADD COLUMN IF NOT EXISTS "siteId" uuid NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "intersections"
          ADD CONSTRAINT "FK_intersections_project"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "intersections"
          ADD CONSTRAINT "FK_intersections_site"
          FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "override_commands" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "action" "override_action" NOT NULL,
        "reasonCode" "override_reason_code" NOT NULL,
        "note" varchar(500) NULL,
        "result" "override_result" NOT NULL DEFAULT 'accepted',
        "durationSeconds" integer NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ipAddress" varchar(64) NULL,
        "issuedAt" timestamptz NOT NULL,
        "expiresAt" timestamptz NULL,
        "intersectionCode" varchar(64) NOT NULL,
        "intersectionId" uuid NULL,
        "operatorUserId" uuid NULL,
        CONSTRAINT "PK_override_commands" PRIMARY KEY ("id"),
        CONSTRAINT "FK_override_commands_intersection"
          FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_override_commands_user"
          FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_override_commands_issued_at"
      ON "override_commands" ("issuedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_override_commands_intersection"
      ON "override_commands" ("intersectionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_override_commands_intersection"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_override_commands_issued_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "override_commands"`);

    await queryRunner.query(`
      ALTER TABLE "intersections"
        DROP CONSTRAINT IF EXISTS "FK_intersections_site",
        DROP CONSTRAINT IF EXISTS "FK_intersections_project"
    `);

    await queryRunner.query(`
      ALTER TABLE "intersections"
        DROP COLUMN IF EXISTS "siteId",
        DROP COLUMN IF EXISTS "projectId"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "sites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "override_result"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "override_reason_code"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "override_action"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "project_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "organization_type"`);
  }
}
