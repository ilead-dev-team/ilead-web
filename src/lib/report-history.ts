import { z } from "zod";
import { metadata } from "./configuration";
import { reportSection } from "./reports";
export const versionNumber = z.number().int().positive().max(2147483647);
export const versionPage = z
  .object({
    data: z.array(
      z.object({ version: versionNumber, sentAt: z.iso.datetime() }),
    ),
    meta: metadata,
  })
  .refine(
    (value) =>
      new Set(value.data.map((row) => row.version)).size === value.data.length,
    "Duplicate versions",
  );
const snapshot = z.object({
  id: z.uuid(),
  status: z.enum(["SENT", "CHANGES_REQUESTED"]),
  version: versionNumber,
  author: z.object({ id: z.uuid(), name: z.string() }),
  session: z.object({ id: z.uuid(), date: z.iso.date() }),
  academicYearId: z.uuid(),
  academicYear: z.string(),
  term: z.object({ id: z.uuid(), name: z.string() }),
  sections: z.array(reportSection).min(2).max(30),
  openChangeRequests: z.number().int().nonnegative().default(0),
  sentAt: z.iso.datetime(),
});
export function parseVersion(
  value: unknown,
  id: string,
  version: number,
  sessionId: string,
) {
  const result = snapshot.parse(value);
  if (
    result.id !== id ||
    result.version !== version ||
    result.session.id !== sessionId
  )
    throw new Error("Unexpected report version");
  return result;
}
export const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export async function validateDocx(blob: Blob, type: string | null) {
  if (type?.split(";")[0]?.trim().toLowerCase() !== docxMime || blob.size === 0)
    throw new Error("Invalid Word download");
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4)
    throw new Error("Invalid Word download");
  return blob;
}
