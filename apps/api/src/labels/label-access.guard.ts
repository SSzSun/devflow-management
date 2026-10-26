import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma.service";
import { ProjectScopedGuard } from "../projects/project-access.guard";
import type { ProjectRequest } from "../common/authed-request";

/** Resolves :labelId → its project, then delegates to the shared project-role check. */
@Injectable()
export class LabelAccessGuard extends ProjectScopedGuard {
  constructor(
    prisma: PrismaService,
    reflector: Reflector,
  ) {
    super(prisma, reflector);
  }

  protected async resolveProjectId(ctx: ExecutionContext): Promise<string | null> {
    const labelId = ctx.switchToHttp().getRequest<ProjectRequest>().params.labelId;
    if (typeof labelId !== "string" || !labelId) return null;
    const label = await this.prisma.label.findUnique({
      where: { id: labelId },
      select: { projectId: true },
    });
    return label?.projectId ?? null;
  }
}
