import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

/**
 * One consistent error shape across every MedSphere service, per
 * PROJECT_RULES.md #7 ("one consistent error envelope shape across all
 * endpoints; stack traces never reach the client").
 *
 * Register once per service:
 *   app.useGlobalFilters(new GlobalExceptionFilter());
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers?.['x-request-id'] as string | undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let envelope: ErrorEnvelope = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', requestId },
    };

    if (exception instanceof DomainException) {
      status = exception.httpStatus;
      envelope = { error: { code: exception.code, message: exception.message, requestId } };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : (((body as Record<string, unknown>).message as string) ?? exception.message);
      envelope = { error: { code: exception.name, message, requestId } };
    } else {
      // Unknown/unexpected error: full detail goes to the server-side log
      // only. The client only ever sees the generic message above.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json(envelope);
  }
}
