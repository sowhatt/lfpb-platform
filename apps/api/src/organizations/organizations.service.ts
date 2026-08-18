import { Injectable } from '@nestjs/common';
import { OrganizationType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { CreateClubDto } from './dto/create-club.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async listFor(actor: AuthenticatedActor) {
    const scope = this.tenantAccess.organizationScope(actor);
    return this.prisma.organization.findMany({
      where: scope ? { id: { in: scope }, active: true } : { active: true },
      include: { club: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOneFor(actor: AuthenticatedActor, organizationId: string) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { club: true },
    });
  }

  async createClub(input: CreateClubDto) {
    const normalizedCode = input.code.trim().toUpperCase();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>
      tx.organization.create({
        data: {
          name: input.name.trim(),
          code: normalizedCode,
          type: OrganizationType.CLUB,
          club: {
            create: {
              shortName: input.shortName.trim(),
              division: input.division,
              city: input.city?.trim(),
            },
          },
        },
        include: { club: true },
      }),
    );
  }
}
