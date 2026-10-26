import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

/** Label CRUD, uniqueness per project, and role boundaries. */
describe("labels (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("lb-owner");
  const memberEmail = uniqueEmail("lb-member");
  const viewerEmail = uniqueEmail("lb-viewer");
  const outsiderEmail = uniqueEmail("lb-outsider");
  const emails = [ownerEmail, memberEmail, viewerEmail, outsiderEmail];

  let owner: Client;
  let member: Client;
  let viewer: Client;
  let outsider: Client;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    prisma = t.prisma;
    owner = new Client(app, ownerEmail);
    member = new Client(app, memberEmail);
    viewer = new Client(app, viewerEmail);
    outsider = new Client(app, outsiderEmail);
    for (const c of [owner, member, viewer, outsider]) await c.register();

    const ws = await owner
      .request("post", "/api/v1/workspaces")
      .send({ name: "LB Workspace", slug: `lb-test-${Date.now()}` })
      .expect(201);
    const workspaceId = ws.body.id as string;

    for (const email of [memberEmail, viewerEmail]) {
      await owner
        .request("post", `/api/v1/workspaces/${workspaceId}/members`)
        .send({ email, role: "MEMBER" })
        .expect(201);
    }

    const project = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Label Project", key: "LBL" })
      .expect(201);
    projectId = project.body.id as string;

    const other = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Label Other", key: "LBO" })
      .expect(201);
    otherProjectId = other.body.id as string;

    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: viewerEmail, role: "VIEWER" })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "lb-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const createLabel = async (name = "bug", color = "#cc3333") => {
    const res = await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name, color }).expect(201);
    return res.body.id as string;
  };

  describe("create", () => {
    it("creates a label and returns it", async () => {
      const res = await member
        .request("post", `/api/v1/projects/${projectId}/labels`)
        .send({ name: "feature", color: "#3366cc" })
        .expect(201);
      expect(res.body).toMatchObject({ name: "feature", color: "#3366cc" });
    });

    it("rejects a duplicate name within the same project", async () => {
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "dup", color: "#000000" }).expect(201);
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "dup", color: "#ffffff" }).expect(409);
    });

    it("allows the same name in a different project", async () => {
      await owner.request("post", `/api/v1/projects/${otherProjectId}/labels`).send({ name: "dup", color: "#123456" }).expect(201);
    });

    it("rejects a malformed colour and an empty name", async () => {
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "x", color: "red" }).expect(400);
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "x", color: "#fff" }).expect(400);
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "", color: "#000000" }).expect(400);
    });

    it("forbids a VIEWER from creating a label", async () => {
      await viewer.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "nope", color: "#000000" }).expect(403);
    });

    it("hides the label list from a non-project user with 404", async () => {
      await outsider.request("get", `/api/v1/projects/${projectId}/labels`).expect(404);
      await outsider.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "nope", color: "#000000" }).expect(404);
    });
  });

  describe("list", () => {
    it("lists labels sorted by name and lets a VIEWER read them", async () => {
      const res = await viewer.request("get", `/api/v1/projects/${projectId}/labels`).expect(200);
      const names = (res.body as { name: string }[]).map((l) => l.name);
      expect(names.length).toBeGreaterThan(0);
      expect([...names].sort()).toEqual(names);
    });
  });

  describe("update", () => {
    it("renames a label", async () => {
      const id = await createLabel("rename-me");
      const res = await member.request("patch", `/api/v1/labels/${id}`).send({ name: "renamed" }).expect(200);
      expect(res.body.name).toBe("renamed");
    });

    it("rejects a rename onto an existing name", async () => {
      const id = await createLabel("taken-source");
      await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "taken", color: "#000000" }).expect(201);
      await member.request("patch", `/api/v1/labels/${id}`).send({ name: "taken" }).expect(409);
    });

    it("forbids a VIEWER from updating a label", async () => {
      const id = await createLabel("viewer-blocked");
      await viewer.request("patch", `/api/v1/labels/${id}`).send({ name: "x" }).expect(403);
    });

    it("hides another project's label with 404", async () => {
      const id = await createLabel("secret");
      await outsider.request("patch", `/api/v1/labels/${id}`).send({ name: "hijack" }).expect(404);
      await outsider.request("delete", `/api/v1/labels/${id}`).expect(404);
    });
  });

  describe("delete", () => {
    it("deletes a label and detaches it from its issues", async () => {
      const id = await createLabel("ephemeral");
      const issue = await owner
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Labeled", labelIds: [id] })
        .expect(201);
      expect((issue.body.labels as unknown[]).length).toBe(1);

      await owner.request("delete", `/api/v1/labels/${id}`).expect(200);
      expect(await prisma.label.findUnique({ where: { id } })).toBeNull();

      const after = await owner.request("get", `/api/v1/issues/${issue.body.id as string}`).expect(200);
      expect((after.body.labels as unknown[]).length).toBe(0);
    });

    it("lets a project ADMIN delete a label but not a MEMBER", async () => {
      const id = await createLabel("admin-only-delete");
      await member.request("delete", `/api/v1/labels/${id}`).expect(403);
      await owner.request("delete", `/api/v1/labels/${id}`).expect(200);
    });
  });
});
