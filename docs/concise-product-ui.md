# Concise product UI

Routine screens show labels, values and actions without repeating operating
instructions. Dashboard filter/export explanations, page introductions and
Program email deployment guidance have been removed. Runtime validation,
failed-save recovery and confirmation of an email recipient remain visible
when needed; these protect the user's work rather than explain routine usage.

The dashboard's roundtable search uses a bounded, wrapping toolbar with a 12px
gap. Shared fields align their contents at the top, so a help or error line in
one field cannot shift neighboring inputs. Session date actions keep their
content width, and standalone status controls are bounded.

Shared notices and paragraph empty states size to their content, capped by the
available width. Roundtable list cells retain the linked name and latest lesson;
the progress graphic and slogan remain on the detail screen. View trash is a
single standalone navigation button; Move to trash is available on the specific roundtable detail page, outside the
list table; its review and uncertain-result recovery remain. Session cancellation reasons expand on demand
and repeated entry breakdowns are omitted from the list.

Curriculum editors no longer repeat the loaded title below each input. After an
uncertain save is explicitly checked, the returned saved title is displayed only
in that recovery state so users can compare it with their retained edit.

Verification results are recorded in the pull request. Browser scenarios use API
fixtures and do not verify deployed production data.

Moving a live roundtable to trash now happens from its detail page. After a
confirmed move, the app returns to the list and focuses its heading. The
navigation flag is ephemeral UI state in session storage and is cleared when the
list mounts; it does not contain account or roundtable data. Trash restore stays
in the trash list because a trashed detail page is not available.
