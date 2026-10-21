import { z } from "zod";
import { ApiError } from "./api";
export const categories = {
  WRONG_LESSON: "Wrong lesson recorded",
  WRONG_LEVEL: "Wrong level recorded",
  WRONG_DETAILS: "Roundtable details wrong",
  OTHER: "Other",
} as const;
export const issueInput = z.object({
  category: z.enum(["WRONG_LESSON", "WRONG_LEVEL", "WRONG_DETAILS", "OTHER"]),
  message: z
    .string()
    .trim()
    .min(1, "Describe the issue.")
    .max(5000, "Use no more than 5,000 characters."),
});
const person = z.object({ id: z.string(), name: z.string() });
export const issueSchema = z
  .object({
    id: z.string(),
    category: issueInput.shape.category,
    message: z.string(),
    status: z.enum(["OPEN", "RESOLVED"]),
    resolutionNote: z.string().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    roundtable: person,
    raisedBy: person,
    resolvedBy: person.nullable(),
  })
  .refine(
    (row) =>
      row.status === "OPEN"
        ? row.resolvedBy === null &&
          row.resolvedAt === null &&
          row.resolutionNote === null
        : row.resolvedBy !== null && row.resolvedAt !== null,
    "Issue resolution fields do not match its status",
  );
export const issuePage = z.object({
  data: z.array(issueSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type Issue = z.infer<typeof issueSchema>;
export function createdIssue(
  value: unknown,
  input: z.infer<typeof issueInput>,
  owner: { id: string; roundtableId: string | null },
) {
  const row = z.object({ data: issueSchema }).parse(value).data;
  if (
    row.status !== "OPEN" ||
    row.category !== input.category ||
    row.message !== input.message ||
    row.raisedBy.id !== owner.id ||
    row.roundtable.id !== owner.roundtableId
  )
    throw new Error("The created issue could not be verified");
  return row;
}
export function resolvedIssue(value: unknown, original: Issue) {
  const row = z.object({ data: issueSchema }).parse(value).data;
  if (
    row.id !== original.id ||
    row.status !== "RESOLVED" ||
    row.category !== original.category ||
    row.message !== original.message ||
    row.createdAt !== original.createdAt ||
    row.roundtable.id !== original.roundtable.id ||
    row.raisedBy.id !== original.raisedBy.id
  )
    throw new Error("The resolved issue could not be verified");
  // A repeat resolve deliberately returns the existing resolver/note unchanged.
  return row;
}
export function readIssuePage(
  value: unknown,
  page: number,
  status: "OPEN" | "RESOLVED" | "",
  owner?: { id: string; roundtableId: string | null },
) {
  const result = issuePage.parse(value),
    { data, meta } = result;
  if (
    meta.page !== page ||
    meta.pageSize !== 20 ||
    meta.totalPages !== Math.ceil(meta.total / 20) ||
    data.length > Math.max(0, Math.min(20, meta.total - (page - 1) * 20)) ||
    new Set(data.map((row) => row.id)).size !== data.length ||
    data.some(
      (row) =>
        (status && row.status !== status) ||
        (owner &&
          (row.raisedBy.id !== owner.id ||
            row.roundtable.id !== owner.roundtableId)),
    )
  )
    throw new Error("The issue list could not be verified");
  return result;
}
export function uncertainIssueWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
