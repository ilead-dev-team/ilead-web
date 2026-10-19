import { z } from "zod";
import { metadata } from "./configuration";
import { api } from "./api";
export const academicYear = z.object({
  id: z.uuid(),
  label: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isCurrent: z.boolean(),
  terms: z.array(
    z.object({
      id: z.uuid(),
      number: z.number().int().min(1).max(3),
      name: z.string(),
      startsOn: z.iso.date(),
      endsOn: z.iso.date(),
    }),
  ),
});
export const academicPage = z.object({
  data: z.array(academicYear),
  meta: metadata,
});
export async function loadAcademicYears(signal?: AbortSignal) {
  const first = academicPage.parse(
    await api("/academic-years?page=1&pageSize=20&sort=startsOn%3Adesc", {
      signal,
    }),
  );
  const years = [...first.data];
  for (let page = 2; page <= first.meta.totalPages; page++) {
    years.push(
      ...academicPage.parse(
        await api(
          `/academic-years?page=${page}&pageSize=20&sort=startsOn%3Adesc`,
          { signal },
        ),
      ).data,
    );
  }
  return years;
}
