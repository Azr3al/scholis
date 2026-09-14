import LoginForm from "@/components/auth/login-form";
import { getTenantOnServer } from "@/helpers/tenant";
import { Suspense } from "react";

export default async function LoginPage() {
  // Seed only. `getTenantOnServer` is bounded by a 1.5s abort and a 60s data
  // cache, and swallows its own failures, so `tenant` may be undefined — the
  // form must still render and fall back to the client `useTenant()` query.
  // Never gate rendering on this value.
  const { tenant } = await getTenantOnServer();
  return (
    <Suspense>
      <LoginForm tenant={tenant} />
    </Suspense>
  );
}
