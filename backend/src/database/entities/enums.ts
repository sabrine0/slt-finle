export enum OperatingEnvironment {
  REAL = 'real',
  SIMULATION = 'simulation',
}

export enum IntersectionControlMode {
  ADAPTIVE = 'adaptive',
  MANUAL = 'manual',
  FIXED = 'fixed',
  EMERGENCY = 'emergency',
  FLASH = 'flash',
  FAIL_SAFE = 'fail-safe',
}

export enum IntersectionHealth {
  HEALTHY = 'healthy',
  WATCH = 'watch',
  CRITICAL = 'critical',
}

export enum ControllerConnectionState {
  ONLINE = 'online',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
}

export enum ControllerType {
  ATC = 'atc',
  NEMA_TS2 = 'nema_ts2',
  SIMULATION_RUNTIME = 'simulation_runtime',
}

export enum ControllerDeploymentState {
  IDLE = 'idle',
  PENDING = 'pending',
  PUBLISHED = 'published',
  ACKNOWLEDGED = 'acknowledged',
  APPLIED = 'applied',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export enum ControllerEventType {
  HEARTBEAT = 'heartbeat',
  DEPLOYMENT_ACK = 'deployment_ack',
  PACKAGE_REJECTION = 'package_rejection',
  RUNTIME_FAULT = 'runtime_fault',
  COMMUNICATION_LOSS = 'communication_loss',
  TELEMETRY = 'telemetry',
}

export enum DetectorType {
  LOOP = 'loop',
  CAMERA = 'camera',
  RADAR = 'radar',
  PEDESTRIAN_BUTTON = 'pedestrian_button',
}

export enum PhaseType {
  VEHICLE = 'vehicle',
  PEDESTRIAN = 'pedestrian',
  TRANSIT = 'transit',
}

export enum TimingPlanStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  RETIRED = 'retired',
}

export enum AlarmSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlarmStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

export enum ScenarioTarget {
  REAL = 'real',
  SIMULATION = 'simulation',
  BOTH = 'both',
}

export enum DeploymentStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  SIGNED = 'signed',
  PUBLISHED = 'published',
  ROLLED_BACK = 'rolled_back',
  SUPERSEDED = 'superseded',
  QUEUED = 'queued',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum DeploymentTargetType {
  TIMING_PLAN = 'timing_plan',
  SCENARIO = 'scenario',
  CONFIG = 'config',
}

export enum AuditOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export enum OrganizationType {
  AGENCY = 'agency',
  CONTRACTOR = 'contractor',
  MINISTRY = 'ministry',
  OPERATOR = 'operator',
}

export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SEALED = 'sealed',
  DEPLOYED = 'deployed',
  ARCHIVED = 'archived',
}

export enum OverrideAction {
  FORCE_PHASE = 'force_phase',
  FORCE_GREEN = 'force_green',
  RELEASE = 'release',
  MODE_CHANGE = 'mode_change',
  EMERGENCY = 'emergency',
}

export enum OverrideReasonCode {
  INCIDENT = 'incident',
  EMERGENCY_VEHICLE = 'emergency_vehicle',
  CONGESTION_RELIEF = 'congestion_relief',
  MAINTENANCE = 'maintenance',
  EVENT = 'event',
  PEDESTRIAN_SAFETY = 'pedestrian_safety',
  FAULT_RECOVERY = 'fault_recovery',
  DRILL = 'drill',
  OTHER = 'other',
}

export enum OverrideResult {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  RELEASED = 'released',
}
