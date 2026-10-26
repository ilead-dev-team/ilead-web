import { z } from "zod";
import { api, ApiError } from "./api";
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
export const sectionKindLabels = {
  TEXT: "Text",
  BULLETS: "Bullet list",
  TABLE: "Table",
} satisfies Record<z.infer<typeof sectionKind>, string>;
export const activity = z.object({
  id: z.string().min(1),
  name: configurationName,
  isActive: z.boolean(),
  position,
});
export const section = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  title: sectionTitle,
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
export type ConfigurationMode = "activities" | "sections";
export type ConfigurationRecord = Activity | Section;
export const configurationEndpoint = (mode: ConfigurationMode) =>
  mode === "activities" ? "/activity-types" : "/section-templates";

function record(mode: ConfigurationMode, value: unknown) {
  return mode === "activities" ? activity.parse(value) : section.parse(value);
}
export function sameConfigurationIdentity(
  current: ConfigurationRecord,
  original: ConfigurationRecord,
) {
  if (current.id !== original.id || "name" in current !== "name" in original)
    throw new Error("The configuration record could not be verified");
  if (!("name" in current) && !("name" in original))
    for (const key of [
      "key",
      "kind",
      "autoSource",
      "isSystem",
      "isMandatory",
      "isPreselected",
      "position",
    ] as const)
      if (current[key] !== original[key])
        throw new Error("The section identity could not be verified");
  return current;
}
export function savedConfiguration(
  mode: ConfigurationMode,
  value: unknown,
  body: Record<string, unknown>,
  original?: ConfigurationRecord,
) {
  const result = record(
    mode,
    z.object({ data: z.unknown() }).parse(value).data,
  );
  if (original) sameConfigurationIdentity(result, original);
  for (const [key, expected] of Object.entries(body))
    if (!(key in result) || result[key as keyof typeof result] !== expected)
      throw new Error("The saved configuration could not be verified");
  if (!original) {
    if ("name" in result) {
      if (!result.isActive)
        throw new Error("The new activity could not be verified");
    } else if (
      result.isSystem ||
      result.isMandatory ||
      result.isPreselected ||
      result.isArchived ||
      result.autoSource !== "NONE"
    )
      throw new Error("The new section could not be verified");
  } else if (
    !("name" in result) &&
    !("name" in original) &&
    !("isArchived" in body) &&
    result.isArchived !== original.isArchived
  )
    throw new Error("The saved section availability could not be verified");
  return result;
}
export function readConfigurationPage(
  mode: ConfigurationMode,
  value: unknown,
  page: number,
  pageSize = 20,
) {
  const result =
    mode === "activities"
      ? activityPage.parse(value)
      : sectionPage.parse(value);
  if (
    result.meta.page !== page ||
    result.meta.pageSize !== pageSize ||
    result.meta.totalPages !== Math.ceil(result.meta.total / pageSize) ||
    result.data.length > Math.min(pageSize, result.meta.total) ||
    new Set(result.data.map((row) => row.id)).size !== result.data.length
  )
    throw new Error("The requested configuration page could not be verified");
  return result;
}
export function uncertainConfigurationWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
// Recovery is read-only and bounded; detected pagination inconsistencies keep writes locked.
export async function checkConfigurationRecords(
  mode: ConfigurationMode,
  load: (path: string, signal: AbortSignal) => Promise<unknown> = (
    path,
    signal,
  ) => api(path, { signal }),
) {
  const rows: ConfigurationRecord[] = [];
  const signal = AbortSignal.timeout(60000);
  let total: number | undefined;
  for (let page = 1; page <= 20; page++) {
    const result = readConfigurationPage(
      mode,
      await load(
        `${configurationEndpoint(mode)}?page=${page}&pageSize=100`,
        signal,
      ),
      page,
      100,
    );
    total ??= result.meta.total;
    if (
      result.meta.total !== total ||
      result.meta.totalPages > 20 ||
      result.data.length !==
        Math.min(100, Math.max(0, total - (page - 1) * 100))
    )
      throw new Error("The complete saved configuration could not be verified");
    rows.push(...result.data);
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error("Configuration pages overlap; check again");
    if (page >= result.meta.totalPages) return rows;
  }
  throw new Error("The saved configuration could not be verified");
}
