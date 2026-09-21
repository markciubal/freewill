"use client";

import type { Category } from "@prisma/client";
import { useState } from "react";
import { CATEGORIES, CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
import {
  HIGH_ASK_FACTOR,
  SETTLEMENT_HINT,
  SETTLEMENT_LABEL,
  askSignal,
  defaultSettlementFor,
  fmtTimes,
  type Reference,
  type Settlement,
} from "@/lib/pricing";
import { InfoDot } from "./info-dot";
import { Field, Input, Select, fmtGrace, fmtHours } from "./ui";

// The part of the new-listing form that depends on the category: what kind of
// listing this is, how the person wants to settle, and what that category has
// usually settled for nearby. The way to settle starts from a default for the
// category (a gift for survival goods, Hours for care and skills) and follows
// the category until the person picks one themselves; after that it is theirs.
// Inputs for ways they did not pick are not rendered, so they submit blank and
// the server action needs no knowledge of any of this.

type References = Record<Category, { grace: Reference | null; hours: Reference | null }>;

const MODES: Settlement[] = ["gift", "hours", "grace", "barter", "mix"];

export function ListingTerms({ initialKind, references }: { initialKind: "NEED" | "OFFER"; references: References }) {
  const [kind, setKind] = useState<"NEED" | "OFFER">(initialKind);
  const [category, setCategory] = useState<Category>("FOOD");
  const [chosen, setChosen] = useState<Settlement | null>(null);
  const [graceAsk, setGraceAsk] = useState("");

  const settlement = chosen ?? defaultSettlementFor(category);
  const isSurvival = SURVIVAL.includes(category);
  const reference = references[category];
  const showBarter = settlement === "barter" || settlement === "mix";
  const showGrace = settlement === "grace" || settlement === "mix";
  const showHours = settlement === "hours" || settlement === "mix";

  const askCents = graceAsk.trim() === "" ? null : Math.round(Number(graceAsk) * 100);
  const signal = askSignal({ kind, category, ask: askCents && askCents > 0 ? askCents : null }, reference.grace);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="This is a">
          <Select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "NEED" | "OFFER")}>
            <option value="NEED">Need</option>
            <option value="OFFER">Offer</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select name="category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="text-sm">
        <span className="mb-1 block font-medium">How would you like to settle?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to settle">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={settlement === mode}
              onClick={() => setChosen(mode)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                settlement === mode ? "border-accent bg-accent/10 text-accent" : "border-border bg-card/70 hover:bg-border/40"
              }`}
            >
              {SETTLEMENT_LABEL[mode]}
            </button>
          ))}
        </div>
        <span className="mt-1 block text-xs text-muted">
          {SETTLEMENT_HINT[settlement]}{" "}
          {chosen === null && isSurvival && "For water, food, medicine, shelter and safety, a gift is where most people here start. Any other way is one click away."}
          {chosen === null && !isSurvival && settlement === "hours" && "For care and skills, Hours is where most people here start: everyone's time is worth the same."}
        </span>
      </div>

      {showBarter && (
        <Field label="What would you take in return?">
          <Input name="wantsInReturn" maxLength={200} placeholder="Eggs, batteries, an afternoon of digging" />
        </Field>
      )}

      {(showGrace || showHours) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {showGrace && (
            <Field
              label="Grace ask"
              info="grace"
              hint={
                reference.grace
                  ? `${CATEGORY_LABEL[category]} has recently settled for about ${fmtGrace(reference.grace.median)} near you (the middle of ${reference.grace.exchanges} exchanges).`
                  : "Not enough settled exchanges near you yet to show a usual price."
              }
            >
              <Input name="priceGrace" type="number" min={0} step={0.01} value={graceAsk} onChange={(event) => setGraceAsk(event.target.value)} />
            </Field>
          )}
          {showHours && (
            <Field
              label="Hours ask"
              info="hours"
              hint={reference.hours ? `Usually about ${fmtHours(reference.hours.median)} near you (${reference.hours.exchanges} exchanges). Decimal hours, e.g. 1.5` : "Decimal hours, e.g. 1.5"}
            >
              <Input name="priceHours" type="number" min={0} step={0.25} />
            </Field>
          )}
        </div>
      )}

      {signal && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          That is about {fmtTimes(signal.timesUsual)} times what {CATEGORY_LABEL[category].toLowerCase()} has recently settled for near you ({fmtGrace(signal.usual)}, the middle of{" "}
          {signal.exchanges} exchanges) <InfoDot term="usual-price" />. You can still post it. Anything over {HIGH_ASK_FACTOR} times the usual will carry a note saying so, so people can ask you why.
        </p>
      )}
    </>
  );
}
