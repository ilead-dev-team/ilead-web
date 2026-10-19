import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commentPayload,
  feedbackBody,
  parseComment,
  parseCommentPage,
} from "../src/lib/report-feedback.js";
const id = "11111111-1111-4111-8111-111111111111";
const comment = {
  id,
  parentId: null,
  sectionId: null,
  kind: "COMMENT",
  body: "Private note",
  visibleToSponsor: false,
  resolvedAt: null,
  createdAt: "2026-10-19T10:00:00.000Z",
  author: { id, name: "Coordinator", role: "COORDINATOR" },
  replyCount: 0,
};
const page = (data: unknown[]) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});
test("feedback payload trims text and sends only backend-supported references", () => {
  assert.deepEqual(commentPayload("  hello  ", id, id), {
    body: "hello",
    parentId: id,
    sectionId: id,
  });
  assert.deepEqual(commentPayload("hello"), { body: "hello" });
  assert.equal(feedbackBody.safeParse(" ").success, false);
  assert.equal(feedbackBody.safeParse("x".repeat(5001)).success, false);
  assert.equal(feedbackBody.safeParse("x".repeat(5000)).success, true);
  assert.throws(() => commentPayload("hello", "bad-id"));
});
test("Sponsors reject private comments and pages without rendering partial data", () => {
  assert.throws(() => parseComment(comment, "SPONSOR"));
  assert.throws(() =>
    parseCommentPage(
      page([{ ...comment, visibleToSponsor: true }, comment]),
      "SPONSOR",
    ),
  );
  assert.equal(parseCommentPage(page([comment]), "COORDINATOR").data.length, 1);
  assert.equal(
    parseComment({ ...comment, visibleToSponsor: true }, "SPONSOR").body,
    comment.body,
  );
});
test("reply pages must match their requested root and cannot enter root feeds", () => {
  const reply = { ...comment, parentId: id, visibleToSponsor: true };
  assert.throws(() => parseCommentPage(page([reply]), "SPONSOR"));
  assert.throws(() => parseCommentPage(page([comment]), "COORDINATOR", id));
  assert.equal(
    parseCommentPage(page([reply]), "SPONSOR", id).data[0]?.parentId,
    id,
  );
  assert.throws(() =>
    parseCommentPage(
      page([{ ...reply, visibleToSponsor: false }]),
      "SPONSOR",
      id,
    ),
  );
});
