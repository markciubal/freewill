# The onion address

Freewill can be reached through Tor at an onion address (a long name ending in `.onion`), as well as at its regular address. Through the onion address, the server never learns a member's network address, and nobody watching the network can see that a member is using Freewill, only that they are using Tor.

## How an onion address works

**The address is a key.** A v3 onion address is 56 characters that spell out the service's public key, a two-byte checksum and a version number (`src/lib/onion.ts` decodes and checks them). No registrar issues it, so no one can seize or reassign it the way a domain can be taken. Whoever holds the matching private key *is* the service. Tor checks this on every connection, so a certificate authority isn't needed.

**Finding the service without knowing where it is.** The Tor daemon running beside the app:

1. Picks a few Tor relays as **introduction points**, reaching each through a three-relay circuit, so none of them learns where the server is.
2. Publishes a signed, encrypted **descriptor** naming those introduction points to a set of relays (the hidden-service directories). Which relays hold it, and the key it is encrypted with, are derived from the address and change every day. A relay can therefore neither read descriptors for addresses it doesn't already know nor keep listing the same service.

**Connecting.** When someone opens the address in Tor Browser:

1. Their browser derives the day's lookup key from the address and fetches the descriptor.
2. It picks a random relay as a **rendezvous point** and builds a circuit to it.
3. Through an introduction point, it asks the service to meet it there.
4. The service builds its own circuit to the same rendezvous point, and the two circuits are joined.

The connection is six relays long: three chosen by the visitor and three by the service. Neither side learns the other's network address, and no relay sees both ends. Traffic is encrypted end to end between the browser and the service, and it never leaves the Tor network, so there is no exit relay that could read or alter it. That is why onion services use plain `http://`: the encryption TLS would add is already there.

## What it protects, and what it does not

| It hides | It does not hide |
|---|---|
| A member's network address, from this server and its logs | Who you are once you log in. The app still knows your account, and everything you publish is as public as ever. |
| From your internet provider or a network watcher: that you use Freewill at all | That you use Tor. A provider can see that; Tor "bridges" can hide even that. |
| The server's network address, but only if it has no regular address as well. This deployment has one, so the server itself is not hidden. | Mistakes on your own device: a compromised phone or computer sees everything. |
| | A global observer who can watch traffic entering and leaving the Tor network and match the timing. |

Tor is slower than the open internet, and pages take a moment longer.

## What the app does differently for an onion visit

A visit counts as coming through the onion service when it is addressed to `ONION_HOSTNAME` and comes from this machine itself: Tor hands each visit straight to the app from the loopback address (Next.js records it as `X-Forwarded-For: 127.0.0.1`). A web host or reverse proxy appends the real visitor's address to that header, so a request from the open internet cannot pass itself off as an onion visit, even by forging `X-Forwarded-For: 127.0.0.1`. **Keep the app's own port reachable only by Tor and your reverse proxy** (for example `next start -H 127.0.0.1`), not directly from the internet.

For an onion visit, the app:
- Leaves `upgrade-insecure-requests` out of the Content-Security-Policy. It would otherwise send every script to `https://…onion`, where nothing answers. The other protections (script nonces, no framing) stay the same.
- Sets the session cookie without `Secure`. The cookie belongs to the onion address only.
- Throttles logins and sign-ups in one shared onion bucket with wider limits. Every Tor visitor arrives from the same place, so per-address limits would lock them all out together. The per-username login limit still applies in full.
- Keeps redirects on the onion address.
- Turns off ID.me verification, because ID.me sends people back to the regular address and checks their legal identity anyway.

On the regular address, pages carry an `Onion-Location` header, and Tor Browser offers to switch to the onion address. `npm run smoke:onion` checks all of this without Tor.

## Setting it up

The onion service needs Tor running **on the same machine as the app**, or on the same private network. A hosted platform such as Heroku, where you can't run a background daemon beside the app, can't do this directly. A community that wants an onion address runs its own node on a small server or a machine at home, which is also the direction federation takes.

1. **Install Tor** from the Tor Project's own package repository, which has current releases and the proof-of-work defence: https://support.torproject.org/apt/ (Debian and Ubuntu). Use your system's package manager elsewhere.

2. **Point it at the app.** Add to `/etc/tor/torrc`:

   ```
   HiddenServiceDir /var/lib/tor/freewill/
   HiddenServicePort 80 127.0.0.1:3000
   # Make floods expensive: visitors solve a small puzzle when the service is
   # under load. Needs Tor 0.4.8 or later built with it (the Tor Project's
   # packages are). If Tor refuses to start with this line, remove it.
   HiddenServicePoWDefensesEnabled 1
   # Close a circuit that opens too many streams at once.
   HiddenServiceMaxStreams 64
   HiddenServiceMaxStreamsCloseCircuit 1
   ```

   Point `HiddenServicePort` straight at the app's port. That is the simplest setup and the one `smoke:onion` checks. A proxy in between works only if it runs on this same machine, so the address it adds is loopback.

3. **Restart Tor** (`sudo systemctl restart tor`). It creates the keys and writes the address to `/var/lib/tor/freewill/hostname`.

4. **Tell the app its address.** Set `ONION_HOSTNAME=<that address>` in the environment and restart the app. An address with a typo is ignored, because the checksum catches it, and the onion features stay off.

5. **Back up the key, offline.** `/var/lib/tor/freewill/hs_ed25519_secret_key` is the address:
   - Lose it and the address is gone for good; members must be told a new one.
   - Anyone who copies it can impersonate the service.

   Keep a copy the way you would keep a cash note: written down or on an offline drive, never in the repository or in a chat.

6. **Check it** by opening `http://<address>` in Tor Browser. On the regular site, Tor Browser should show a ".onion available" button in the address bar.

A memorable prefix is possible with a tool such as `mkp224o`, which searches for keys whose address starts with chosen letters. It only helps people spot typos, not fakes: attackers can make lookalikes the same way. Share the address through people members already trust, the way vouches travel.

## Honest limits

- The server still runs on a regular address too, so this protects members, not the server's location.
- The app can't tell one Tor visitor from another, so onion sign-ups share one limit (30 an hour). Someone flooding it could fill that allowance and block sign-ups through Tor for the hour; the regular address still works. Vouching, not the sign-up limit, is what keeps fake accounts from mattering.
- Voting needs JavaScript, because the browser seals the ballot. Tor Browser's "Safest" level turns JavaScript off; members need "Safer" or "Standard" to vote.
