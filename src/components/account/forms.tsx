"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  loginSchema,
  forgotSchema,
  resetSchema,
  userSchema,
  permittedNext,
  tokenPattern,
} from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Feedback, Pending } from "./feedback";

export function LoginForm() {
  const router = useRouter(),
    params = useSearchParams(),
    cache = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  const next = params.get("next");
  const proceed = async () => {
    const result = await api<{ data: unknown }>("/auth/me");
    const user = userSchema.parse(result.data);
    cache.clear();
    cache.setQueryData(["session"], user);
    router.replace(permittedNext(next, user));
  };
  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof loginSchema>) => {
      await api("/auth/login", { method: "POST", body: input, public: true });
      setSignedIn(true);
      await proceed();
    },
  });
  const continuation = useMutation({ mutationFn: proceed });
  return (
    <>
      <h1>Welcome back.</h1>
      <p>Log in to your iLead workspace.</p>
      {signedIn ? (
        <>
          <p role="status">
            You are signed in. Open your workspace to continue.
          </p>
          <Feedback error={mutation.error || continuation.error} />
          <Button
            onClick={() => continuation.mutate()}
            disabled={continuation.isPending}
          >
            Open workspace
          </Button>
        </>
      ) : (
        <form noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <Field id="email" label="Email address" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
          </Field>
          <Field
            id="password"
            label="Password"
            error={errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
          </Field>
          <div className="mb-6 text-right">
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <Feedback error={mutation.error} />
          <Pending active={mutation.isPending} />
          <Button className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Logging in…" : "Log in"}
          </Button>
        </form>
      )}
      <p className="mt-7 text-sm text-muted-foreground">
        New to iLead? Ask a Coordinator for an invitation.
      </p>
    </>
  );
}
export function ForgotForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
  });
  const mutation = useMutation({
    mutationFn: (body: z.infer<typeof forgotSchema>) =>
      api("/auth/forgot-password", { method: "POST", body, public: true }),
  });
  return (
    <>
      <h1>Forgot your password?</h1>
      <p>Enter your account email to request help from a Coordinator.</p>
      {mutation.isSuccess ? (
        <div role="status" className="notice">
          If the account exists, a Coordinator will help you recover it. Watch
          your email for a reset link.
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <Field id="email" label="Email address" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
          </Field>
          <Feedback error={mutation.error} />
          <Pending active={mutation.isPending} />
          <Button className="w-full" disabled={mutation.isPending}>
            Request password recovery
          </Button>
        </form>
      )}
      <p className="mt-7">
        <Link href="/login">Back to log in</Link>
      </p>
    </>
  );
}
export function ResetForm({ token }: { token: string }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
  });
  useEffect(() => {
    window.history.replaceState(null, "", "/reset-password");
  }, []);
  const mutation = useMutation({
    mutationFn: ({ password }: z.infer<typeof resetSchema>) =>
      api("/auth/reset-password", {
        method: "POST",
        body: { token, password },
        public: true,
      }),
  });
  if (!tokenPattern.test(token))
    return (
      <>
        <h1>Reset link unavailable.</h1>
        <p>Open the full link from your email, or request a new one.</p>
        <Link href="/forgot-password">Request password recovery</Link>
      </>
    );
  if (mutation.isSuccess)
    return (
      <>
        <h1>Password reset.</h1>
        <p role="status">
          Your password has changed. Log in with your new password.
        </p>
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </>
    );
  return (
    <>
      <h1>Choose a new password.</h1>
      <p>A fresh start for your account.</p>
      <form noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        <Field
          id="password"
          label="New password"
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
          label="Confirm new password"
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
          Reset password
        </Button>
      </form>
      <p className="mt-7">
        <Link href="/forgot-password">
          Expired or used link? Request a new one.
        </Link>
      </p>
    </>
  );
}
