import { ListingTerms } from "@/components/listing-terms";
import { Card, Field, Input, Notice, PageTitle, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { getReferencePrices } from "@/lib/pricing.data";
import { createListing } from "../actions";

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ error?: string; kind?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  // What each category has recently settled for near this person, so the form
  // can show a usual price beside the ask. Nobody sets these; they are the
  // middle of what neighbors actually paid.
  const references = await getReferencePrices(me);
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Post to the board" subtitle="Say plainly what you need or what you can give. A gift, Hours, Grace, or barter: your choice." />
      <Notice error={sp.error} />
      <Card>
        <form action={createListing} className="space-y-4">
          <ListingTerms initialKind={sp.kind === "OFFER" ? "OFFER" : "NEED"} references={references} />
          <Field label="Title">
            <Input name="title" required minLength={3} maxLength={80} placeholder="Insulin, 2 weeks / Firewood, split / Can fix small engines" />
          </Field>
          <Field label="Details">
            <Textarea name="description" required minLength={3} maxLength={2000} placeholder="What exactly, for whom, by when, where to meet." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity (optional)">
              <Input name="quantity" maxLength={60} placeholder="3 jars / 2 hrs a week / one room" />
            </Field>
            <Field label="Locality"><Input value={me.locality} disabled /></Field>
          </div>
          <SubmitButton pendingText="Posting...">Post</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
