// Made-up examples, shown only on an empty list, so someone arriving at a new
// community can see what belongs there and how much to say. They are never
// stored, never counted, never mixed in with real posts, and every one is
// marked as an example. The names contain a hyphen, which no username can,
// so an example can never be mistaken for a neighbor who really signed up.
// See "Only real figures in production" in AGENTS.md; smoke:a11y and
// smoke:prod hold these to it.

export type ExampleTone = "neutral" | "accent" | "danger" | "warn";
export type Example = { tags: { text: string; tone?: ExampleTone }[]; title: string; body: string; by: string };
export type ExampleSet = { key: string; intro: string; items: Example[] };

export const EXAMPLES = {
  board: {
    key: "board",
    intro: "This is the kind of thing that goes here: one need or one offer each, specific enough that someone can act on it.",
    items: [
      {
        tags: [{ text: "NEED", tone: "warn" }, { text: "Water" }],
        title: "Drinking water for a family of four",
        body: "Our tap has been dry since Tuesday. Two jugs a day until it runs again. We can trade eggs.",
        by: "@a-neighbor",
      },
      {
        tags: [{ text: "OFFER", tone: "accent" }, { text: "Skills & labor" }],
        title: "Bike and small-engine repairs",
        body: "Afternoons in my garage. Bring the part if you have it, and I will show you how while I work.",
        by: "@another-neighbor",
      },
      {
        tags: [{ text: "NEED", tone: "warn" }, { text: "Care" }],
        title: "Someone to sit with my mother on Thursdays",
        body: "Two hours in the afternoon so I can get to the market. Paid in Hours.",
        by: "@a-third-neighbor",
      },
    ],
  },
  bulletins: {
    key: "bulletins",
    intro: "A good notice says what is happening, where exactly, what to do, and how you know. It expires when it stops being true.",
    items: [
      {
        tags: [{ text: "HAZARD", tone: "warn" }],
        title: "Power line down on the school road",
        body: "By the bend past the school. Stay well back and keep children away. I saw it myself at 7 this morning.",
        by: "@a-neighbor",
      },
      {
        tags: [{ text: "INFO" }],
        title: "Water point open at the community hall, 8 to noon",
        body: "Bring your own containers. Two jugs each until everyone has had some.",
        by: "@another-neighbor",
      },
    ],
  },
  commons: {
    key: "commons",
    intro: "A shared thing has a name, a place, a steward who keeps it usable, and a few rules the people who use it agree on.",
    items: [
      {
        tags: [{ text: "Water" }],
        title: "Rain barrels behind the library",
        body: "Four barrels with a filter. Rules: drinking and cooking water only, and say so in its record when you take some.",
        by: "@a-neighbor",
      },
      {
        tags: [{ text: "Tools & parts" }],
        title: "Shared ladder and saws",
        body: "In the blue shed at the end of the lane. Rules: back by dark, and write in the record if anything breaks.",
        by: "@another-neighbor",
      },
    ],
  },
  seeds: {
    key: "seeds",
    intro: "Share seed you saved from your own plants, say when to sow it, and ask for a little back at harvest.",
    items: [
      {
        tags: [{ text: "Seed" }, { text: "Vegetable" }],
        title: "Bush beans, saved last autumn",
        body: "About sixty seeds. Easy for a first garden. Sow after the last frost, and bring back a handful at harvest.",
        by: "@a-neighbor",
      },
      {
        tags: [{ text: "Cutting" }, { text: "Herb" }],
        title: "Mint runners",
        body: "Grows almost anywhere, maybe too well. Keep it in a pot.",
        by: "@another-neighbor",
      },
    ],
  },
} satisfies Record<string, ExampleSet>;
