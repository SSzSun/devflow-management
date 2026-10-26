import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { isUniqueViolation } from "../common/prisma-errors";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";

// Public shape: never leak passwordHash of members.
const MEMBER_SELECT = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, email: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    try {
      // Creator becomes OWNER in the same transaction — a workspace with no owner would be unreachable.
      return await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: dto.name, slug: dto.slug, ownerId: userId },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: workspace.id, userId, role: "OWNER" },
        });
        return workspace;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Workspace slug already taken");
      throw e;
    }
  }

  listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        createdAt: true,
        _count: { select: { projects: true, members: true } },
      },
    });
  }

  async findForMember(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, ownerId: true, createdAt: true, updatedAt: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: dto.name },
      select: { id: true, name: true, slug: true, ownerId: true, createdAt: true, updatedAt: true },
    });
  }

  async listMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: "asc" },
      select: MEMBER_SELECT,
    });
  }

  async addMember(workspaceId: string, dto: AddMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    // A distinct 404 here is safe: membership endpoints are already admin-gated.
    if (!user) throw new NotFoundException("No user with that email");
    try {
      return await this.prisma.workspaceMember.create({
        data: { workspaceId, userId: user.id, role: dto.role },
        select: MEMBER_SELECT,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Already a member of this workspace");
      throw e;
    }
  }

  async updateMemberRole(workspaceId: string, targetUserId: string, dto: UpdateMemberDto) {
    const current = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      select: { role: true },
    });
    if (!current) throw new NotFoundException("Member not found");
    // The owner row is immutable: transfer/removal would otherwise orphan the workspace.
    if (current.role === "OWNER") throw new BadRequestException("The workspace owner's role cannot be changed");
    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: dto.role },
      select: MEMBER_SELECT,
    });
  }

  async removeMember(workspaceId: string, targetUserId: string) {
    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "OWNER") throw new BadRequestException("The workspace owner cannot be removed");
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    return { success: true };
  }
}
