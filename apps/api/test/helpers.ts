import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestApp> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

const CSRF = "test-csrf";

/** A fresh client: signed-in cookie jar plus the matching CSRF cookie. */
export class Client {
  private cookies: string[] = [`csrf_token=${CSRF}`];
  private readonly email: string;

  constructor(
    private readonly app: INestApplication,
    email: string,
  ) {
    this.email = email;
  }

  get address(): string {
    return this.email;
  }

  private get cookieHeader(): string {
    return this.cookies.join("; ");
  }

  setSession(cookies: string[]): void {
    const jar = cookies.filter((c) => !c.startsWith("csrf_token="));
    this.cookies = [...jar, `csrf_token=${CSRF}`];
  }

  request(method: "get" | "post" | "patch" | "delete", path: string) {
    const req = request(this.app.getHttpServer())[method](path)
      .set("Cookie", this.cookieHeader)
      .set("X-CSRF-Token", CSRF);
    return req;
  }

  async register(name = "Test"): Promise<void> {
    const res = await this.request("post", "/api/v1/auth/register")
      .send({ email: this.email, name, password: "password123" })
      .expect(201);
    const cookies = res.get("Set-Cookie");
    if (!cookies) throw new Error("register set no cookies");
    this.setSession(cookies);
  }
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@devflow.test`;
}
