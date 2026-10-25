import { z } from "zod";

const docxType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const paramsSchema = z.object({
  id: z.uuid(),
  version: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((v) => Number(v) <= 2147483647)
    .optional(),
});

function failure(status: number, message: string) {
  return Response.json(
    { error: { code: "DOWNLOAD_UNAVAILABLE", message } },
    {
      status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
}

/** Same-origin transport only. Express still authenticates and authorizes every export. */
export async function forwardWordDownload(
  request: Request,
  params: { id: string; version?: string },
  apiOrigin: string,
  transport: typeof fetch = fetch,
) {
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success || new URL(request.url).search)
    return failure(400, "Open a valid report before downloading.");
  const origin = new URL(apiOrigin);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  )
    throw new Error("Invalid download API origin");
  const tokens = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith("ilead_at="));
  if (tokens.length !== 1 || tokens[0] === "ilead_at=")
    return failure(401, "Please log in again.");
  const { id, version } = parsed.data;
  const path = `/api/v1/reports/${id}${version ? `/versions/${version}` : ""}/export/docx`;
  const started = performance.now();
  try {
    const upstream = await transport(new URL(path, origin), {
      headers: { Cookie: tokens[0]!, "Accept-Encoding": "identity" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(110000)]),
    });
    if (
      upstream.ok &&
      upstream.headers.get("content-type")?.split(";")[0] !== docxType
    ) {
      await upstream.body?.cancel();
      return failure(
        502,
        "The report download could not be verified. Try again.",
      );
    }
    const headers = new Headers({
      "Cache-Control": "private, no-store, no-transform",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Server-Timing": `upstream;dur=${Math.round(performance.now() - started)}`,
    });
    for (const name of ["content-type", "content-disposition", "retry-after"])
      if (upstream.headers.has(name))
        headers.set(name, upstream.headers.get(name)!);
    // Fetch may decode compressed bodies; never retain their compressed byte length.
    if (
      !upstream.headers.has("content-encoding") &&
      upstream.headers.has("content-length")
    )
      headers.set("content-length", upstream.headers.get("content-length")!);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return failure(502, "The report download was interrupted. Try again.");
  }
}
