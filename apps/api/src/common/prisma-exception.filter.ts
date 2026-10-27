import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { toHttpException } from "./prisma-errors";

/**
 * Last-resort Prisma mapping: an uncaught P2025/P2002/P2003 becomes 404/409/400
 * instead of a logged 500. Services with a specific message still catch first.
 */
@Catch()
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(toHttpException(exception) ?? exception, host);
  }
}
