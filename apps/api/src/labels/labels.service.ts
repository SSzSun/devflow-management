import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { isUniqueViolation } from "../common/prisma-errors";
import { CreateLabelDto } from "./dto/create-label.dto";
import { UpdateLabelDto } from "./dto/update-label.dto";

const LABEL_SELECT = { id: true, name: true, color: true, createdAt: true } as const;

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string) {
    return this.prisma.label.findMany({ where: { projectId }, orderBy: { name: "asc" }, select: LABEL_SELECT });
  }

  async create(projectId: string, dto: CreateLabelDto) {
    try {
      return await this.prisma.label.create({
        data: { projectId, name: dto.name, color: dto.color },
        select: LABEL_SELECT,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("A label with that name already exists in this project");
      throw e;
    }
  }

  async update(labelId: string, dto: UpdateLabelDto) {
    try {
      return await this.prisma.label.update({ where: { id: labelId }, data: dto, select: LABEL_SELECT });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("A label with that name already exists in this project");
      throw e;
    }
  }

  async remove(labelId: string) {
    // IssueLabel rows cascade, so issues simply lose the label.
    await this.prisma.label.delete({ where: { id: labelId } });
    return { success: true };
  }
}
