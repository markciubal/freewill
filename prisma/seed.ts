// Seed a small valley so the skeleton has something to show.
// Everyone's password is "freewill123". Run: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const PASSWORD = "freewill123";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const people = [
    { username: "ada", displayName: "Ada Okafor", locality: "North Ridge", lat: 44.312, lng: -121.184, skills: ["first aid", "midwifery", "herbalism"], bio: "Nurse for twenty years. I keep the clinic tent." },
    { username: "bo", displayName: "Bo Lindqvist", locality: "North Ridge", lat: 44.318, lng: -121.171, skills: ["welding", "small engines", "solar"], bio: "If it has a motor I can probably make it run." },
    { username: "cy", displayName: "Cy Marchetti", locality: "River Flats", lat: 44.271, lng: -121.212, skills: ["carpentry", "water purification", "ham radio"], bio: "Radio on 146.52 most evenings." },
    { username: "dee", displayName: "Dee Nakamura", locality: "River Flats", lat: 44.266, lng: -121.199, skills: ["gardening", "seed saving", "cooking"], bio: "Seed bank steward. Ask me about beans." },
    { username: "eli", displayName: "Eli Brandt", locality: "Old Mill", lat: 44.229, lng: -121.098, skills: ["hunting", "tracking", "butchering"], bio: "" },
  ];
  const id: Record<string, string> = {};
  const pin: Record<string, { lat: number; lng: number }> = {};
  for (const p of people) {
    const u = await db.user.upsert({
      where: { username: p.username },
      update: {},
      create: { ...p, passwordHash: hash, covenantAcceptedAt: new Date() },
    });
    id[p.username] = u.id;
    pin[p.username] = { lat: p.lat, lng: p.lng };
  }

  const vouches: [string, string, string?][] = [
    ["ada", "bo", "Fixed our generator in a storm"], ["ada", "dee", "Kept the kitchen going for a month"], ["ada", "cy"],
    ["bo", "ada", "Set my arm"], ["bo", "cy"], ["cy", "ada"], ["cy", "bo"], ["dee", "ada"], ["dee", "cy", "Purified our water after the flood"],
  ];
  for (const [f, t, note] of vouches) {
    await db.vouch.upsert({
      where: { fromId_toId: { fromId: id[f], toId: id[t] } },
      update: {},
      create: { fromId: id[f], toId: id[t], note },
    });
  }

  if ((await db.listing.count()) > 0) {
    console.log("Listings exist; skipping the rest of the seed.");
    return;
  }

  await db.listing.createMany({
    data: [
      { kind: "NEED", category: "MEDICAL", title: "Insulin, two weeks", description: "Type 1, eleven years old. We have four days left. Any brand.", ownerId: id["ada"], locality: "North Ridge", ...pin["ada"] },
      { kind: "NEED", category: "ENERGY", title: "Firewood, one cord, split", description: "For the kitchen through January. Can collect with the cart.", ownerId: id["dee"], locality: "River Flats", ...pin["dee"], priceGrace: 15 },
      { kind: "OFFER", category: "ENERGY", title: "Solar and battery repair", description: "Panels, charge controllers, inverters. Bring it to the shed or I come to you.", ownerId: id["bo"], locality: "North Ridge", ...pin["bo"], priceHours: 120, wantsInReturn: "Eggs, or diesel" },
      { kind: "OFFER", category: "FOOD", title: "Tomato and squash seedlings", description: "Forty trays. Gift. Take what you will actually plant.", ownerId: id["dee"], locality: "River Flats", ...pin["dee"], quantity: "40 trays" },
      { kind: "NEED", category: "SAFETY", title: "Night watch, two more people", description: "Route 9 crossing, 10pm to 2am, three nights a week. Paid in Hours.", ownerId: id["cy"], locality: "River Flats", ...pin["cy"], priceHours: 240 },
      { kind: "OFFER", category: "FOOD", title: "Venison, quartered", description: "One deer a week most weeks. Salt or ammunition preferred.", ownerId: id["eli"], locality: "Old Mill", ...pin["eli"], wantsInReturn: "Salt, .30-06, or Grace", priceGrace: 40 },
    ],
  });

  await db.commons.createMany({
    data: [
      { name: "North well", category: "WATER", description: "Hand pump, tested clean weekly.", rules: "Boil if the tag is red. Twenty liters per household per day when the tag is yellow.", stewardId: id["cy"], locality: "River Flats", ...pin["cy"] },
      { name: "Tool shed", category: "TOOLS", description: "Hand tools, two chainsaws, a welder, ladders.", rules: "Sign the book. Back by dusk. Broken is fine, unreported is not.", stewardId: id["bo"], locality: "North Ridge", ...pin["bo"] },
      { name: "Seed bank", category: "FOOD", description: "Beans, squash, corn, brassicas, potatoes. Regional varieties.", rules: "Take a packet, return two at harvest.", stewardId: id["dee"], locality: "River Flats", ...pin["dee"] },
      { name: "Clinic tent", category: "MEDICAL", description: "Triage, wound care, births. Open mornings.", rules: "Emergencies any hour: ring the bell.", stewardId: id["ada"], locality: "North Ridge", ...pin["ada"] },
    ],
  });

  const day = 86_400_000;
  await db.bulletin.createMany({
    data: [
      { title: "Boil water in River Flats", body: "The creek tested positive after the rain. Boil everything from the creek for three minutes. The north well is clean.", level: "HAZARD", locality: "River Flats", ...pin["cy"], authorId: id["cy"], expiresAt: new Date(Date.now() + 7 * day) },
      { title: "Armed group seen on Route 9", body: "Six people, two trucks, heading east at dusk. Not known to us. Stay off the road tonight.", level: "URGENT", locality: "Old Mill", ...pin["eli"], authorId: id["eli"], expiresAt: new Date(Date.now() + 2 * day) },
      { title: "Clinic hours", body: "Mornings, sunrise to noon. Bring your own bandages if you have them.", level: "INFO", locality: "North Ridge", ...pin["ada"], authorId: id["ada"] },
    ],
  });

  // A few settled exchanges, applied to balances so the ledger sums to zero.
  const xfers: { ledger: "GRACE" | "HOURS"; from: string; to: string; amount: number; memo: string }[] = [
    { ledger: "GRACE", from: "bo", to: "ada", amount: 20, memo: "Splint and care" },
    { ledger: "HOURS", from: "dee", to: "bo", amount: 90, memo: "Fixed the pump" },
    { ledger: "GRACE", from: "ada", to: "dee", amount: 10, memo: "Squash and beans" },
  ];
  for (const x of xfers) {
    const field = x.ledger === "GRACE" ? "graceBalance" : "hoursBalance";
    await db.user.update({ where: { id: id[x.from] }, data: { [field]: { decrement: x.amount } } });
    await db.user.update({ where: { id: id[x.to] }, data: { [field]: { increment: x.amount } } });
    await db.transfer.create({ data: { ledger: x.ledger, fromId: id[x.from], toId: id[x.to], amount: x.amount, memo: x.memo } });
  }

  await db.circle.create({
    data: {
      title: "More than a share from the seed bank",
      account: "Eli took eight packets of bean seed in one visit. The rule is one packet, two back at harvest. Others went without.",
      raisedById: id["dee"], aboutId: id["eli"], keeperIds: [id["ada"], id["cy"]], locality: "River Flats", ...pin["dee"],
      status: "RESOLVED", outcome: "HARM_FOUND", resolvedAt: new Date(),
      resolution: "Eli returns six packets now and works two mornings in the garden before planting. Dee posts the seed bank rule on the door. No further action.",
    },
  });

  await db.proposal.create({
    data: {
      title: "Where should the second well go?",
      body: "The north well serves two hundred people at the yellow tag. We can dig one more this season.",
      options: ["Behind the mill", "North field", "Do not dig a second well this year"],
      locality: "River Flats", authorId: id["cy"], closesAt: new Date(Date.now() + 5 * day),
    },
  });

  console.log("Seeded. Log in as ada / bo / cy / dee / eli with password:", PASSWORD);
}

main().finally(() => db.$disconnect());
