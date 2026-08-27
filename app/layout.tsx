import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import { AssistantRoot } from "@/components/assistant/assistant-root";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "School of Disciples Portal",
  description:
    "A quiet place for students and leaders to walk the School of Disciples course together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${figtree.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col font-sans"
        suppressHydrationWarning
      >
        <ToastProvider>
          {children}
          <AssistantRoot />
        </ToastProvider>
      </body>
    </html>
  );
}
