"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  curriculumResponse,
  lessonResponse,
  lessonTitle,
  lesson,
} from "@/lib/curriculum";
import { useSession } from "./session";
import { Feedback, Pending } from "./account/feedback";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";

function LessonEditor({ item }: { item: z.infer<typeof lesson> }) {
  const [title, setTitle] = useState(item.title),
    [invalid, setInvalid] = useState<string>(),
    [saved, setSaved] = useState(false);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const response = lessonResponse.parse(
        await api(`/curriculum/lessons/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: { title: value },
        }),
      );
      if (response.data.id !== item.id || response.data.number !== item.number)
        throw new Error("Unexpected lesson acknowledgement");
      return response.data;
    },
    onSuccess: async (data) => {
      setTitle(data.title);
      setSaved(true);
      await cache.invalidateQueries({ queryKey: ["curriculum"] });
    },
  });
  const id = `lesson-${item.id}`;
  return (
    <form
      className="rounded-xl border border-border p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        mutation.reset();
        const result = lessonTitle.safeParse(title);
        setInvalid(
          result.success ? undefined : result.error.issues[0]?.message,
        );
        if (result.success) mutation.mutate(result.data);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field id={id} label={`Lesson ${item.number} title`} error={invalid}>
            <Input
              id={id}
              value={title}
              maxLength={200}
              disabled={mutation.isPending}
              aria-invalid={!!invalid}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
            />
          </Field>
        </div>
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Feedback error={mutation.error} />
      {saved && <p role="status">Lesson {item.number} saved.</p>}
    </form>
  );
}

export function Curriculum() {
  const user = useSession(),
    [selected, setSelected] = useState("ICHOOSE");
  const query = useQuery({
    queryKey: ["curriculum", user.id, user.role],
    enabled: user.role !== "FACILITATOR",
    queryFn: async () => curriculumResponse.parse(await api("/curriculum")),
  });
  return (
    <section>
      <h1>Curriculum</h1>
      <p className="mb-6 text-muted-foreground">
        Edit lesson titles used throughout iLead. Levels and lesson numbers are
        fixed. Saved titles apply to future views of existing records.
      </p>
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {query.data && (
        <>
          <Field id="curriculum-level" label="Level">
            <Select
              id="curriculum-level"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {query.data.data.levels.map((level) => (
                <option key={level.key} value={level.key}>
                  {level.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-6 grid gap-4">
            {query.data.data.levels
              .find((level) => level.key === selected)
              ?.lessons.map((item) => (
                <LessonEditor key={item.id} item={item} />
              ))}
          </div>
        </>
      )}
    </section>
  );
}
