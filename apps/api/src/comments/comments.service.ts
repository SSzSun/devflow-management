import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProjectRole } from "@devflow/shared";
import { PrismaService } from "../prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";
import { ListCommentsQueryDto } from "./dto/list-comments-query.dto";

const COMMENT_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(issueId: string, query: ListCommentsQueryDto) {
    const where = { issueId };
    // Oldest first: a comment thread reads top to bottom.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: COMMENT_SELECT,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      data: rows,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(issueId: string, authorId: string, dto: CreateCommentDto) {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: { issueId, authorId, body: dto.body },
        select: COMMENT_SELECT,
      });
      // Same transaction: a failed comment leaves no activity row.
      await tx.activityLog.create({
        data: { issueId, actorId: authorId, action: "comment_added", toValue: comment.id },
      });
      return comment;
    });
  }

  async update(commentId: string, actorId: string, projectRole: ProjectRole, dto: UpdateCommentDto) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, issueId: true, body: true },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    this.assertCanModify(comment.authorId, actorId, projectRole);

    if (comment.body === dto.body) {
      // No real change: return as-is rather than logging a no-op edit.
      return this.prisma.comment.findUniqueOrThrow({ where: { id: commentId }, select: COMMENT_SELECT });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { body: dto.body },
        select: COMMENT_SELECT,
      });
      await tx.activityLog.create({
        data: { issueId: comment.issueId, actorId, action: "comment_edited", toValue: commentId },
      });
      return updated;
    });
  }

  async remove(commentId: string, actorId: string, projectRole: ProjectRole) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, issueId: true },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    this.assertCanModify(comment.authorId, actorId, projectRole);

    await this.prisma.$transaction(async (tx) => {
      // Hard delete: a comment has no history of its own to preserve.
      await tx.comment.delete({ where: { id: commentId } });
      await tx.activityLog.create({
        data: { issueId: comment.issueId, actorId, action: "comment_deleted", fromValue: commentId },
      });
    });
    return { success: true };
  }

  /** Authors edit their own comments; project admins can moderate any. */
  private assertCanModify(authorId: string, actorId: string, projectRole: ProjectRole): void {
    if (authorId === actorId || projectRole === "ADMIN") return;
    throw new ForbiddenException("You can only modify your own comments");
  }
}
