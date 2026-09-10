import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: { organizationId: true, role: true },
        },
      },
    });

    const passwordMatches =
      user?.active === true
        ? await compare(input.password, user.passwordHash)
        : false;

    this.logger.log(
      `AUTH_PASSWORD_DIAG email=${input.email.trim().toLowerCase()} receivedLen=${input.password.length} envLen=${process.env.SEED_OFFICIAL_PASSWORD?.length ?? 0} inputMatchesEnv=${input.password === process.env.SEED_OFFICIAL_PASSWORD}`,
    );

    if (!user?.active || !passwordMatches) {
      this.logger.warn(
        `AUTH_LOGIN_FAILED email=${input.email.trim().toLowerCase()} userFound=${Boolean(user)} active=${Boolean(user?.active)} passwordMatch=${passwordMatches}`,
      );
      throw new UnauthorizedException('Identifiants invalides');
    }

    this.logger.log(
      `AUTH_LOGIN_SUCCESS email=${user.email} memberships=${user.memberships.length}`,
    );

    const actor = {
      userId: user.id,
      email: user.email,
      memberships: user.memberships,
    };

    return {
      accessToken: await this.jwtService.signAsync(actor),
      tokenType: 'Bearer',
      expiresIn: 3600,
      actor,
    };
  }
}
