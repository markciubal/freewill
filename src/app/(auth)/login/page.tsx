"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { login, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <Notice error={state.error} />
      <Field label="Username">
        <Input name="username" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking..." : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/join" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
