import { ThemeEditor } from "@/components/theme-editor";
import { Notice, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { sanitizeTheme } from "@/lib/theme";

export default async function ThemePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <PageTitle
        title="Theme"
        subtitle="Colors, type, and shape, saved to your account. Change a control or edit the CSS; the page updates as you type. Save to keep it."
      />
      <Notice error={sp.error} ok={sp.ok} />
      <ThemeEditor initial={sanitizeTheme(me.theme)} />
    </div>
  );
}
