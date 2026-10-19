"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { inviteSchema, role, destination, tokenPattern } from "@/lib/account";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Feedback, Pending } from "./feedback";
const summary = z.object({ email: z.email(), role, expiresAt: z.string() });
const labels = {
  FACILITATOR: "Facilitator",
  COORDINATOR: "Coordinator",
  SPONSOR: "Sponsor",
};
export function Invitation({ token }: { token: string }) {
  const router = useRouter(),
    cache = useQueryClient();
  const lookup = useQuery({
    queryKey: ["invitation", token],
    enabled: tokenPattern.test(token),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      summary.parse(
        (
          await api<{ data: unknown }>(
            `/invitations/by-token/${encodeURIComponent(token)}`,
            { public: true },
          )
        ).data,
      ),
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { classYear: "" },
  });
  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof inviteSchema>) => {
      await api(`/invitations/by-token/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        public: true,
        body: {
          name: input.name,
          password: input.password,
          ...(input.classYear ? { classYear: input.classYear } : {}),
        },
      });
      cache.clear();
      router.replace(
        destination({ role: lookup.data!.role, hasRoundtable: false }),
      );
    },
  });
  if (!tokenPattern.test(token) || lookup.isError)
    return (
      <>
        <h1>Invitation unavailable.</h1>
        <p>
          This invitation may have expired, been used or been revoked. Ask the
          inviting Coordinator for a new invitation.
        </p>
        <Feedback error={lookup.error} />
        {lookup.isError && (
          <Button variant="outline" onClick={() => lookup.refetch()}>
            Check again
          </Button>
        )}
        <p className="mt-6">
          <Link href="/login">Back to log in</Link>
        </p>
      </>
    );
  if (lookup.isPending)
    return (
      <>
        <h1>Checking your invitation.</h1>
        <Pending active />
      </>
    );
  const invitation = lookup.data!;
  return (
    <>
      <span className="mb-5 inline-block rounded-lg bg-muted px-3 py-1 text-xs font-semibold">
        {labels[invitation.role]} invitation
      </span>
      <h1>You’re invited to iLead.</h1>
      <p>Create your account to join the leadership program.</p>
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          if (invitation.role !== "SPONSOR" && !v.classYear) {
            setError("classYear", { message: "Choose your class." });
            return;
          }
          mutation.mutate(v);
        })}
      >
        <Field id="invited-email" label="Invited email">
          <Input
            id="invited-email"
            value={invitation.email}
            readOnly
            autoComplete="username"
          />
        </Field>
        <Field id="name" label="Full name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            {...register("name")}
          />
        </Field>
        {invitation.role !== "SPONSOR" && (
          <Field id="classYear" label="Class" error={errors.classYear?.message}>
            <Select
              id="classYear"
              aria-invalid={!!errors.classYear}
              aria-describedby={
                errors.classYear ? "classYear-error" : undefined
              }
              {...register("classYear")}
            >
              <option value="">Choose your class</option>
              <option value="YEAR_1">Year 1</option>
              <option value="YEAR_2">Year 2</option>
              <option value="YEAR_3">Year 3</option>
            </Select>
          </Field>
        )}
        <Field
          id="password"
          label="Password"
          help="At least 8 characters, one letter and one number."
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={`password-help${errors.password ? " password-error" : ""}`}
            {...register("password")}
          />
        </Field>
        <Field
          id="confirmation"
          label="Confirm password"
          error={errors.confirmation?.message}
        >
          <Input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmation}
            aria-describedby={
              errors.confirmation ? "confirmation-error" : undefined
            }
            {...register("confirmation")}
          />
        </Field>
        <Feedback error={mutation.error} />
        <Pending active={mutation.isPending} />
        <Button className="w-full" disabled={mutation.isPending}>
          Accept invitation
        </Button>
      </form>
      <p className="mt-6 text-xs text-muted-foreground">
        Single-use invitation · expires{" "}
        {new Date(invitation.expiresAt).toLocaleString("en-GB", {
          timeZone: "Africa/Kigali",
        })}{" "}
        Kigali time.
      </p>
    </>
  );
}
