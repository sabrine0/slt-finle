import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from './base.entity';
import {
  AlarmSeverity,
  AlarmStatus,
  ControllerConnectionState,
  ControllerDeploymentState,
  ControllerEventType,
  ControllerType,
  DeploymentStatus,
  DeploymentTargetType,
  DetectorType,
  IntersectionControlMode,
  IntersectionHealth,
  OperatingEnvironment,
  PhaseType,
  ScenarioTarget,
  TimingPlanStatus,
} from './enums';
import { ProjectEntity, SiteEntity } from './projects.entities';
import { UserEntity } from './user.entities';

@Entity({ name: 'intersections' })
export class IntersectionEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  district!: string;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'numeric', precision: 10, scale: 6 })
  latitude!: number;

  @Column({ type: 'numeric', precision: 10, scale: 6 })
  longitude!: number;

  @Column({
    type: 'enum',
    enum: IntersectionControlMode,
    enumName: 'intersection_control_mode',
    default: IntersectionControlMode.ADAPTIVE,
  })
  controlMode!: IntersectionControlMode;

  @Column({
    type: 'enum',
    enum: IntersectionHealth,
    enumName: 'intersection_health',
    default: IntersectionHealth.HEALTHY,
  })
  status!: IntersectionHealth;

  @Column({ type: 'int', default: 0 })
  queueLength!: number;

  @Column({ type: 'int', default: 0 })
  incidents!: number;

  @Column({ type: 'int', default: 0 })
  averageDelaySeconds!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeat!: Date | null;

  @OneToMany(() => ControllerEntity, (controller) => controller.intersection)
  controllers!: ControllerEntity[];

  @OneToMany(() => DetectorEntity, (detector) => detector.intersection)
  detectors!: DetectorEntity[];

  @OneToMany(() => PhaseEntity, (phase) => phase.intersection)
  phases!: PhaseEntity[];

  @OneToMany(() => TimingPlanEntity, (timingPlan) => timingPlan.intersection)
  timingPlans!: TimingPlanEntity[];

  @OneToMany(() => AlarmEntity, (alarm) => alarm.intersection)
  alarms!: AlarmEntity[];

  @OneToMany(() => EventEntity, (event) => event.intersection)
  events!: EventEntity[];

  @OneToMany(() => DeploymentEntity, (deployment) => deployment.intersection)
  deployments!: DeploymentEntity[];

  @Column({ type: 'uuid', nullable: true })
  projectId!: string | null;

  @ManyToOne(() => ProjectEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity | null;

  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @ManyToOne(() => SiteEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'siteId' })
  site!: SiteEntity | null;
}

@Entity({ name: 'controllers' })
export class ControllerEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  firmwareVersion!: string;

  @Column({
    type: 'enum',
    enum: ControllerType,
    enumName: 'controller_type',
    default: ControllerType.ATC,
  })
  controllerType!: ControllerType;

  @Column({ type: 'varchar', length: 64, default: '1.0.0' })
  runtimeVersion!: string;

  @Column({ type: 'int', default: 1 })
  supportedPackageSchemaVersion!: number;

  @Column({
    type: 'enum',
    enum: ControllerConnectionState,
    enumName: 'controller_connection_state',
    default: ControllerConnectionState.ONLINE,
  })
  connectionState!: ControllerConnectionState;

  @Column({
    type: 'enum',
    enum: OperatingEnvironment,
    enumName: 'operating_environment',
    default: OperatingEnvironment.REAL,
  })
  operatingEnvironment!: OperatingEnvironment;

  @Column({ type: 'boolean', default: true })
  batteryBacked!: boolean;

  @Column({ type: 'int', default: 0 })
  uptimeHours!: number;

  @Column({ type: 'int', default: 32 })
  detectorCapacity!: number;

  @Column({ type: 'int', default: 16 })
  signalGroupCapacity!: number;

  @Column({ type: 'boolean', default: true })
  isPrimary!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeen!: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  lastDeployedPackageVersion!: string | null;

  @Column({
    type: 'enum',
    enum: ControllerDeploymentState,
    enumName: 'controller_deployment_state',
    default: ControllerDeploymentState.IDLE,
  })
  lastDeploymentState!: ControllerDeploymentState;

  @Column({ type: 'timestamptz', nullable: true })
  lastDeploymentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastTelemetryAt!: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  telemetrySummary!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastKnownIpAddress!: string | null;

  @Column({ type: 'uuid' })
  intersectionId!: string;

  @ManyToOne(
    () => IntersectionEntity,
    (intersection) => intersection.controllers,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity;

  @OneToMany(() => DetectorEntity, (detector) => detector.controller)
  detectors!: DetectorEntity[];

  @OneToMany(() => AlarmEntity, (alarm) => alarm.controller)
  alarms!: AlarmEntity[];

  @OneToMany(() => EventEntity, (event) => event.controller)
  events!: EventEntity[];

  @OneToMany(() => DeploymentEntity, (deployment) => deployment.controller)
  deployments!: DeploymentEntity[];

  @OneToMany(
    () => ControllerCredentialEntity,
    (credential) => credential.controller,
  )
  credentials!: ControllerCredentialEntity[];

  @OneToMany(
    () => ControllerEventEntity,
    (runtimeEvent) => runtimeEvent.controller,
  )
  runtimeEvents!: ControllerEventEntity[];
}

