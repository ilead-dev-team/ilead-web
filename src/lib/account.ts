import { z } from "zod";
export const role = z.enum(["FACILITATOR", "COORDINATOR", "SPONSOR"]);
export const classYear = z.enum(["YEAR_1", "YEAR_2", "YEAR_3"]);
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role,
  classYear: classYear.nullable(),
  hasRoundtable: z.boolean(),
  roundtableId: z.string().nullable(),
});
export type User = z.infer<typeof userSchema>;
export const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(256)
  .regex(/[A-Za-z]/, "Include a letter.")
  .regex(/[0-9]/, "Include a number.");
export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(256),
});
export const forgotSchema = loginSchema.pick({ email: true });
export const resetSchema = z
  .object({ password, confirmation: z.string() })
  .refine((v) => v.password === v.confirmation, {
    path: ["confirmation"],
    message: "The passwords do not match.",
  });
export const inviteSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(100),
    password,
    confirmation: z.string(),
    classYear: classYear.or(z.literal("")),
  })
  .refine((v) => v.password === v.confirmation, {
    path: ["confirmation"],
    message: "The passwords do not match.",
  });
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function destination(user: Pick<User, "role" | "hasRoundtable">) {
  return user.role === "FACILITATOR"
    ? user.hasRoundtable
      ? "/my-roundtable"
      : "/register-roundtable"
    : "/dashboard";
}
export function permittedNext(next: string | null, user: User) {
  const base = destination(user);
  if (user.role === "FACILITATOR" && !user.hasRoundtable) return base;
  if (
    !next ||
    !/^\/[a-z0-9/-]+(?:\?[a-zA-Z0-9_=&-]*)?$/.test(next) ||
    next.startsWith("//")
  )
    return base;
  const path = next.split("?")[0];
  const allowed =
    user.role === "FACILITATOR"
      ? ["/my-roundtable", "/issues"]
      : user.role === "COORDINATOR"
        ? [
            "/dashboard",
            "/mailbox",
            "/people/recovery",
            "/settings/activities",
            "/settings/sections",
            "/issues",
            "/curriculum",
          ]
        : ["/dashboard", "/curriculum"];
  return allowed.includes(path!) || roundtablePath(path!, user.role)
    ? next
    : base;
}

export function roundtablePath(path: string, role: string) {
  return (
    role !== "FACILITATOR" &&
    (path === "/roundtables" ||
      /^\/roundtables\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        path,
      ) ||
      (role === "COORDINATOR" && path === "/roundtables/trash"))
  );
}
