import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeTheme } from "@/lib/theme";
import { themeToCss } from "@/lib/theme.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freewill",
  description: "Community tools for mutual aid, fair exchange, shared resources, and dispute resolution.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Each person's look is their own. The theme is re-serialized from validated
  // tokens, so this <style> can only ever contain colors, fonts, and lengths.
  const user = await getCurrentUser();
  const theme = sanitizeTheme(user?.theme);
  return (
    <html
      lang="en"
      data-theme={theme.scheme === "system" ? undefined : theme.scheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <style id="user-theme" dangerouslySetInnerHTML={{ __html: themeToCss(theme, false) }} />
        {children}
      </body>
    </html>
  );
}
