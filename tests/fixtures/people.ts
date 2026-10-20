export const ids = {
  person: "11111111-1111-4111-8111-111111111111",
  invitation: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
};
export const person = {
  id: ids.person,
  name: "Ada Example",
  email: "ada@example.test",
  role: "FACILITATOR" as const,
  classYear: "YEAR_1",
  status: "ACTIVE",
  emailVerifiedAt: "2026-10-20T08:00:00Z",
  createdAt: "2026-10-20T08:00:00Z",
  expiresAt: "2029-10-20T08:00:00Z",
  hasRoundtable: false,
};
export const invitation = {
  id: ids.invitation,
  email: "invited@example.test",
  role: "FACILITATOR" as const,
  createdAt: "2026-10-20T08:00:00Z",
  expiresAt: "2026-10-27T08:00:00Z",
  acceptedAt: null as string | null,
  revokedAt: null as string | null,
  status: "PENDING",
  deliveryStatus: "FAILED",
  deliveryError: "MAIL_NOT_QUEUED",
  deliveryAttempts: 0,
  deliveryAcceptedAt: null as string | null,
};
export function inviteAck(row = invitation) {
  const { deliveryAttempts, deliveryAcceptedAt, ...ack } = row;
  void deliveryAttempts;
  void deliveryAcceptedAt;
  return ack;
}
