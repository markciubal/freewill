import type { ExampleSet } from "@/lib/examples";
import { Badge } from "./ui";

// Made-up examples under an empty list (src/lib/examples.ts). The box is
// dashed, its heading says they are not real, and each card starts with
// "example", so the word is read aloud before anything else about it.
export function Examples({ set }: { set: ExampleSet }) {
  const headingId = `examples-${set.key}`;
  return (
    <section aria-labelledby={headingId} className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-4">
      <div>
        <h2 id={headingId} className="text-sm font-semibold">
          Examples, not real posts
        </h2>
        <p className="mt-1 text-sm text-muted">{set.intro}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {set.items.map((item) => (
          <li key={item.title} className="rounded-md border border-border/70 bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>example</Badge>
              {item.tags.map((tag) => (
                <span key={tag.text}>
                  {" "}
                  <Badge tone={tag.tone}>{tag.text}</Badge>
                </span>
              ))}
            </div>
            <div className="mt-1 font-medium">{item.title}</div>
            <p className="text-muted">{item.body}</p>
            <div className="mt-1 text-xs text-muted">
              {item.by} <span className="italic">(made up)</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
