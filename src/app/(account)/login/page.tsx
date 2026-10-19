import { Suspense } from "react";
import { LoginForm } from "@/components/account/forms";
export const metadata = { title: "Log in" };
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening login…</p>}>
      <LoginForm />
    </Suspense>
  );
}
