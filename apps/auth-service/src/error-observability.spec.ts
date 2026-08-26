import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '@medsphere/common';
import type { ServiceLogger } from '@medsphere/logger';

function createLoggerFixture() {
  return {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } satisfies ServiceLogger;
}

function createHttpHost(requestId: string) {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };

  response.status.mockReturnValue(response);

  const request = {
    headers: {
      'x-request-id': requestId,
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    response,
  };
}

describe('server error observability', () => {
  it('records bounded correlated metadata without logging raw exception details', () => {
    const logger = createLoggerFixture();
    const filter = new GlobalExceptionFilter(logger);

    const { host, response } = createHttpHost('request-safe-123');

    const exception = new Error(
      'postgresql://operator:super-secret@database.internal:5432/medsphere',
    );

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'request-safe-123',
      },
    });

    expect(logger.error).toHaveBeenCalledWith('Unhandled HTTP exception', undefined, {
      requestId: 'request-safe-123',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorType: 'Error',
    });

    const telemetry = JSON.stringify(logger.error.mock.calls);

    expect(telemetry).not.toContain('operator');
    expect(telemetry).not.toContain('super-secret');
    expect(telemetry).not.toContain('database.internal');
  });

  it('preserves an upstream 5xx status while hiding its private message', () => {
    const logger = createLoggerFixture();
    const filter = new GlobalExceptionFilter(logger);

    const { host, response } = createHttpHost('request-safe-456');

    filter.catch(
      new HttpException('private upstream infrastructure detail', HttpStatus.BAD_GATEWAY),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'request-safe-456',
      },
    });

    expect(logger.error).toHaveBeenCalledWith('Unhandled HTTP exception', undefined, {
      requestId: 'request-safe-456',
      status: HttpStatus.BAD_GATEWAY,
      errorType: 'HttpException',
    });

    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'private upstream infrastructure detail',
    );
  });
});
