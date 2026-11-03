import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "@fontsource-variable/geist";
import "./global.css";
import { docsPath, docsSiteUrl, docsSocialImageUrlForRoute } from "@openpost/social-images";

const docsSocialImagePath = docsSocialImageUrlForRoute("/");

export const metadata: Metadata = {
  metadataBase: new URL(docsSiteUrl),
  title: { template: "%s | dopost Docs", default: "dopost Docs" },
  description:
    "Connect your accounts, publish your first post, and keep your content moving with dopost.",
  icons: { icon: docsPath("/assets/brand/icon.svg") },
  openGraph: {
    siteName: "dopost Docs",
    type: "website",
    images: [
      {
        url: docsSocialImagePath,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "dopost documentation social preview.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [
      {
        url: docsSocialImagePath,
        width: 1200,
        height: 630,
        alt: "dopost documentation social preview.",
      },
    ],
  },
  other: {
    "integration-screenshot-sources": docsPath("/assets/screenshots/integrations/SOURCES.txt"),
    "integration-screenshot-license": docsPath(
      "/assets/screenshots/integrations/POSTIZ-LICENSE.txt",
    ),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
