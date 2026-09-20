import Link from "next/link";
import { Card, Field, Input, Notice, PageTitle, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LocationPicker } from "@/components/location-picker";
import { requireUser } from "@/lib/auth";
import { Badge, Button } from "@/components/ui";
import { idmeEnabled } from "@/lib/idme";
import { fmtDate } from "@/components/ui";
import { unlinkIdme, updateProfile } from "./actions";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle
        title="Your profile"
        subtitle="Skills are how responders are found. List everything you can actually do."
        action={<Link href={`/people/${me.username}`} className="text-sm text-accent hover:underline">View as others see it</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <Card>
        <form action={updateProfile} className="space-y-4">
          <Field label="Username"><Input value={`@${me.username}`} disabled /></Field>
          <Field label="Display name"><Input name="displayName" maxLength={60} defaultValue={me.displayName ?? ""} /></Field>
          <Field label="Locality" hint="Set when you joined. It does not change."><Input value={me.locality} disabled /></Field>
          <div className="text-sm">
            <span className="mb-1 block font-medium">Your pin</span>
            <p className="mb-2 text-xs text-muted">Set when you joined, rounded to about a hundred meters. Others see only a distance, never this point. ({me.lat}, {me.lng})</p>
            <LocationPicker initial={{ lat: me.lat, lng: me.lng }} readOnly />
          </div>
          <Field label="Skills" hint="Comma-separated. e.g. first aid, welding, water purification, midwifery, ham radio, carpentry">
            <Textarea name="skills" rows={3} maxLength={500} defaultValue={me.skills.join(", ")} />
          </Field>
          <Field label="About you"><Textarea name="bio" maxLength={1000} defaultValue={me.bio ?? ""} /></Field>
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </form>
      </Card>
      {idmeEnabled() && (
        <Card className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            One distinct person <Badge tone={me.humanVerifiedAt ? "accent" : "neutral"}>{me.humanVerifiedAt ? "attested" : "optional"}</Badge>
          </div>
          {me.humanVerifiedAt ? (
            <>
              <p className="text-sm text-muted">
                Attested via ID.me on {fmtDate(me.humanVerifiedAt)}. It counts as one extra vouch toward verification, nothing more.
                Plain trade-off: ID.me keeps a record linking your legal identity to this community. We hold only the date and an anonymous code.
              </p>
              <form action={unlinkIdme} className="mt-2">
                <Button variant="ghost" type="submit">Remove it</Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Optional: prove through ID.me that you are one distinct person. It counts as one extra vouch toward verification and gates nothing.
                Plain trade-off: ID.me verifies you with government ID and keeps a record linking your legal identity to this community.
                We store only the date and an anonymous code, never your name or documents. Vouches from neighbors work without it.
              </p>
              <a href="/api/idme/start" className="mt-2 inline-block rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-border/40">
                Verify with ID.me
              </a>
            </>
          )}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Passwords cannot be changed or reset, so keep yours somewhere safe.</p>
    </div>
  );
}
