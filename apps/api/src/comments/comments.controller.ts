import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { requireProjectRole, requireUserId } from "../common/request-context";
import { ProjectRoles } from "../common/project-roles.decorator";
import type { IssueRequest } from "../common/authed-request";
import { IssueAccessGuard } from "../issues/issue-access.guard";
import { CommentAccessGuard } from "./comment-access.guard";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";
import { ListCommentsQueryDto } from "./dto/list-comments-query.dto";

@Controller()
@ApiTags("comments")
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get("issues/:issueId/comments")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("VIEWER")
  list(@Param("issueId") issueId: string, @Query() query: ListCommentsQueryDto) {
    return this.comments.list(issueId, query);
  }

  // A VIEWER may comment: reading is the only thing they are denied.
  @Post("issues/:issueId/comments")
  @UseGuards(IssueAccessGuard)
  @ProjectRoles("VIEWER")
  create(@Req() req: IssueRequest, @Param("issueId") issueId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(issueId, requireUserId(req), dto);
  }

  @Patch("comments/:commentId")
  @UseGuards(CommentAccessGuard)
  @ProjectRoles("VIEWER")
  update(@Req() req: IssueRequest, @Param("commentId") commentId: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(commentId, requireUserId(req), requireProjectRole(req), dto);
  }

  @Delete("comments/:commentId")
  @HttpCode(200)
  @UseGuards(CommentAccessGuard)
  @ProjectRoles("VIEWER")
  remove(@Req() req: IssueRequest, @Param("commentId") commentId: string) {
    return this.comments.remove(commentId, requireUserId(req), requireProjectRole(req));
  }
}
