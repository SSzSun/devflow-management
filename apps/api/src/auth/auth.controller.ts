import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";

// Credential endpoints: 10 attempts per minute per IP to slow brute-forcing.
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };
import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { AuthService, SESSION_COOKIES, SessionTokens } from "./auth.service";
import { PrismaService } from "../prisma.service";
import { JwtAuthGuard, type AuthedRequest } from "./jwt-auth.guard";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
@ApiTags("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Issues a CSRF token before a session exists, so the first login/register can pass CsrfGuard. */
  @Get("csrf")
  csrf(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const existing = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIES.csrf];
    const csrfToken = existing ?? randomBytes(32).toString("base64url");
    res.cookie(SESSION_COOKIES.csrf, csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AuthService.REFRESH_TTL_MS,
    });
    return { csrfToken };
  }

  @Post("register")
  @Throttle(AUTH_LIMIT)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.setSession(res, await this.auth.register(dto));
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.setSession(res, await this.auth.login(dto));
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string>)["refresh_token"];
    if (!refreshToken) throw new UnauthorizedException("Refresh token missing");
    return this.setSession(res, await this.auth.refresh(refreshToken));
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string>;
    const userId = await this.userIdFromAccess(cookies["access_token"]);
    if (userId && cookies["refresh_token"]) await this.auth.logout(userId, cookies["refresh_token"]);
    for (const name of Object.values(SESSION_COOKIES)) res.clearCookie(name, { path: "/" });
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthedRequest) {
    if (!req.userId) throw new UnauthorizedException("Authentication required");
    const user = await this.prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException("User not found");
    return user;
  }

  private async userIdFromAccess(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: process.env.JWT_ACCESS_SECRET });
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  private setSession(res: Response, s: SessionTokens) {
    res.cookie(SESSION_COOKIES.access, s.accessToken, AuthService.cookieOptions(AuthService.ACCESS_TTL_MS));
    res.cookie(SESSION_COOKIES.refresh, s.refreshToken, AuthService.cookieOptions(AuthService.REFRESH_TTL_MS));
    // CSRF cookie readable by JS (double-submit pattern), not HttpOnly.
    res.cookie(SESSION_COOKIES.csrf, s.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AuthService.REFRESH_TTL_MS,
    });
    return { csrfToken: s.csrfToken };
  }
}
