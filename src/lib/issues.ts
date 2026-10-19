import { z } from "zod";
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
export const issueSchema = z.object({
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
});
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
