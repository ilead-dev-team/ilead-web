"use client";
import styles from "./administration.module.css";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  configurationName,
  sectionTitle,
  position,
  sectionKind,
  sectionKindLabels,
  configurationEndpoint,
  savedConfiguration,
  readConfigurationPage,
  uncertainConfigurationWrite,
  checkConfigurationRecords,
  sameConfigurationIdentity,
  type ConfigurationMode as Mode,
  type ConfigurationRecord as Record,
} from "@/lib/configuration";
import { useSession } from "./session";
import { Feedback, Pending } from "./account/feedback";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";

function Editor({
  item,
  mode,
  blocked,
  beginEdit,
  beginWrite,
  release,
  finish,
  refresh,
}: {
  item: Record;
  mode: Mode;
  blocked: boolean;
  beginEdit: () => void;
  beginWrite: () => boolean;
  release: () => void;
  finish: () => void;
  refresh: () => Promise<void>;
}) {
  const isActivity = "name" in item;
  const [name, setName] = useState(isActivity ? item.name : item.title);
  const [order, setOrder] = useState(String(item.position));
  const [enabled, setEnabled] = useState(
    isActivity ? item.isActive : !item.isArchived,
  );
  const [invalid, setInvalid] = useState<{ name?: string; order?: string }>({});
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<Record>();
  const [compared, setCompared] = useState(false);
  const [checkError, setCheckError] = useState<unknown>();
  const nameInput = useRef<HTMLInputElement>(null),
    orderInput = useRef<HTMLInputElement>(null);
  const focusAfter = useRef(false),
    checkLock = useRef(false);
  const loaded = checked ?? item;
  const disabled = blocked || uncertain || checking;
  useEffect(() => {
    if (focusAfter.current && !disabled) {
      nameInput.current?.focus();
      focusAfter.current = false;
    }
  }, [disabled]);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (body: { [key: string]: unknown }) =>
      savedConfiguration(
        mode,
        await api(
          `${configurationEndpoint(mode)}/${encodeURIComponent(item.id)}`,
          { method: "PATCH", body },
        ),
        body,
        item,
      ),
    onError: (error) => {
      if (uncertainConfigurationWrite(error)) setUncertain(true);
    },
    onSuccess: async (record) => {
      setName("name" in record ? record.name : record.title);
      setOrder(String(record.position));
      setEnabled("name" in record ? record.isActive : !record.isArchived);
      setChecked(record);
      setCompared(false);
      setSaved(true);
      finish();
      await refresh();
    },
    onSettled: release,
  });
  const check = async () => {
    if (checkLock.current || blocked) return;
    checkLock.current = true;
    setChecking(true);
    setCheckError(undefined);
    try {
      const rows = await checkConfigurationRecords(mode);
      const current = rows.find((row) => row.id === item.id);
      if (!current) throw new Error("The edited record could not be found");
      setChecked(sameConfigurationIdentity(current, item));
      setCompared(true);
      setUncertain(false);
      mutation.reset();
      focusAfter.current = true;
    } catch (error) {
      setCheckError(error);
    } finally {
      setChecking(false);
      checkLock.current = false;
    }
  };
  const change = () => {
    beginEdit();
    setSaved(false);
    setCompared(false);
  };
  const id = `${mode}-${item.id}`;
  return (
    <form
      aria-label={`Edit ${isActivity ? item.name : item.title}`}
      className={`${styles.panel} grid gap-4`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || mutation.isPending) return;
        const parsed = (
          isActivity ? configurationName : sectionTitle
        ).safeParse(name);
        const parsedOrder = position.safeParse(
          order.trim() ? Number(order) : NaN,
        );
        setInvalid({
          name: parsed.success ? undefined : parsed.error.issues[0]?.message,
          order:
            isActivity && !parsedOrder.success
              ? "Position must be a whole number from 0 to 100,000."
              : undefined,
        });
        if (!parsed.success) {
          nameInput.current?.focus();
          return;
        }
        if (isActivity && !parsedOrder.success) {
          orderInput.current?.focus();
          return;
        }
        if (!beginWrite()) return;
        setSaved(false);
        setCheckError(undefined);
        mutation.reset();
        focusAfter.current = true;
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
      <p className="min-w-0 [overflow-wrap:anywhere] text-sm text-muted-foreground">
        Last loaded:{" "}
        {"name" in loaded
          ? `${loaded.name} · Position ${loaded.position} · ${loaded.isActive ? "Active" : "Inactive"}`
          : `${loaded.title} · ${loaded.isArchived ? "Archived" : "Available"}`}
      </p>
      {!isActivity && (
        <p className="break-words text-sm text-muted-foreground">
          {sectionKindLabels[item.kind]} ·{" "}
          {item.isSystem
            ? "System section — cannot be archived"
            : "Custom section"}
          {item.isMandatory ? " · Mandatory" : ""}
          {item.isPreselected ? " · Preselected" : ""}
        </p>
      )}
      <Field
        id={id}
        label={isActivity ? "Activity name" : "Section title"}
        error={invalid.name}
      >
        <Input
          ref={nameInput}
          id={id}
          value={name}
          maxLength={isActivity ? 200 : 120}
          disabled={disabled}
          aria-invalid={!!invalid.name}
          aria-describedby={invalid.name ? `${id}-error` : undefined}
          onChange={(event) => {
            setName(event.target.value);
            change();
          }}
        />
      </Field>
      {isActivity && (
        <Field
          id={`${id}-order`}
          label="Position"
          error={invalid.order}
          help="Lower positions appear first; equal positions use the server’s stable ordering."
        >
          <Input
            ref={orderInput}
            id={`${id}-order`}
            type="number"
            min={0}
            max={100000}
            step={1}
            value={order}
            disabled={disabled}
            aria-invalid={!!invalid.order}
            aria-describedby={`${id}-order-help${invalid.order ? ` ${id}-order-error` : ""}`}
            onChange={(event) => {
              setOrder(event.target.value);
              change();
            }}
          />
        </Field>
      )}
      {(isActivity || !item.isSystem) && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              change();
            }}
          />
          {isActivity ? "Active" : "Available in section library"}
        </label>
      )}
      <Feedback error={mutation.error} />
      {uncertain && (
        <div className="notice space-y-3">
          <p>
            Saving is unconfirmed. Your edits are retained. Check saved records
            before making another change.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={checking || blocked}
            onClick={() => void check()}
          >
            Check saved records
          </Button>
        </div>
      )}
      <Pending active={checking} />
      <Feedback error={checkError} />
      {compared && !saved && (
        <p role="status" className="notice">
          Saved values loaded above. Compare them with your retained edits; this
          read does not confirm the earlier save.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setName("name" in loaded ? loaded.name : loaded.title);
            setOrder(String(loaded.position));
            setEnabled("name" in loaded ? loaded.isActive : !loaded.isArchived);
            setInvalid({});
            setCompared(false);
            setSaved(false);
            mutation.reset();
            finish();
            if (checked) void refresh();
          }}
        >
          Discard edits
        </Button>
      </div>
      {saved && <p role="status">Changes saved.</p>}
    </form>
  );
}

