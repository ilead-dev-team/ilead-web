import { z } from "zod";

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
