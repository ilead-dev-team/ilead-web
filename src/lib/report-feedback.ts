import { z } from "zod";
import { metadata } from "./configuration";
export const feedbackBody = z
  .string()
  .trim()
  .min(1, "Enter a message.")
  .max(5000, "Use no more than 5,000 characters.");
export const reportComment = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  sectionId: z.uuid().nullable(),
  kind: z.enum(["COMMENT", "CHANGE_REQUEST"]),
  body: z.string(),
  visibleToSponsor: z.boolean(),
  resolvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  author: z.object({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(["COORDINATOR", "SPONSOR"]),
  }),
  replyCount: z.number().int().nonnegative(),
});
export type ReportComment = z.infer<typeof reportComment>;
export function parseComment(value: unknown, role: string) {
  const comment = reportComment.parse(value);
  if (role === "SPONSOR" && !comment.visibleToSponsor)
    throw new Error("Private discussion unavailable");
  return comment;
}
export function parseCommentPage(
  value: unknown,
  role: string,
  parentId: string | null = null,
) {
  const result = z
    .object({ data: z.array(reportComment), meta: metadata })
    .parse(value);
  for (const comment of result.data) {
    if (
      comment.parentId !== parentId ||
      (role === "SPONSOR" && !comment.visibleToSponsor)
    )
      throw new Error("Discussion unavailable");
  }
  return result;
}
export function commentPayload(
  body: string,
  parentId?: string,
  sectionId?: string,
) {
  return z
    .object({
      body: feedbackBody,
      parentId: z.uuid().optional(),
      sectionId: z.uuid().optional(),
    })
    .parse({
      body,
      ...(parentId ? { parentId } : {}),
      ...(sectionId ? { sectionId } : {}),
    });
}
