import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseReservationExpiryEnvironment } from './inventory/reservation-expiry.config';
import { executeReservationExpiryWorker } from './inventory/reservation-expiry.runner';
import { ReservationExpiryService } from './inventory/reservation-expiry.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('reservation-expiry-worker');
  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseReservationExpiryEnvironment(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    const service = application.get(ReservationExpiryService);
    process.exitCode = await executeReservationExpiryWorker(service, config, logger);
  } catch {
    logger.error('Reservation expiry worker bootstrap failed', undefined, {
      category: 'unexpected',
    });
    process.exitCode = 1;
  } finally {
    await application?.close();
  }
}

void bootstrap();
