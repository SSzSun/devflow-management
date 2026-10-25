import { expect, test } from "bun:test";
import { ISSUE_STATUSES, canTransition, isIssueSortField } from "./constants.js";

test("only the five spec transitions are allowed", () => {
  const allowed = ISSUE_STATUSES.flatMap((from) =>
    ISSUE_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`),
  );
  expect(allowed.sort()).toEqual(
    [
      "TODO->IN_PROGRESS",
      "IN_PROGRESS->IN_REVIEW",
      "IN_REVIEW->DONE",
      "IN_REVIEW->IN_PROGRESS",
      "DONE->IN_PROGRESS",
    ].sort(),
  );
});

test("sort allowlist rejects arbitrary input", () => {
  expect(isIssueSortField("createdAt")).toBe(true);
  expect(isIssueSortField("createdAt; DROP TABLE issues")).toBe(false);
});
