import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AgentSchedulerService } from './agents/agent-scheduler.service';
import { AppModule } from './app.module';

const processLogger = new Logger('Process');

// A background task that rejects without a catch (e.g. the agent
// scheduler's fire-and-forget command execution) makes Node exit with
// code 1 by default, which was silently killing the backend mid-cycle.
// Log the failure with its stack and keep the process alive instead.
process.on('unhandledRejection', (reason) => {
  processLogger.error(
    `Unhandled promise rejection: ${
      reason instanceof Error ? reason.message : String(reason)
    }`,
    reason instanceof Error ? reason.stack : undefined,
  );
});
process.on('uncaughtException', (err) => {
  processLogger.error(`Uncaught exception: ${err.message}`, err.stack);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuredPort = process.env.PORT ?? 4010;

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(configuredPort);

  // Arm the agent loop only once the API is actually serving, so its
  // DB-heavy cycles never compete with the bootstrap seeders.
  app.get(AgentSchedulerService, { strict: false }).start();
}
void bootstrap();
