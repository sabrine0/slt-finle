import { registerAs } from '@nestjs/config';

export type AiControlMode = 'advisory' | 'supervised' | 'disabled';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dbHost: string;
  dbPort: number;
  dbUsername: string;
  dbPassword: string;
  dbName: string;
  dbSsl: boolean;
  dbSynchronize: boolean;
  dbRunMigrations: boolean;
  accessTokenSecret: string;
  accessTokenTtl: string;
  refreshTokenSecret: string;
  refreshTokenTtl: string;
  deploymentSigningSecret: string;
  controllerAccessTokenSecret: string;
  controllerAccessTokenTtl: string;
  controllerHeartbeatTimeoutSeconds: number;
  bcryptSaltRounds: number;
  seedDefaultUsers: boolean;
  seedDefaultPassword: string;
  jwtIssuer: string;
  // Traffic Intelligence / AI Assist.
  //
  // GOOGLE_MAPS_API_KEY is the SERVER-SIDE key used by the Traffic
  // Intelligence module to call Google Traffic / Roads APIs. It must
  // NEVER be exposed to the browser; the frontend Maps key is a
  // separate, referrer-restricted NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
  googleMapsApiKey: string | null;
  geminiApiKey: string | null;
  aiControlMode: AiControlMode;
  aiAutoApplyReal: boolean;
  // Engineering reference layer — points to the folder that holds
  // real-world Plan RS / Dossier de Régulation / Plan Filaire /
  // Programme archives. When null, the document-ingest service
  // refuses to scan and the linked-document panels show empty.
  engineeringReferencesRoot: string | null;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): AppConfig & Record<string, unknown> {
  const nodeEnv = readString(config, 'NODE_ENV', 'development');
  const defaultSynchronize = isLocalEnvironment(nodeEnv);

  const appConfig: AppConfig = {
    nodeEnv,
    port: readNumber(config, 'PORT', 4010),
    dbHost: readString(config, 'DB_HOST', 'localhost'),
    dbPort: readNumber(config, 'DB_PORT', 5433),
    dbUsername: readString(config, 'DB_USERNAME', 'stls'),
    dbPassword: readString(config, 'DB_PASSWORD', 'stls_dev_password'),
    dbName: readString(config, 'DB_NAME', 'stls_hybrid'),
    dbSsl: readBoolean(config, 'DB_SSL', false),
    dbSynchronize: readBoolean(config, 'DB_SYNCHRONIZE', defaultSynchronize),
    dbRunMigrations: readBoolean(
      config,
      'DB_RUN_MIGRATIONS',
      !readBoolean(config, 'DB_SYNCHRONIZE', defaultSynchronize),
    ),
    accessTokenSecret: readSecret(
      config,
      'ACCESS_TOKEN_SECRET',
      'local-dev-access-secret',
      nodeEnv,
    ),
    accessTokenTtl: readString(config, 'ACCESS_TOKEN_TTL', '15m'),
    refreshTokenSecret: readSecret(
      config,
      'REFRESH_TOKEN_SECRET',
      'local-dev-refresh-secret',
      nodeEnv,
    ),
    refreshTokenTtl: readString(config, 'REFRESH_TOKEN_TTL', '7d'),
    deploymentSigningSecret: readSecret(
      config,
      'DEPLOYMENT_SIGNING_SECRET',
      'local-dev-deployment-signing-secret',
      nodeEnv,
    ),
    controllerAccessTokenSecret: readSecret(
      config,
      'CONTROLLER_ACCESS_TOKEN_SECRET',
      'local-dev-controller-access-secret',
      nodeEnv,
    ),
    controllerAccessTokenTtl: readString(
      config,
      'CONTROLLER_ACCESS_TOKEN_TTL',
      '12h',
    ),
    controllerHeartbeatTimeoutSeconds: readNumber(
      config,
      'CONTROLLER_HEARTBEAT_TIMEOUT_SECONDS',
      90,
    ),
    bcryptSaltRounds: readNumber(config, 'BCRYPT_SALT_ROUNDS', 12),
    seedDefaultUsers: readBoolean(config, 'SEED_DEFAULT_USERS', true),
    seedDefaultPassword: readString(
      config,
      'SEED_DEFAULT_PASSWORD',
      'ChangeMe123!',
    ),
    jwtIssuer: readString(config, 'JWT_ISSUER', 'stls-hybrid'),
    googleMapsApiKey: readOptionalString(config, 'GOOGLE_MAPS_API_KEY'),
    geminiApiKey: readOptionalString(config, 'GEMINI_API_KEY'),
    aiControlMode: readAiControlMode(config, 'AI_CONTROL_MODE', 'advisory'),
    aiAutoApplyReal: readBoolean(config, 'AI_AUTO_APPLY_REAL', false),
    engineeringReferencesRoot: readOptionalString(
      config,
      'STLS_ENGINEERING_REFERENCES_ROOT',
    ),
  };

  return {
    ...config,
    ...appConfig,
  };
}

