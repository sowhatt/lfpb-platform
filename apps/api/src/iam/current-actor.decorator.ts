import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorRequest } from '../auth/jwt-auth.guard';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<ActorRequest>().actor,
);
