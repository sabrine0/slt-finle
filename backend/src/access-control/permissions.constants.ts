export const permissionCatalog = [
  {
    code: 'command-platform.read',
    description: 'Read live command platform telemetry and operational status.',
  },
  {
    code: 'command-platform.control',
    description:
      'Execute operational actions such as scenario runs and stop commands.',
  },
  {
    code: 'engineering.read',
    description: 'Read engineering configuration resources.',
  },
  {
    code: 'intersections.manage',
    description: 'Create and update intersections.',
  },
  {
    code: 'controllers.manage',
    description: 'Create and update controllers.',
  },
  {
    code: 'detectors.manage',
    description: 'Create and update detectors.',
  },
  {
    code: 'phases.manage',
    description: 'Create and update signal phases.',
  },
  {
    code: 'timing-plans.manage',
    description: 'Create and update timing plans.',
  },
  {
    code: 'scenarios.manage',
    description: 'Create and update traffic scenarios.',
  },
  {
    code: 'scenarios.execute',
    description: 'Execute scenario actions in the command platform.',
  },
  {
    code: 'deployments.manage',
    description: 'Queue and track deployments.',
  },
  {
    code: 'deployments.validate',
    description: 'Run deployment safety validation.',
  },
  {
    code: 'deployments.sign',
    description: 'Sign deployment packages for release.',
  },
  {
    code: 'deployments.publish',
    description: 'Publish signed deployment packages.',
  },
  {
    code: 'deployments.rollback',
    description: 'Roll back published deployment packages.',
  },
  {
    code: 'alarms.read',
    description: 'Read alarm feeds.',
  },
  {
    code: 'events.read',
    description: 'Read operations events.',
  },
  {
    code: 'users.manage',
    description: 'Create and manage users.',
  },
  {
    code: 'roles.manage',
    description: 'Create and manage roles and permissions.',
  },
  {
    code: 'audit.read',
    description: 'Read audit logs.',
  },
] as const;

export const roleCatalog = [
  {
    name: 'police',
    displayName: 'Police',
    description: 'Police authorities with emergency operational access.',
    permissions: [
      'command-platform.read',
      'command-platform.control',
      'scenarios.execute',
      'alarms.read',
      'events.read',
    ],
  },
  {
    name: 'operator',
    displayName: 'Operator',
    description: 'Traffic operators responsible for the command platform.',
    permissions: [
      'command-platform.read',
      'command-platform.control',
      'scenarios.execute',
      'alarms.read',
      'events.read',
    ],
  },
  {
    name: 'engineer',
    displayName: 'Engineer',
    description: 'Engineers maintaining signal logic and deployment workflows.',
    permissions: [
      'command-platform.read',
      'engineering.read',
      'intersections.manage',
      'controllers.manage',
      'detectors.manage',
      'phases.manage',
      'timing-plans.manage',
      'scenarios.manage',
      'deployments.manage',
      'deployments.validate',
      'deployments.sign',
      'deployments.publish',
      'deployments.rollback',
      'alarms.read',
      'events.read',
    ],
  },
  {
    name: 'admin',
    displayName: 'Admin',
    description: 'Platform administrators with full access.',
    permissions: permissionCatalog.map((permission) => permission.code),
  },
  {
    name: 'maintenance',
    displayName: 'Maintenance',
    description: 'Maintenance users focused on controller supervision.',
    permissions: [
      'command-platform.read',
      'engineering.read',
      'controllers.manage',
      'alarms.read',
      'events.read',
    ],
  },
] as const;

export type PermissionCode = (typeof permissionCatalog)[number]['code'];
export type RoleName = (typeof roleCatalog)[number]['name'];
