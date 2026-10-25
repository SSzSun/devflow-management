import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { SESSION_COOKIES } from "./auth.service";

export interface AuthedRequest extends Request {
  userId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIES.access] ?? bearer(req);
    if (!token) throw new UnauthorizedException("Authentication required");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: process.env.JWT_ACCESS_SECRET });
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}
