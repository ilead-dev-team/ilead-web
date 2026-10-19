import { ReportDetail } from "@/components/reports";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportDetail key={id} id={id} />;
}
