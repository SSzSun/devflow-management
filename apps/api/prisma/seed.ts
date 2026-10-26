/**
 * Demo data for local development and portfolio review.
 * Idempotent: re-running resets the demo workspace instead of duplicating it.
 * Credentials are fixed demo values, never real secrets.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_SLUG = "devflow-demo";
const PASSWORD = "devflow123";

const users = [
  { email: "owner@devflow.test", name: "Somchai Prasert" },
  { email: "admin@devflow.test", name: "Nattaya Chaiwong" },
  { email: "member@devflow.test", name: "Kittipong Saelim" },
  { email: "viewer@devflow.test", name: "Pimchanok Wongsa" },
] as const;

const labels = [
  { name: "bug", color: "#d93025" },
  { name: "feature", color: "#1a73e8" },
  { name: "chore", color: "#5f6368" },
  { name: "performance", color: "#e37400" },
] as const;

/** Issues spread across every column so the board and the filters both show something. */
const issues = [
  { title: "Board cards flicker when a move is rejected", status: "TODO", priority: "HIGH", labels: ["bug"] },
  { title: "Add keyboard navigation to the kanban board", status: "TODO", priority: "MEDIUM", labels: ["feature"] },
  { title: "Workspace slug validation allows consecutive dashes", status: "TODO", priority: "LOW", labels: ["bug"] },
  { title: "Issue list query runs N+1 for labels", status: "IN_PROGRESS", priority: "URGENT", labels: ["performance"] },
  { title: "Comment editing loses its place in the thread", status: "IN_PROGRESS", priority: "MEDIUM", labels: ["bug"] },
  { title: "Document the workflow transition rules", status: "IN_REVIEW", priority: "LOW", labels: ["chore"] },
  { title: "Project archive keeps its key reserved", status: "IN_REVIEW", priority: "HIGH", labels: ["feature"] },
  { title: "Cookie refresh rotates the token on every call", status: "DONE", priority: "HIGH", labels: ["chore"] },
  { title: "Pagination metadata on the issue list", status: "DONE", priority: "MEDIUM", labels: ["feature"] },
] as const;

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);
  const created: Record<string, string> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash },
    });
    created[u.email] = row.id;
  }
  const [ownerId, adminId, memberId, viewerId] = [
    created["owner@devflow.test"],
    created["admin@devflow.test"],
    created["member@devflow.test"],
    created["viewer@devflow.test"],
  ];
  if (!ownerId || !adminId || !memberId || !viewerId) throw new Error("seed users missing");

  // Reset rather than accumulate, so repeated runs stay predictable.
  await prisma.workspace.deleteMany({ where: { slug: DEMO_SLUG } });

  const workspace = await prisma.workspace.create({
    data: {
      name: "DevFlow Demo",
      slug: DEMO_SLUG,
      ownerId,
      // The owner needs their own membership row, exactly as the API's create
      // writes it; without it the workspace is invisible in the owner's list.
      // VIEWER exists only at project level, so that user joins the project below.
      members: {
        create: [
          { userId: ownerId, role: "OWNER" },
          { userId: adminId, role: "ADMIN" },
          { userId: memberId, role: "MEMBER" },
        ],
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Web Application",
      key: "WEB",
      description: "The customer-facing Next.js app.",
      counter: { create: { lastIssueNumber: issues.length } },
      members: {
        create: [
          { userId: adminId, role: "ADMIN" },
          { userId: memberId, role: "MEMBER" },
          { userId: viewerId, role: "VIEWER" },
        ],
      },
      labels: { create: labels.map((l) => ({ ...l })) },
    },
    include: { labels: true, counter: true },
  });

  for (const [i, issue] of issues.entries()) {
    await prisma.issue.create({
      data: {
        projectId: project.id,
        number: i + 1,
        title: issue.title,
        description: null,
        status: issue.status,
        priority: issue.priority,
        assigneeId: i % 3 === 0 ? memberId : i % 3 === 1 ? adminId : null,
        createdById: ownerId,
        labels: {
          create: issue.labels
            .map((name) => project.labels.find((l) => l.name === name))
            .filter((l): l is (typeof project.labels)[number] => l !== undefined)
            .map((l) => ({ labelId: l.id })),
        },
        activity: { create: { actorId: ownerId, action: "created" } },
      },
    });
  }

  console.log(`Seeded workspace "${workspace.name}" (${issues.length} issues)`);
  console.log(`Sign in with ${users[0].email} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
