// The same advice wherever a password is chosen. There is no reset here: no
// email on file, and no person with the power to let you back in. So the
// advice is concrete, and it is repeated rather than assumed.

export function PasswordKeeping({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
      <div className="font-medium">Your password cannot be reset. Ever.</div>
      <p className="mt-1 text-xs text-muted">
        There is no email on file and no one who can let you back in. You can change it while you know it; if you lose it, the account and its vouches are gone. So keep it in a way that survives a bad week:
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
        <li><span className="text-foreground">A password manager</span> (Bitwarden, KeePass, the one built into your phone). Best option.</li>
        <li><span className="text-foreground">Written down</span>, somewhere only you would look, in a form only you would understand: split across two places, or inside a note that looks like something else.</li>
        <li><span className="text-foreground">In a file on a drive you keep</span>: a USB stick in a drawer, an old phone in a box. Name the file something dull.</li>
        {!compact && <li>Do not keep it only in your head, and do not keep it only on this device.</li>}
      </ul>
    </div>
  );
}
