import { sectionPayload, type Report, type ReportSection } from "./reports";
export function validateSaveAcknowledgement(
  sent: ReportSection[],
  result: Report,
  id: string,
  authorId: string,
) {
  if (
    result.id !== id ||
    result.status !== "DRAFT" ||
    result.author.id !== authorId ||
    result.archivedAt ||
    result.sections.length !== sent.length ||
    new Set(result.sections.map((s) => s.id)).size !== sent.length
  )
    throw new Error("Unexpected save acknowledgement");
  const payload = sectionPayload(sent).sections;
  payload.forEach((wanted, index) => {
    const saved = result.sections[index]!;
    if (
      saved.position !== index + 1 ||
      saved.title !== wanted.title ||
      saved.kind !== wanted.kind ||
      JSON.stringify(saved.content) !== JSON.stringify(wanted.content) ||
      ("id" in wanted && wanted.id !== saved.id) ||
      saved.key !== sent[index]!.key ||
      saved.isMandatory !== sent[index]!.isMandatory ||
      saved.autoSource !== sent[index]!.autoSource
    )
      throw new Error("Saved sections do not match the request");
  });
  return result;
}
/** Reconcile server-assigned IDs without replacing edits made after the snapshot. */
export function rebaseReportDraft(
  sent: ReportSection[],
  saved: ReportSection[],
  current: ReportSection[],
) {
  const identities = new Map(
    sent.map((section, index) => [section.id, saved[index]!]),
  );
  return current.map((section) => {
    const identity = identities.get(section.id);
    return identity
      ? {
          ...section,
          id: identity.id,
          key: identity.key,
          isMandatory: identity.isMandatory,
          autoSource: identity.autoSource,
        }
      : section;
  });
}
