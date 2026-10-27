import { BadRequestException, ConflictException, HttpException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";

/** True for a unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Maps a known Prisma error to an HTTP exception; null means "leave it alone". */
export function toHttpException(e: unknown): HttpException | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (e.code) {
    case "P2025":
      return new NotFoundException("Record not found");
    case "P2002":
      return new ConflictException("Already exists");
    case "P2003":
      return new BadRequestException("Related record does not exist");
    default:
      return null;
  }
}
