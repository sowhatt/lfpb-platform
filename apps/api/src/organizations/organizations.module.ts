import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [IamModule],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
