import { ResetForm } from "@/components/account/forms";
export const metadata = { title: "Reset password" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ResetForm token={typeof token === "string" ? token : ""} />;
}
