import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

/**
 * Double-submit CSRF check for cookie-authenticated mutations.
 * Header X-CSRF-Token must match the non-HttpOnly csrf_token cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

    // Bearer-auth requests are not cookie-based → CSRF not applicable.
    if (req.headers.authorization?.startsWith("Bearer ")) return true;

    const cookie = (req.cookies as Record<string, string> | undefined)?.["csrf_token"];
    const header = req.headers["x-csrf-token"];
    if (!cookie || !header || cookie !== header) {
      throw new ForbiddenException("CSRF token missing or invalid");
    }
    return true;
  }
}
