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
import { normalizeRequestId } from '../http/request-id';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

const MAX_CLIENT_ERROR_MESSAGE_LENGTH = 512;

function boundedMessage(value: string, fallback: string): string {
  const normalized = value.trim();
  return (normalized || fallback).slice(0, MAX_CLIENT_ERROR_MESSAGE_LENGTH);
}

function normalizeHttpExceptionMessage(body: string | object, fallback: string): string {
  if (typeof body === 'string') {
    return boundedMessage(body, fallback);
  }

  const value = (body as Record<string, unknown>).message;
  if (typeof value === 'string') {
    return boundedMessage(value, fallback);
  }

  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (messages.length > 0) {
      return boundedMessage(messages.join('; '), fallback);
    }
  }

  return boundedMessage(fallback, 'Request failed.');
}

function isServerErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 500 && status <= 599;
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
    const requestId = normalizeRequestId(request.headers?.['x-request-id']);

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let envelope: ErrorEnvelope = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', requestId },
    };

    if (exception instanceof DomainException && exception.httpStatus < 500) {
      status = exception.httpStatus;
      envelope = {
        error: {
          code: exception.code,
          message: boundedMessage(exception.message, 'Request failed.'),
          requestId,
        },
      };
    } else if (exception instanceof HttpException && exception.getStatus() < 500) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const message = normalizeHttpExceptionMessage(body, exception.message);
      envelope = { error: { code: exception.name, message, requestId } };
    } else {
      if (exception instanceof HttpException && isServerErrorStatus(exception.getStatus())) {
        status = exception.getStatus();
      } else if (
        exception instanceof DomainException &&
        isServerErrorStatus(exception.httpStatus)
      ) {
        status = exception.httpStatus;
      }
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json(envelope);
  }
}
