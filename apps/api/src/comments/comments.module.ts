import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IssuesModule } from "../issues/issues.module"; // exports IssueAccessGuard
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
import { CommentAccessGuard } from "./comment-access.guard";

@Module({
  imports: [AuthModule, IssuesModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentAccessGuard],
})
export class CommentsModule {}
