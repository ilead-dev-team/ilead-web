"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  activity,
  section,
  activityPage,
  sectionPage,
  configurationName,
  sectionTitle,
  position,
  sectionKind,
  type Activity,
  type Section,
} from "@/lib/configuration";
import { useSession } from "./session";
import { Feedback, Pending } from "./account/feedback";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";

type Mode = "activities" | "sections";
const endpoint = (mode: Mode) =>
  mode === "activities" ? "/activity-types" : "/section-templates";
function parseRecord(mode: Mode, response: { data: unknown }) {
  return mode === "activities"
    ? activity.parse(response.data)
    : section.parse(response.data);
}
function Editor({
  item,
  mode,
  refresh,
}: {
  item: Activity | Section;
  mode: Mode;
  refresh: () => Promise<void>;
}) {
  const isActivity = "name" in item;
  const [name, setName] = useState(isActivity ? item.name : item.title),
    [order, setOrder] = useState(String(item.position)),
    [enabled, setEnabled] = useState(
      isActivity ? item.isActive : !item.isArchived,
    ),
    [invalid, setInvalid] = useState<string>(),
    [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: async (body: object) => {
      const result = parseRecord(
        mode,
        await api<{ data: unknown }>(
          `${endpoint(mode)}/${encodeURIComponent(item.id)}`,
          { method: "PATCH", body },
        ),
      );
      if (result.id !== item.id)
        throw new Error("Unexpected configuration acknowledgement");
      return result;
    },
    onSuccess: async (record) => {
      setName("name" in record ? record.name : record.title);
      setOrder(String(record.position));
      setEnabled("name" in record ? record.isActive : !record.isArchived);
      setSaved(true);
      await refresh();
    },
  });
  const id = `${mode}-${item.id}`;
  return (
    <form
      aria-label={`Edit ${isActivity ? item.name : item.title}`}
      className="grid gap-4 rounded-xl border border-border p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        mutation.reset();
        const parsed = (
          isActivity ? configurationName : sectionTitle
        ).safeParse(name);
        const parsedOrder = position.safeParse(
          order.trim() ? Number(order) : NaN,
        );
        if (!parsed.success) {
          setInvalid(parsed.error.issues[0]?.message);
          return;
        }
        if (isActivity && !parsedOrder.success) {
          setInvalid("Position must be a whole number from 0 to 100,000.");
          return;
        }
        setInvalid(undefined);
        mutation.mutate(
          isActivity
            ? {
                name: parsed.data,
                position: parsedOrder.data,
                isActive: enabled,
              }
            : {
                title: parsed.data,
                ...(!item.isSystem ? { isArchived: !enabled } : {}),
              },
        );
      }}
    >
      {!isActivity && (
        <p className="text-sm text-muted-foreground">
          {item.kind} ·{" "}
          {item.isSystem
            ? "System section — cannot be archived"
            : "Custom section"}
          {item.isMandatory ? " · Mandatory" : ""}
          {item.isPreselected ? " · Preselected" : ""}
        </p>
      )}
      <Field id={id} label={isActivity ? "Activity name" : "Section title"}>
        <Input
          id={id}
          value={name}
          maxLength={isActivity ? 200 : 120}
          disabled={mutation.isPending}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      {isActivity && (
        <Field
          id={`${id}-order`}
          label="Position"
          help="Lower positions appear first; equal positions use the server’s stable ordering."
        >
          <Input
            id={`${id}-order`}
            type="number"
            min={0}
            max={100000}
            step={1}
            value={order}
            aria-describedby={`${id}-order-help`}
            disabled={mutation.isPending}
            onChange={(e) => {
              setOrder(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
      )}
      {(isActivity || !item.isSystem) && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={mutation.isPending}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
          />
          {isActivity ? "Active" : "Available in section library"}
        </label>
      )}
      {invalid && (
        <p role="alert" className="field-error">
          {invalid}
        </p>
      )}
      <Feedback error={mutation.error} />
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
      {saved && <p role="status">Changes saved.</p>}
    </form>
  );
}
export function Configuration({ mode }: { mode: Mode }) {
  const user = useSession(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("all"),
    [name, setName] = useState(""),
    [kind, setKind] = useState("TEXT"),
    [invalid, setInvalid] = useState<string>(),
    [created, setCreated] = useState(false);
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["configuration", mode] });
  const query = useQuery({
    queryKey: ["configuration", mode, user.id, user.role, filter, page],
    enabled: user.role === "COORDINATOR",
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (filter !== "all")
        params.set(mode === "activities" ? "isActive" : "isArchived", filter);
      const response = await api(`${endpoint(mode)}?${params}`);
      return mode === "activities"
        ? activityPage.parse(response)
        : sectionPage.parse(response);
    },
  });
  const create = useMutation({
    mutationFn: async (body: object) =>
      parseRecord(
        mode,
        await api<{ data: unknown }>(endpoint(mode), { method: "POST", body }),
      ),
    onSuccess: async () => {
      setName("");
      setCreated(true);
      setPage(1);
      setFilter("all");
      await refresh();
    },
  });
  return (
    <section>
      <h1>{mode === "activities" ? "Activity types" : "Section library"}</h1>
      <p className="mb-6 text-muted-foreground">
        {mode === "activities"
          ? "Add, rename, reorder or deactivate activity types. Historical session records are retained."
          : "Add custom report sections or rename existing sections. Archive custom sections to hide them from future selection. System sections stay available; custom sections are not preselected."}
      </p>
      <form
        aria-label="Add configuration"
        className="mb-8 grid gap-4 rounded-xl border border-border p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setCreated(false);
          create.reset();
          const result = (
            mode === "activities" ? configurationName : sectionTitle
          ).safeParse(name);
          setInvalid(
            result.success ? undefined : result.error.issues[0]?.message,
          );
          if (result.success)
            create.mutate(
              mode === "activities"
                ? { name: result.data }
                : { title: result.data, kind: sectionKind.parse(kind) },
            );
        }}
      >
        <h2>{mode === "activities" ? "Add activity type" : "Add section"}</h2>
        <Field
          id="new-name"
          label={
            mode === "activities" ? "New activity name" : "New section title"
          }
          error={invalid}
        >
          <Input
            id="new-name"
            value={name}
            maxLength={mode === "activities" ? 200 : 120}
            aria-invalid={!!invalid}
            aria-describedby={invalid ? "new-name-error" : undefined}
            disabled={create.isPending}
            onChange={(e) => {
              setName(e.target.value);
              setCreated(false);
            }}
          />
        </Field>
        {mode === "sections" && (
          <Field id="new-kind" label="Section kind">
            <Select
              id="new-kind"
              value={kind}
              disabled={create.isPending}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="TEXT">Text</option>
              <option value="BULLETS">Bullet list</option>
              <option value="TABLE">Table</option>
            </Select>
          </Field>
        )}
        <Feedback error={create.error} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add"}
        </Button>
        {created && <p role="status">Added successfully.</p>}
      </form>
      <Field id="configuration-filter" label="Show">
        <Select
          id="configuration-filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All</option>
          <option value={mode === "activities" ? "true" : "false"}>
            {mode === "activities" ? "Active" : "Available"}
          </option>
          <option value={mode === "activities" ? "false" : "true"}>
            {mode === "activities" ? "Inactive" : "Archived"}
          </option>
        </Select>
      </Field>
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {query.data && (
        <>
          <div className="my-6 grid gap-4">
            {query.data.data.length ? (
              query.data.data.map((item) => (
                <Editor
                  key={item.id}
                  item={item}
                  mode={mode}
                  refresh={refresh}
                />
              ))
            ) : (
              <p>No matching records.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <p>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </p>
            <Button
              variant="outline"
              disabled={page >= query.data.meta.totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