@Entity({ name: 'detectors' })
export class DetectorEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    type: 'enum',
    enum: DetectorType,
    enumName: 'detector_type',
    default: DetectorType.LOOP,
  })
  type!: DetectorType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  laneReference!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastTriggeredAt!: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  assignedPhaseSequenceNumbers!: number[];

  @Column({ type: 'uuid' })
  intersectionId!: string;

  @ManyToOne(
    () => IntersectionEntity,
    (intersection) => intersection.detectors,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity;

  @Column({ type: 'uuid', nullable: true })
  controllerId!: string | null;

  @ManyToOne(() => ControllerEntity, (controller) => controller.detectors, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity | null;
}

@Entity({ name: 'phases' })
export class PhaseEntity extends AppBaseEntity {
  @Column({ type: 'int' })
  sequenceNumber!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'general' })
  approach!: string;

  @Column({ type: 'varchar', length: 120 })
  movementGroup!: string;

  @Column({
    type: 'enum',
    enum: PhaseType,
    enumName: 'phase_type',
    default: PhaseType.VEHICLE,
  })
  phaseType!: PhaseType;

  @Column({ type: 'int' })
  minGreenSeconds!: number;

  @Column({ type: 'int' })
  yellowSeconds!: number;

  @Column({ type: 'int' })
  redClearanceSeconds!: number;

  @Column({ type: 'int', nullable: true })
  pedestrianWalkSeconds!: number | null;

  @Column({ type: 'int', nullable: true })
  pedestrianClearSeconds!: number | null;

  @Column({ type: 'boolean', default: true })
  isProtected!: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  clearanceGroup!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedConcurrentPhaseSequenceNumbers!: number[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  conflictingPhaseSequenceNumbers!: number[];

  @Column({ type: 'uuid' })
  intersectionId!: string;

  @ManyToOne(() => IntersectionEntity, (intersection) => intersection.phases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity;
}

@Entity({ name: 'scenarios' })
export class ScenarioEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({
    type: 'enum',
    enum: ScenarioTarget,
    enumName: 'scenario_target',
    default: ScenarioTarget.SIMULATION,
  })
  appliesTo!: ScenarioTarget;

  @Column({ type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  parameters!: Record<string, unknown>;

  @OneToMany(() => TimingPlanEntity, (timingPlan) => timingPlan.scenario)
  timingPlans!: TimingPlanEntity[];

  @OneToMany(() => EventEntity, (event) => event.scenario)
  events!: EventEntity[];

  @OneToMany(() => DeploymentEntity, (deployment) => deployment.scenario)
  deployments!: DeploymentEntity[];
}

@Entity({ name: 'timing_plans' })
export class TimingPlanEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    type: 'enum',
    enum: TimingPlanStatus,
    enumName: 'timing_plan_status',
    default: TimingPlanStatus.DRAFT,
  })
  status!: TimingPlanStatus;

  @Column({ type: 'int' })
  cycleLengthSeconds!: number;

  @Column({ type: 'int', default: 0 })
  offsetSeconds!: number;

  @Column({ type: 'boolean', default: false })
  simulationOnly!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  scheduleConfig!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  planData!: Record<string, unknown>;

  @Column({ type: 'uuid' })
  intersectionId!: string;

  @ManyToOne(
    () => IntersectionEntity,
    (intersection) => intersection.timingPlans,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity;

  @Column({ type: 'uuid', nullable: true })
  scenarioId!: string | null;

  @ManyToOne(() => ScenarioEntity, (scenario) => scenario.timingPlans, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: ScenarioEntity | null;

  @OneToMany(() => DeploymentEntity, (deployment) => deployment.timingPlan)
  deployments!: DeploymentEntity[];
}

@Entity({ name: 'alarms' })
export class AlarmEntity extends AppBaseEntity {
  @Column({
    type: 'enum',
    enum: AlarmSeverity,
    enumName: 'alarm_severity',
  })
  severity!: AlarmSeverity;

  @Column({
    type: 'enum',
    enum: AlarmStatus,
    enumName: 'alarm_status',
    default: AlarmStatus.OPEN,
  })
  status!: AlarmStatus;

  @Column({
    type: 'enum',
    enum: OperatingEnvironment,
    enumName: 'alarm_environment',
    default: OperatingEnvironment.SIMULATION,
  })
  operatingEnvironment!: OperatingEnvironment;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  detail!: string;

  @Column({ type: 'timestamptz' })
  triggeredAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  acknowledgedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'acknowledgedByUserId' })
  acknowledgedByUser!: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, (intersection) => intersection.alarms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  controllerId!: string | null;

  @ManyToOne(() => ControllerEntity, (controller) => controller.alarms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity | null;
}

