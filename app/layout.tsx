import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./final.css?ui=header-actions-v2";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;
  const description =
    "Quiet writing, lasting growth. A local-first private writing studio.";

  return {
    metadataBase,
    title: "Personal Writer OS",
    description,
    applicationName: "Personal Writer OS",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Writer OS",
    },
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
    openGraph: {
      title: "Personal Writer OS",
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1792, height: 933 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Personal Writer OS",
      description,
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#59cbd5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
