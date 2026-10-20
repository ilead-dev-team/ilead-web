export const calendar = {
  label: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  terms: [
    { number: 1, name: "Term 1", startsOn: "2026-09-01", endsOn: "2026-12-18" },
    { number: 2, name: "Term 2", startsOn: "2027-01-05", endsOn: "2027-04-01" },
    { number: 3, name: "Term 3", startsOn: "2027-04-20", endsOn: "2027-07-15" },
  ],
};
export const savedYear = {
  ...calendar,
  id: "11111111-1111-4111-8111-111111111111",
  isCurrent: false,
  terms: calendar.terms.map((t) => ({
    ...t,
    id: `${t.number}2222222-2222-4222-8222-222222222222`,
  })),
};
export const currentYear = {
  ...savedYear,
  id: "33333333-3333-4333-8333-333333333333",
  label: "2025/2026",
  isCurrent: true,
};
export const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
