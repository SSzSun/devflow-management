import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma.service";
import { isUniqueViolation } from "../common/prisma-errors";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const SESSION_COOKIES = {
  access: "access_token",
  refresh: "refresh_token",
  csrf: "csrf_token",
} as const;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<SessionTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // Same error as login failure — don't reveal registered emails.
      throw new UnauthorizedException("Invalid credentials");
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user
      .create({ data: { email: dto.email, name: dto.name, passwordHash } })
      // Lost a concurrent signup race: same answer as the check above.
      .catch((e: unknown) => {
        if (isUniqueViolation(e)) throw new UnauthorizedException("Invalid credentials");
        throw e;
      });
    return this.issueSession(user.id);
  }

  async login(dto: LoginDto): Promise<SessionTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH), dto.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException("Invalid credentials");
    return this.issueSession(user.id);
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    // Rotation must be atomic: a replayed token loses the updateMany race and gets no session.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1) throw new UnauthorizedException("Invalid refresh token");
    return this.issueSession(stored.userId);
  }

  // Keyed by the (secret) token itself, so logout works with an expired access token.
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(userId: string): Promise<SessionTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "15m" },
    );
    const refreshToken = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const csrfToken = randomBytes(32).toString("base64url");
    return { accessToken, refreshToken, csrfToken, userId };
  }

  static cookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: maxAgeMs,
    };
  }

  static get ACCESS_TTL_MS() { return ACCESS_TTL_MS; }
  static get REFRESH_TTL_MS() { return REFRESH_TTL_MS; }
}

// Real hash so unknown-email logins cost the same argon2 work as wrong-password ones (no timing enumeration).
const DUMMY_HASH = argon2.hash(randomBytes(16).toString("hex"));
function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}
