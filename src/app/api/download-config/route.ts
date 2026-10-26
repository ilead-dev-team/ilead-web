/** API_ORIGIN is the public API address, never a credential or user-supplied URL. */
export function GET() {
  const origin = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:4000");
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
    return Response.json(
      { error: "Download service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { origin: origin.origin },
    { headers: { "Cache-Control": "no-store" } },
  );
}
