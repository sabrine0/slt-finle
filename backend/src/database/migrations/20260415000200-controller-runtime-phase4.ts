import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ControllerRuntimePhase420260415000200 implements MigrationInterface {
  name = 'ControllerRuntimePhase420260415000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createEnum(queryRunner, 'controller_type', [
      'atc',
      'nema_ts2',
      'simulation_runtime',
    ]);
    await this.createEnum(queryRunner, 'controller_deployment_state', [
      'idle',
      'pending',
      'published',
      'acknowledged',
      'applied',
      'rejected',
      'failed',
    ]);
    await this.createEnum(queryRunner, 'controller_event_type', [
      'heartbeat',
      'deployment_ack',
      'package_rejection',
      'runtime_fault',
      'communication_loss',
      'telemetry',
    ]);

    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "controllerType" "controller_type" NOT NULL DEFAULT 'atc'
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "runtimeVersion" varchar(64) NOT NULL DEFAULT '1.0.0'
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "supportedPackageSchemaVersion" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "detectorCapacity" integer NOT NULL DEFAULT 32
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "signalGroupCapacity" integer NOT NULL DEFAULT 16
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "lastDeployedPackageVersion" varchar(80)
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "lastDeploymentState" "controller_deployment_state" NOT NULL DEFAULT 'idle'
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "lastDeploymentAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "lastTelemetryAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "telemetrySummary" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      ADD COLUMN IF NOT EXISTS "lastKnownIpAddress" varchar(64)
    `);

    await queryRunner.query(`
      ALTER TABLE "detectors"
      ADD COLUMN IF NOT EXISTS "assignedPhaseSequenceNumbers" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "requiredRuntimeVersion" varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "compatibleControllerTypes" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "runtimeContractSchemaVersion" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "acknowledgedByControllerId" uuid REFERENCES "controllers" ("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      ADD COLUMN IF NOT EXISTS "controllerReportedPackageDigest" varchar(128)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "controller_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "clientId" varchar(80) NOT NULL UNIQUE,
        "secretHash" varchar(255) NOT NULL,
        "label" varchar(120) NOT NULL,
        "issuedAt" TIMESTAMPTZ NOT NULL,
        "expiresAt" TIMESTAMPTZ,
        "revokedAt" TIMESTAMPTZ,
        "lastUsedAt" TIMESTAMPTZ,
        "controllerId" uuid NOT NULL REFERENCES "controllers" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "controller_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "eventType" "controller_event_type" NOT NULL,
        "severity" "alarm_severity" NOT NULL DEFAULT 'info',
        "summary" varchar(160) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurredAt" TIMESTAMPTZ NOT NULL,
        "controllerId" uuid NOT NULL REFERENCES "controllers" ("id") ON DELETE CASCADE,
        "deploymentId" uuid REFERENCES "deployments" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_controller_events_controller_occurredAt"
      ON "controller_events" ("controllerId", "occurredAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_controller_credentials_controllerId"
      ON "controller_credentials" ("controllerId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_controller_credentials_controllerId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_controller_events_controller_occurredAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "controller_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "controller_credentials"`);

    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "controllerReportedPackageDigest"
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "acknowledgedByControllerId"
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "acknowledgedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "runtimeContractSchemaVersion"
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "compatibleControllerTypes"
    `);
    await queryRunner.query(`
      ALTER TABLE "deployments"
      DROP COLUMN IF EXISTS "requiredRuntimeVersion"
    `);

    await queryRunner.query(`
      ALTER TABLE "detectors"
      DROP COLUMN IF EXISTS "assignedPhaseSequenceNumbers"
    `);

    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "lastKnownIpAddress"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "telemetrySummary"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "lastTelemetryAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "lastDeploymentAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "lastDeploymentState"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "lastDeployedPackageVersion"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "signalGroupCapacity"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "detectorCapacity"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "supportedPackageSchemaVersion"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "runtimeVersion"
    `);
    await queryRunner.query(`
      ALTER TABLE "controllers"
      DROP COLUMN IF EXISTS "controllerType"
    `);

    await this.dropEnum(queryRunner, 'controller_event_type');
    await this.dropEnum(queryRunner, 'controller_deployment_state');
    await this.dropEnum(queryRunner, 'controller_type');
  }

  private async createEnum(
    queryRunner: QueryRunner,
    name: string,
    values: string[],
  ) {
    const valueList = values.map((value) => `'${value}'`).join(', ');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = '${name}'
        ) THEN
          CREATE TYPE "${name}" AS ENUM (${valueList});
        END IF;
      END
      $$;
    `);
  }

  private async dropEnum(queryRunner: QueryRunner, name: string) {
    await queryRunner.query(`DROP TYPE IF EXISTS "${name}"`);
  }
}
