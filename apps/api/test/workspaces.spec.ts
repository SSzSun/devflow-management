import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

// Real database. Each test run uses fresh emails and removes what it created.
describe("workspaces (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("ws-owner");
  const memberEmail = uniqueEmail("ws-member");
  const outsiderEmail = uniqueEmail("ws-outsider");
  const adminEmail = uniqueEmail("ws-admin");
  const emails = [ownerEmail, memberEmail, outsiderEmail, adminEmail];

  let owner: Client;
  let member: Client;
  let outsider: Client;
  let admin: Client;
  let workspaceId: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    prisma = t.prisma;
    owner = new Client(app, ownerEmail);
    member = new Client(app, memberEmail);
    outsider = new Client(app, outsiderEmail);
    admin = new Client(app, adminEmail);
    for (const c of [owner, member, outsider, admin]) await c.register();
  });

  afterAll(async () => {
    // Cascades: workspace delete removes members and projects.
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "ws-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/workspaces").expect(401);
  });

  it("creates a workspace and makes the creator OWNER", async () => {
    const res = await owner
      .request("post", "/api/v1/workspaces")
      .send({ name: "WS Test", slug: `ws-test-${Date.now()}` })
      .expect(201);
    workspaceId = res.body.id as string;

    const me = await owner.request("get", `/api/v1/workspaces/${workspaceId}/members`).expect(200);
    const self = (me.body as { role: string; user: { email: string } }[]).find(
      (m) => m.user.email === ownerEmail,
    );
    expect(self?.role).toBe("OWNER");
  });

  it("rejects a duplicate slug with 409", async () => {
    const res = await owner.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
    await owner
      .request("post", "/api/v1/workspaces")
      .send({ name: "Dup", slug: res.body.slug as string })
      .expect(409);
  });

  it("rejects a malformed slug", async () => {
    await owner.request("post", "/api/v1/workspaces").send({ name: "Bad", slug: "Bad Slug!" }).expect(400);
  });

  it("an admin can add a member, and only lists members of their own workspace", async () => {
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: adminEmail, role: "ADMIN" })
      .expect(201);

    const list = await owner.request("get", `/api/v1/workspaces/${workspaceId}/members`).expect(200);
    expect((list.body as unknown[]).length).toBe(3);

    // Membership never exposes password hashes.
    const raw = JSON.stringify(list.body);
    expect(raw.includes("passwordHash")).toBe(false);
    expect(raw.includes("$argon2")).toBe(false);
  });

  it("rejects adding the same member twice with 409", async () => {
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(409);
  });

  it("will not grant OWNER through the members API", async () => {
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: outsiderEmail, role: "OWNER" })
      .expect(400);
  });

  it("hides a workspace from non-members with 404, not 403", async () => {
    // 403 would confirm the workspace exists.
    await outsider.request("get", `/api/v1/workspaces/${workspaceId}`).expect(404);
    await outsider.request("get", `/api/v1/workspaces/${workspaceId}/members`).expect(404);
    await outsider.request("patch", `/api/v1/workspaces/${workspaceId}`).send({ name: "Hijack" }).expect(404);
  });

  it("does not list workspaces the user is not a member of", async () => {
    const res = await outsider.request("get", "/api/v1/workspaces").expect(200);
    const ids = (res.body as { id: string }[]).map((w) => w.id);
    expect(ids.includes(workspaceId)).toBe(false);
  });

  it("lets a plain member read but not modify", async () => {
    await member.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
    await member.request("patch", `/api/v1/workspaces/${workspaceId}`).send({ name: "Nope" }).expect(403);
    await member
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: outsiderEmail, role: "MEMBER" })
      .expect(403);
  });

  it("lets an ADMIN rename but not touch the OWNER row", async () => {
    await admin.request("patch", `/api/v1/workspaces/${workspaceId}`).send({ name: "Renamed" }).expect(200);

    const ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } })).id;
    await admin
      .request("patch", `/api/v1/workspaces/${workspaceId}/members/${ownerId}`)
      .send({ role: "MEMBER" })
      .expect(400);
    await admin.request("delete", `/api/v1/workspaces/${workspaceId}/members/${ownerId}`).expect(400);
  });

  it("lets an ADMIN change a member's role and remove them", async () => {
    const memberId = (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).id;
    await admin
      .request("patch", `/api/v1/workspaces/${workspaceId}/members/${memberId}`)
      .send({ role: "ADMIN" })
      .expect(200);

    // Revoked membership immediately loses access.
    await member.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
    await admin.request("delete", `/api/v1/workspaces/${workspaceId}/members/${memberId}`).expect(200);
    await member.request("get", `/api/v1/workspaces/${workspaceId}`).expect(404);
  });

  it("rejects mutations without a CSRF token on the new routes too", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/workspaces")
      .set("Cookie", `access_token=x; csrf_token=${"test-csrf"}`)
      .send({ name: "NoCsrf", slug: "no-csrf-test" })
      .expect(403);
  });
});
