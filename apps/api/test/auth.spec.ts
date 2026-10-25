import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";

// Integration test against the real dev database; cleans up its own user.
describe("auth (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `jest-${Date.now()}@devflow.test`;
  const csrf = "test-csrf";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const post = (path: string) =>
    request(app.getHttpServer()).post(`/api/v1/auth/${path}`).set("X-CSRF-Token", csrf).set("Cookie", `csrf_token=${csrf}`);

  it("rejects mutations without a matching CSRF token", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password: "x" }).expect(403);
  });

  it("GET /auth/csrf issues a token a fresh client can log in with", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/csrf").expect(200);
    const token: unknown = res.body.csrfToken;
    if (typeof token !== "string") throw new Error("no csrf token");
    // Reaches credential check (401), not the CSRF gate (403).
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Cookie", `csrf_token=${token}`)
      .set("X-CSRF-Token", token)
      .send({ email: "nobody@devflow.test", password: "wrongpass1" })
      .expect(401);
  });

  it("rejects invalid register input", async () => {
    await post("register").send({ email: "not-an-email", name: "", password: "short" }).expect(400);
  });

  it("register -> me works and stores no plaintext password", async () => {
    const res = await post("register").send({ email, name: "Jest", password: "password123" }).expect(201);
    const cookies = res.get("Set-Cookie");
    if (!cookies) throw new Error("register did not set cookies");
    expect(cookies.some((c) => c.startsWith("access_token=") && c.includes("HttpOnly"))).toBe(true);
    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies).expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.passwordHash).toBeUndefined();
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("wrong password and unknown email get the same 401", async () => {
    const a = await post("login").send({ email, password: "wrongpass1" }).expect(401);
    const b = await post("login").send({ email: "nobody@devflow.test", password: "wrongpass1" }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it("me without a session is 401", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
  });

  // Keep last: it exhausts the per-IP login budget for this app instance.
  it("login is rate limited", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await post("login").send({ email: "nobody@devflow.test", password: "wrongpass1" });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
