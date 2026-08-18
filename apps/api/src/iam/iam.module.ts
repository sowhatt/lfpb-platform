import { Module } from '@nestjs/common';
import { TenantAccessService } from './tenant-access.service';

@Module({
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class IamModule {}
