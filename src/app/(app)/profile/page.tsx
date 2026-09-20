import Link from "next/link";
import { Card, Field, Input, Notice, PageTitle, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LocationPicker } from "@/components/location-picker";
import { requireUser } from "@/lib/auth";
import { Badge, Button } from "@/components/ui";
import { idmeEnabled, idmePolicies, policyLabel } from "@/lib/idme";
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
          <Field label="Locality" hint="Where you are. You can change this; matching ignores capitalization."><Input name="locality" required minLength={2} maxLength={80} defaultValue={me.locality} /></Field>
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
        <Card className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            Verified affiliations <Badge tone={me.affiliations.length ? "accent" : "neutral"}>{me.affiliations.length ? `${me.affiliations.length} verified` : "optional"}</Badge>
          </div>
          <p className="text-sm text-muted">
            Optional: prove an affiliation through ID.me. Each becomes a badge on your profile and helps people find responders. It counts as one extra vouch toward verification and gates nothing.
            Plain trade-off: ID.me checks you with official records and keeps a record linking your legal identity to this community. We store only the date, an anonymous code, and which affiliations were confirmed, never your name or documents. Vouches from neighbors work without any of this.
          </p>

          {me.affiliations.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {me.affiliations.map((h) => <Badge key={h} tone="accent">{policyLabel(h)}</Badge>)}
              {me.humanVerifiedAt && <span className="text-xs text-muted">since {fmtDate(me.humanVerifiedAt)}</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {idmePolicies().map((p) => {
              const has = me.affiliations.includes(p.handle);
              return (
                <a
                  key={p.handle}
                  href={`/api/idme/start?policy=${p.handle}`}
                  title={p.hint}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${has ? "border-accent text-accent hover:bg-accent/10" : "border-border hover:bg-border/40"}`}
                >
                  {has ? `Re-verify ${p.label}` : `Verify ${p.label}`}
                </a>
              );
            })}
          </div>

          {me.affiliations.length > 0 && (
            <form action={unlinkIdme}>
              <Button variant="ghost" type="submit">Remove all ID.me verifications</Button>
            </form>
          )}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Passwords cannot be changed or reset, so keep yours somewhere safe.</p>
    </div>
  );
}