@Entity({ name: 'events' })
export class EventEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: OperatingEnvironment,
    enumName: 'event_environment',
    default: OperatingEnvironment.SIMULATION,
  })
  operatingEnvironment!: OperatingEnvironment;

  @Column({ type: 'varchar', length: 160 })
  summary!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, (intersection) => intersection.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  controllerId!: string | null;

  @ManyToOne(() => ControllerEntity, (controller) => controller.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity | null;

  @Column({ type: 'uuid', nullable: true })
  scenarioId!: string | null;

  @ManyToOne(() => ScenarioEntity, (scenario) => scenario.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: ScenarioEntity | null;
}

@Entity({ name: 'controller_credentials' })
export class ControllerCredentialEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 80 })
  clientId!: string;

  @Column({ type: 'varchar', length: 255 })
  secretHash!: string;

  @Column({ type: 'varchar', length: 120 })
  label!: string;

  @Column({ type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'uuid' })
  controllerId!: string;

  @ManyToOne(() => ControllerEntity, (controller) => controller.credentials, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity;
}

@Entity({ name: 'controller_events' })
export class ControllerEventEntity extends AppBaseEntity {
  @Column({
    type: 'enum',
    enum: ControllerEventType,
    enumName: 'controller_event_type',
  })
  eventType!: ControllerEventType;

  @Column({
    type: 'enum',
    enum: AlarmSeverity,
    enumName: 'alarm_severity',
    default: AlarmSeverity.INFO,
  })
  severity!: AlarmSeverity;

  @Column({ type: 'varchar', length: 160 })
  summary!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'uuid' })
  controllerId!: string;

  @ManyToOne(() => ControllerEntity, (controller) => controller.runtimeEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity;

  @Column({ type: 'uuid', nullable: true })
  deploymentId!: string | null;

  @ManyToOne(() => DeploymentEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'deploymentId' })
  deployment!: DeploymentEntity | null;
}

@Entity({ name: 'deployments' })
export class DeploymentEntity extends AppBaseEntity {
  @Column({
    type: 'enum',
    enum: DeploymentStatus,
    enumName: 'deployment_status',
    default: DeploymentStatus.DRAFT,
  })
  status!: DeploymentStatus;

  @Column({
    type: 'enum',
    enum: DeploymentTargetType,
    enumName: 'deployment_target_type',
  })
  targetType!: DeploymentTargetType;

  @Column({
    type: 'enum',
    enum: OperatingEnvironment,
    enumName: 'deployment_environment',
    default: OperatingEnvironment.SIMULATION,
  })
  targetEnvironment!: OperatingEnvironment;

  @Column({
    type: 'enum',
    enum: IntersectionControlMode,
    enumName: 'deployment_operating_mode',
    default: IntersectionControlMode.ADAPTIVE,
  })
  operatingMode!: IntersectionControlMode;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  packageManifest!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  validationReport!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, nullable: true })
  packageVersion!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  packageDigest!: string | null;

  @Column({ type: 'text', nullable: true })
  packageSignature!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requiredRuntimeVersion!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  compatibleControllerTypes!: ControllerType[];

  @Column({ type: 'int', default: 1 })
  runtimeContractSchemaVersion!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultSummary!: string | null;

  @Column({ type: 'boolean', default: false })
  isSigned!: boolean;

  @Column({ type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  signedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rolledBackAt!: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  controllerReportedPackageDigest!: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser!: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  acknowledgedByControllerId!: string | null;

  @ManyToOne(() => ControllerEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'acknowledgedByControllerId' })
  acknowledgedByController!: ControllerEntity | null;

  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(
    () => IntersectionEntity,
    (intersection) => intersection.deployments,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  controllerId!: string | null;

  @ManyToOne(() => ControllerEntity, (controller) => controller.deployments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'controllerId' })
  controller!: ControllerEntity | null;

  @Column({ type: 'uuid', nullable: true })
  timingPlanId!: string | null;

  @ManyToOne(() => TimingPlanEntity, (timingPlan) => timingPlan.deployments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'timingPlanId' })
  timingPlan!: TimingPlanEntity | null;

  @Column({ type: 'uuid', nullable: true })
  scenarioId!: string | null;

  @ManyToOne(() => ScenarioEntity, (scenario) => scenario.deployments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: ScenarioEntity | null;

  @Column({ type: 'uuid', nullable: true })
  rollbackOfDeploymentId!: string | null;

  @ManyToOne(() => DeploymentEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'rollbackOfDeploymentId' })
  rollbackOfDeployment!: DeploymentEntity | null;

  @Column({ type: 'uuid', nullable: true })
  supersededByDeploymentId!: string | null;

  @ManyToOne(() => DeploymentEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'supersededByDeploymentId' })
  supersededByDeployment!: DeploymentEntity | null;
}
