import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
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

    if (!user?.active || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Identifiants invalides');
    }

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
