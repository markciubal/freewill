"use client";

import Link from "next/link";
import { useMemo } from "react";
import { vouch } from "@/app/(app)/people/actions";
import { signMessage, vouchToken } from "@/lib/keys";
import { InfoDot } from "./info-dot";
import { useLocalIdentity } from "./use-local-identity";
import { Field, Input } from "./ui";
import { SubmitButton } from "./submit-button";

// Signs the vouch with the device-held identity key, if there is one, so the
// endorsement is provably the voucher's. Falls back to an unsigned vouch when
// no key is on this device; the vouch still works, it just is not signed.

export function VouchForm({ username, fromId, toId, hasKey, defaultNote, isUpdate }: { username: string; fromId: string; toId: string; hasKey: boolean; defaultNote: string; isUpdate: boolean }) {
  const local = useLocalIdentity();
  const signature = useMemo(() => (local ? signMessage(local, vouchToken(fromId, toId)) : ""), [local, fromId, toId]);

  return (
    <form action={vouch.bind(null, username)} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-60 flex-1">
          <Field label="How do you know them? (optional)">
            <Input name="note" maxLength={200} defaultValue={defaultNote} />
          </Field>
        </div>
        <input type="hidden" name="signature" value={signature} />
        <SubmitButton pendingText="...">{isUpdate ? "Update vouch" : "Vouch"}</SubmitButton>
      </div>
      <p className="text-xs text-muted">
        {signature ? (
          <>This vouch will be signed with your identity key <InfoDot term="identity-key" />.</>
        ) : hasKey ? (
          <>Your identity key <InfoDot term="identity-key" /> is not on this device, so this vouch will be unsigned. <Link href="/keys" className="text-accent hover:underline">Load your key</Link> to sign.</>
        ) : (
          <><Link href="/keys" className="text-accent hover:underline">Add an identity key</Link> <InfoDot term="identity-key" /> to sign your vouches so no one can forge them.</>
        )}
      </p>
    </form>
  );
}
