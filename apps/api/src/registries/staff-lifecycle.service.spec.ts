import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RegistrationCategory, RegistrationStatus, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { StaffLifecycleService } from './staff-lifecycle.service';

describe('StaffLifecycleService', () => {
  const organizationId = '72d68e06-4e23-49ff-b752-9fbfaa7099a4';
  const otherOrganizationId = 'f9781640-13ec-44cf-a123-b0646c58ba31';
  const registrationId = '9efbdb1e-c38f-4fbc-81ee-32bbbc588d62';
  const actor: AuthenticatedActor = {
    userId: 'a021c3c1-c303-4d1c-90aa-f98130d52b21',
    memberships: [{ organizationId, role: Role.CLUB_ADMIN }],
  };

  function makeService(status: RegistrationStatus, targetOrganizationId = organizationId) {
    const update = jest.fn().mockResolvedValue({
      id: registrationId,
      status: RegistrationStatus.ARCHIVED,
    });
    const createAudit = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const tx = {
      registration: { update },
      auditLog: { create: createAudit },
    };
    const prisma = {
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: registrationId,
          organizationId: targetOrganizationId,
          category: RegistrationCategory.STAFF,
          status,
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    return {
      service: new StaffLifecycleService(prisma, new TenantAccessService()),
      update,
      createAudit,
    };
  }

  it('archive un membre du staff sans supprimer ses données', async () => {
    const { service, update, createAudit } = makeService(RegistrationStatus.DRAFT);

    await service.archiveStaff(actor, registrationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: registrationId },
        data: expect.objectContaining({ status: RegistrationStatus.ARCHIVED }),
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'STAFF_ARCHIVED',
          resourceId: registrationId,
        }),
      }),
    );
  });

  it('refuse de réarchiver un membre déjà archivé', async () => {
    const { service } = makeService(RegistrationStatus.ARCHIVED);

    await expect(service.archiveStaff(actor, registrationId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('interdit à un club d’archiver le staff d’un autre club', async () => {
    const { service } = makeService(RegistrationStatus.DRAFT, otherOrganizationId);

    await expect(service.archiveStaff(actor, registrationId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('autorise la modification d’un membre actif du même club', async () => {
    const { service } = makeService(RegistrationStatus.DRAFT);

    await expect(service.assertStaffEditable(actor, registrationId)).resolves.toBeUndefined();
  });

  it('refuse la modification d’un membre archivé', async () => {
    const { service } = makeService(RegistrationStatus.ARCHIVED);

    await expect(service.assertStaffEditable(actor, registrationId)).rejects.toThrow(
      BadRequestException,
    );
  });
});
