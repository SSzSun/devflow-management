import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

/**
 * Project authorization: workspace OWNER/ADMIN inherit project ADMIN, a workspace
 * MEMBER only sees projects they were added to, and outsiders get 404 everywhere.
 */
describe("projects (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("pj-owner");
  const memberEmail = uniqueEmail("pj-member");
  const viewerEmail = uniqueEmail("pj-viewer");
  const outsiderEmail = uniqueEmail("pj-outsider");
  const emails = [ownerEmail, memberEmail, viewerEmail, outsiderEmail];

  let owner: Client;
  let member: Client;
  let viewer: Client;
  let outsider: Client;
  let workspaceId: string;
  let viewerId: string;
  let projectId: string;
  let privateProjectId: string;
  let adminEmail: string;

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
      .send({ name: "PJ Workspace", slug: `pj-test-${Date.now()}` })
      .expect(201);
    workspaceId = ws.body.id as string;

    for (const email of [memberEmail, viewerEmail]) {
      await owner
        .request("post", `/api/v1/workspaces/${workspaceId}/members`)
        .send({ email, role: "MEMBER" })
        .expect(201);
    }
    viewerId = (await prisma.user.findUniqueOrThrow({ where: { email: viewerEmail } })).id;
  });

  afterAll(async () => {
    // In afterAll, not inline: a failing test must not leave rows behind.
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "pj-test-" } } });
    await prisma.user.deleteMany({
      where: { OR: [{ email: { in: emails } }, { email: { startsWith: "pj-admin-" } }] },
    });
    await app.close();
  });

  it("only a workspace admin can create a project", async () => {
    await member
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Nope", key: "NOPE" })
      .expect(403);

    const res = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Main", key: "MAIN", description: "Primary project" })
      .expect(201);
    projectId = res.body.id as string;
  });

  it("creates the issue counter for the new project", async () => {
    const counter = await prisma.projectCounter.findUnique({ where: { projectId } });
    expect(counter?.lastIssueNumber).toBe(0);
  });

  it("rejects a duplicate key within the same workspace", async () => {
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Dup", key: "MAIN" })
      .expect(409);
  });

  it("rejects a lowercase or too-short key", async () => {
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Bad", key: "abc" })
      .expect(400);
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Bad", key: "A" })
      .expect(400);
  });

  it("does not let the key be changed through PATCH", async () => {
    await owner.request("patch", `/api/v1/projects/${projectId}`).send({ key: "HACK" }).expect(400);
  });

  it("hides projects from workspace members who were not added", async () => {
    const list = await member.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(200);
    expect((list.body as unknown[]).length).toBe(0);
    // Direct access is 404, not 403 — existence is not confirmed.
    await member.request("get", `/api/v1/projects/${projectId}`).expect(404);
  });

  it("shows every project to workspace admins", async () => {
    const list = await owner.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(200);
    expect((list.body as unknown[]).length).toBe(1);
  });

  it("gives an added member access at the project role they were given", async () => {
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);

    const list = await member.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(200);
    expect((list.body as unknown[]).length).toBe(1);

    // MEMBER can read but not administer the project.
    await member.request("get", `/api/v1/projects/${projectId}`).expect(200);
    await member.request("patch", `/api/v1/projects/${projectId}`).send({ name: "Renamed" }).expect(403);
    await member.request("delete", `/api/v1/projects/${projectId}`).expect(403);
  });

  it("a VIEWER can read but not modify", async () => {
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: viewerEmail, role: "VIEWER" })
      .expect(201);
    await viewer.request("get", `/api/v1/projects/${projectId}`).expect(200);
    await viewer.request("get", `/api/v1/projects/${projectId}/members`).expect(200);
    await viewer.request("patch", `/api/v1/projects/${projectId}`).send({ name: "Nope" }).expect(403);
    await viewer
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: outsiderEmail, role: "MEMBER" })
      .expect(403);
  });

  it("will not add a non-workspace-user to a project", async () => {
    // outsider is a registered user but not in this workspace.
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: outsiderEmail, role: "MEMBER" })
      .expect(400);
  });

  it("rejects adding the same project member twice", async () => {
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(409);
  });

  it("lets a workspace admin administer a project they never joined", async () => {
    adminEmail = uniqueEmail("pj-admin");
    const adminClient = new Client(app, adminEmail);
    await adminClient.register();
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/members`)
      .send({ email: adminEmail, role: "ADMIN" })
      .expect(201);

    const created = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Private", key: "PRIV" })
      .expect(201);
    privateProjectId = created.body.id as string;

    // Inherited ADMIN: can read and rename without a ProjectMember row.
    await adminClient.request("get", `/api/v1/projects/${privateProjectId}`).expect(200);
    await adminClient
      .request("patch", `/api/v1/projects/${privateProjectId}`)
      .send({ name: "Renamed By Admin" })
      .expect(200);

    const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } })).id;
    const rows = await prisma.projectMember.count({ where: { projectId: privateProjectId, userId: adminId } });
    expect(rows).toBe(0);
  });

  it("hides everything from a non-workspace-user with 404", async () => {
    await outsider.request("get", `/api/v1/projects/${projectId}`).expect(404);
    await outsider.request("get", `/api/v1/projects/${projectId}/members`).expect(404);
    await outsider.request("patch", `/api/v1/projects/${projectId}`).send({ name: "Hijack" }).expect(404);
    await outsider.request("delete", `/api/v1/projects/${projectId}`).expect(404);
    await outsider.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(404);
  });

  it("drops access when project membership is revoked", async () => {
    await owner.request("delete", `/api/v1/projects/${projectId}/members/${viewerId}`).expect(200);
    await viewer.request("get", `/api/v1/projects/${projectId}`).expect(404);
  });

  it("archives instead of deleting, preserving issues and members", async () => {
    await owner.request("delete", `/api/v1/projects/${projectId}`).expect(200);

    // The row is still there, only flagged.
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.archivedAt).not.toBeNull();
    expect(await prisma.projectCounter.findUnique({ where: { projectId } })).not.toBeNull();
    expect(await prisma.projectMember.count({ where: { projectId } })).toBeGreaterThan(0);

    // Hidden from the default list, still reachable by id for its history.
    const list = await member.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(200);
    expect((list.body as unknown[]).length).toBe(0);
    await member.request("get", `/api/v1/projects/${projectId}`).expect(200);

    // Opted in explicitly, it comes back.
    const all = await member
      .request("get", `/api/v1/workspaces/${workspaceId}/projects?includeArchived=true`)
      .expect(200);
    expect((all.body as unknown[]).length).toBe(1);
  });

  it("restores an archived project", async () => {
    await owner.request("post", `/api/v1/projects/${projectId}/restore`).expect(200);
    const list = await member.request("get", `/api/v1/workspaces/${workspaceId}/projects`).expect(200);
    expect((list.body as unknown[]).length).toBe(1);
  });

  it("keeps the archived project's key reserved", async () => {
    // Reusing it would make old issue keys like MAIN-42 mean a different project.
    await owner.request("delete", `/api/v1/projects/${projectId}`).expect(200);
    await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Reuse", key: "MAIN" })
      .expect(409);
  });
  it("makes an archived project read-only in the API, not just the UI", async () => {
    // Restore briefly to seed an issue and a label, then archive again.
    await owner.request("post", `/api/v1/projects/${projectId}/restore`).expect(200);
    const issue = await member
      .request("post", `/api/v1/projects/${projectId}/issues`)
      .send({ title: "Before archive" })
      .expect(201);
    const issueId = issue.body.id as string;
    const label = await member
      .request("post", `/api/v1/projects/${projectId}/labels`)
      .send({ name: "frozen", color: "#123456" })
      .expect(201);
    const labelId = label.body.id as string;
    await owner.request("delete", `/api/v1/projects/${projectId}`).expect(200);

    // Writes through every project- and issue-scoped guard are 409.
    await member.request("post", `/api/v1/projects/${projectId}/issues`).send({ title: "x" }).expect(409);
    await member.request("patch", `/api/v1/issues/${issueId}`).send({ title: "x" }).expect(409);
    await member.request("patch", `/api/v1/issues/${issueId}/status`).send({ status: "IN_PROGRESS" }).expect(409);
    await member.request("delete", `/api/v1/issues/${issueId}`).expect(409);
    await member.request("post", `/api/v1/issues/${issueId}/comments`).send({ body: "x" }).expect(409);
    await member.request("post", `/api/v1/projects/${projectId}/labels`).send({ name: "y", color: "#000000" }).expect(409);
    await owner.request("patch", `/api/v1/labels/${labelId}`).send({ name: "z" }).expect(409);

    // Reads still work, and admins can still rename and restore.
    await member.request("get", `/api/v1/issues/${issueId}`).expect(200);
    await owner.request("patch", `/api/v1/projects/${projectId}`).send({ name: "Main (old)" }).expect(200);
    await owner.request("post", `/api/v1/projects/${projectId}/restore`).expect(200);
    await member.request("patch", `/api/v1/issues/${issueId}`).send({ title: "After restore" }).expect(200);
  });
});
