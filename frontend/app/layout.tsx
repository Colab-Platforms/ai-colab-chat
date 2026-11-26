import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import { PlanCapabilitiesProvider } from "@/context/plan-capabilities-context";
import { ChatRootShell } from "@/components/chat/chat-root-shell";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";
import Script from "next/script";
// Imported directly (not via the feature index) so it stays a plain string in this server component.
import { NODEBOX_ERROR_FILTER_SCRIPT } from "@/features/code-workspace/lib/nodeboxErrorFilter";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  keywords:
    "Colab Platforms AI, LLM, models, Multichat, chatbot, gemini, claude, perplexity, artificial intelligence, multi-model AI, conversational AI",
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Colab",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before hydration see features/code-workspace/lib/nodeboxErrorFilter.ts */}
        <Script
          id="code-workspace-nodebox-error-filter"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: NODEBOX_ERROR_FILTER_SCRIPT }}
        />
        <Script
          id="theme-class"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <Script
          id="ms-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "w8ygd5tzgk");`,
          }}
        />
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '927597176298283');
fbq('track', 'PageView');`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <noscript>
          <img
            height="1"
            width="1"
            alt=""
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=927597176298283&ev=PageView&noscript=1"
          />
        </noscript>
        <Toaster />
        <ThemeProvider>
          <AuthProvider>
            <PlanCapabilitiesProvider>
              {/* Pages that read the query string suspend here. Public pages do not,
                  so their HTML is still rendered. The fallback matches the old
                  pre-hydration blank shell for those query-string routes. */}
              <Suspense fallback={null}>
                <ChatRootShell>{children}</ChatRootShell>
              </Suspense>
              <PwaInstallPrompt />
            </PlanCapabilitiesProvider>
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
