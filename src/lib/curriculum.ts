import { z } from "zod";
import { ApiError } from "./api";

export const lessonTitle = z
  .string()
  .trim()
  .min(1, "Enter a lesson title.")
  .max(200, "Use no more than 200 characters.");
export const lesson = z.object({
  id: z.string().min(1),
  number: z.number().int().min(1).max(16),
  title: lessonTitle,
});
export const levelKey = z.enum(["ICHOOSE", "IDO", "ILEAD"]);
export const curriculumResponse = z.object({
  data: z.object({
    levels: z.array(
      z.object({
        key: levelKey,
        label: z.string(),
        order: z.number().int(),
        lessons: z.array(lesson),
      }),
    ),
  }),
});
export const lessonResponse = z.object({
  data: lesson.extend({ level: levelKey }),
});
export const curriculumLevels = [
  { key: "ICHOOSE", label: "iChoose", order: 1 },
  { key: "IDO", label: "iDo", order: 2 },
  { key: "ILEAD", label: "iLead", order: 3 },
] as const;
export function readCurriculum(
  value: unknown,
  previous?: z.infer<typeof curriculumResponse>,
) {
  const result = curriculumResponse.parse(value);
  const levels = result.data.levels;
  if (
    levels.length !== 3 ||
    curriculumLevels.some((expected, index) => {
      const current = levels[index];
      return (
        !current ||
        current.key !== expected.key ||
        current.label !== expected.label ||
        current.order !== expected.order ||
        current.lessons.length !== 16 ||
        current.lessons.some((item, position) => item.number !== position + 1)
      );
    }) ||
    new Set(levels.flatMap((current) => current.lessons.map((item) => item.id)))
      .size !== 48
  )
    throw new Error("The complete curriculum could not be verified");
  if (
    previous?.data.levels.some((level, index) =>
      level.lessons.some(
        (item, position) => levels[index]?.lessons[position]?.id !== item.id,
      ),
    )
  )
    throw new Error(
      "Curriculum lesson identities changed; reload before editing",
    );
  return result;
}
export function savedLesson(
  value: unknown,
  original: z.infer<typeof lesson>,
  level: z.infer<typeof levelKey>,
  title: string,
) {
  const result = lessonResponse.parse(value).data;
  if (
    result.id !== original.id ||
    result.number !== original.number ||
    result.level !== level ||
    result.title !== title
  )
    throw new Error("The saved lesson could not be verified");
  return result;
}
export function curriculumLesson(
  value: ReturnType<typeof readCurriculum>,
  original: z.infer<typeof lesson>,
  level: z.infer<typeof levelKey>,
) {
  const result = value.data.levels
    .find((current) => current.key === level)
    ?.lessons.find((item) => item.id === original.id);
  if (!result || result.number !== original.number)
    throw new Error("The requested lesson could not be verified");
  return result;
}
export function uncertainLessonWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
