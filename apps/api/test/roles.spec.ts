import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

/**
 * GET /workspaces/:id and GET /projects/:id report the caller's effective role.
 * The UI uses it to show or hide actions; the guards remain the real boundary.
 */
describe("caller role on detail endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("rl-owner");
  const adminEmail = uniqueEmail("rl-admin");
  const memberEmail = uniqueEmail("rl-member");
  const outsiderEmail = uniqueEmail("rl-outsider");
  const emails = [ownerEmail, adminEmail, memberEmail, outsiderEmail];

  let owner: Client;
  let admin: Client;
  let member: Client;
  let outsider: Client;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    prisma = t.prisma;
    owner = new Client(app, ownerEmail);
    admin = new Client(app, adminEmail);
    member = new Client(app, memberEmail);
    outsider = new Client(app, outsiderEmail);
    for (const c of [owner, admin, member, outsider]) await c.register();

    const ws = await owner
      .request("post", "/api/v1/workspaces")
      .send({ name: "RL Workspace", slug: `rl-test-${Date.now()}` })
      .expect(201);
    workspaceId = ws.body.id as string;

    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: adminEmail, role: "ADMIN" })
      .expect(201);
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);

    const project = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "RL Project", key: "RLP" })
      .expect(201);
    projectId = project.body.id as string;

    // A workspace MEMBER is not on the project, so the project role must come
    // from their own membership rather than the workspace.
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "VIEWER" })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "rl-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe("GET /workspaces/:id", () => {
    it("reports OWNER to the owner", async () => {
      const res = await owner.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
      expect(res.body.role).toBe("OWNER");
    });

    it("reports ADMIN to an admin", async () => {
      const res = await admin.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
      expect(res.body.role).toBe("ADMIN");
    });

    it("reports MEMBER to a member", async () => {
      const res = await member.request("get", `/api/v1/workspaces/${workspaceId}`).expect(200);
      expect(res.body.role).toBe("MEMBER");
    });

    it("still returns 404 to a non-member, without leaking the role", async () => {
      await outsider.request("get", `/api/v1/workspaces/${workspaceId}`).expect(404);
    });
  });

  describe("GET /projects/:id", () => {
    it("reports ADMIN to the workspace owner", async () => {
      const res = await owner.request("get", `/api/v1/projects/${projectId}`).expect(200);
      expect(res.body.role).toBe("ADMIN");
    });

    it("reports the project role to a project member", async () => {
      const res = await member.request("get", `/api/v1/projects/${projectId}`).expect(200);
      expect(res.body.role).toBe("VIEWER");
    });

    it("does not leak the role to an outsider", async () => {
      await outsider.request("get", `/api/v1/projects/${projectId}`).expect(404);
    });
  });
});