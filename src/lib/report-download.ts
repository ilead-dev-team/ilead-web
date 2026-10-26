import { z } from "zod";
import { api, ApiError } from "./api";
import { validateDocx } from "./report-history";
const grant = z.object({
  data: z.strictObject({
    token: z.string().min(1).max(8192),
    expiresAt: z.iso.datetime(),
  }),
});
const unavailable = () =>
  new ApiError(
    0,
    "NETWORK_ERROR",
    "The file transfer was interrupted. Try downloading again.",
  );
export function directDownloadUrl(value: unknown) {
  const { origin } = z.strictObject({ origin: z.url() }).parse(value);
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw unavailable();
  return new URL("/api/v1/report-download", url).toString();
}
/** The scoped grant stays in memory and in a header; account cookies never cross origins. */
export async function downloadReportWord(
  id: string,
  version: number | null,
  signal: AbortSignal,
  client: typeof api = api,
  transport: typeof fetch = fetch,
) {
  z.uuid().parse(id);
  if (version !== null)
    z.number().int().positive().max(2147483647).parse(version);
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  try {
    const config = await transport("/api/download-config", {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: bounded,
    });
    if (!config.ok) throw unavailable();
    const destination = directDownloadUrl(await config.json());
    const ticket = grant.parse(
      await client(`/reports/${id}/export-ticket`, {
        method: "POST",
        body: version === null ? {} : { version },
        signal: bounded,
      }),
    ).data;
    // The API enforces expiry; a device clock may be wrong.
    const result = await transport(destination, {
      headers: { Authorization: `Bearer ${ticket.token}` },
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      redirect: "error",
      signal: bounded,
    });
    if (!result.ok) {
      if (result.status === 401)
        throw new ApiError(
          0,
          "DOWNLOAD_EXPIRED",
          "The download authorization expired. Try downloading again.",
        );
      throw new ApiError(
        result.status,
        "DOWNLOAD_UNAVAILABLE",
        "The report could not be downloaded. Try again.",
      );
    }
    return await validateDocx(
      await result.blob(),
      result.headers.get("content-type"),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
