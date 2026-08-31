import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IamModule } from "../iam/iam.module";
import { OfficialAssignmentsController } from "./official-assignments.controller";
import { OfficialAssignmentsService } from "./official-assignments.service";

@Module({
  imports: [AuthModule, IamModule],
  controllers: [OfficialAssignmentsController],
  providers: [OfficialAssignmentsService],
})
export class OfficialAssignmentsModule {}
