import { parseManifest, type Manifest } from "./manifest.schema";

// What this software says about itself. Every claim here is shaped by
// manifest.schema.ts, which will not accept a capability without at least one
// stated limitation, a way to check it, and where the idea came from.
//
// Rendered for people at /about, served as JSON at /api/about so another node,
// a researcher, or a machine can read the claims and go check them.

const SOURCES = {
  dispossessed: {
    title: "The Dispossessed: An Ambiguous Utopia",
    author: "Ursula K. Le Guin",
    year: 1974,
    informs: "The whole design posture. Anarres is a society with no state that still grows quiet power through control of channels and appropriation of others' work. The critic page is named for Sabul, who does exactly that; identity keys and the drawn-by-lot mediators are answers to him.",
  },
  omelas: {
    title: "The Ones Who Walk Away from Omelas",
    author: "Ursula K. Le Guin",
    year: 1973,
    informs: "The negative test: no arrangement here may rest on a hidden cost somebody else pays. It is why there is no fee on trades, no sale of Grace, and no data to sell.",
  },
  stayAndFight: {
    title: "The Ones Who Stay and Fight",
    author: "N. K. Jemisin",
    year: 2018,
    informs: "Utopia as maintenance rather than a destination: each critic finding ends with what one member can do. Her story's mechanism, a class of workers who remove dangerous people, is deliberately refused here.",
  },
  mutualAid: {
    title: "Mutual Aid: A Factor of Evolution",
    author: "Peter Kropotkin",
    year: 1902,
    informs: "That cooperation between neighbors is ordinary rather than exceptional, and needs tools rather than supervision.",
  },
  ostrom: {
    title: "Governing the Commons",
    author: "Elinor Ostrom",
    year: 1990,
    informs: "Commons survive with clear boundaries, rules made by the people who use them, graduated response to breaches, and cheap local conflict resolution: the shape of the commons pages and of disputes.",
  },
  gesell: {
    title: "The Natural Economic Order",
    author: "Silvio Gesell",
    year: 1916,
    informs: "Demurrage: money that slowly melts is spent rather than hoarded. Here the melt is paid out equally to every verified member.",
  },
  lets: {
    title: "LETS and mutual credit practice",
    author: "Michael Linton and the mutual-credit tradition",
    year: 1983,
    informs: "Money created by a transfer between two members rather than issued: balances net to zero, so there is no treasury to seize and no issuer to capture.",
  },
  restorative: {
    title: "Restorative justice and peacemaking circles",
    informs: "Harm answered by an account, people with no stake in the matter, restitution, and a public record, instead of punishment or exclusion.",
  },
  sortition: {
    title: "Sortition in Athenian democracy and modern citizens' assemblies",
    informs: "Selection by lot for roles that would otherwise attract the power-seeking. Mediators are drawn, never volunteers.",
  },
  drand: {
    title: "drand: distributed randomness beacon (League of Entropy)",
    url: "https://drand.love/",
    informs: "Public, signed randomness so a mediator draw can be recomputed by anyone and cannot be quietly re-rolled.",
  },
  noble: {
    title: "noble-curves and noble-hashes",
    author: "Paul Miller",
    url: "https://paulmillr.com/noble/",
    informs: "Ed25519 signatures and SHA-256, used for member identity keys, signed vouches, the hash-chained ledger and its checkpoints.",
  },
  pedersen: {
    title: "Hash commitments (commit-and-reveal)",
    informs: "Cash notes: a secret is hashed on the member's device and only the commitment reaches the server; revealing the secret redeems the note, and the first reveal wins.",
  },
  typesafe: {
    title: "TypeSafe AI: System One models (Jev)",
    url: "https://docs.typesafe.ai/introduction",
    informs:
      "The claim audit. Questions whose permitted answers are fixed in advance, answered against supplied state and returning calibrated probabilities with confidence, which is the right shape for auditing prose: it cannot wander off into generated text, and its uncertainty is a number rather than a tone.",
  },
  osm: {
    title: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    informs: "All map data, whether drawn from a self-hosted file or fetched as picture tiles.",
  },
  tor: {
    title: "Tor onion services (version 3)",
    url: "https://community.torproject.org/onion-services/overview/",
    informs: "The onion address: a service reached through rendezvous points, whose address is its own public key, so neither the visitor nor the server learns the other's network address.",
  },
  protomaps: {
    title: "Protomaps and the PMTiles format",
    url: "https://protomaps.com/",
    informs: "A whole region's map in one file that a community can host itself and that the browser draws, so the map works with no internet beyond this server.",
  },
} as const;

