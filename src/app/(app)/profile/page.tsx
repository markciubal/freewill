import Link from "next/link";
import { Card, Field, Input, Notice, PageTitle, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LocationPicker } from "@/components/location-picker";
import { requireUser } from "@/lib/auth";
import { updateProfile } from "./actions";

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
      <p className="mt-4 text-xs text-muted">Passwords cannot be changed or reset, so keep yours somewhere safe.</p>
    </div>
  );
}
