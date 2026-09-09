"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { LocationPicker } from "@/components/location-picker";
import { COVENANT } from "@/lib/covenant";
import { join, type AuthState } from "../actions";

export default function JoinPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(join, {});
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Create an account</h1>
      <p className="text-sm text-muted">
        Just a username and a password. There is no email on file and no reset: if you lose the password you will
        need a new account and new vouches. Write it down somewhere safe.
      </p>
      <Notice error={state.error} />
      <Field label="Username" hint="Lowercase letters, numbers, underscores. This is how people will find you.">
        <Input name="username" autoComplete="username" required autoFocus pattern="[a-z0-9_]{3,24}" />
      </Field>
      <Field label="Password" hint="At least 8 characters. Cannot be reset.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Display name (optional)">
        <Input name="displayName" maxLength={60} />
      </Field>
      <Field label="Locality" hint="Where you actually are: neighborhood, valley, block, mesh node. Anywhere in the world. Set once, never changed; people near you are the ones who can vouch for you, so be honest.">
        <Input name="locality" required minLength={2} maxLength={80} />
      </Field>
      <div className="text-sm">
        <span className="mb-1 block font-medium">Your pin</span>
        <p className="mb-2 text-xs text-muted">
          Click the map to place a pin near where you live. Not on your door: nearby is enough. It is rounded to about a hundred meters, it never changes, and nobody else ever sees it as a point, only as a distance from them. No address is asked. The device location button is optional and only runs if you press it.
        </p>
        <LocationPicker />
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-2 text-sm font-medium">The ground rules</div>
        <ol className="space-y-2 text-sm">
          {COVENANT.map((c, i) => (
            <li key={c.title}>
              <span className="font-medium">
                {i + 1}. {c.title}.
              </span>{" "}
              <span className="text-muted">{c.text}</span>
            </li>
          ))}
        </ol>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="covenant" required className="mt-1" />
          <span>I agree to these ground rules.</span>
        </label>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
