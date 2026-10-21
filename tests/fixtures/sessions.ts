export const id = "11111111-1111-4111-8111-111111111111";
export const activityId = "22222222-2222-4222-8222-222222222222";
export const record = {
  id,
  date: "2026-10-14",
  status: "HELD" as "HELD" | "CANCELLED",
  cancellationReason: null as string | null,
  notes: "Weekly meeting",
  academicYear: { id: "year", label: "2026–27" },
  term: { id: "term", number: 1, name: "Term 1" },
  createdBy: { id: "c", name: "Coordinator" },
  activities: [{ activityTypeId: activityId, name: "Reflection", held: true }],
  counts: { roundtables: 4, met: 0, notMet: 0, pending: 4 },
  report: null,
};
export const input = {
  date: record.date,
  notes: record.notes,
  activities: [{ activityTypeId: activityId, held: true }],
};
