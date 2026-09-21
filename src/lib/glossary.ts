// The app's own vocabulary, in one place. `short` is plain language for anyone;
// `more` is the technical detail, shown only if someone opens it. Add a term
// here and reference it with <InfoDot term="..." />.

export type GlossaryEntry = { label: string; short: string; more: string };

export const GLOSSARY = {
  grace: {
    label: "Grace",
    short: "The community's main credit. It is created when you help someone and settled when you give back. Nobody issues it and it is not backed by anything but trust.",
    more: "Mutual credit: a payment debits the payer and credits the payee by the same amount, so every balance always sums to zero (plus a small demurrage remainder and any value reserved in notes). It is stored in cents. How far you may go below zero is set by your standing, and nothing else. There is no mint, bank, or reserve to inflate or seize.",
  },
  hours: {
    label: "Hours",
    short: "A second currency where one hour equals one hour, for everyone. It is for work that should not be haggled over: care, watch shifts, teaching.",
    more: "A time bank stored in minutes. Same mutual-credit mechanics as Grace, but denominated in time so no one's hour is worth more than another's.",
  },
  vouch: {
    label: "Vouch",
    short: "Saying you know someone and would answer for them. Vouches are how the community knows you are a real person, since there is no ID authority.",
    more: "The atom of the web of trust. A vouch from a verified local counts toward that person's verification. Only verified people can vouch, vouches never transfer, and they can be withdrawn. A dispute may ask a voucher why they gave it.",
  },
  standing: {
    label: "Standing",
    short: "Your reputation, earned rather than granted. It rises with vouches, kept promises, and service, and falls if a dispute finds you caused harm.",
    more: "A computed score, never assignable by hand: vouches received, pledges kept, exchange activity, tenure, and disputes mediated, minus harm found and unfounded accusations, with diminishing returns. It gates exactly one thing — how far into Grace and Hours credit you may go — and nothing else. Nobody can change it by hand, because there is no admin to do it.",
  },
  verified: {
    label: "Verified",
    short: "Recognized as a real, distinct person by enough neighbors. Verified people can use credit, vouch, mediate disputes, and vote.",
    more: "Verification means vouches from already-verified locals meeting the locality's threshold, which scales with population as round(sqrt(population)/3), from 1 up to 7. While a locality is new, every vouch counts (bootstrap). An optional ID.me affiliation counts as one extra vouch. Unverified accounts can post, pledge, and earn, but cannot go below zero, vouch, mediate, propose, or vote.",
  },
  demurrage: {
    label: "Demurrage",
    short: "Grace you hold slowly shrinks, and the amount is shared out equally to everyone. It keeps credit circulating instead of piling up.",
    more: "3% of a positive Grace balance every 30 days is redistributed as an equal dividend to every verified member; the rounding remainder carries forward so the ledger stays exactly zero-sum. It runs at most once per interval and is idempotent.",
  },
  dispute: {
    label: "Dispute",
    short: "How harm is handled with no police or courts. Someone raises it, neutral people hear everyone, and a repair is agreed and written down.",
    more: "A restorative circle. Mediators are drawn by public lottery from high-standing verified locals. Outcomes are harm found (which lowers the named person's standing), no harm, or unfounded (which lowers the raiser's standing and their accusation allowance). Restitution over punishment; never a cage, never exclusion by default.",
  },
  mediator: {
    label: "Mediator",
    short: "A neutral person who holds a dispute: hears everyone and records what is agreed. Chosen at random, never by volunteering.",
    more: "Drawn by a lottery seeded from the drand public randomness beacon: seed = sha256(disputeId + the round's randomness). The draw is logged on the dispute (the pool, the seed, and who was drawn) so anyone can recompute it. The parties cannot be mediators; the pool is the highest-standing verified people nearby, about five per hundred, growing with the square root of the population.",
  },
  "accusation-credit": {
    label: "Accusation credit",
    short: "You can only have so many disputes open at once. Raising a false one costs you a slot and some standing, so disputes cannot be used as a weapon.",
    more: "Allowance = 2 + floor(score / 40) − unfounded count, with a minimum of 1. One is spent while a dispute you raised is open; an unfounded outcome permanently reduces the allowance and lowers standing.",
  },
  commons: {
    label: "Commons",
    short: "Things held by everyone and kept by a steward: wells, tool libraries, seed banks, kitchens. Not owned, but cared for.",
    more: "Each has a steward who keeps it usable, and a record where anyone who takes, uses, returns or tends it says so. Nobody approves the record and nobody rations the thing: a shared thing is ruined when no one can see it being used up, so the record is the protection. The people in the record decide its rules, and choose who tends it if a steward goes quiet for sixty days.",
  },
  steward: {
    label: "Steward",
    short: "The person who keeps a shared resource usable and answerable to the people who use it. A caretaker, not an owner.",
    more: "Stewardship shows on a profile and is answerable in a dispute like anything else. There is no ownership to transfer; a commons belongs to its users.",
  },
  pledge: {
    label: "Pledge",
    short: "A public promise to meet a need or take an offer. Keeping your word raises your standing.",
    more: "On the board a pledge moves offered → accepted → completed. The person paying confirms completion, which optionally settles the Grace or Hours ask, so nobody is debited without their own click. Completed pledges feed standing.",
  },
  cash: {
    label: "Cash",
    short: "Bearer notes you can hand over on paper, even with no network. You mint one and write it down; whoever holds it reclaims the value when they can reach the server, like cashing a check.",
    more: "Hash-commitment notes. Your browser makes a random secret and hashes it (SHA-256 of 'N1:denomination:secret'); only that hash reaches the server, which therefore can never spend the note for you. Minting burns the value to the commitment; revealing the secret reclaims it. Single-use, with the whole-Grace denomination (1–100) bound into the hash, so a photocopy is caught the second time.",
  },
  commitment: {
    label: "Commitment",
    short: "The hash of your note's secret. The system stores this, never the secret itself, so it cannot spend the note for you.",
    more: "A cryptographic commitment: sha256('N1:' + denomination + ':' + secret), computed in your browser. Because only the hash is stored, even a seized server cannot forge a redemption; the secret is revealed only at the moment of spending.",
  },
  checkpoint: {
    label: "Checkpoint",
    short: "A signed fingerprint of the whole ledger. Download it and verify the history on any machine, trusting nothing but the public key.",
    more: "Every economic event is hash-chained, and the root is signed by the commons key. The ledger can be downloaded as that signed chain and re-derived and checked offline at /verify with only the public key. Publish a checkpoint and the past cannot be quietly rewritten.",
  },
  locality: {
    label: "Locality",
    short: "Where you are: a neighborhood, valley, or block. You name it when you join and change it from your profile when you move; your map pin lives there too.",
    more: "The name is yours to type. Your map pin, placed on OpenStreetMap, is rounded to about a hundred meters, and no address is stored. The locality scopes the board, bulletins, commons, disputes, and assemblies. People are never drawn as a point, only shown as a distance. Honesty about it is what makes local vouches and votes mean something.",
  },
  jubilee: {
    label: "Jubilee",
    short: "The fail-safe: if the community ever winds down, every debt is forgiven and everyone returns to zero. Nobody is ruined by its ending.",
    more: "Because mutual credit nets to zero, dissolution costs each person exactly nothing; there is no treasury to seize and no one left holding the loss. The /wind-down page is a live mirror of this, never a button. Winding down is an assembly decision, not a switch one person flips.",
  },
  "ranked-choice": {
    label: "Ranked choice",
    short: "You rank the options you can live with, first to last. The count runs instant runoffs until one option holds a majority.",
    more: "Instant-runoff voting: each round the lowest option is eliminated and its ballots move to their next choice, until one option holds a majority of the ballots still live. Ballots can be changed until voting closes, and results are hidden until then so early votes do not steer later ones. Verified locals only.",
  },
  affiliation: {
    label: "Affiliation",
    short: "An optional, verified credential — nurse, first responder, teacher, and so on — that helps people find who can help.",
    more: "Proven through ID.me and shown as a badge, searchable in the People directory. It counts as one extra vouch toward verification and grants no authority; a trust signal, never power. Off unless the deployment enables it, and only the affiliation, a date, and an anonymous code are stored.",
  },
  "trade-pulse": {
    label: "Trade pulse",
    short: "After a trade settles, both people say whether it left them better off. The running total shows that exchange creates value.",
    more: "Answers are private per person, shown only as community aggregates, and never affect standing. It mirrors the classroom gains-from-trade experiment: the ledger sums to zero, but wellbeing does not.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type Term = keyof typeof GLOSSARY;
