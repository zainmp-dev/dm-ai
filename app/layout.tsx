import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { GlobalApiActivity } from "@/components/global-api-activity";
import { StructuredData } from "@/components/structured-data";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { GlobalThemeToggle } from "@/components/global-theme-toggle";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "FlowPilot",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered multi-tenant platform for strategy, content creation, approvals, scheduling, and social publishing.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL != null ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FlowPilot — AI marketing & content workspace",
    template: "%s · FlowPilot",
  },
  description:
    "Plan and ship social content with AI: brand research, post ideas, drafts, approvals, scheduling, and publishing to LinkedIn, Instagram, and Facebook—one workspace for your marketing team.",
  applicationName: "FlowPilot",
  keywords: [
    "AI marketing",
    "content calendar",
    "social media scheduling",
    "LinkedIn scheduling",
    "Meta publishing",
  ],
  authors: [{ name: "FlowPilot" }],
  openGraph: {
    type: "website",
    siteName: "FlowPilot",
    title: "FlowPilot — AI marketing & content workspace",
    description:
      "Plan and ship social content with AI: research, drafts, approvals, scheduling, and publishing—LinkedIn, Instagram, Facebook.",
    locale: "en_US",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowPilot — AI marketing & content workspace",
    description:
      "Plan and ship social content with AI: research, drafts, approvals, scheduling, and publishing.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground"
      >
        <ThemeProvider>
          <StructuredData data={structuredData} />
          <ToastProvider>
            <GlobalApiActivity />
            <GlobalThemeToggle />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
