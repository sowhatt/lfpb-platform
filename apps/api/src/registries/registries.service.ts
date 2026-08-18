import { Injectable } from '@nestjs/common';
import { Prisma, RegistrationCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { CreatePlayerDto } from './dto/create-player.dto';

@Injectable()
export class RegistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async listPlayers(actor: AuthenticatedActor, organizationId: string) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    return this.prisma.registration.findMany({
      where: { organizationId, category: RegistrationCategory.PLAYER },
      include: {
        person: true,
        playerProfile: true,
        licenses: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { person: { lastName: 'asc' } },
    });
  }

  async createPlayer(actor: AuthenticatedActor, input: CreatePlayerDto) {
    this.tenantAccess.assertOrganizationAccess(actor, input.organizationId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>
      tx.person.create({
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          birthDate: new Date(input.birthDate),
          nationality: input.nationality?.trim(),
          registrations: {
            create: {
              organizationId: input.organizationId,
              category: RegistrationCategory.PLAYER,
              startDate: new Date(input.startDate),
              endDate: input.endDate ? new Date(input.endDate) : undefined,
              playerProfile: {
                create: {
                  position: input.position,
                  shirtName: input.shirtName?.trim(),
                  shirtNumber: input.shirtNumber,
                },
              },
            },
          },
        },
        include: {
          registrations: {
            include: { playerProfile: true },
          },
        },
      }),
    );
  }
}
