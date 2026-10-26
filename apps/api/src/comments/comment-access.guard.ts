import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma.service";
import { IssueScopedGuard } from "../issues/issue-access.guard";
import type { IssueRequest } from "../common/authed-request";

/** Resolves :commentId → its issue, then delegates to the shared project-role check. */
@Injectable()
export class CommentAccessGuard extends IssueScopedGuard {
  constructor(
    prisma: PrismaService,
    reflector: Reflector,
  ) {
    super(prisma, reflector);
  }

  protected async resolveIssueId(ctx: ExecutionContext): Promise<string | null> {
    const commentId = ctx.switchToHttp().getRequest<IssueRequest>().params.commentId;
    if (typeof commentId !== "string" || !commentId) return null;
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { issueId: true },
    });
    return comment?.issueId ?? null;
  }
}
