export const ids = {
  year: "11111111-1111-4111-8111-111111111111",
  oldYear: "22222222-2222-4222-8222-222222222222",
  term: "33333333-3333-4333-8333-333333333333",
  oldTerm: "44444444-4444-4444-8444-444444444444",
  roundtable: "55555555-5555-4555-8555-555555555555",
  session: "66666666-6666-4666-8666-666666666666",
  person: "77777777-7777-4777-8777-777777777777",
};
export function summary(role = "COORDINATOR") {
  return {
    academicYear: { id: ids.year, label: "2026–27" },
    cards: {
      activeRoundtables: 8,
      completedRoundtables: 2,
      unregisteredFacilitators: 1,
      sessionsHeld: 5,
      sessionsCancelled: 1,
      staleRoundtables: 1,
      reportsFlagged: 1,
      ...(role === "SPONSOR"
        ? { reportsReceived: 4 }
        : { reportsAwaitingSend: 2 }),
    },
    pies: {
      roundtablesByLevel: [
        { key: "ICHOOSE", label: "iChoose", value: 3 },
        { key: "IDO", label: "iDo", value: 3 },
        { key: "ILEAD", label: "iLead", value: 2 },
      ],
      roundtablesByClass: [
        { key: "YEAR_1", label: "Year 1", value: 3 },
        { key: "YEAR_2", label: "Year 2", value: 4 },
        { key: "YEAR_3", label: "Year 3", value: 1 },
      ],
      lastSessionAttendance: {
        date: "2026-10-14",
        met: 5,
        notMet: 2,
        unrecorded: 1,
      },
      reportsByStatus:
        role === "SPONSOR"
          ? [
              { key: "SENT", label: "Received", value: 3 },
              {
                key: "CHANGES_REQUESTED",
                label: "Changes requested",
                value: 1,
              },
            ]
          : [
              { key: "DRAFT", label: "DRAFT", value: 1 },
              { key: "FINAL", label: "FINAL", value: 1 },
              { key: "SENT", label: "SENT", value: 3 },
              {
                key: "CHANGES_REQUESTED",
                label: "CHANGES_REQUESTED",
                value: 1,
              },
            ],
    },
    stale: [
      { roundtableId: ids.roundtable, name: "Pinnacles", lastProgressOn: null },
    ],
    latestSessions: [{ id: ids.session, date: "2026-10-14", status: "HELD" }],
    ...(role === "COORDINATOR"
      ? {
          unregisteredFacilitators: [
            {
              id: ids.person,
              name: "Unregistered Person",
              classYear: "YEAR_1",
            },
          ],
        }
      : {}),
  };
}
export const years = [
  {
    id: ids.year,
    label: "2026–27",
    isCurrent: true,
    startsOn: "2026-09-01",
    endsOn: "2027-07-31",
    terms: [
      {
        id: ids.term,
        number: 1,
        name: "Term 1",
        startsOn: "2026-09-01",
        endsOn: "2026-12-20",
      },
    ],
  },
  {
    id: ids.oldYear,
    label: "2025–26",
    isCurrent: false,
    startsOn: "2025-09-01",
    endsOn: "2026-07-31",
    terms: [
      {
        id: ids.oldTerm,
        number: 1,
        name: "Old term",
        startsOn: "2025-09-01",
        endsOn: "2025-12-20",
      },
    ],
  },
];
export const roundtable = {
  id: ids.roundtable,
  name: "Pinnacles",
  slogan: "Lead together",
  classYear: "YEAR_1",
  currentLevel: "IDO",
  lastLesson: null,
  nextLesson: null,
  status: "ACTIVE",
  completedAt: null,
  facilitator: null,
  enrolledAt: "2026-09-01T08:00:00Z",
};
