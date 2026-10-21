export const staff = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Coordinator",
  email: "staff@example.test",
  role: "COORDINATOR" as const,
  classYear: "YEAR_2" as const,
  hasRoundtable: false,
  roundtableId: null,
};
export const invite = {
  email: "invited@example.test",
  role: "FACILITATOR" as const,
  expiresAt: "2026-11-01T00:00:00Z",
};
export const invitee = {
  ...staff,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Invitee",
  email: invite.email,
  role: invite.role,
};
export const mailbox = {
  connected: true,
  provider: "gmail",
  address: "sender@example.test",
  reconnectRequired: false,
};
export const recovery = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "PENDING" as const,
  requestedAt: "2026-10-20T08:00:00Z",
  issuedAt: null as string | null,
  resolvedAt: null as string | null,
  user: {
    id: invitee.id,
    name: "Invitee",
    email: invite.email,
    role: "FACILITATOR" as const,
  },
  deliveries: [] as (typeof delivery)[],
};
export const delivery = {
  id: "44444444-4444-4444-8444-444444444444",
  status: "PENDING" as "PENDING" | "ACCEPTED" | "FAILED" | "CANCELLED",
  attempts: 0,
  acceptedAt: null as string | null,
  lastErrorCode: null as string | null,
  expiresAt: "2026-10-20T10:00:00Z",
};
export const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
