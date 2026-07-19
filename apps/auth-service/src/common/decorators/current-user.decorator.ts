import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Record<string, unknown> => {
    const request = ctx.switchToHttp().getRequest();
    return request.user ?? {};
  },
);
