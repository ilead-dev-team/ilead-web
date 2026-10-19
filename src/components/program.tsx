"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
export function Dashboard() {
  const user = useSession();
  const query = useQuery({
    queryKey: ["dashboard", user.id],
    queryFn: () =>
      api<{
        data: {
          academicYear: { label: string };
          cards: Record<string, number>;
        };
      }>("/dashboard/summary"),
  });
  const labels = {
    activeRoundtables: "Active roundtables",
    sessionsHeld: "Sessions held",
    staleRoundtables: "Stale roundtables",
    unregisteredFacilitators: "Unregistered Facilitators",
  };
  return (
    <>
      <h1>Welcome back, {user.name}.</h1>
      <p className="text-muted-foreground">
        A clear view of the program, one session at a time.
      </p>
      <Pending active={query.isPending} />
      {query.isError && (
        <>
          <Feedback error={query.error} />
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </>
      )}
      {query.data && (
        <>
          <p className="mt-6 text-sm">{query.data.data.academicYear.label}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(labels).map(([key, label]) => (
              <div
                className="rounded-lg border border-border bg-card p-6"
                key={key}
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-3 text-3xl font-semibold">
                  {query.data.data.cards[key]}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </>
  );
}
const registration = z.object({
  name: z.string().trim().min(3).max(40),
  slogan: z.string().trim().min(3).max(80),
  classYear: z.enum(["YEAR_1", "YEAR_2", "YEAR_3"]),
  level: z.enum(["ICHOOSE", "IDO", "ILEAD"]),
  lastCompletedLesson: z.number().int().min(0).max(16),
});
type Registration = z.infer<typeof registration>;
type Curriculum = {
  levels: {
    key: Registration["level"];
    label: string;
    lessons: { id: string; number: number; title: string }[];
  }[];
};
export function RegisterRoundtable() {
  const user = useSession(),
    cache = useQueryClient();
  const curriculum = useQuery({
    queryKey: ["curriculum"],
    queryFn: () => api<{ data: Curriculum }>("/curriculum"),
    staleTime: 3600000,
  });
  const {
    register,
    handleSubmit,
    getValues,
    control,
    formState: { errors },
  } = useForm<Registration>({
    resolver: zodResolver(registration),
    defaultValues: {
      classYear: user.classYear ?? "YEAR_1",
      level: "ICHOOSE",
      lastCompletedLesson: 0,
    },
  });
  const selected = useWatch({ control, name: "level" });
  const check = useMutation({
    mutationFn: (name: string) =>
      api<{ data: { available: boolean; similarTo?: string } }>(
        `/roundtables/check-name?name=${encodeURIComponent(name)}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (body: Registration) =>
      api("/roundtables", { method: "POST", body }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["session"] });
    },
  });
  return (
    <div className="max-w-xl">
      <h1>Register your roundtable.</h1>
      <p className="mb-7 text-muted-foreground">
        Choose the starting point from your roundtable’s completed lessons.
      </p>
      <Pending active={curriculum.isPending} />
      {curriculum.isError && (
        <>
          <Feedback error={curriculum.error} />
          <Button onClick={() => curriculum.refetch()}>Try again</Button>
        </>
      )}
      {curriculum.data && (
        <form noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <Field id="name" label="Roundtable name" error={errors.name?.message}>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name", { onChange: () => check.reset() })}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate(getValues("name"))}
          >
            Check name
          </Button>
          <Feedback error={check.error} />
          {check.data && (
            <p role="status" className="notice">
              {check.data.data.available
                ? "This name is available. Availability is checked again when you register."
                : `Choose a different name. It is too close to ${check.data.data.similarTo}.`}
            </p>
          )}
          <Field id="slogan" label="Slogan" error={errors.slogan?.message}>
            <Input
              id="slogan"
              aria-invalid={!!errors.slogan}
              aria-describedby={errors.slogan ? "slogan-error" : undefined}
              {...register("slogan")}
            />
          </Field>
          <Field id="classYear" label="Class">
            <Select id="classYear" {...register("classYear")}>
              <option value="YEAR_1">Year 1</option>
              <option value="YEAR_2">Year 2</option>
              <option value="YEAR_3">Year 3</option>
            </Select>
          </Field>
          <Field id="level" label="Starting level">
            <Select id="level" {...register("level")}>
              {curriculum.data.data.levels.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="lesson" label="Last completed lesson">
            <Select
              id="lesson"
              {...register("lastCompletedLesson", { valueAsNumber: true })}
            >
              <option value={0}>No lesson completed at this level</option>
              {curriculum.data.data.levels
                .find((l) => l.key === selected)
                ?.lessons.map((l) => (
                  <option value={l.number} key={l.id}>
                    {l.number}. {l.title}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="notice">
            All earlier levels and lessons through your selection will be
            recorded as already completed, without session dates. Coordinators
            record future progress.
          </p>
          <Feedback error={mutation.error} />
          <Pending active={mutation.isPending} />
          <Button disabled={mutation.isPending}>Register roundtable</Button>
        </form>
      )}
    </div>
  );
}
