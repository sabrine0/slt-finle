import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { validateEnvironment } from '../config/app.config';
import { createDatabaseOptions } from './database.options';

loadEnvironmentFiles();

const config = validateEnvironment(process.env as Record<string, unknown>);

const dataSource = new DataSource(
  createDatabaseOptions(config, {
    synchronize: false,
    migrationsRun: false,
  }),
);

export default dataSource;

function loadEnvironmentFiles() {
  const workingDirectory = process.cwd();

  for (const fileName of ['.env.local', '.env']) {
    const filePath = join(workingDirectory, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const fileContents = readFileSync(filePath, 'utf8');

    for (const line of fileContents.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
