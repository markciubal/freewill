import { Card, PageTitle } from "@/components/ui";
import { IdentityKeys } from "@/components/identity-keys";
import { requireUser } from "@/lib/auth";

export default async function KeysPage() {
  const me = await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title="Identity key"
        info="identity-key"
        subtitle="An optional key that lives only on your device and lets you sign your vouches, so no one can forge or claim your endorsement, and other communities can verify your web of trust without trusting this server. The server never sees the private half."
      />
      <Card>
        <IdentityKeys registeredPublicKey={me.publicKey ?? null} />
      </Card>
      <Card className="space-y-2 text-sm text-muted">
        <p className="font-medium text-foreground">What it is for</p>
        <p>A vouch is your word that you know someone. Signed with your key, that word is provably yours; a gatekeeper cannot appropriate it or fake it in your name. And because the signature verifies against your public key alone, a distant node can confirm your vouches are real without asking this server to vouch for itself.</p>
        <p>The private key is a secret only your device holds, like a cash-note secret. Write down the backup. If you lose it, your account keeps working, but you will need the backup (or a new key) to sign again.</p>
      </Card>
    </div>
  );
}
