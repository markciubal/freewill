// "Show the work." A computed rule in this app can hand back, alongside its
// result, the list of steps it took: what went in, the rule applied, and what
// came out. The steps are built by the same code that computes the number, in
// the same pass, so the explanation cannot drift from the decision. A person
// can read the steps, redo the arithmetic, and see for themselves that the app
// did what the ground rules say. That is the whole point: a rule nobody can
// check is an authority wearing a costume.

export type WorkedValue = number | string | boolean;

export type WorkedStep = {
  // What this step establishes, in plain words: "Vouches needed in your locality".
  label: string;
  // The named inputs the step used, exactly as the code saw them.
  inputs: Record<string, WorkedValue>;
  // The rule, written as arithmetic or a sentence, with the real numbers in it.
  rule: string;
  // What the step produced, exactly as the code holds it (Grace in hundredths).
  result: WorkedValue;
  // The same result as a person should read it, when the stored form differs:
  // "0.13 Grace" for a result held as 13 hundredths. The page shows this; the
  // checks compare `result`.
  shown?: string;
  // Optional: why the rule is shaped this way.
  why?: string;
};

export type Worked = {
  title: string;
  // The file that holds the code, so a reader can go and check the source.
  source: string;
  steps: WorkedStep[];
  // The final answer this explanation supports.
  result: WorkedValue;
};

// A small builder so rule code reads as "step(label, inputs, rule, result)"
// and returns the result, letting the computation and its record share a line.
export class Work {
  readonly steps: WorkedStep[] = [];

  step<T extends WorkedValue>(label: string, inputs: Record<string, WorkedValue>, rule: string, result: T, why?: string): T {
    this.steps.push({ label, inputs, rule, result, ...(why ? { why } : {}) });
    return result;
  }

  // A step whose result is an amount of Grace held in hundredths: recorded as
  // the exact number, shown as Grace.
  graceStep(label: string, inputs: Record<string, WorkedValue>, rule: string, cents: number, why?: string): number {
    this.steps.push({ label, inputs, rule, result: cents, shown: `${fmtCentsForWork(cents)} Grace`, ...(why ? { why } : {}) });
    return cents;
  }
}

// Formats cents of Grace as the whole-unit figure a person would write.
export function fmtCentsForWork(cents: number): string {
  return (cents / 100).toFixed(2);
}
