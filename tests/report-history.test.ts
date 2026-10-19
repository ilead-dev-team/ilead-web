import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVersion,
  versionPage,
  validateDocx,
  docxMime,
} from "../src/lib/report-history.js";
import { createApiClient } from "../src/lib/api.js";
const id = "11111111-1111-4111-8111-111111111111";
const section = {
  id,
  key: "summary",
  title: "Summary",
  isMandatory: true,
  autoSource: "NONE",
  position: 1,
  kind: "TEXT",
  content: { text: "Published text" },
};
const snapshot = {
  id,
  status: "SENT",
  version: 1,
  author: { id, name: "Author" },
  session: { id, date: "2026-10-19" },
  academicYearId: id,
  academicYear: "2026",
  term: { id, name: "Term" },
  sections: [
    section,
    {
      ...section,
      id: "22222222-2222-4222-8222-222222222222",
      key: "progress",
      position: 2,
    },
  ],
  sentAt: "2026-10-19T10:00:00Z",
};
test("historical snapshots require published state and matching report/session/version", () => {
  assert.deepEqual(parseVersion(snapshot, id, 1, id).sections[0]?.content, {
    text: "Published text",
  });
  for (const change of [
    { status: "DRAFT" },
    { status: "FINAL" },
    { version: 2 },
    { id: "22222222-2222-4222-8222-222222222222" },
    {
      session: {
        id: "22222222-2222-4222-8222-222222222222",
        date: "2026-10-19",
      },
    },
  ])
    assert.throws(() => parseVersion({ ...snapshot, ...change }, id, 1, id));
});
test("version metadata rejects invalid timestamps and repeated version numbers", () => {
  const page = {
    data: [{ version: 1, sentAt: snapshot.sentAt }],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
  assert.equal(versionPage.parse(page).data.length, 1);
  assert.throws(() =>
    versionPage.parse({ ...page, data: [page.data[0], page.data[0]] }),
  );
  assert.throws(() =>
    versionPage.parse({ ...page, data: [{ version: 1, sentAt: "bad" }] }),
  );
});
test("download validation rejects error documents and binary API keeps cookie/refresh handling", async () => {
  const file = new Blob([new Uint8Array([80, 75, 3, 4, 0])]);
  assert.equal(await validateDocx(file, docxMime), file);
  await assert.rejects(() =>
    validateDocx(new Blob(["<html>error</html>"]), docxMime),
  );
  await assert.rejects(() => validateDocx(file, "application/json"));
  let calls = 0;
  const client = createApiClient(async (_url, options) => {
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    assert.equal("responseType" in options!, false);
    calls++;
    return calls === 1
      ? new Response(null, { status: 401 })
      : calls === 2
        ? new Response("{}", { status: 200 })
        : new Response(file, { headers: { "content-type": docxMime } });
  });
  const blob = await client<Blob>("/reports/id/export/docx", {
    responseType: "blob",
  });
  assert.equal(calls, 3);
  assert.equal(blob.size, 5);
});
