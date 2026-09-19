import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import { ChatRootShell } from "@/components/chat/chat-root-shell";
import { ToastContainer } from "react-toastify";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";
import Script from "next/script";

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
  title:
    "Colab Platforms AI - Multi-Model LLM Chat Platform | Claude, Gemini, Perplexity",
  description:
    "Advanced AI chatbot platform by ColabPlatforms. Chat with multiple LLM models simultaneously - Gemini, Claude, Perplexity, and more. Experience the future of AI conversation with our multichat interface.",
  keywords:
    "AI, ColabPlatforms, LLM, models, Multichat, chatbot, colab, gemini, claude, perplexity, artificial intelligence, machine learning, natural language processing, AI chat, multi-model AI, conversational AI, AI platform",
  authors: [{ name: "ColabPlatforms" }],
  creator: "ColabPlatforms",
  publisher: "ColabPlatforms",
  robots: "index, follow",
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
    title: "ColabPlatforms AI - Multi-Model LLM Chat Platform",
    description:
      "Advanced AI chatbot platform by ColabPlatforms. Chat with multiple LLM models simultaneously - Gemini, Claude, Perplexity, and more.",
    url: "https://chat.colabplatforms.ai",
    siteName: "ColabPlatforms AI",
    type: "website",
    images: [
      {
        url: "https://cdn.shopify.com/s/files/1/0636/5226/6115/files/CP_white_logo_new.png?v=1762234933",
        width: 1200,
        height: 630,
        alt: "ColabPlatforms AI - Multi-Model LLM Chat Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ColabPlatforms AI - Multi-Model LLM Chat Platform",
    description:
      "Advanced AI chatbot platform by ColabPlatforms. Chat with multiple LLM models simultaneously.",
    images: [
      "https://cdn.shopify.com/s/files/1/0636/5226/6115/files/CP_white_logo_new.png?v=1762234933",
    ],
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
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          theme="light"
          toastClassName="!text-sm"
          style={{ zIndex: 99999 }}
          className={"max-md:m-2"}
        />
        <ThemeProvider>
          <AuthProvider>
            <ChatRootShell>{children}</ChatRootShell>
            <PwaInstallPrompt />
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
