import { Recovery } from "@/components/recovery";
import { recoverySelection } from "@/lib/account-delivery";
export const metadata = { title: "Account recovery" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const selected = recoverySelection((await searchParams).request);
  return <Recovery key={selected ?? "queue"} requestId={selected} />;
}
