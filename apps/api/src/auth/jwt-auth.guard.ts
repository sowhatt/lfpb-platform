import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedActor } from '../iam/domain/actor';

export interface ActorRequest {
  headers: Record<string, string | string[] | undefined>;
  actor?: AuthenticatedActor;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const [type, token] = authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Jeton d’accès manquant');
    }

    try {
      request.actor = await this.jwtService.verifyAsync<AuthenticatedActor>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER', 'lfpb-platform'),
        audience: this.config.get<string>('JWT_AUDIENCE', 'lfpb-users'),
      });
      return true;
    } catch {
      throw new UnauthorizedException('Jeton d’accès invalide ou expiré');
    }
  }
}
