// The app's own vocabulary, in one place. Each term appears behind an (i) next
// to the word wherever it matters on a page (<InfoDot term="..." />).
//
//   short: plain language for anyone, shown as soon as the (i) opens.
//   more:  the fuller explanation, folded away under "More about ..." so only
//          people who want it read it.
//   see:   the page where you can see the thing for yourself, offered at the
//          end of "more" (and hidden when you are already on that page).
//
// Add a term here, then put its (i) beside the word on the pages that use it.
// smoke:glossary fails if a term is defined but never shown, or links nowhere.

export type GlossaryEntry = { label: string; short: string; more: string; see?: { href: string; label: string } };

export const GLOSSARY = {
  grace: {
    label: "Grace",
    short: "The community's main credit. It is created when you help someone and settled when you give back. Nobody issues it, and it is backed by nothing but trust.",
    more: "Grace is mutual credit. A payment takes Grace off the payer and adds the same amount to the payee, so all balances together always sum to zero (counting a few hundredths carried by demurrage and anything locked in cash notes). A negative balance is not a debt to one person; it means the community has given you more than you have given back so far. How far below zero you may go is set by your standing and nothing else. There is no mint, no bank, and no reserve that anyone could inflate or seize. Amounts are kept to the hundredth.",
    see: { href: "/ledger", label: "your ledger" },
  },
  hours: {
    label: "Hours",
    short: "A second currency where one hour equals one hour, for everyone. It is for work that should not be haggled over: care, watch shifts, teaching.",
    more: "Hours is a time bank that works like Grace: paying someone moves time from your balance to theirs, and all balances sum to zero. An hour of childcare is worth exactly an hour of welding, so no one's time is worth more than anyone else's. It is kept to the minute and has its own credit limit, also set by standing.",
    see: { href: "/ledger", label: "your ledger" },
  },
  vouch: {
    label: "Vouch",
    short: "Saying you know someone and would answer for them. Vouches are how the community knows you are a real person, since there is no ID office.",
    more: "A vouch from someone already verified in your locality counts toward your own verification; while a locality is brand new, every vouch counts, so it can get started. Only verified people can vouch. You can withdraw a vouch at any time, and a dispute may ask why you gave one. With an identity key, your vouch can be signed so nobody can forge it in your name.",
    see: { href: "/people", label: "the people directory" },
  },
  standing: {
    label: "Standing",
    short: "Your reputation, earned rather than granted. It rises with vouches, kept promises, and service, and falls if a dispute finds you caused harm.",
    more: "Standing is a score the app computes from public facts: vouches received, pledges kept, exchange, time as a member, and disputes you mediated, minus harm a dispute found and accusations that proved unfounded. Each part is capped, so nobody can pile it up. The score is labelled newcomer, neighbor, trusted or pillar. It controls exactly one thing, how far into Grace and Hours credit you may go, and nothing else. Nobody can change it by hand, because there is no admin to do it.",
    see: { href: "/explain", label: "your standing, step by step" },
  },
  verified: {
    label: "Verified",
    short: "Recognized as a real, distinct person by enough neighbors. Verified people can use credit, vouch, mediate disputes, and vote.",
    more: "You are verified once enough vouches come from people already verified in your locality. How many depends on how many people live there: about the square root of the population divided by three, at least 1 and never more than 7. An optional ID.me affiliation counts as one extra vouch. Until you are verified you can still post, pledge, and earn; you just cannot go below zero, vouch, mediate, propose, or vote.",
    see: { href: "/explain", label: "how many vouches you need" },
  },
  demurrage: {
    label: "Demurrage",
    short: "Grace you hold slowly shrinks, and the amount is shared out equally to everyone. It keeps credit moving instead of piling up.",
    more: "Every 30 days, 3% of each positive Grace balance is taken off and shared equally among all verified members. Anyone at or below zero loses nothing. Hundredths that do not divide evenly are carried to the next run, so the books still sum to exactly zero. It runs at most once a month however often it is triggered.",
    see: { href: "/explain", label: "the last run, worked through" },
  },
  dispute: {
    label: "Dispute",
    short: "How harm is handled with no police or courts. Someone raises it, neutral people hear everyone, and a repair is agreed and written down.",
    more: "Three mediators with no stake in the matter are drawn at random. They hear everyone and record one of three outcomes: harm found, which lowers the standing of the person it is about; no harm; or unfounded, which lowers the standing of the person who raised it. The aim is repair, not punishment, and nobody is thrown out.",
    see: { href: "/circles", label: "disputes" },
  },
  mediator: {
    label: "Mediator",
    short: "A neutral person who holds a dispute: hears everyone and records what is agreed. Chosen at random, never by volunteering.",
    more: "Mediators are drawn from the most trusted verified people nearby, about five per hundred residents. The people in the dispute can never be drawn. The draw uses public randomness from the drand beacon, and the pool, the random seed, and who was drawn are all written on the dispute, so anyone can redo the draw and see it was fair.",
    see: { href: "/circles", label: "disputes" },
  },
  "accusation-credit": {
    label: "Dispute allowance",
    short: "You can only have so many disputes open at once. Raising a false one costs you a slot and some standing, so disputes cannot be used as a weapon.",
    more: "You start with 2 open disputes at a time, plus one for every 40 points of standing. Each dispute you raise uses a slot until it closes. If one is found unfounded, you lose standing and one slot for good. You always keep at least one.",
    see: { href: "/explain", label: "your allowance, worked through" },
  },
  commons: {
    label: "Commons",
    short: "Things held by everyone and kept by a steward: wells, tool libraries, seed banks, kitchens. Not owned, but cared for.",
    more: "Each shared thing has a steward who keeps it usable, and a record where anyone who takes, uses, returns or tends it says so. Nobody approves the record and nobody rations the thing: a shared thing is ruined when no one can see it being used up, so the record is the protection. The people in the record decide its rules, and choose who tends it if a steward goes quiet for sixty days.",
    see: { href: "/commons", label: "shared things" },
  },
  steward: {
    label: "Steward",
    short: "The person who keeps a shared thing usable and answerable to the people who use it. A caretaker, not an owner.",
    more: "A steward can hand the role to someone who accepts it. If a steward writes nothing in the thing's record for sixty days, its users can choose a new one. An active steward cannot be voted out; a steward doing the job badly is answered with a public word on the record, then a dispute.",
    see: { href: "/commons", label: "shared things" },
  },
  pledge: {
    label: "Pledge",
    short: "A public promise to meet a need or take an offer. Keeping your word raises your standing.",
    more: "A pledge goes from offered, to accepted by the person who posted, to completed. The person who pays confirms it is done, which settles any Grace or Hours that was asked, so nobody is charged without their own click. Completed pledges count toward standing.",
    see: { href: "/board", label: "the board" },
  },
  cash: {
    label: "Cash",
    short: "Bearer notes you can hand over on paper, even with no network. You mint one and write it down; whoever holds it reclaims the value when they can reach the server, like cashing a check.",
    more: "Minting takes the Grace off your balance and locks it to a secret your device makes. Only a scrambled fingerprint of the secret (its hash) is stored here, so the server can never spend the note for you. Whoever reveals the secret first reclaims the value, and a copy shown later is refused. Lose the paper and the value is gone, exactly like cash.",
    see: { href: "/cash", label: "cash" },
  },
  commitment: {
    label: "Commitment",
    short: "The fingerprint of your note's secret. The app stores this, never the secret itself, so it cannot spend the note for you.",
    more: "It is a SHA-256 hash of the note's denomination and secret, worked out in your browser before anything is sent. A hash can be checked against a secret but not turned back into one, so even a seized server cannot forge a reclaim. The secret is only revealed at the moment someone spends the note.",
    see: { href: "/cash", label: "cash" },
  },
  checkpoint: {
    label: "Checkpoint",
    short: "A signed fingerprint of the whole ledger. Download it and check the history on any machine, trusting nothing but the public key.",
    more: "Every payment and adjustment is chained to the one before it by a hash, so changing any past entry changes every fingerprint after it. The latest fingerprint is signed by the commons. Download the ledger and it can be re-checked anywhere, offline. Write down a checkpoint and nobody can quietly rewrite what happened before it.",
    see: { href: "/verify", label: "how to check a ledger yourself" },
  },
  locality: {
    label: "Locality",
    short: "Where you are: a neighborhood, valley, or block. You name it when you join and change it from your profile when you move.",
    more: "The name is yours to type; capitalization does not matter when matching. Your map pin, placed separately, is rounded to about a hundred meters, and no address is stored. Your locality sets what you see by default on the board, bulletins, commons, disputes, and assemblies, and whose vouches count toward your verification, so being honest about it is what makes local trust mean something.",
    see: { href: "/profile", label: "your profile" },
  },
  jubilee: {
    label: "Wind-down",
    short: "The fail-safe: if the community ever winds down, every debt is forgiven and everyone returns to zero. Nobody is ruined by its ending.",
    more: "Because all balances sum to zero, ending the whole thing costs each person exactly nothing: there is no treasury to seize and no one left holding the loss. The wind-down page shows this live. It is a mirror, never a button; winding down would be decided by an assembly, not by one person.",
    see: { href: "/wind-down", label: "the wind-down page" },
  },
  "ranked-choice": {
    label: "Ranked choice",
    short: "You rank the options you can live with, first to last. The count runs instant runoffs until one option holds a majority.",
    more: "Each round, the option with the fewest first choices is dropped and its ballots move to their next choice, until one option has a majority of the ballots still counting. You can change your ballot until voting closes, and results stay hidden until then so early votes do not steer later ones. Only verified people in the locality vote.",
    see: { href: "/assemblies", label: "assemblies" },
  },
  "secret-ballot": {
    label: "Secret ballot",
    short: "Nobody can see how you voted: not your neighbors, and not anyone reading the server's records. The records say only that you voted.",
    more: "Your browser seals your ballot with a key that stays in this browser and sends only the key's fingerprint. The server keeps two separate lists: who voted, and the rankings with no names or times, shuffled every time a ballot comes in. To change your ballot before voting closes, your browser shows the key; without it, nobody can find which ballot is yours. The honest limit: the server handles your ballot while you are signed in, so an operator recording requests as they arrived could still see it. What is protected is the stored record, which is what a seized database would show. Save the key if you might change your ballot from another device.",
    see: { href: "/assemblies", label: "assemblies" },
  },
  affiliation: {
    label: "Affiliation",
    short: "An optional, verified credential, such as nurse, first responder, or teacher, that helps people find who can help.",
    more: "It is proven through ID.me and shown as a badge on your profile, where people searching for help can find it. It counts as one extra vouch toward verification and gives no authority at all. Only the affiliation, a date, and an anonymous code are stored, never your name or documents. It is off unless this community turns it on.",
    see: { href: "/profile", label: "your profile" },
  },
  "trade-pulse": {
    label: "Trade pulse",
    short: "After a trade settles, both people say whether it left them better off. The running total shows that exchange creates value.",
    more: "Each answer runs from much worse off to much better off. Answers are private and only ever shown added up, never person by person, and they never affect standing. The ledger always sums to zero, but wellbeing does not: this is how the community sees what trading actually does for it, and which kinds of exchange help most.",
    see: { href: "/ledger", label: "the pulse on your ledger" },
  },
  "identity-key": {
    label: "Identity key",
    short: "A signing key that lives only on your device. It lets you sign your vouches so nobody can forge them or claim them as theirs.",
    more: "The key has two halves. The private half never leaves your browser; the public half is stored on your account. A vouch signed with it can be checked by anyone, even on another community's server, without trusting this one. Back up the private half: if you lose it, your account keeps working, but you need the backup or a new key to sign again. It is optional.",
    see: { href: "/keys", label: "your identity key" },
  },
  node: {
    label: "Node",
    short: "Another community's own copy of this app. Once enough verified members here trust one, what it publishes shows here, marked with its name.",
    more: "A node is known by its key, the same key that signs its ledger, so check the whole key with someone who lives there, by voice or on paper, before you trust it. A node is taken in once enough verified members trust it: the square root of the number of verified members here, divided by three, at least 1 and never more than 7, the same rule as vouches. Until then nothing it sends is kept and nothing of ours goes to it. Its needs, offers, notices, shared things and seeds are shown as it sent them. Its Grace is its own and does not move here, and no one's balance, trades or exact pin leaves a node.",
    see: { href: "/nodes", label: "other nodes" },
  },
  "usual-price": {
    label: "Usual price",
    short: "What this kind of thing has recently sold for near you. Nobody sets it; it is the middle of what neighbors actually paid.",
    more: "It is the middle value (the median) of Grace actually paid for this category nearby in the last ninety days, so one unusually high or low sale cannot move it. It only appears once there have been three such sales, which also keeps anyone's own price private. An offer of water, food, medicine, shelter or safety asking more than twice the usual price carries a plain note, so people can ask why. It never blocks anything.",
    see: { href: "/board", label: "the board" },
  },
} as const satisfies Record<string, GlossaryEntry>;

export type Term = keyof typeof GLOSSARY;
