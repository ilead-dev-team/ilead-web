import { forwardWordDownload } from "@/lib/download-proxy";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; version: string }> },
) {
  return forwardWordDownload(
    request,
    await context.params,
    process.env.API_ORIGIN ?? "http://127.0.0.1:4000",
  );
}
