import { pathToFileURL } from "node:url";
// Never log URL, bearer secret or response body.
export async function invokeJobTick({
  env = process.env,
  request = fetch,
  output = console,
} = {}) {
  try {
    const target = new URL(env.JOB_TICK_URL ?? "");
    const secret = env.JOB_SECRET ?? "";
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      target.port ||
      target.pathname !== "/api/v1/internal/jobs/tick" ||
      !/^[a-z0-9-]+\.onrender\.com$/.test(target.hostname) ||
      secret.length < 32 ||
      secret.length > 256 ||
      /\s/.test(secret)
    )
      throw new Error();
    const response = await request(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    await response.body?.cancel();
    if (!response.ok) {
      output.error(
        `Job tick failed (HTTP ${response.status}). Inspect server job status without exposing credentials.`,
      );
      return 1;
    } else {
      output.log(
        `Job tick request acknowledged (HTTP ${response.status}); job progress remains server-side.`,
      );
      return 0;
    }
  } catch {
    output.error(
      "Job tick unavailable: check approved HTTPS target, scheduler credentials and server configuration.",
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await invokeJobTick();
