import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
export interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
        requestId?: string;
    };
}
export declare class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger;
    catch(exception: unknown, host: ArgumentsHost): void;
}
