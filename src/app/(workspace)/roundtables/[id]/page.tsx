import { RoundtableDetail } from "@/components/roundtables";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoundtableDetail id={id} />;
}
