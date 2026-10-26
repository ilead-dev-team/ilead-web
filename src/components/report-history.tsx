"use client";
import styles from "./reports.module.css";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Report } from "@/lib/reports";
import { parseVersion, versionPage } from "@/lib/report-history";
import { downloadReportWord } from "@/lib/report-download";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";
import { ReportDocument } from "./report-document";
export function ReportHistory({
  report,
  blocked,
}: {
  report: Report;
  blocked: boolean;
}) {
  const user = useSession();
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const activeDownload = useRef<AbortController | null>(null);
  useEffect(() => () => activeDownload.current?.abort(), []);
  const list = useQuery({
    queryKey: [
      "report-history",
      report.id,
      user.id,
      user.role,
      report.version,
      report.sentAt,
      page,
    ],
    enabled: open,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      versionPage.parse(
        await api(`/reports/${report.id}/versions?page=${page}&pageSize=20`, {
          signal,
        }),
      ),
  });
  const version = useQuery({
    queryKey: ["report-version", report.id, user.id, user.role, selected],
    enabled: selected !== null,
    queryFn: async ({ signal }) =>
      parseVersion(
        (
          await api<{ data: unknown }>(
            `/reports/${report.id}/versions/${selected}`,
            { signal },
          )
        ).data,
        report.id,
        selected!,
        report.session.id,
      ),
  });
  const download = useMutation({
    mutationFn: async (number: number | null) => {
      if (number === null && blocked)
        throw new Error("Save report changes before exporting.");
      if (number !== null && version.data?.version !== number)
        throw new Error("Select a valid sent version before exporting.");
      const date =
        number === null ? report.session.date : version.data!.session.date;
      const controller = new AbortController();
      activeDownload.current = controller;
      const blob = await downloadReportWord(
        report.id,
        number,
        controller.signal,
      );
      if (controller.signal.aborted) throw new Error("Download cancelled");
      return { blob, number, controller, date };
    },
    onSuccess: ({ blob, number, controller, date }) => {
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `RCA_iLead_Session_Report_${date}${number === null ? "" : `_v${number}`}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Word file handed to your browser. Check Downloads for the file.",
      );
    },
  });
  const start = (number: number | null) => {
    setNotice("");
    download.reset();
    download.mutate(number);
  };
  return (
    <section
      className={`${styles.panel} grid gap-4`}
      aria-labelledby="report-history-heading"
    >
      <h2 id="report-history-heading">Versions and Word downloads</h2>
      <p>
        {user.role === "SPONSOR"
          ? "Current export uses the last published snapshot, including while a revision is in progress."
          : "Current export uses saved draft/final content or the last published snapshot for a sent report."}{" "}
        Sent versions below are immutable and read only.
      </p>
      <Button
        variant="outline"
        disabled={blocked || download.isPending}
        onClick={() => start(null)}
      >
        Export current report .docx
      </Button>
      {blocked && (
        <p>Wait for report changes to save before exporting current content.</p>
      )}
      <Feedback error={download.error} />
      {download.isPending && (
        <p role="status">
          Preparing your Word file. Keep this page open; slow transfers can take
          up to two minutes.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Show sent versions
        </Button>
      ) : (
        <>
          <Pending active={list.isPending} />
          <Feedback error={list.error} />
          {list.isError && (
            <Button variant="outline" onClick={() => list.refetch()}>
              Retry version list
            </Button>
          )}
          {list.data && (
            <>
              <ul className="compact-records">
                {list.data.data.length ? (
                  list.data.data.map((row) => (
                    <li
                      key={row.version}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <span>
                        Version {row.version} · Sent {row.sentAt.slice(0, 10)}
                      </span>
                      <Button
                        variant="outline"
                        disabled={download.isPending}
                        onClick={() => {
                          setSelected(row.version);
                          setNotice("");
                          download.reset();
                        }}
                      >
                        View sent version {row.version}
                      </Button>
                    </li>
                  ))
                ) : (
                  <li>No sent versions yet.</li>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={download.isPending || list.isFetching || page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous versions
                </Button>
                <p>
                  Version page {page} of{" "}
                  {Math.max(1, list.data.meta.totalPages)}
                </p>
                <Button
                  variant="outline"
                  disabled={
                    download.isPending ||
                    list.isFetching ||
                    page >= list.data.meta.totalPages
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next versions
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {selected !== null && (
        <section className="min-w-0" aria-label="Selected sent version">
          <h3 className="font-semibold">Sent version {selected}</h3>
          <Pending active={version.isPending} />
          <Feedback error={version.error} />
          {version.isError && (
            <Button variant="outline" onClick={() => version.refetch()}>
              Retry selected version
            </Button>
          )}
          {version.data && (
            <>
              <p>
                Sent {version.data.sentAt.slice(0, 10)} · Author:{" "}
                {version.data.author.name} · {version.data.academicYear} ·{" "}
                {version.data.term.name}
              </p>
              <ReportDocument
                report={version.data}
                label={`Sent version ${selected}`}
                historical
              />
              <Button
                variant="outline"
                disabled={download.isPending}
                onClick={() => start(selected)}
              >
                Export sent version {selected} .docx
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={download.isPending}
            onClick={() => setSelected(null)}
          >
            Close sent version
          </Button>
        </section>
      )}
    </section>
  );
}
