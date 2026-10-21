export const id = "22222222-2222-4222-8222-222222222222";
export const row = {
  id,
  name: "Pinnacles",
  slogan: "Lead with care",
  classYear: "YEAR_2" as const,
  currentLevel: "ICHOOSE" as const,
  lastLesson: { id: "l1", number: 1, title: "Leadership" },
  nextLesson: {
    id: "l2",
    number: 2,
    title: "Purpose",
    level: "ICHOOSE" as const,
  },
  status: "ACTIVE" as "ACTIVE" | "COMPLETED",
  completedAt: null as string | null,
  facilitator: { id: "f", name: "Facilitator", classYear: "YEAR_2" as const },
  enrolledAt: "2026-10-01T08:00:00.000Z",
};
export const attendance = {
  met: 1,
  didNotMeet: 0,
  history: [
    {
      entryId: "entry",
      met: true,
      sessionId: "session",
      sessionDate: "2026-10-14",
      status: "HELD" as const,
    },
  ],
};
export const trashed = {
  ...row,
  facilitator: null,
  deletedAt: "2026-10-20T08:00:00Z",
  purgeAfter: "2026-11-19T08:00:00Z",
  formerFacilitatorId: "f",
};
export const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
