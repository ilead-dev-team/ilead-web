import { SessionGate } from "@/components/session";
import { Workspace } from "@/components/workspace";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <Workspace>{children}</Workspace>
    </SessionGate>
  );
}
