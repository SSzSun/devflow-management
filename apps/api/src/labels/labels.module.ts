import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module"; // exports ProjectAccessGuard
import { LabelsController } from "./labels.controller";
import { LabelsService } from "./labels.service";
import { LabelAccessGuard } from "./label-access.guard";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [LabelsController],
  providers: [LabelsService, LabelAccessGuard],
})
export class LabelsModule {}
