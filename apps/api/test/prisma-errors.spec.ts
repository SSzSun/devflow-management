import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../src/generated/prisma/client";
import { toHttpException } from "../src/common/prisma-errors";

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, { code, clientVersion: "test" });

describe("toHttpException", () => {
  it("maps the Prisma codes the API can actually hit", () => {
    expect(toHttpException(known("P2025"))).toBeInstanceOf(NotFoundException);
    expect(toHttpException(known("P2002"))).toBeInstanceOf(ConflictException);
    expect(toHttpException(known("P2003"))).toBeInstanceOf(BadRequestException);
  });

  it("leaves unrelated errors for the default handler", () => {
    expect(toHttpException(known("P1001"))).toBeNull();
    expect(toHttpException(new Error("boom"))).toBeNull();
    expect(toHttpException("boom")).toBeNull();
  });
});
