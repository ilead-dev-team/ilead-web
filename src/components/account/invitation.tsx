"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import {
  inviteSchema,
  destination,
  tokenPattern,
  userSchema,
} from "@/lib/account";
import {
  acceptance,
  invitationSummary,
  unconfirmedAccountWrite,
} from "@/lib/account-delivery";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Feedback, Pending } from "./feedback";
const labels = {
  FACILITATOR: "Facilitator",
  COORDINATOR: "Coordinator",
  SPONSOR: "Sponsor",
};
export function Invitation({ token }: { token: string }) {
  const router = useRouter(),
    cache = useQueryClient();
  const [result, setResult] = useState<"accepted" | "unconfirmed" | null>(null);
  const lookup = useQuery({
    queryKey: ["invitation", token],
    enabled: tokenPattern.test(token),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      invitationSummary.parse(
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
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { classYear: "" },
  });
  const continuation = useMutation({
    retry: false,
    mutationFn: async (id?: string) => {
      const user = userSchema.parse(
        (await api<{ data: unknown }>("/auth/me", { public: true })).data,
      );
      if (
        user.email.toLowerCase() !== lookup.data?.email.toLowerCase() ||
        user.role !== lookup.data?.role ||
        (id && user.id !== id)
      )
        throw new ApiError(
          409,
          "ACCOUNT_CHANGED",
          "This sign-in does not match the invitation. Log in with the invited account.",
        );
      cache.clear();
      cache.setQueryData(["session"], user);
      router.replace(destination(user));
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: z.infer<typeof inviteSchema>) => {
      return acceptance(
        await api(`/invitations/by-token/${encodeURIComponent(token)}/accept`, {
          method: "POST",
          public: true,
          body: {
            name: input.name,
            password: input.password,
            ...(input.classYear ? { classYear: input.classYear } : {}),
          },
        }),
        lookup.data!,
      );
    },
    onSuccess: (user) => {
      reset();
      setResult("accepted");
      continuation.mutate(user.id);
    },
    onError: (cause) => {
      if (unconfirmedAccountWrite(cause)) {
        reset();
        setResult("unconfirmed");
      }
    },
  });
  if (result)
    return (
      <>
        <h1>
          {result === "accepted"
            ? "Account created."
            : "Account creation not confirmed."}
        </h1>
        <p role="status">
          {result === "accepted"
            ? "Your invitation was accepted. Open your workspace to continue."
            : "The request may have completed. Check your sign-in or log in with the invited email and chosen password before requesting a new invitation."}
        </p>
        <Feedback error={continuation.error} />
        <Pending active={continuation.isPending} />
        <Button
          disabled={continuation.isPending}
          onClick={() => continuation.mutate(undefined)}
        >
          {result === "accepted" ? "Open workspace" : "Check sign-in"}
        </Button>
        <p className="mt-6">
          <Link href="/login">Back to log in</Link>
        </p>
        <p className="mt-3">
          <Link href="/forgot-password">Request password recovery</Link>
        </p>
      </>
    );
  if (!tokenPattern.test(token) || (lookup.isError && !lookup.data))
    return (
      <>
        <h1>
          {lookup.isError && unconfirmedAccountWrite(lookup.error)
            ? "Could not check invitation."
            : "Invitation unavailable."}
        </h1>
        <p>
          {lookup.isError && unconfirmedAccountWrite(lookup.error)
            ? "The invitation could not be checked. Try again when the connection is available."
            : "This invitation may have expired, been used or been revoked. Ask the inviting Coordinator for a new invitation."}
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
          if (mutation.isPending || lookup.isFetching || lookup.isError) return;
          if (invitation.role !== "SPONSOR" && !v.classYear) {
            setError(
              "classYear",
              { message: "Choose your class." },
              { shouldFocus: true },
            );
            return;
          }
          mutation.mutate(v);
        })}
      >
        <fieldset
          aria-label="Invitation account details"
          disabled={mutation.isPending}
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
            <Field
              id="classYear"
              label="Class"
              error={errors.classYear?.message}
            >
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
          <Feedback error={lookup.error} />
          {lookup.isError && (
            <Button
              type="button"
              variant="outline"
              disabled={lookup.isFetching}
              onClick={() => lookup.refetch()}
            >
              Check again
            </Button>
          )}
          <Pending active={mutation.isPending} />
          <Button
            className="w-full"
            disabled={mutation.isPending || lookup.isFetching || lookup.isError}
          >
            Accept invitation
          </Button>
        </fieldset>
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