const manifest: Manifest = {
  version: 1,
  name: "Freewill",
  tagline: "Tools for neighbors to stay fed, safe and honest with each other when there is no authority to appeal to.",

  mission:
    "Freewill exists for the weeks after a government collapses or turns on the people it was supposed to serve. In that gap, the things that actually keep people alive are local: who has water, who can set a bone, who will watch the children, who is owed what. Those things normally run on institutions. This software tries to run them on neighbors instead, without creating a new authority in the process. It gives a community five things: a board of who needs what and who has what; a way to trade that does not require anyone to have money; shared resources with a named steward; a way to answer harm that is neither a court nor a feud; and a way to decide things together. Every one of them is designed so that the person who wants to control it cannot, and so that the server it runs on can be taken tomorrow without taking the community with it.",

  notThis:
    "This is not a bank, a cryptocurrency, a social network, or a company. Grace is not an investment and cannot be bought or sold for money: it is a record of promises between people who can find each other, worth nothing to anyone outside the community. There is no administrator, so nobody can restore your account, reverse a trade, remove a person, or rescue you from a bad decision. It is not a substitute for emergency services where those still work, and it is not anonymous: your neighbors see your name, your locality, your standing, and what you publish. It is also young software, written quickly, tested by its own automated checks and not by an outside auditor.",

  principles: [
    {
      key: "no-authority",
      statement: "There is no administrator, moderator, or issuer anywhere in the system.",
      because:
        "Every structure that can be captured will eventually attract someone who wants to capture it. The safest office is the one that does not exist. Decisions that need making are made by a computed rule anyone can read, by a steward who is accountable through their own standing, or by a group of people drawn by lot.",
      brokenIf:
        "Any account gains a power other accounts cannot compute for themselves: deleting someone else's record, adjusting a balance, granting standing, or deciding a dispute without being drawn for it.",
      enforcedBy: [
        { kind: "file", ref: "src/lib/standing.ts", what: "Standing is a pure function of public facts; there is no field anyone can set by hand." },
        { kind: "page", ref: "/explain", what: "Every decision the app makes about you, shown step by step with your real numbers." },
      ],
    },
    {
      key: "zero-sum",
      statement: "Money here is mutual credit. There is no mint, and every balance nets to zero.",
      because:
        "If money must be issued, someone issues it, and that someone is a power. If money is held in a treasury, the treasury can be seized. Mutual credit needs neither: when you pay someone and go below zero, the money you spent is your own promise, and it disappears when you make good on it.",
      brokenIf: "The sum of every balance, plus what demurrage carried forward, plus what is held in unredeemed notes, is anything other than zero.",
      enforcedBy: [
        { kind: "page", ref: "/explain", what: "The zero-sum check, itemized, against the live database." },
        { kind: "script", ref: "smoke:cash", what: "Minting and reclaiming a cash note leaves the books at zero." },
      ],
    },
    {
      key: "checkable",
      statement: "Any claim the software makes about you can be recomputed by you.",
      because: "A rule nobody can check is an authority wearing the costume of arithmetic. The explanation and the decision are produced by the same code in the same pass, so they cannot drift apart.",
      brokenIf: "A number shown to a member cannot be reproduced from public inputs, or the explanation of a rule disagrees with what the rule does.",
      enforcedBy: [
        { kind: "script", ref: "smoke:explain", what: "The recorded steps of a rule must equal that rule's own result, for every member and every demurrage run on record." },
        { kind: "page", ref: "/verify", what: "The whole ledger history re-derived from its hash chain." },
      ],
    },
    {
      key: "real-figures",
      statement: "Every figure you see counts something that happened. Nothing on a live server is seeded, simulated or made up.",
      because:
        "People decide whom to trust, and whether this is worth joining, by what they see: how many neighbors, how many trades, whether the books balance. Demo neighbors or test trades on the live server would be a false sense of use. The guards stop accidents, not a determined operator: whoever holds the production connection string can still write to it directly, which is why the ledger is hash-chained and its checkpoints can be written down.",
      brokenIf:
        "The live database holds the demo seed or a test record, a page shows a count that was not read from the database, or an example on a page names someone who could be a real member.",
      enforcedBy: [
        { kind: "script", ref: "smoke:prod", what: "The seed and every test refuse the production database before connecting, nothing in build or deploy runs them, no page quotes the seed, and Grace cannot be scaled to hundredths twice." },
        { kind: "file", ref: "scripts/not-production.ts", what: "The guard every data-making script imports first. It has no override." },
      ],
    },
    {
      key: "survive-seizure",
      statement: "Assume the server will be taken. Nothing important may live only here.",
      because:
        "A single machine is a single point of seizure, and the people most likely to need this are the people a hostile authority is most interested in. So records are signed, the ledger is a hash chain anyone can re-derive, trust can be exported and verified elsewhere, and the whole thing is meant to be run by anyone on their own hardware.",
      brokenIf: "A record that matters cannot be exported, or an exported record cannot be verified without trusting this server.",
      enforcedBy: [
        { kind: "script", ref: "smoke:keys", what: "A trust bundle of public keys and signed vouches verifies with no server, and a forged vouch inside it is caught." },
        { kind: "script", ref: "smoke:checkpoint", what: "An exported ledger bundle re-derives and verifies with no database." },
        { kind: "script", ref: "smoke:federation", what: "Another node checks this node's bundle with nothing but its key, and holds it to the ledger history it saw before." },
      ],
    },
    {
      key: "least-data",
      statement: "Collect nothing that is not needed to run the commons.",
      because:
        "Data that exists can be demanded. There is no email, no phone number, no address, and no real-name requirement; the map pin is rounded to about a hundred meters and is never shown to anyone as a point, only as a distance.",
      brokenIf: "The app asks for an identifier it does not need, stores a precise location, or shows one member another member's exact position.",
      enforcedBy: [
        { kind: "file", ref: "src/lib/geo.ts", what: "Pins are rounded through roundPin; distance is all anyone else is shown." },
        { kind: "script", ref: "smoke:idme", what: "The optional affiliation check stores only a date, a one-way code, and which affiliations were confirmed." },
      ],
    },
    {
      key: "standing-gates-credit-only",
      statement: "Standing is earned and computed, and it controls credit and nothing else.",
      because:
        "A reputation number that gates speech, votes, or disputes is a class system with extra steps. Here it sets how far below zero you may go, how many disputes you may have open, and nothing more.",
      brokenIf: "Standing is used to restrict posting, voting, raising a dispute, or being heard.",
      enforcedBy: [
        { kind: "file", ref: "src/lib/standing.ts", what: "The computed limits: credit, dispute allowance, and the verification flag." },
        { kind: "page", ref: "/sabul", what: "A live measurement of whether trust and credit are concentrating in a few hands." },
      ],
    },
    {
      key: "no-hidden-cost",
      statement: "No part of this may rest on a cost somebody else pays without knowing.",
      because:
        "The usual ways to fund software are advertising, selling data, or taking a cut of transactions. Each of those makes some person or some moment the product. The server is funded by donations kept entirely apart from Grace, and if nobody donates, the answer is that a community hosts its own copy, not that the members become the revenue.",
      brokenIf: "A fee appears on trades, Grace becomes purchasable, member data leaves for a third party, or an advertisement appears.",
      enforcedBy: [{ kind: "page", ref: "/support", what: "The donation link, and the explanation of why Grace is not for sale." }],
    },
  ],

  capabilities: [
    {
      key: "board",
      name: "Needs and offers",
      status: "live",
      route: "/board",
      does: "A public board of what people need and what they have, by category and locality, with survival needs first. You can pledge to meet a need, and the app suggests two-way trades where your offer matches someone's need and theirs matches yours.",
      doesNot: [
        "It does not deliver anything, verify that a listing is truthful, or hold anything in escrow. A pledge is a public promise, and the only consequence of breaking it is that people saw.",
        "It has no search across localities beyond the scope toggle, and no notifications: you have to come and look.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:matches", what: "Two-way trade detection and counterpart suggestions." }],
      sources: [SOURCES.mutualAid],
    },
    {
      key: "grace",
      name: "Grace: mutual credit",
      status: "live",
      route: "/ledger",
      does: "Money that needs no bank and no mint. A transfer debits the payer and credits the payee in the same instant, so the money supply is exactly the sum of outstanding promises and always nets to zero. Your credit limit is computed from your standing. Positive balances melt about 3% a month and the melt is shared equally among verified members.",
      doesNot: [
        "Grace cannot be bought or sold for money and is worth nothing outside this community. It is a record of promises, not an asset.",
        "Nobody can reverse a transfer. There is no dispute process inside the ledger; a wrong payment is a matter between two people, or a dispute if it was harm.",
        "A person can go to their credit limit and simply stop participating. The loss is spread across everyone who holds positive balances, and the limit is the only cap on that.",
      ],
      verifiedBy: [
        { kind: "page", ref: "/explain", what: "Your credit limit derived step by step, and the zero-sum check." },
        { kind: "script", ref: "smoke", what: "Balances net to zero across transfers and limits are enforced." },
      ],
      sources: [SOURCES.lets, SOURCES.gesell],
    },
    {
      key: "hours",
      name: "Hours: the time bank",
      status: "live",
      route: "/ledger",
      does: "A second ledger where one hour equals one hour for everybody, so care work and skilled trades are worth the same time. Stored in minutes, with its own credit limit.",
      doesNot: ["It does not judge whether an hour was well spent, and it cannot price anything that is not time."],
      verifiedBy: [{ kind: "script", ref: "smoke", what: "Hours transfers and limits behave like Grace but in minutes." }],
      sources: [],
    },
    {
      key: "fair-prices",
      name: "Usual prices, with nobody setting them",
      status: "live",
      route: "/board",
      does: "When water is short, a market left alone gives the last jug to whoever can pay most. Nothing here can cap a price, so the app removes what overcharging depends on: not knowing what is normal. It shows what each kind of thing has recently settled for near you, puts a plain note on any offer of a survival good asking more than twice that, and starts survival listings as a gift and care listings in Hours. The ledger page shows which kinds of exchange people say helped them most beside what those usually cost.",
      doesNot: [
        "It does not stop anyone charging anything. The note is a fact on the page for a conversation between two people, and the seller can post regardless.",
        "A usual price appears only after three settled exchanges nearby in ninety days. In a new community, or in the first days of a shortage, there is no figure and so no note, which is exactly when it would matter most.",
        "The usual price is the middle of what was paid, not a judgment of what is fair. If everyone overcharges, the middle moves with them.",
        "It only sees exchanges settled in Grace on the board. Barter, gifts, Hours and anything agreed off the board are invisible to it, and someone who wants to avoid the note can ask in barter.",
        "A need offering to pay far above the usual is never flagged, on purpose: that is someone desperate, not someone overcharging. It also means a seller can wait for desperate needs rather than post a high offer.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:pricing", what: "The median resists one exploitative sale, small samples show nothing, and only survival offers well above the usual are noted." },
        { kind: "file", ref: "src/lib/pricing.ts", what: "The rules and their thresholds, in one short file." },
      ],
      sources: [SOURCES.ostrom],
    },
    {
      key: "cash",
      name: "Cash notes for trading offline",
      status: "live",
      route: "/cash",
      does: "Turn Grace into a bearer note you can hand to someone on paper. Your device makes a secret and hashes it; only the hash reaches the server, and the Grace is locked until somebody reveals the secret. The first reveal wins, so a note cannot be spent twice.",
      doesNot: [
        "If you lose the secret, the Grace stays locked and nobody can recover it for you.",
        "Anyone holding the secret can redeem the note. A photograph of your paper is the note.",
        "Minting and redeeming both need this server. Two people cannot settle a note with each other while the network is down; they can only carry it until they can reach the server.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:cash", what: "Commitment, single reveal, double-spend refusal, and the books staying at zero." }],
      sources: [SOURCES.pedersen],
    },
    {
      key: "trust",
      name: "Vouching and standing",
      status: "live",
      route: "/people",
      does: "Identity comes from other people. Enough vouches from verified locals (the square root of the locality over three, at most seven) makes you verified, which unlocks credit, vouching, mediating and voting. Standing is computed from vouches, kept pledges, exchange, tenure, and resolved disputes.",
      doesNot: [
        "It cannot tell whether someone is who they say they are. It can only make a fake person expensive, by requiring vouches from people who are themselves vouched for.",
        "A patient group of real people who vouch only for each other can still reach verification. The critic page measures this rather than preventing it.",
        "Standing cannot be appealed, because there is nobody to appeal to. It can only be changed by doing the things it counts.",
      ],
      verifiedBy: [
        { kind: "page", ref: "/explain", what: "Your standing, step by step, from public counts." },
        { kind: "page", ref: "/sabul", what: "Whether trust is concentrating, and whether closed vouch rings exist right now." },
      ],
      sources: [SOURCES.dispossessed],
    },
    {
      key: "identity-keys",
      name: "Member-held identity keys",
      status: "live",
      route: "/keys",
      does: "A signing key made in your browser, whose private half never reaches the server. Your vouches are signed with it, so nobody, including whoever runs this server, can forge or claim your endorsement. The web of trust can be exported and verified on another machine.",
      doesNot: [
        "The private key lives in your browser's storage. A script-injection flaw on this site could read it, and clearing your browser data destroys it. Back it up.",
        "Money transfers are not yet signed by members; the server still mediates them, signing checkpoints with its own key. Per-transfer member signatures are the next step.",
        "A signed vouch proves who wrote it, not that what it says is true.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:keys", what: "Signing, forgery refusal, and off-server verification of an exported trust bundle." }],
      sources: [SOURCES.noble, SOURCES.dispossessed],
    },
    {
      key: "commons",
      name: "Shared resources",
      status: "live",
      route: "/commons",
      does: "A well, a tool library, a clinic tent: held in common with a steward, not an owner. Each has a record where anyone who takes, uses, returns or tends it says so, with no approval, so use is visible to the people who share it. Its users, not the steward alone, decide its rules by ranked choice, and the result is carried out when voting closes. A steward can hand it to someone who accepts; if a steward writes nothing for sixty days, its users choose who tends it now. Anyone can leave one public word about an entry, which costs nobody standing: the step before a dispute.",
      doesNot: [
        "It does not ration, count stock, or decide what fair use is. It makes use visible; what people do about what they see is up to them.",
        "The record is only what people choose to write. Someone who takes without writing it down leaves no trace, and the app cannot know.",
        "An active steward cannot be voted out. A steward doing the job badly is answered by a word, then a dispute, not by a recall, because a recall vote is also how a clique would seize something a person built.",
        "Members can read that you used a thing and on which day. Near a pinned place, that says roughly where you were that day. It is your choice to write it, and you should know that it does.",
        "A result needs a third of its users, at least two, to vote. A shared thing whose users have drifted away can get stuck with a silent steward and too few voters to replace them.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:commons", what: "Who counts as a user, when a steward is silent, the quorum, and a real question carried out against the database, including an outsider's ballot being ignored." },
        { kind: "file", ref: "src/lib/commons.ts", what: "The rules and their thresholds, in one short file." },
      ],
      sources: [SOURCES.ostrom],
    },
    {
      key: "disputes",
      name: "Disputes and repair",
      status: "live",
      route: "/circles",
      does: "When someone is harmed, the answer is an account, three mediators with no stake in the matter drawn by public lottery, a written resolution, and a public record. Findings of harm lower standing until kept promises rebuild it.",
      doesNot: [
        "It cannot compel anyone to take part, to comply with an outcome, or to stay. There is no enforcement beyond what the community chooses to do with what it now knows.",
        "It is not equipped for violence or for anything where someone is in danger. Get to safety first.",
        "A finding is the judgment of three drawn neighbors, not proof. There is no appeal.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:lottery", what: "Mediators are drawn from a public beacon, logged, and the draw can be recomputed." }],
      sources: [SOURCES.restorative, SOURCES.sortition, SOURCES.drand],
    },
    {
      key: "assemblies",
      name: "Deciding together",
      status: "live",
      route: "/assemblies",
      does: "Locality questions decided by ranked-choice voting among verified members, with the rounds shown. Ballots are secret: the browser seals each one with a key it keeps, and the records hold who voted and, separately, the rankings with no names or times, reshuffled on every ballot. Only the key reopens a ballot to change it before voting closes.",
      doesNot: [
        "It does not make anyone abide by the result, and it has no quorum rule: a question decided by three people looks the same as one decided by three hundred, except for the count.",
        "The secrecy protects the stored record, not the moment of voting. The server handles each ballot while the voter is signed in, so an operator who logged requests as they arrived, or watched the database change live, could still see which ballot was whose. Hiding that too would take blind signatures and casting from an unlinked connection, which are not built.",
        "Because a sealed ballot cannot be traced to its voter, one cannot be struck out later. Who may vote is checked once, when the ballot is cast.",
        "A voter who loses the key (a cleared browser, another device) cannot change their ballot. It still counts.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:rcv", what: "The instant-runoff tally, round by round, including ties." },
        { kind: "script", ref: "smoke:ballots", what: "Sealing, one ballot per person even when pressed twice at once, changing only with the key, and a stored ballot that names no one." },
      ],
      sources: [SOURCES.sortition],
    },
    {
      key: "onion",
      name: "An onion address",
      status: "partial",
      does: "When a community runs Tor beside the app, members can reach it at an onion address. The server then never learns their network address, and a network watcher sees only that they use Tor. Tor Browser is offered the onion address from the regular site, and the app handles onion visits correctly: no forced https, a cookie for the onion address only, shared login limits that do not lock every Tor user out together, and no ID.me.",
      doesNot: [
        "This deployment does not run one: the hosted server cannot run Tor beside the app. A community has to run its own node for it (docs/onion.md).",
        "It hides where members connect from, not who they are. Once logged in, the app knows the account and everything published is as public as ever.",
        "While the regular address exists, the server's own location is not hidden.",
        "Every Tor visitor shares one sign-up allowance, so someone flooding it could block sign-ups through Tor for an hour. The regular address keeps working.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:onion", what: "Address checksums against real published onion addresses, telling onion visits apart, the policy without forced https, and the shared limits." },
        { kind: "file", ref: "docs/onion.md", what: "How onion addresses work, what they hide and do not, and how to run one." },
      ],
      sources: [SOURCES.tor],
    },
    {
      key: "map",
      name: "Map and distance",
      status: "live",
      route: "/map",
      does: "Needs, offers, shared resources, hazards and open disputes drawn around you. A community can host one map file for its area, which the browser draws in your own colors and which works with no internet beyond this server.",
      doesNot: [
        "It never draws people. Your pin is rounded to about a hundred meters and others see only a distance.",
        "There is no address search and no geocoder, on purpose, and nothing asks your device for your location unless you press the button.",
        "Without a self-hosted map file it falls back to OpenStreetMap's public picture tiles, which need the internet and are not meant for heavy use.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:map", what: "Theme colors become map colors, and the drawing rules match the map data's layers." }],
      sources: [SOURCES.osm, SOURCES.protomaps],
    },
    {
      key: "ledger-integrity",
      name: "A history that cannot be quietly edited",
      status: "live",
      route: "/verify",
      does: "Every economic event is appended to a hash chain. Editing any past record breaks that link and every link after it, moving the root. The whole chain can be exported with a signature and re-derived by anyone with no database.",
      doesNot: [
        "It detects tampering; it does not prevent it. Whoever controls the database can still rewrite it, and the point is that the rewrite becomes visible to anyone who wrote down an earlier root.",
        "The checkpoint is signed by this server's key, not by members, so it proves the server said this, not that members agreed.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:hashlog", what: "An altered record is caught, with the position of the break." },
        { kind: "script", ref: "smoke:checkpoint", what: "An exported bundle verifies with no database." },
      ],
      sources: [SOURCES.noble],
    },
    {
      key: "critic",
      name: "The critic",
      status: "live",
      route: "/sabul",
      does: "A standing self-audit that asks, of live data, where power could still be pooling: concentration of trust, hoarding against demurrage, closed vouch rings, one voice on a shared channel, a mediator lottery that keeps landing on the same person, and how much of the web of trust is forgeable. Each finding ends with one thing a single member can do about it.",
      doesNot: [
        "It has no power at all. It does not restrict anyone, and nobody is assigned to act on it; that is deliberate, because a role that acts on findings would be the authority this design exists without.",
        "Its thresholds are judgment calls, written in the source, not discoveries.",
      ],
      verifiedBy: [{ kind: "file", ref: "src/lib/sabul.ts", what: "The seven measurements and the thresholds they are judged against." }],
      sources: [SOURCES.dispossessed, SOURCES.stayAndFight],
    },
    {
      key: "glossary",
      name: "The app's words, explained where they appear",
      status: "live",
      does: "An (i) beside each word the app uses in its own sense (Grace, Hours, vouch, standing, verified, demurrage, dispute, mediator, steward, commitment, checkpoint and more) opens one plain sentence, with a fuller explanation folded underneath and a link to the page where you can see the thing for yourself. It opens by hover, by tap, or by keyboard, and stays on screen.",
      doesNot: [
        "The explanations are written by hand, not generated from the rules. The numbers in them are checked against the code's constants, but the prose around those numbers is only as accurate as whoever last wrote it. Show the Work is the page computed from the rules themselves.",
        "It explains a word, not your situation. Your own numbers are on the page each explanation links to.",
        "Only the words chosen for the glossary have one. A word the app uses that nobody added has no (i).",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:glossary", what: "Every term is shown on a page, every link goes to a real page, each explanation reads as a sentence, and every number in them matches the rule it describes." }],
      sources: [],
    },
    {
      key: "accounts",
      name: "Accounts without email",
      status: "live",
      route: "/profile",
      does: "A username and a password, and nothing else. You can change your password, your locality, your pin, your name and your skills at any time.",
      doesNot: [
        "There is no password reset, ever. No email is on file and nobody has the power to let you back in; if you lose your password the account and its vouches are gone.",
        "Your username cannot be changed, because other people's vouches and records point at it.",
      ],
      verifiedBy: [{ kind: "script", ref: "smoke:security", what: "Password rules, login throttling, and sessions that die when you change your password." }],
      sources: [],
    },
    {
      key: "claim-audit",
      name: "An audit of this page's own claims",
      status: "partial",
      does: "Every claim on this page is checked two ways. First the checks it names are run, which proves the mechanical part. Then the claim and that evidence go to a model answering fixed-answer questions about the prose: are these limitations a real disclosure or marketing, does this answer oversell, is a limitation a careful reader would expect missing, does the provenance say plainly that an AI wrote the code. Answers are probabilities with confidence; anything the model is unsure of goes to a person rather than into the report as fact.",
      doesNot: [
        "The judgment half is not proof. It is a probability from a second reader about prose, and it can be wrong in both directions: it can miss a real evasion, and it can flag honest writing.",
        "The audit questions were written by the same author as the claims they audit. A different reader answers them, but the questions themselves carry that author's blind spots, which is the same limitation the testing section admits one level up.",
        "It judges the text, not the running system. A capability could describe itself perfectly and still behave differently; only the deterministic checks speak to behavior.",
        "The judgment half needs an external service and an API key, so it runs when a maintainer runs it, not continuously. The evidence-gathering half needs neither and runs offline.",
        "Nothing in the running app consults any of it. A model that could gate anything here would be the authority this design exists without.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:audit", what: "Every claim is covered, every question is well formed, and every question has a reading that can fail." },
        { kind: "file", ref: "src/lib/audit.questions.ts", what: "The questions themselves, and the thresholds at which an answer becomes a finding." },
      ],
      sources: [SOURCES.typesafe],
    },
    {
      key: "federation",
      name: "Other nodes you choose to trust",
      status: "partial",
      route: "/nodes",
      does: "A community runs its own copy, and copies trust each other the way you would trust a bank you had checked. A node is known by its key, which also signs its ledger. Once enough verified members here trust a node (the square-root rule used for vouches), this node takes in its signed bundle, fetched, sent, or carried as a file, and shows its needs, offers, notices, shared things and seeds under its name. Each bundle carries its ledger history as hashes; a later one must carry the history an earlier one did, and a changed history is shown. Nothing of ours goes to a node members here do not trust.",
      doesNot: [
        "Grace and Hours do not cross between nodes. A price on another node's listing is in that node's own Grace. Transfers signed by the people on both sides, which would let members trade across nodes, are not built.",
        "Trusting a node means believing what it signs. The signature proves a bundle came from the key members here checked and that its ledger history was not quietly rewritten between bundles. It cannot prove that the people it lists are real or that its records are honest: whoever runs that node can write anything and sign it.",
        "Checking the key is left to the members who trust it. If people are given a false key and enough of them trust it without checking, this node will take in whatever that key signs.",
        "Whether a node's books balance is its own word. Another node cannot check its balances from outside.",
        "Nothing syncs on a schedule. A bundle moves when a member presses fetch or send, or brings a file. There is no sync over a local network or radio.",
        "A bundle sent or carried by hand holds the whole ledger history as hashes, so a node past about a hundred thousand ledger entries cannot send one that way. A fetch carries only what is new.",
        "Pins on published records are rounded to about a kilometer before they leave, but whoever runs a trusted node sees everything this node's members published, who wrote it, and the signed vouches for those people.",
        "It protects the fetch against private network addresses by the address and by what it resolves to, but it does not pin the resolved address, so a name that changes what it points to between the check and the fetch can slip past.",
      ],
      verifiedBy: [
        { kind: "script", ref: "smoke:federation", what: "A signed bundle is taken in once enough verified members trust its node; an edited, forged, future-dated or untrusted bundle is refused with its reason; a rewritten ledger history is caught; the same bundle twice changes nothing; no balance, password or exact pin leaves the node." },
        { kind: "page", ref: "/nodes", what: "This node's key, every node members here have added, who trusts each one, and every bundle taken in or refused." },
        { kind: "file", ref: "docs/federation.md", what: "The API, the bundle format, and exactly what is signed, for anyone building a node that talks to this one." },
      ],
      sources: [SOURCES.dispossessed, SOURCES.noble],
    },
  ],

  provenance: {
    summary:
      "Freewill was built in the open between August and September 2026 as a working answer to a question: what would it actually take to keep a neighborhood civil without a state? It is a Next.js application with a MongoDB database, about fifteen thousand lines, and it is meant to be read as much as run. The constitution it was built from is in BUILD_PROMPT.md, the conventions in AGENTS.md, and a guide to checking any rule against its code in docs/reading-guide.md.",
    authorship:
      "The code was written by Claude, an AI assistant made by Anthropic, working from the direction, decisions and corrections of one person, Mark Ciubal. That is not a disclaimer; it is a fact a reader needs: nobody should extend more trust to this software because software is usually written by people. Extend it the trust the checks below earn, and no more. Every design decision that mattered was made by a person and is recorded with its date in BUILD_PROMPT.md.",
    reviewed:
      "No independent security audit has been done. No outside developer has reviewed the code. The cryptography uses well-regarded libraries rather than anything invented here, but the way it is assembled has not been reviewed by a cryptographer. Treat the money, the keys and the privacy properties as promising rather than proven.",
    testing:
      "The project carries its own automated checks, run as scripts whose names begin with smoke, covering the ledger's zero-sum invariant, the hash chain, cash notes, identity keys and forged signatures, exported checkpoints, the mediator lottery, standing, ranked-choice voting, theming, locality handling, security rules, and the worked explanations, which are checked against every decision the app makes for every member. They are written by the same author as the code, so they show the code does what its author intended, not that what was intended is right.",
    cautions: [
      "This is young software carrying real consequences: if a community keeps its food and water coordination here, a bug is a real hunger. Keep a paper copy of anything you cannot afford to lose.",
      "The people most likely to need tools like this are the people most at risk from being identified. Read the privacy limits above before you invite anyone.",
      "Whoever runs the server can read everything in the database, including who traded with whom. The design limits what is stored, not what the operator can see.",
      "Nothing here is legal, medical or financial advice, and Grace is not money in any legal sense.",
    ],
    license: "See the repository.",
  },

  questions: [
    {
      key: "what-is-this",
      question: "What is Freewill, in one paragraph?",
      answer:
        "It is a set of tools for a neighborhood that has no working authority to appeal to: a board of needs and offers, money that is just a record of promises between members, shared resources with stewards, a way to answer harm with drawn mediators rather than a court, and ranked-choice decisions. It is built so that no account has power over another, and so that the community survives the loss of the server.",
      limits: [
        "It only works where people can actually reach each other. It is a coordination tool, not a supply of anything.",
        "It assumes a group small enough that vouching means something. In a locality of strangers, verification is slow by design.",
      ],
      liveState: ["members", "localities", "verifiedShare"],
      seeAlso: [{ kind: "page", ref: "/programs", what: "Every feature, its status, and why it exists." }],
      sources: [SOURCES.dispossessed, SOURCES.mutualAid],
    },
    {
      key: "who-is-in-charge",
      question: "Who is in charge? Who can ban me, or take my account?",
      answer:
        "Nobody. There is no administrator role in the software: no account can delete another person's records, adjust a balance, grant standing, or remove a member. Decisions come from a computed rule you can recompute, from a steward who is accountable through their own standing, or from mediators drawn by public lottery. The person running the server has power over the machine, not a power inside the app.",
      limits: [
        "Whoever runs the server can read the database, stop the service, or alter records directly. The hash chain makes alteration visible to anyone who saved an earlier root; it does not prevent it.",
        "Being unable to remove anyone means the community's only answers to a persistently bad actor are a dispute record, lowered standing, and people's own choices about whom to trade with.",
      ],
      liveState: ["booksBalance", "ledgerEntries"],
      seeAlso: [
        { kind: "page", ref: "/explain", what: "Every rule applied to you, with the arithmetic." },
        { kind: "page", ref: "/verify", what: "The whole history, re-derived." },
      ],
      sources: [SOURCES.dispossessed],
    },
    {
      key: "where-does-money-come-from",
      question: "Where does the money come from? Can someone print it?",
      answer:
        "No one can. Grace is created by spending, not by issuing: when a verified member pays someone and goes below zero, the credit they spent is their own promise to the community, and it is extinguished when they earn their way back. That is why every balance always sums to zero, and why there is no treasury anyone could seize and no issuer anyone could capture. Your credit limit is computed from your standing; positive balances melt a little each month and the melt is shared equally among verified members.",
      limits: [
        "The total that can exist is bounded by everyone's credit limits, so a young community with few vouches has very little room to trade.",
        "Someone can spend to their limit and walk away. That loss is shared by everyone holding positive balances; nothing recovers it.",
        "Grace has no value outside this community and cannot be exchanged for money.",
      ],
      liveState: ["graceInCirculation", "booksBalance", "demurrageLastRun"],
      seeAlso: [{ kind: "page", ref: "/explain", what: "The zero-sum check and the last melt, itemized." }],
      sources: [SOURCES.lets, SOURCES.gesell],
    },
    {
      key: "how-was-this-built",
      question: "Who wrote this code, and should I trust it?",
      answer:
        "The code was written by Claude, an AI assistant from Anthropic, directed by one person who made the design decisions and is named in the repository. No outside developer has reviewed it and no security audit has been done. The right posture is the one the software asks for everywhere else: do not trust it, check it. Every rule maps to a file, a function and a runnable check, and the pages that tell you things about yourself show the arithmetic.",
      limits: [
        "The automated checks were written by the same author as the code. They show the code does what its author intended, not that the intent was correct.",
        "The cryptography uses well-regarded libraries, but nobody qualified has reviewed how they are assembled here.",
        "It is young software. If a community depends on it for food or water coordination, keep a paper copy.",
        "Even the audit of this page is partly the author's own work: a different reader answers the questions, but the questions were written here.",
      ],
      liveState: ["capabilityCount", "checkCount"],
      seeAlso: [
        { kind: "file", ref: "docs/reading-guide.md", what: "Each ground rule mapped to its file, function and test." },
        { kind: "file", ref: "BUILD_PROMPT.md", what: "Every design decision, with its date and reasoning." },
      ],
      sources: [],
    },
    {
      key: "what-do-you-know-about-me",
      question: "What does this know about me, and who can see it?",
      answer:
        "A username, a password you chose, a locality you typed, a map pin rounded to about a hundred meters, and whatever you chose to write or publish. No email, no phone number, no address, no real name unless you give one. Other members see your name, your locality, your standing, your vouches, what you publish, and how far away you are, never your pin as a point.",
      limits: [
        "Whoever runs the server can see everything in the database, including who traded with whom and the contents of disputes.",
        "The rounded pin still narrows you to a small area, and a distance from several members narrows it further. Treat it as approximate, not as protection against someone determined.",
        "Your trades are visible to the people you trade with, and the ledger's hash chain records that events happened, though the exported form hides who paid whom.",
      ],
      liveState: ["members"],
      seeAlso: [{ kind: "page", ref: "/profile", what: "Everything the app holds about you, editable." }],
      sources: [],
    },
    {
      key: "what-if-i-lose-my-password",
      question: "What happens if I lose my password?",
      answer:
        "The account is gone, along with its vouches and its standing, and you would start again with a new account and new vouches. There is no email on file to send a reset to and no person with the power to let you in. You can change your password while you still know it. Keep it in a password manager, or written somewhere only you would look in a form only you would understand, or in a dull-looking file on a drive you keep.",
      limits: [
        "This is a deliberate trade: any reset path is a way in for someone impersonating you, and any person who can perform a reset is an authority.",
        "The same is true of your identity key, which lives only in your browser. Back it up separately.",
      ],
      liveState: [],
      seeAlso: [{ kind: "page", ref: "/profile", what: "Change your password, or sign out of every other device." }],
      sources: [],
    },
    {
      key: "what-happens-if-this-ends",
      question: "What happens if this shuts down, or the server is seized?",
      answer:
        "Because every balance nets to zero, dissolving the commons costs nobody anything: debts are forgiven, credits release claims that were only ever promises, and everyone returns to zero together. There is no treasury to take. What is lost is the coordination and the record, which is why the ledger can be exported with a signature and verified anywhere, and why the web of trust can be exported as a bundle another community can check without trusting this server.",
      limits: [
        "Exports have to be made before the loss. Nothing is automatically backed up to you.",
        "Another node that trusts this one holds a copy of what this one published and the fingerprint of its ledger history, not the ledger itself. Who owes whom lives only here, so a copy to rebuild from has to be exported before the loss.",
      ],
      liveState: ["booksBalance", "ledgerEntries"],
      seeAlso: [
        { kind: "page", ref: "/wind-down", what: "What dissolving the commons would cost each person, checked against the live books." },
        { kind: "page", ref: "/verify", what: "Export the ledger and verify it elsewhere." },
      ],
      sources: [],
    },
    {
      key: "who-pays-for-it",
      question: "Who pays for this, and what is the catch?",
      answer:
        "Donations for the server bill, kept completely separate from Grace, plus communities hosting their own copies. There is no fee on trades, no way to buy Grace, no advertising and no data for sale. A payments layer that would have taken a percentage was considered and refused: it would have created a pot of money to seize, let wealth buy influence, and required identity checks that contradict the privacy design.",
      limits: [
        "That means funding is uncertain. If donations do not cover the bill, the answer is that communities self-host, not that the members become the product.",
        "Whoever pays the server bill still controls the server, which is an argument for self-hosting rather than for trusting this instance.",
      ],
      liveState: [],
      seeAlso: [{ kind: "page", ref: "/support", what: "The donation link and why Grace is not for sale." }],
      sources: [SOURCES.omelas],
    },
    {
      key: "can-it-be-gamed",
      question: "Can this be gamed? What are the known weaknesses?",
      answer:
        "Yes, and the honest ones are these. A patient group of real people can vouch for each other and reach verification. Someone can spend to their credit limit and leave, and everyone holding positive Grace shares that loss. Whoever runs the server can read everything and can alter records, at the price of breaking a hash chain anyone may have saved. An injected script on this site could read an identity key out of the browser. Anyone holding a cash note's secret can spend it. The critic page measures several of these against live data rather than pretending they are solved.",
      limits: [
        "This list is what its authors know of. An adversary with more imagination will find more, and nobody outside has audited it.",
        "The critic's thresholds are judgment calls, not findings.",
      ],
      liveState: ["signatureCoverage", "strainedFindings"],
      seeAlso: [{ kind: "page", ref: "/sabul", what: "Where power could be pooling right now, measured." }],
      sources: [SOURCES.dispossessed],
    },
    {
      key: "why-le-guin",
      question: "Why does a mutual-aid app quote science fiction?",
      answer:
        "Because The Dispossessed is the most careful account anyone has written of how a society without a state still grows quiet power: not through police, but through whoever controls the channel and whoever can take credit for others' work. The design treats that book as a threat model. The critic is named for Sabul, the man who does it. Jemisin's reply to Le Guin, that utopia is maintenance rather than a destination, is why each of the critic's findings ends with something one person can do, and why the enforcers her story imagines are deliberately refused here.",
      limits: ["Fiction is a source of questions, not of evidence. Nothing here works because a novel said it would."],
      liveState: [],
      seeAlso: [{ kind: "page", ref: "/sabul", what: "The critic, and what one person can do about each finding." }],
      sources: [SOURCES.dispossessed, SOURCES.omelas, SOURCES.stayAndFight],
    },
  ],

  sources: Object.values(SOURCES),
};

// Parsed at import: a manifest that breaks its own schema breaks the build.
export const MANIFEST: Manifest = parseManifest(manifest);
