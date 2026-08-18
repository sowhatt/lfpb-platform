import { Role } from '@prisma/client';

export type ActorMembership = {
  organizationId: string;
  role: Role;
};

export type AuthenticatedActor = {
  userId: string;
  memberships: ActorMembership[];
};
