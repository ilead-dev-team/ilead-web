import type { User } from "../../src/lib/account";
export const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ada",
  email: "ada@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
export const notice = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "REPORT_DUE_REMINDER" as const,
  title: "Report due",
  body: "Prepare the session report.",
  link: "/sessions/33333333-3333-4333-8333-333333333333",
  readAt: null,
  createdAt: "2026-10-20T06:00:00.000Z",
  reminderId: "44444444-4444-4444-8444-444444444444",
};
export const reminder = {
  id: notice.reminderId,
  kind: "REPORT_DUE" as const,
  refType: "SESSION",
  refId: "33333333-3333-4333-8333-333333333333",
  nextRunAt: "2026-10-20T06:00:00.000Z",
  snoozedUntil: null as string | null,
  lastSentAt: "2026-10-20T06:00:00.000Z",
  sendCount: 1,
  maxSends: 3,
  createdAt: "2026-10-18T06:00:00.000Z",
};
export const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
