export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
type Options = Omit<RequestInit, "body"> & {
  body?: unknown;
  public?: boolean;
  responseType?: "blob";
  onResponse?: (response: Response) => void;
};
export function createApiClient(
  transport: typeof fetch = (...args) => fetch(...args),
) {
  let refreshing: Promise<void> | undefined;
  const networkError = (options: Options) =>
    new ApiError(
      0,
      "NETWORK_ERROR",
      options.responseType === "blob"
        ? "The file transfer was interrupted. Try downloading again."
        : "Could not reach iLead. Check your connection and try again. Your entries are still here.",
    );
  async function raw(path: string, options: Options = {}) {
    const {
      body,
      public: _public,
      onResponse: _onResponse,
      responseType: _responseType,
      ...init
    } = options;
    void _responseType;
    void _public;
    void _onResponse;
    const timeout = AbortSignal.timeout(
      options.responseType === "blob" ? 120000 : 60000,
    );
    return transport(`/api/v1${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function renew() {
    if (!refreshing) {
      const rotate = async () => {
        // Recheck after a cross-tab lock: another tab may already have rotated the shared cookie.
        const current = await raw("/auth/me");
        if (current.ok) return;
        if (current.status !== 401)
          throw new ApiError(
            current.status,
            "SESSION_CHECK_FAILED",
            "Unable to check your session. Try again.",
          );
        const result = await raw("/auth/refresh", { method: "POST" });
        if (!result.ok)
          throw new ApiError(
            result.status,
            "SESSION_EXPIRED",
            "Please log in again.",
          );
      };
      const run = (async () => {
        if (typeof navigator !== "undefined" && navigator.locks)
          await navigator.locks.request("ilead-session-refresh", rotate);
        else await rotate();
      })();
      refreshing = run.finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
  }
  return async function api<T>(
    path: string,
    options: Options = {},
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("API paths must be relative.");
    let response: Response;
    try {
      response = await raw(path, options);
      if (response.status === 401 && !options.public) {
        await renew();
        response = await raw(path, options);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw networkError(options);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        payload.error?.code ?? "REQUEST_FAILED",
        payload.error?.message ?? "The request failed. Try again.",
        payload.error?.requestId,
        payload.error?.details,
      );
    }
    options.onResponse?.(response);
    try {
      return response.status === 204
        ? (undefined as T)
        : options.responseType === "blob"
          ? ((await response.blob()) as T)
          : ((await response.json()) as T);
    } catch {
      // Fetch resolves at headers; a timeout or disconnect can still interrupt the body.
      throw networkError(options);
    }
  };
}
export const api = createApiClient();
export function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  if (error.status === 429)
    return "Too many attempts. Wait a few minutes and try again.";
  if (error.status >= 500)
    return "iLead is unavailable right now. Wait a moment and try again.";
  return error.message;
}
