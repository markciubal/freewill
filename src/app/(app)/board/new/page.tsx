import { Card, Field, Input, Notice, PageTitle, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/covenant";
import { createListing } from "../actions";

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ error?: string; kind?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Post to the board" subtitle="Say plainly what you need or what you can give. Barter, Grace, Hours, or a gift: your choice." />
      <Notice error={sp.error} />
      <Card>
        <form action={createListing} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="This is a">
              <Select name="kind" defaultValue={sp.kind === "OFFER" ? "OFFER" : "NEED"}>
                <option value="NEED">Need</option>
                <option value="OFFER">Offer</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue="FOOD">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
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
          <Field label="Barter: what would you take in return? (optional)" hint="Leave all three blank to make this a gift.">
            <Input name="wantsInReturn" maxLength={200} placeholder="Eggs, batteries, an afternoon of digging" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grace ask (optional)" hint="GRC, whole units.">
              <Input name="priceGrace" type="number" min={0} step={1} />
            </Field>
            <Field label="Hours ask (optional)" hint="Decimal hours, e.g. 1.5">
              <Input name="priceHours" type="number" min={0} step={0.25} />
            </Field>
          </div>
          <SubmitButton pendingText="Posting...">Post</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
