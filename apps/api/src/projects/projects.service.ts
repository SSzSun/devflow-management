import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { isUniqueViolation } from "../common/prisma-errors";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { UpdateProjectMemberDto } from "./dto/update-project-member.dto";

const PROJECT_SUMMARY = {
  id: true,
  name: true,
  key: true,
  description: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { issues: true, members: true } },
} as const;

const PROJECT_MEMBER_SELECT = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, email: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, userId: string, dto: CreateProjectDto) {
    try {
      // The counter row is created up front so issue numbering never races on a missing row.
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            name: dto.name,
            key: dto.key,
            description: dto.description,
            workspaceId,
          },
        });
        await tx.projectCounter.create({ data: { projectId: project.id, lastIssueNumber: 0 } });
        // The creator administers what they made, even if they are only a workspace MEMBER.
        await tx.projectMember.create({ data: { projectId: project.id, userId, role: "ADMIN" } });
        return project;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Project key already used in this workspace");
      throw e;
    }
  }

  /**
   * Projects the caller may see: everything, for workspace OWNER/ADMIN; only
   * explicit project memberships, for workspace MEMBER.
   */
  listForWorkspace(workspaceId: string, userId: string, isWorkspaceAdmin: boolean) {
    return this.prisma.project.findMany({
      where: {
        workspaceId,
        ...(isWorkspaceAdmin ? {} : { members: { some: { userId } } }),
      },
      orderBy: { createdAt: "asc" },
      select: PROJECT_SUMMARY,
    });
  }

  async findOne(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ...PROJECT_SUMMARY, workspace: { select: { id: true, name: true, slug: true } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(projectId: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({
      where: { id: projectId },
      data: { name: dto.name, description: dto.description },
      select: PROJECT_SUMMARY,
    });
  }

  async remove(projectId: string) {
    // Cascades to issues, labels and counters; issue activity history goes with them.
    await this.prisma.project.delete({ where: { id: projectId } });
    return { success: true };
  }

  async listMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: "asc" },
      select: PROJECT_MEMBER_SELECT,
    });
  }

  async addMember(projectId: string, workspaceId: string, dto: AddProjectMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        memberships: { where: { workspaceId }, select: { userId: true } },
      },
    });
    if (!user) throw new NotFoundException("No user with that email");
    // Project membership is subordinate to workspace membership: adding a
    // non-workspace-user would create a member who can never be authorized.
    if (user.memberships.length === 0) {
      throw new BadRequestException("User is not a member of this workspace");
    }
    try {
      return await this.prisma.projectMember.create({
        data: { projectId, userId: user.id, role: dto.role },
        select: PROJECT_MEMBER_SELECT,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Already a member of this project");
      throw e;
    }
  }

  async updateMemberRole(projectId: string, targetUserId: string, dto: UpdateProjectMemberDto) {
    const found = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!found) throw new NotFoundException("Member not found");
    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: dto.role },
      select: PROJECT_MEMBER_SELECT,
    });
  }

  async removeMember(projectId: string, targetUserId: string) {
    const found = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!found) throw new NotFoundException("Member not found");
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    return { success: true };
  }
}
