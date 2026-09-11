import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductionFoundationPhase320260415000100 implements MigrationInterface {
  name = 'ProductionFoundationPhase320260415000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await this.createEnum(queryRunner, 'intersection_control_mode', [
      'adaptive',
      'manual',
      'fixed',
      'emergency',
      'flash',
      'fail-safe',
    ]);
    await this.createEnum(queryRunner, 'intersection_health', [
      'healthy',
      'watch',
      'critical',
    ]);
    await this.createEnum(queryRunner, 'controller_connection_state', [
      'online',
      'degraded',
      'offline',
    ]);
    await this.createEnum(queryRunner, 'operating_environment', [
      'real',
      'simulation',
    ]);
    await this.createEnum(queryRunner, 'detector_type', [
      'loop',
      'camera',
      'radar',
      'pedestrian_button',
    ]);
    await this.createEnum(queryRunner, 'phase_type', [
      'vehicle',
      'pedestrian',
      'transit',
    ]);
    await this.createEnum(queryRunner, 'scenario_target', [
      'real',
      'simulation',
      'both',
    ]);
    await this.createEnum(queryRunner, 'timing_plan_status', [
      'draft',
      'active',
      'retired',
    ]);
    await this.createEnum(queryRunner, 'alarm_severity', [
      'info',
      'warning',
      'critical',
    ]);
    await this.createEnum(queryRunner, 'alarm_status', [
      'open',
      'acknowledged',
      'resolved',
    ]);
    await this.createEnum(queryRunner, 'alarm_environment', [
      'real',
      'simulation',
    ]);
    await this.createEnum(queryRunner, 'event_environment', [
      'real',
      'simulation',
    ]);
    await this.createEnum(queryRunner, 'deployment_status', [
      'draft',
      'validated',
      'signed',
      'published',
      'rolled_back',
      'superseded',
      'queued',
      'in_progress',
      'completed',
      'failed',
    ]);
    await this.createEnum(queryRunner, 'deployment_target_type', [
      'timing_plan',
      'scenario',
      'config',
    ]);
    await this.createEnum(queryRunner, 'deployment_environment', [
      'real',
      'simulation',
    ]);
    await this.createEnum(queryRunner, 'deployment_operating_mode', [
      'adaptive',
      'manual',
      'fixed',
      'emergency',
      'flash',
      'fail-safe',
    ]);
    await this.createEnum(queryRunner, 'audit_outcome', ['success', 'failure']);

    await this.createAccessControlTables(queryRunner);
    await this.createTrafficDomainTables(queryRunner);
    await this.patchPhase3Columns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deployments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alarms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timing_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scenarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "phases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "detectors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "controllers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "intersections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);

    await this.dropEnum(queryRunner, 'audit_outcome');
    await this.dropEnum(queryRunner, 'deployment_operating_mode');
    await this.dropEnum(queryRunner, 'deployment_environment');
    await this.dropEnum(queryRunner, 'deployment_target_type');
    await this.dropEnum(queryRunner, 'deployment_status');
    await this.dropEnum(queryRunner, 'event_environment');
    await this.dropEnum(queryRunner, 'alarm_environment');
    await this.dropEnum(queryRunner, 'alarm_status');
    await this.dropEnum(queryRunner, 'alarm_severity');
    await this.dropEnum(queryRunner, 'timing_plan_status');
    await this.dropEnum(queryRunner, 'scenario_target');
    await this.dropEnum(queryRunner, 'phase_type');
    await this.dropEnum(queryRunner, 'detector_type');
    await this.dropEnum(queryRunner, 'operating_environment');
    await this.dropEnum(queryRunner, 'controller_connection_state');
    await this.dropEnum(queryRunner, 'intersection_health');
    await this.dropEnum(queryRunner, 'intersection_control_mode');
  }

  private async createAccessControlTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(120) NOT NULL UNIQUE,
        "description" varchar(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(64) NOT NULL UNIQUE,
        "displayName" varchar(120) NOT NULL,
        "description" varchar(255)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "email" varchar(160) NOT NULL UNIQUE,
        "fullName" varchar(160) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "mfaEnabled" boolean NOT NULL DEFAULT false,
        "lastLoginAt" TIMESTAMPTZ,
        "passwordChangedAt" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "tokenHash" varchar(255) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "revokedAt" TIMESTAMPTZ,
        "replacedByTokenId" uuid,
        "userAgent" varchar(255),
        "ipAddress" varchar(64),
        "isCompromised" boolean NOT NULL DEFAULT false,
        "deviceName" varchar(160),
        "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "action" varchar(120) NOT NULL,
        "resourceType" varchar(120) NOT NULL,
        "resourceId" varchar(120),
        "outcome" "audit_outcome" NOT NULL DEFAULT 'success',
        "method" varchar(16) NOT NULL,
        "route" varchar(255) NOT NULL,
        "ipAddress" varchar(64),
        "userAgent" varchar(255),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "actorUserId" uuid REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "role_id" uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
        PRIMARY KEY ("user_id", "role_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id" uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
        "permission_id" uuid NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
        PRIMARY KEY ("role_id", "permission_id")
      )
    `);
  }

  private async createTrafficDomainTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "intersections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(64) NOT NULL UNIQUE,
        "name" varchar(160) NOT NULL,
        "district" varchar(120) NOT NULL,
        "address" varchar(255) NOT NULL,
        "latitude" numeric(10, 6) NOT NULL,
        "longitude" numeric(10, 6) NOT NULL,
        "controlMode" "intersection_control_mode" NOT NULL DEFAULT 'adaptive',
        "status" "intersection_health" NOT NULL DEFAULT 'healthy',
        "queueLength" integer NOT NULL DEFAULT 0,
        "incidents" integer NOT NULL DEFAULT 0,
        "averageDelaySeconds" integer NOT NULL DEFAULT 0,
        "lastHeartbeat" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "controllers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(80) NOT NULL UNIQUE,
        "firmwareVersion" varchar(64) NOT NULL,
        "connectionState" "controller_connection_state" NOT NULL DEFAULT 'online',
        "operatingEnvironment" "operating_environment" NOT NULL DEFAULT 'real',
        "batteryBacked" boolean NOT NULL DEFAULT true,
        "uptimeHours" integer NOT NULL DEFAULT 0,
        "isPrimary" boolean NOT NULL DEFAULT true,
        "lastSeen" TIMESTAMPTZ,
        "intersectionId" uuid NOT NULL REFERENCES "intersections" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "detectors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(80) NOT NULL UNIQUE,
        "name" varchar(120) NOT NULL,
        "type" "detector_type" NOT NULL DEFAULT 'loop',
        "laneReference" varchar(80),
        "isActive" boolean NOT NULL DEFAULT true,
        "lastTriggeredAt" TIMESTAMPTZ,
        "intersectionId" uuid NOT NULL REFERENCES "intersections" ("id") ON DELETE CASCADE,
        "controllerId" uuid REFERENCES "controllers" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "phases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "sequenceNumber" integer NOT NULL,
        "name" varchar(120) NOT NULL,
        "approach" varchar(32) NOT NULL DEFAULT 'general',
        "movementGroup" varchar(120) NOT NULL,
        "phaseType" "phase_type" NOT NULL DEFAULT 'vehicle',
        "minGreenSeconds" integer NOT NULL,
        "yellowSeconds" integer NOT NULL,
        "redClearanceSeconds" integer NOT NULL,
        "pedestrianWalkSeconds" integer,
        "pedestrianClearSeconds" integer,
        "isProtected" boolean NOT NULL DEFAULT true,
        "clearanceGroup" varchar(80),
        "allowedConcurrentPhaseSequenceNumbers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "conflictingPhaseSequenceNumbers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "intersectionId" uuid NOT NULL REFERENCES "intersections" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scenarios" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(80) NOT NULL UNIQUE,
        "name" varchar(120) NOT NULL,
        "description" varchar(255) NOT NULL,
        "appliesTo" "scenario_target" NOT NULL DEFAULT 'simulation',
        "isSystem" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT false,
        "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timing_plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(80) NOT NULL UNIQUE,
        "name" varchar(120) NOT NULL,
        "status" "timing_plan_status" NOT NULL DEFAULT 'draft',
        "cycleLengthSeconds" integer NOT NULL,
        "offsetSeconds" integer NOT NULL DEFAULT 0,
        "simulationOnly" boolean NOT NULL DEFAULT false,
        "scheduleConfig" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "planData" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "intersectionId" uuid NOT NULL REFERENCES "intersections" ("id") ON DELETE CASCADE,
        "scenarioId" uuid REFERENCES "scenarios" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alarms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "severity" "alarm_severity" NOT NULL,
        "status" "alarm_status" NOT NULL DEFAULT 'open',
        "operatingEnvironment" "alarm_environment" NOT NULL DEFAULT 'simulation',
        "title" varchar(160) NOT NULL,
        "detail" varchar(500) NOT NULL,
        "triggeredAt" TIMESTAMPTZ NOT NULL,
        "acknowledgedAt" TIMESTAMPTZ,
        "acknowledgedByUserId" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "intersectionId" uuid REFERENCES "intersections" ("id") ON DELETE SET NULL,
        "controllerId" uuid REFERENCES "controllers" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "eventType" varchar(120) NOT NULL,
        "operatingEnvironment" "event_environment" NOT NULL DEFAULT 'simulation',
        "summary" varchar(160) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurredAt" TIMESTAMPTZ NOT NULL,
        "intersectionId" uuid REFERENCES "intersections" ("id") ON DELETE SET NULL,
        "controllerId" uuid REFERENCES "controllers" ("id") ON DELETE SET NULL,
        "scenarioId" uuid REFERENCES "scenarios" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deployments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "status" "deployment_status" NOT NULL DEFAULT 'draft',
        "targetType" "deployment_target_type" NOT NULL,
        "targetEnvironment" "deployment_environment" NOT NULL DEFAULT 'simulation',
        "operatingMode" "deployment_operating_mode" NOT NULL DEFAULT 'adaptive',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "packageManifest" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "validationReport" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "packageVersion" varchar(80),
        "packageDigest" varchar(128),
        "packageSignature" text,
        "resultSummary" varchar(255),
        "isSigned" boolean NOT NULL DEFAULT false,
        "requestedAt" TIMESTAMPTZ NOT NULL,
        "validatedAt" TIMESTAMPTZ,
        "signedAt" TIMESTAMPTZ,
        "publishedAt" TIMESTAMPTZ,
        "completedAt" TIMESTAMPTZ,
        "rolledBackAt" TIMESTAMPTZ,
        "requestedByUserId" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "intersectionId" uuid REFERENCES "intersections" ("id") ON DELETE SET NULL,
        "controllerId" uuid REFERENCES "controllers" ("id") ON DELETE SET NULL,
        "timingPlanId" uuid REFERENCES "timing_plans" ("id") ON DELETE SET NULL,
        "scenarioId" uuid REFERENCES "scenarios" ("id") ON DELETE SET NULL,
        "rollbackOfDeploymentId" uuid REFERENCES "deployments" ("id") ON DELETE SET NULL,
        "supersededByDeploymentId" uuid REFERENCES "deployments" ("id") ON DELETE SET NULL
      )
    `);
  }

  private async patchPhase3Columns(queryRunner: QueryRunner) {
    await queryRunner.query(`
      ALTER TABLE "phases"
      ADD COLUMN IF NOT EXISTS "approach" varchar(32) NOT NULL DEFAULT 'general'
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
      ADD COLUMN IF NOT EXISTS "phaseType" "phase_type" NOT NULL DEFAULT 'vehicle'
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
      ADD COLUMN IF NOT EXISTS "clearanceGroup" varchar(80)
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
      ADD COLUMN IF NOT EXISTS "allowedConcurrentPhaseSequenceNumbers" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "phases"
      ADD COLUMN IF NOT EXISTS "conflictingPhaseSequenceNumbers" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "operatingMode" "deployment_operating_mode" NOT NULL DEFAULT 'adaptive'
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "packageManifest" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "validationReport" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "packageVersion" varchar(80)
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "packageDigest" varchar(128)
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "packageSignature" text
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "rolledBackAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "rollbackOfDeploymentId" uuid REFERENCES "deployments" ("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "supersededByDeploymentId" uuid REFERENCES "deployments" ("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_phases_intersection_sequence"
      ON "phases" ("intersectionId", "sequenceNumber")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_deployments_scope"
      ON "deployments" ("intersectionId", "targetEnvironment", "targetType")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_environment_occurred"
      ON "events" ("operatingEnvironment", "occurredAt")
    `);
  }

  private async createEnum(
    queryRunner: QueryRunner,
    enumName: string,
    enumValues: string[],
  ) {
    const values = enumValues.map((value) => `'${value}'`).join(', ');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${enumName}') THEN
          CREATE TYPE "${enumName}" AS ENUM (${values});
        END IF;
      END $$;
    `);
  }

  private async dropEnum(queryRunner: QueryRunner, enumName: string) {
    await queryRunner.query(`DROP TYPE IF EXISTS "${enumName}"`);
  }
}