const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4010),
    dbHost: process.env.DB_HOST ?? 'localhost',
    dbPort: Number(process.env.DB_PORT ?? 5433),
    dbUsername: process.env.DB_USERNAME ?? 'stls',
    dbPassword: process.env.DB_PASSWORD ?? 'stls_dev_password',
    dbName: process.env.DB_NAME ?? 'stls_hybrid',
    dbSsl: process.env.DB_SSL === 'true',
    dbSynchronize:
      process.env.DB_SYNCHRONIZE === undefined
        ? isLocalEnvironment(process.env.NODE_ENV ?? 'development')
        : process.env.DB_SYNCHRONIZE === 'true',
    dbRunMigrations:
      process.env.DB_RUN_MIGRATIONS === undefined
        ? process.env.DB_SYNCHRONIZE === undefined
          ? !isLocalEnvironment(process.env.NODE_ENV ?? 'development')
          : process.env.DB_SYNCHRONIZE !== 'true'
        : process.env.DB_RUN_MIGRATIONS === 'true',
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET ?? 'change-me-access',
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET ?? 'change-me-refresh',
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
    deploymentSigningSecret:
      process.env.DEPLOYMENT_SIGNING_SECRET ??
      'local-dev-deployment-signing-secret',
    controllerAccessTokenSecret:
      process.env.CONTROLLER_ACCESS_TOKEN_SECRET ??
      'change-me-controller-access',
    controllerAccessTokenTtl: process.env.CONTROLLER_ACCESS_TOKEN_TTL ?? '12h',
    controllerHeartbeatTimeoutSeconds: Number(
      process.env.CONTROLLER_HEARTBEAT_TIMEOUT_SECONDS ?? 90,
    ),
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
    seedDefaultUsers: process.env.SEED_DEFAULT_USERS !== 'false',
    seedDefaultPassword: process.env.SEED_DEFAULT_PASSWORD ?? 'ChangeMe123!',
    jwtIssuer: process.env.JWT_ISSUER ?? 'stls-hybrid',
    googleMapsApiKey: emptyToNull(process.env.GOOGLE_MAPS_API_KEY),
    geminiApiKey: emptyToNull(process.env.GEMINI_API_KEY),
    aiControlMode: normaliseAiMode(process.env.AI_CONTROL_MODE) ?? 'advisory',
    aiAutoApplyReal: process.env.AI_AUTO_APPLY_REAL === 'true',
    engineeringReferencesRoot: emptyToNull(
      process.env.STLS_ENGINEERING_REFERENCES_ROOT,
    ),
  }),
);

export default appConfig;

function readSecret(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
  nodeEnv: string,
) {
  const value = config[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (nodeEnv === 'production') {
    throw new Error(`Environment variable ${key} is required.`);
  }

  return fallback;
}

function isLocalEnvironment(nodeEnv: string) {
  return nodeEnv === 'development' || nodeEnv === 'local';
}

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = config[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function readNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = config[key];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);

    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  return fallback;
}

function readBoolean(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return fallback;
}

function readOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | null {
  const value = config[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function readAiControlMode(
  config: Record<string, unknown>,
  key: string,
  fallback: AiControlMode,
): AiControlMode {
  const raw = config[key];
  const normalised = normaliseAiMode(typeof raw === 'string' ? raw : undefined);
  return normalised ?? fallback;
}

function normaliseAiMode(value: string | undefined): AiControlMode | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower === 'advisory' || lower === 'supervised' || lower === 'disabled') {
    return lower;
  }
  return null;
}

function emptyToNull(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}
