import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

/** Comment CRUD plus the "who may edit whose comment" rule. */
describe("comments (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("cm-owner");
  const memberEmail = uniqueEmail("cm-member");
  const otherEmail = uniqueEmail("cm-other");
  const viewerEmail = uniqueEmail("cm-viewer");
  const outsiderEmail = uniqueEmail("cm-outsider");
  const emails = [ownerEmail, memberEmail, otherEmail, viewerEmail, outsiderEmail];

  let owner: Client;
  let member: Client;
  let other: Client;
  let viewer: Client;
  let outsider: Client;
  let projectId: string;
  let issueId: string;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    prisma = t.prisma;
    owner = new Client(app, ownerEmail);
    member = new Client(app, memberEmail);
    other = new Client(app, otherEmail);
    viewer = new Client(app, viewerEmail);
    outsider = new Client(app, outsiderEmail);
    for (const c of [owner, member, other, viewer, outsider]) await c.register();

    const ws = await owner
      .request("post", "/api/v1/workspaces")
      .send({ name: "CM Workspace", slug: `cm-test-${Date.now()}` })
      .expect(201);
    const workspaceId = ws.body.id as string;

    for (const [email, role] of [
      [memberEmail, "MEMBER"],
      [otherEmail, "MEMBER"],
      [viewerEmail, "MEMBER"],
    ] as const) {
      await owner
        .request("post", `/api/v1/workspaces/${workspaceId}/members`)
        .send({ email, role })
        .expect(201);
    }

    const project = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Comment Project", key: "CMT" })
      .expect(201);
    projectId = project.body.id as string;

    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: otherEmail, role: "MEMBER" })
      .expect(201);
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: viewerEmail, role: "VIEWER" })
      .expect(201);

    const issue = await owner
      .request("post", `/api/v1/projects/${projectId}/issues`)
      .send({ title: "Discuss this" })
      .expect(201);
    issueId = issue.body.id as string;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "cm-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const addComment = async (client: Client, body = "Looks good") => {
    const res = await client.request("post", `/api/v1/issues/${issueId}/comments`).send({ body }).expect(201);
    return res.body.id as string;
  };

  describe("create and list", () => {
    it("returns the author on the created comment", async () => {
      const res = await member
        .request("post", `/api/v1/issues/${issueId}/comments`)
        .send({ body: "First thought" })
        .expect(201);
      expect(res.body.body).toBe("First thought");
      expect(res.body.author.email).toBe(memberEmail);
    });

    it("records a comment_added activity in the same transaction", async () => {
      const id = await addComment(member, "Activity please");
      const rows = await prisma.activityLog.findMany({ where: { issueId, action: "comment_added" } });
      expect(rows.map((r) => r.toValue)).toContain(id);
    });

    it("lists oldest first with pagination metadata", async () => {
      const res = await owner.request("get", `/api/v1/issues/${issueId}/comments?page=1&limit=2`).expect(200);
      const rows = res.body.data as { createdAt: string }[];
      expect(rows.length).toBe(2);
      expect(Date.parse(rows[0]!.createdAt)).toBeLessThanOrEqual(Date.parse(rows[1]!.createdAt));
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it("lets a VIEWER comment", async () => {
      await addComment(viewer, "A viewer opinion");
    });

    it("rejects an empty body", async () => {
      await member.request("post", `/api/v1/issues/${issueId}/comments`).send({ body: "" }).expect(400);
      await member.request("post", `/api/v1/issues/${issueId}/comments`).send({}).expect(400);
    });

    it("hides the thread from a non-project user with 404", async () => {
      await outsider.request("get", `/api/v1/issues/${issueId}/comments`).expect(404);
      await outsider.request("post", `/api/v1/issues/${issueId}/comments`).send({ body: "hi" }).expect(404);
    });

    it("hides the thread of a soft-deleted issue", async () => {
      const issue = await owner
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Deleted soon" })
        .expect(201);
      const id = issue.body.id as string;
      await owner.request("post", `/api/v1/issues/${id}/comments`).send({ body: "bye" }).expect(201);
      await owner.request("delete", `/api/v1/issues/${id}`).expect(200);
      await owner.request("get", `/api/v1/issues/${id}/comments`).expect(404);
    });
  });

  describe("update", () => {
    it("lets the author edit their own comment", async () => {
      const id = await addComment(member, "typo");
      const res = await member.request("patch", `/api/v1/comments/${id}`).send({ body: "fixed" }).expect(200);
      expect(res.body.body).toBe("fixed");
    });

    it("records a comment_edited activity", async () => {
      const id = await addComment(member, "before");
      await member.request("patch", `/api/v1/comments/${id}`).send({ body: "after" }).expect(200);
      expect(await prisma.activityLog.count({ where: { issueId, action: "comment_edited", toValue: id } })).toBe(1);
    });

    it("writes no activity when the body did not change", async () => {
      const id = await addComment(member, "same");
      await member.request("patch", `/api/v1/comments/${id}`).send({ body: "same" }).expect(200);
      expect(await prisma.activityLog.count({ where: { issueId, action: "comment_edited", toValue: id } })).toBe(0);
    });

    it("forbids a different MEMBER from editing another author's comment", async () => {
      const id = await addComment(member, "mine");
      await other.request("patch", `/api/v1/comments/${id}`).send({ body: "not yours" }).expect(403);
    });

    it("lets a project ADMIN moderate any comment", async () => {
      const id = await addComment(member, "to moderate");
      const res = await owner.request("patch", `/api/v1/comments/${id}`).send({ body: "moderated" }).expect(200);
      expect(res.body.body).toBe("moderated");
    });

    it("hides another project's comment with 404", async () => {
      const id = await addComment(member, "private");
      await outsider.request("patch", `/api/v1/comments/${id}`).send({ body: "hijack" }).expect(404);
      await outsider.request("delete", `/api/v1/comments/${id}`).expect(404);
    });

    it("404s on an unknown comment id", async () => {
      await member.request("patch", "/api/v1/comments/does-not-exist").send({ body: "x" }).expect(404);
    });
  });

  describe("delete", () => {
    it("lets the author delete their comment and logs it", async () => {
      const id = await addComment(member, "remove me");
      await member.request("delete", `/api/v1/comments/${id}`).expect(200);
      expect(await prisma.comment.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.activityLog.count({ where: { issueId, action: "comment_deleted", fromValue: id } })).toBe(1);
    });

    it("forbids a different MEMBER from deleting another author's comment", async () => {
      const id = await addComment(member, "keep me");
      await other.request("delete", `/api/v1/comments/${id}`).expect(403);
      expect(await prisma.comment.findUnique({ where: { id } })).not.toBeNull();
    });
  });
});
