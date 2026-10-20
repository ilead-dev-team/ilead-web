import { api, ApiError } from "./api";

// Credential failures are 401 too: never run refresh/replay on this mutation.
export async function changePassword(
  userId: string,
  body: { currentPassword: string; newPassword: string },
  transport: typeof api = api,
) {
  const current = await transport<{ data: { id: string } }>("/auth/me");
  if (current?.data?.id !== userId)
    throw new ApiError(
      409,
      "ACCOUNT_CHANGED",
      "Your account changed. Refresh before changing a password.",
    );
  const result = await transport("/auth/change-password", {
    method: "POST",
    public: true,
    body,
  });
  if (result !== undefined)
    throw new ApiError(
      0,
      "UNCONFIRMED_PASSWORD_CHANGE",
      "Password change was not confirmed.",
    );
}
export function passwordOutcomeUnknown(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
