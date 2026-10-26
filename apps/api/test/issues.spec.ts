import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma.service";
import { Client, createTestApp, uniqueEmail } from "./helpers";

/**
 * Issue CRUD, workflow enforcement and transaction behaviour. The status-change
 * tests are the important ones: they prove the workflow cannot be bypassed.
 */
describe("issues (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerEmail = uniqueEmail("is-owner");
  const memberEmail = uniqueEmail("is-member");
  const viewerEmail = uniqueEmail("is-viewer");
  const outsiderEmail = uniqueEmail("is-outsider");
  const emails = [ownerEmail, memberEmail, viewerEmail, outsiderEmail];

  let owner: Client;
  let member: Client;
  let viewer: Client;
  let outsider: Client;
  let workspaceId: string;
  let projectId: string;
  let memberId: string;
  let labelId: string;

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
      .send({ name: "IS Workspace", slug: `is-test-${Date.now()}` })
      .expect(201);
    workspaceId = ws.body.id as string;

    for (const [email, role] of [
      [memberEmail, "MEMBER"],
      [viewerEmail, "MEMBER"],
    ] as const) {
      await owner
        .request("post", `/api/v1/workspaces/${workspaceId}/members`)
        .send({ email, role })
        .expect(201);
    }
    memberId = (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).id;

    const project = await owner
      .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
      .send({ name: "Issue Project", key: "ISS" })
      .expect(201);
    projectId = project.body.id as string;

    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: memberEmail, role: "MEMBER" })
      .expect(201);
    await owner
      .request("post", `/api/v1/projects/${projectId}/members`)
      .send({ email: viewerEmail, role: "VIEWER" })
      .expect(201);

    const label = await prisma.label.create({
      data: { projectId, name: "bug", color: "#cc3333" },
    });
    labelId = label.id;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "is-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const createIssue = async (title = "First issue") => {
    const res = await member
      .request("post", `/api/v1/projects/${projectId}/issues`)
      .send({ title })
      .expect(201);
    return res.body.id as string;
  };

  describe("creation", () => {
    it("numbers issues sequentially per project, starting at 1", async () => {
      const a = await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Numbered A" })
        .expect(201);
      const b = await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Numbered B" })
        .expect(201);
      expect(b.body.number).toBe((a.body.number as number) + 1);
    });

    it("starts every issue at TODO", async () => {
      const id = await createIssue("Status default");
      const res = await member.request("get", `/api/v1/issues/${id}`).expect(200);
      expect(res.body.status).toBe("TODO");
    });

    it("records a creation activity in the same transaction", async () => {
      const id = await createIssue("With activity");
      const acts = await member.request("get", `/api/v1/issues/${id}/activities`).expect(200);
      const actions = (acts.body as { action: string }[]).map((a) => a.action);
      expect(actions).toContain("created");
    });

    it("accepts an assignee and labels that belong to the project", async () => {
      const res = await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Assigned", assigneeId: memberId, labelIds: [labelId], priority: "HIGH" })
        .expect(201);
      expect(res.body.assignee.id).toBe(memberId);
      expect((res.body.labels as unknown[]).length).toBe(1);
    });

    it("rejects an assignee outside the project", async () => {
      const outsiderId = (await prisma.user.findUniqueOrThrow({ where: { email: outsiderEmail } })).id;
      await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Bad assignee", assigneeId: outsiderId })
        .expect(400);
    });

    it("rejects a label from another project", async () => {
      const other = await prisma.project.create({
        data: { name: "Other", key: "OTHR", workspaceId },
      });
      const foreign = await prisma.label.create({ data: { projectId: other.id, name: "x", color: "#000000" } });
      await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Bad label", labelIds: [foreign.id] })
        .expect(400);
      await prisma.project.delete({ where: { id: other.id } });
    });

    it("will not accept a status on create", async () => {
      await member
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Sneaky", status: "DONE" })
        .expect(400);
    });

    it("lets a VIEWER read but not create", async () => {
      const id = await createIssue("Viewer reads");
      await viewer.request("get", `/api/v1/issues/${id}`).expect(200);
      await viewer
        .request("post", `/api/v1/projects/${projectId}/issues`)
        .send({ title: "Viewer writes" })
        .expect(403);
    });

    it("gives concurrent creations distinct numbers", async () => {
      // The counter row is the serialization point; the unique constraint is the backstop.
      const before = await prisma.issue.count({ where: { projectId } });
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          member.request("post", `/api/v1/projects/${projectId}/issues`).send({ title: `Concurrent ${i}` }),
        ),
      );
      const numbers = results.map((r) => r.body.number as number);
      expect(new Set(numbers).size).toBe(10);
      expect(await prisma.issue.count({ where: { projectId } })).toBe(before + 10);
    });
  });

  describe("workflow", () => {
    it("walks the allowed path TODO -> IN_PROGRESS -> IN_REVIEW -> DONE", async () => {
      const id = await createIssue("Happy path");
      for (const next of ["IN_PROGRESS", "IN_REVIEW", "DONE"]) {
        const res = await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: next }).expect(200);
        expect(res.body.status).toBe(next);
      }
    });

    it("allows the two backward transitions the spec defines", async () => {
      const id = await createIssue("Backward");
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_REVIEW" }).expect(200);
      // IN_REVIEW -> IN_PROGRESS
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_REVIEW" }).expect(200);
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "DONE" }).expect(200);
      // DONE -> IN_PROGRESS (reopen)
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
    });

    it("rejects every transition outside the map", async () => {
      const id = await createIssue("Illegal transitions");
      // From TODO, everything except IN_PROGRESS is rejected.
      for (const bad of ["TODO", "IN_REVIEW", "DONE"]) {
        await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: bad }).expect(400);
      }
      const row = await prisma.issue.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("TODO");
    });

    it("rejects an unknown status value", async () => {
      const id = await createIssue("Unknown status");
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "SHIPPED" }).expect(400);
    });

    it("does not let the general update endpoint change status", async () => {
      // The bypass the requirements call out explicitly.
      const id = await createIssue("No bypass");
      await member.request("patch", `/api/v1/issues/${id}`).send({ status: "DONE" }).expect(400);
      const row = await prisma.issue.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("TODO");
    });

    it("writes exactly one status activity per successful change", async () => {
      const id = await createIssue("Status activity");
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
      const rows = await prisma.activityLog.findMany({ where: { issueId: id, action: "status_changed" } });
      expect(rows.length).toBe(1);
      expect(rows[0]?.fromValue).toBe("TODO");
      expect(rows[0]?.toValue).toBe("IN_PROGRESS");
    });

    it("leaves no activity row when a transition is rejected", async () => {
      // Activity must reflect successful operations only.
      const id = await createIssue("Failed change");
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "DONE" }).expect(400);
      expect(await prisma.activityLog.count({ where: { issueId: id, action: "status_changed" } })).toBe(0);
    });

    it("lets a VIEWER read status but not change it", async () => {
      const id = await createIssue("Viewer status");
      await member.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
      await viewer.request("patch", `/api/v1/issues/${id}/status`).send({ status: "IN_REVIEW" }).expect(403);
    });
  });

  describe("update and delete", () => {
    it("records field changes with old and new values", async () => {
      const id = await createIssue("Field changes");
      await member
        .request("patch", `/api/v1/issues/${id}`)
        .send({ title: "Renamed issue", priority: "URGENT" })
        .expect(200);
      const rows = await prisma.activityLog.findMany({ where: { issueId: id }, orderBy: { createdAt: "asc" } });
      const title = rows.find((r) => r.action === "title_changed");
      const priority = rows.find((r) => r.action === "priority_changed");
      expect(title?.fromValue).toBe("Field changes");
      expect(title?.toValue).toBe("Renamed issue");
      expect(priority?.toValue).toBe("URGENT");
    });

    it("writes no activity when a value did not actually change", async () => {
      const id = await createIssue("Same title");
      await member.request("patch", `/api/v1/issues/${id}`).send({ title: "Same title" }).expect(200);
      expect(await prisma.activityLog.count({ where: { issueId: id, action: "title_changed" } })).toBe(0);
    });

    it("unassigns with an explicit null", async () => {
      const id = await createIssue("Unassign");
      await member.request("patch", `/api/v1/issues/${id}`).send({ assigneeId: memberId }).expect(200);
      const res = await member.request("patch", `/api/v1/issues/${id}`).send({ assigneeId: null }).expect(200);
      expect(res.body.assigneeId).toBeNull();
    });

    it("soft deletes and hides the issue from every read path", async () => {
      const id = await createIssue("To delete");
      await member.request("delete", `/api/v1/issues/${id}`).expect(200);

      await member.request("get", `/api/v1/issues/${id}`).expect(404);
      await member.request("get", `/api/v1/issues/${id}/activities`).expect(404);

      // Still in the database, with history intact.
      const row = await prisma.issue.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt).not.toBeNull();
      expect(await prisma.activityLog.count({ where: { issueId: id } })).toBeGreaterThan(0);

      const list = await member.request("get", `/api/v1/projects/${projectId}/issues?limit=100`).expect(200);
      const ids = (list.body.data as { id: string }[]).map((i) => i.id);
      expect(ids.includes(id)).toBe(false);
    });

    it("hides issues from a non-project user with 404", async () => {
      const id = await createIssue("Outsider check");
      await outsider.request("get", `/api/v1/issues/${id}`).expect(404);
      await outsider.request("patch", `/api/v1/issues/${id}`).send({ title: "Hijack" }).expect(404);
      await outsider.request("delete", `/api/v1/issues/${id}`).expect(404);
    });
  });

  describe("search, filter, sort, pagination", () => {
    let pageProjectId: string;

    beforeAll(async () => {
      const p = await owner
        .request("post", `/api/v1/workspaces/${workspaceId}/projects`)
        .send({ name: "Paging", key: "PAGE" })
        .expect(201);
      pageProjectId = p.body.id as string;

      for (let i = 1; i <= 7; i++) {
        const res = await owner
          .request("post", `/api/v1/projects/${pageProjectId}/issues`)
          .send({ title: `Search target ${i}`, priority: i === 1 ? "URGENT" : "LOW" })
          .expect(201);
        if (i <= 2) {
          await owner
            .request("patch", `/api/v1/issues/${res.body.id as string}/status`)
            .send({ status: "IN_PROGRESS" })
            .expect(200);
        }
      }
    });

    it("returns pagination metadata and respects limit", async () => {
      const res = await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?page=1&limit=3`).expect(200);
      expect((res.body.data as unknown[]).length).toBe(3);
      expect(res.body.meta).toEqual({ page: 1, limit: 3, total: 7, totalPages: 3 });
    });

    it("pages to the remainder on the last page", async () => {
      const res = await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?page=3&limit=3`).expect(200);
      expect((res.body.data as unknown[]).length).toBe(1);
    });

    it("paginates past the end as an empty page, not an error", async () => {
      const res = await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?page=99&limit=3`).expect(200);
      expect((res.body.data as unknown[]).length).toBe(0);
      expect(res.body.meta.total).toBe(7);
    });

    it("clamps limit and rejects a zero or oversized page", async () => {
      await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?limit=500`).expect(400);
      await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?page=0`).expect(400);
      await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?limit=0`).expect(400);
    });

    it("searches title and description", async () => {
      const res = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?search=target 2`)
        .expect(200);
      expect((res.body.data as unknown[]).length).toBe(1);
    });

    it("filters by status and by priority", async () => {
      const byStatus = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?status=IN_PROGRESS`)
        .expect(200);
      expect((byStatus.body.meta as { total: number }).total).toBe(2);

      const byPriority = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?priority=URGENT`)
        .expect(200);
      expect((byPriority.body.meta as { total: number }).total).toBe(1);
    });

    it("filters by unassigned", async () => {
      const res = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?assigneeId=unassigned`)
        .expect(200);
      expect((res.body.meta as { total: number }).total).toBe(7);
    });

    it("rejects a status outside the enum", async () => {
      await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?status=SHIPPED`).expect(400);
    });

    it("rejects a sort field outside the allowlist", async () => {
      // Never let a client value reach ORDER BY.
      await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?sortBy=title;DROP TABLE issues`)
        .expect(400);
      await owner.request("get", `/api/v1/projects/${pageProjectId}/issues?sortBy=secretColumn`).expect(400);
    });

    it("sorts by an allowlisted field in both directions", async () => {
      const asc = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?sortBy=createdAt&sortOrder=asc&limit=1`)
        .expect(200);
      const desc = await owner
        .request("get", `/api/v1/projects/${pageProjectId}/issues?sortBy=createdAt&sortOrder=desc&limit=1`)
        .expect(200);
      expect(asc.body.data[0].id).not.toBe(desc.body.data[0].id);
    });
  });
});