export function Configuration({ mode }: { mode: Mode }) {
  const user = useSession(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("all");
  const [name, setName] = useState(""),
    [kind, setKind] = useState("TEXT");
  const [invalid, setInvalid] = useState<string>(),
    [created, setCreated] = useState(false);
  const [active, setActive] = useState<string>();
  const [writing, setWriting] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false),
    [checked, setChecked] = useState<string>();
  const [checkError, setCheckError] = useState<unknown>();
  const inFlight = useRef(false),
    checkLock = useRef(false),
    focusAfter = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const queryKey = ["configuration", mode, user.id, user.role, filter, page];
  const query = useQuery({
    queryKey,
    enabled: user.role === "COORDINATOR",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (filter !== "all")
        params.set(mode === "activities" ? "isActive" : "isArchived", filter);
      return readConfigurationPage(
        mode,
        await api(`${configurationEndpoint(mode)}?${params}`),
        page,
      );
    },
  });
  const views = useMutation({
    retry: false,
    mutationFn: async () => {
      try {
        await cache.invalidateQueries(
          { queryKey: ["configuration", mode] },
          { throwOnError: true },
        );
      } catch {
        throw new ApiError(
          0,
          "REFRESH_FAILED",
          "Saved changes remain recorded, but the list could not refresh. Retry refreshing records.",
        );
      }
    },
  });
  const refresh = async () => {
    await views.mutateAsync().catch(() => undefined);
  };
  const readBlocked = query.isError || query.isFetching || views.isPending;
  const busy = query.isFetching || views.isPending || writing || checking;
  const createBlocked =
    busy ||
    query.isError ||
    (active !== undefined && active !== "new") ||
    uncertain;
  useEffect(() => {
    if (focusAfter.current && !createBlocked) {
      input.current?.focus();
      focusAfter.current = false;
    }
  }, [createBlocked]);
  const release = () => {
    inFlight.current = false;
    setWriting(false);
  };
  const beginWrite = (id: string) => {
    if (
      inFlight.current ||
      readBlocked ||
      checking ||
      (active !== undefined && active !== id)
    )
      return false;
    inFlight.current = true;
    setWriting(true);
    setActive(id);
    return true;
  };
  const create = useMutation({
    retry: false,
    mutationFn: async (body: { [key: string]: unknown }) => {
      const record = savedConfiguration(
        mode,
        await api(configurationEndpoint(mode), { method: "POST", body }),
        body,
      );
      if (query.data?.data.some((row) => row.id === record.id))
        throw new Error("The new record identity could not be verified");
      return record;
    },
    onError: (error) => {
      if (uncertainConfigurationWrite(error)) setUncertain(true);
    },
    onSuccess: async () => {
      setName("");
      setKind("TEXT");
      setCreated(true);
      setActive(undefined);
      setPage(1);
      setFilter("all");
      await refresh();
    },
    onSettled: release,
  });
  const check = async () => {
    if (checkLock.current || writing || readBlocked) return;
    checkLock.current = true;
    setChecking(true);
    setCheckError(undefined);
    try {
      const rows = await checkConfigurationRecords(mode);
      const match = rows.find(
        (row) =>
          ("name" in row ? row.name : row.title).trim().toLowerCase() ===
          name.trim().toLowerCase(),
      );
      setChecked(
        match
          ? `A record named “${"name" in match ? match.name : match.title}” is present. Discard this addition to review it in the list.`
          : "No record with this name was found in the loaded records.",
      );
      setUncertain(false);
      create.reset();
      focusAfter.current = true;
    } catch (error) {
      setCheckError(error);
    } finally {
      setChecking(false);
      checkLock.current = false;
    }
  };
  return (
    <section className={styles.page}>
      <h1>{mode === "activities" ? "Activity types" : "Section library"}</h1>
      <p className="mb-6 text-muted-foreground">
        {mode === "activities"
          ? "Add, rename, reorder or deactivate activity types. Historical session records are retained."
          : "Add custom report sections or rename existing sections. Archive custom sections to hide them from future selection. System sections stay available; custom sections are not preselected."}
      </p>
      {active && (
        <p className="notice mb-4">
          Finish or discard your current edits before changing another record,
          page or filter.
        </p>
      )}
      <Pending
        active={query.isFetching || writing || views.isPending || checking}
      />
      <Feedback error={query.error} />
      {query.isError && (
        <Button
          disabled={query.isFetching || writing || checking}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      )}
      {query.isError && query.data && (
        <p className="notice">
          Last loaded records are shown. Saving is disabled until a successful
          read; your edits are retained.
        </p>
      )}
      <Feedback error={views.error} />
      {views.isError && (
        <Button
          variant="outline"
          disabled={writing || query.isFetching || views.isPending || checking}
          onClick={() => void refresh()}
        >
          Retry refreshing records
        </Button>
      )}
      <form
        aria-label="Add configuration"
        className={`${styles.panel} ${styles.form}`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (createBlocked) return;
          const result = (
            mode === "activities" ? configurationName : sectionTitle
          ).safeParse(name);
          setInvalid(
            result.success ? undefined : result.error.issues[0]?.message,
          );
          if (!result.success) {
            input.current?.focus();
            return;
          }
          if (!beginWrite("new")) return;
          setCreated(false);
          setChecked(undefined);
          create.reset();
          focusAfter.current = true;
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
            ref={input}
            id="new-name"
            value={name}
            maxLength={mode === "activities" ? 200 : 120}
            disabled={createBlocked}
            aria-invalid={!!invalid}
            aria-describedby={invalid ? "new-name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setCreated(false);
              setChecked(undefined);
              setActive("new");
            }}
          />
        </Field>
        {mode === "sections" && (
          <Field id="new-kind" label="Section kind">
            <Select
              id="new-kind"
              value={kind}
              disabled={createBlocked}
              onChange={(event) => {
                setKind(event.target.value);
                setCreated(false);
                setChecked(undefined);
                setActive("new");
              }}
            >
              <option value="TEXT">Text</option>
              <option value="BULLETS">Bullet list</option>
              <option value="TABLE">Table</option>
            </Select>
          </Field>
        )}
        <Feedback error={create.error} />
        {uncertain && (
          <div className="notice space-y-3">
            <p>
              Adding is unconfirmed. Your input is retained. Check saved records
              before trying again to avoid adding the same record twice.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void check()}
            >
              Check saved records
            </Button>
          </div>
        )}
        <Feedback error={checkError} />
        {checked && (
          <p role="status" className="notice break-words">
            {checked} This read does not confirm the earlier addition.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={createBlocked}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={createBlocked}
            onClick={() => {
              setName("");
              setKind("TEXT");
              setInvalid(undefined);
              setChecked(undefined);
              setCreated(false);
              create.reset();
              setActive(undefined);
              if (checked) void refresh();
            }}
          >
            Discard addition
          </Button>
        </div>
        {created && <p role="status">Added successfully.</p>}
      </form>
      <Field id="configuration-filter" label="Show">
        <Select
          id="configuration-filter"
          value={filter}
          disabled={busy || active !== undefined}
          onChange={(event) => {
            setFilter(event.target.value);
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
      {query.data && (
        <>
          <div className="my-6 grid gap-4">
            {query.data.data.length ? (
              query.data.data.map((item) => (
                <Editor
                  key={item.id}
                  item={item}
                  mode={mode}
                  blocked={
                    busy ||
                    query.isError ||
                    (active !== undefined && active !== item.id)
                  }
                  beginEdit={() => {
                    setActive(item.id);
                    setCreated(false);
                  }}
                  beginWrite={() => beginWrite(item.id)}
                  release={release}
                  finish={() => setActive(undefined)}
                  refresh={refresh}
                />
              ))
            ) : (
              <p>No matching records.</p>
            )}
          </div>
        </>
      )}
      {(query.data || page > 1) && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            disabled={page <= 1 || busy || active !== undefined}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <p>
            {query.data
              ? `Page ${page} of ${Math.max(1, query.data.meta.totalPages)}`
              : `Page ${page} — records unavailable`}
          </p>
          <Button
            variant="outline"
            disabled={
              !query.data ||
              page >= query.data.meta.totalPages ||
              busy ||
              active !== undefined
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
