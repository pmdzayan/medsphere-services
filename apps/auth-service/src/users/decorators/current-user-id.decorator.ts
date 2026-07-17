import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // When auth guard is in place, the user is attached by passport
    // For now, fall back to a header for development
    return request.user?.sub ?? request.headers['x-user-id'];
  },
);
