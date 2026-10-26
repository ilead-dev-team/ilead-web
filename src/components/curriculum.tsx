"use client";
import styles from "./screen-surfaces.module.css";
import { useEffect, useRef, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import {
  readCurriculum,
  savedLesson,
  curriculumLesson,
  uncertainLessonWrite,
  lessonTitle,
  lesson,
  levelKey,
} from "@/lib/curriculum";
import { useSession } from "./session";
import { Feedback, Pending } from "./account/feedback";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";

function LessonEditor({
  item,
  level,
  levelLabel,
  blocked,
  readBlocked,
  refresh,
  queryKey,
}: {
  item: z.infer<typeof lesson>;
  level: z.infer<typeof levelKey>;
  levelLabel: string;
  blocked: boolean;
  readBlocked: boolean;
  refresh: () => Promise<void>;
  queryKey: readonly string[];
}) {
  const [title, setTitle] = useState(item.title);
  const [invalid, setInvalid] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [checked, setChecked] = useState(false);
  const writing = useRef(false);
  const restoreFocus = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (restoreFocus.current && !blocked && !uncertain && !checking) {
      input.current?.focus();
      restoreFocus.current = false;
    }
  }, [blocked, uncertain, checking]);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["curriculum-write"],
    retry: false,
    mutationFn: async (value: string) =>
      savedLesson(
        await api(`/curriculum/lessons/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: { title: value },
        }),
        item,
        level,
        value,
      ),
    onError: (error) => {
      if (uncertainLessonWrite(error)) setUncertain(true);
    },
    onSuccess: async (data) => {
      setTitle(data.title);
      setSaved(true);
      await refresh();
    },
    onSettled: () => {
      writing.current = false;
    },
  });
  const check = async () => {
    if (checking || writing.current) return;
    setChecking(true);
    setCheckError(null);
    try {
      await cache.fetchQuery({
        queryKey,
        staleTime: 0,
        queryFn: async () => {
          const result = readCurriculum(
            await api("/curriculum"),
            cache.getQueryData<ReturnType<typeof readCurriculum>>(queryKey),
          );
          curriculumLesson(result, item, level);
          return result;
        },
      });
      restoreFocus.current = true;
      setUncertain(false);
      setChecked(true);
      mutation.reset();
    } catch (error) {
      setCheckError(error);
    } finally {
      setChecking(false);
    }
  };
  const id = `lesson-${item.id}`;
  return (
    <form
      aria-label={`Edit ${levelLabel} lesson ${item.number}`}
      className={styles.lesson}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (writing.current || blocked || uncertain || checking) return;
        const result = lessonTitle.safeParse(title);
        setInvalid(
          result.success ? undefined : result.error.issues[0]?.message,
        );
        if (!result.success) {
          input.current?.focus();
          return;
        }
        writing.current = true;
        setSaved(false);
        setChecked(false);
        mutation.reset();
        mutation.mutate(result.data);
      }}
    >
      <Field id={id} label={`Lesson ${item.number} title`} error={invalid}>
        <div className={styles.lessonControls}>
          <Input
            ref={input}
            id={id}
            value={title}
            maxLength={200}
            disabled={blocked || uncertain || checking}
            aria-invalid={!!invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved(false);
            }}
          />
          <Button disabled={blocked || uncertain || checking} type="submit">
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Field>

      <Feedback error={mutation.error} />
      <Pending active={mutation.isPending || checking} />
      {uncertain && (
        <div className="notice mt-3 space-y-3">
          <p>
            Saving is unconfirmed. Your title is retained. Check the saved title
            before making another change.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={readBlocked || checking}
            onClick={() => void check()}
          >
            Check saved title
          </Button>
        </div>
      )}
      <Feedback error={checkError} />
      {checked && (
        <p className="notice" role="status">
          Saved title: {item.title}. Your edit is unchanged.
        </p>
      )}
      {saved && <p role="status">Lesson {item.number} saved.</p>}
    </form>
  );
}

export function Curriculum() {
  const user = useSession();
  const cache = useQueryClient();
  const [selected, setSelected] = useState("ICHOOSE");
  const queryKey = ["curriculum", user.id, user.role, "editor"];
  const writes = useIsMutating({ mutationKey: ["curriculum-write"] });
  const query = useQuery({
    queryKey,
    enabled: user.role !== "FACILITATOR",
    queryFn: async () => {
      const previous =
        cache.getQueryData<ReturnType<typeof readCurriculum>>(queryKey);
      return readCurriculum(await api("/curriculum"), previous);
    },
  });
  const views = useMutation({
    retry: false,
    mutationFn: async () => {
      const results = await Promise.allSettled(
        ["curriculum", "roundtables", "entry-rows", "dashboard"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }, { throwOnError: true }),
        ),
      );
      if (results.some((result) => result.status === "rejected"))
        throw new ApiError(
          0,
          "REFRESH_FAILED",
          "Some lesson views could not refresh. Retry refreshing views; a confirmed save remains recorded.",
        );
    },
  });
  const refresh = async () => {
    await views.mutateAsync().catch(() => undefined);
  };
  const blocked =
    query.isError || query.isFetching || writes > 0 || views.isPending;
  return (
    <section className={styles.page}>
      <h1>Curriculum</h1>

      <Pending active={query.isFetching || views.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button
          disabled={query.isFetching || writes > 0}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      )}
      {query.isError && query.data && (
        <p className="notice">
          Last loaded curriculum is shown. Saving is disabled until a successful
          read; your edits are retained.
        </p>
      )}
      <Feedback error={views.error} />
      {views.isError && (
        <Button
          variant="outline"
          disabled={query.isFetching || writes > 0 || views.isPending}
          onClick={() => void refresh()}
        >
          Retry refreshing lesson views
        </Button>
      )}
      {query.data && (
        <>
          <div className={styles.filter}>
            <Field id="curriculum-level" label="Level">
              <Select
                id="curriculum-level"
                value={selected}
                disabled={writes > 0 || query.isFetching || views.isPending}
                onChange={(event) => setSelected(event.target.value)}
              >
                {query.data.data.levels.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {query.data.data.levels.map((level) => (
            <div key={level.key} hidden={selected !== level.key}>
              <section
                aria-label={`${level.label} lessons`}
                className={styles.lessonList}
              >
                {level.lessons.map((item) => (
                  <LessonEditor
                    key={item.id}
                    item={item}
                    level={level.key}
                    levelLabel={level.label}
                    blocked={blocked}
                    readBlocked={
                      query.isFetching || writes > 0 || views.isPending
                    }
                    refresh={refresh}
                    queryKey={queryKey}
                  />
                ))}
              </section>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
