import { z } from "zod";
export const configurationName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(200, "Use no more than 200 characters.");
export const sectionTitle = configurationName.max(
  120,
  "Use no more than 120 characters.",
);
export const position = z.number().int().min(0).max(100000);
export const sectionKind = z.enum(["TEXT", "BULLETS", "TABLE"]);
export const activity = z.object({
  id: z.string().min(1),
  name: z.string(),
  isActive: z.boolean(),
  position,
});
export const section = z.object({
  id: z.string().min(1),
  key: z.string(),
  title: z.string(),
  kind: sectionKind,
  autoSource: z.enum(["NONE", "PROGRESS", "ACTIVITIES"]),
  isMandatory: z.boolean(),
  isPreselected: z.boolean(),
  isSystem: z.boolean(),
  isArchived: z.boolean(),
  position,
});
export const metadata = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const activityPage = z.object({
  data: z.array(activity),
  meta: metadata,
});
export const sectionPage = z.object({ data: z.array(section), meta: metadata });
export type Activity = z.infer<typeof activity>;
export type Section = z.infer<typeof section>;
