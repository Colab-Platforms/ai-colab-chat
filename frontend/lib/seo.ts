import type { Metadata } from "next";

export const SITE_URL = "https://www.colabplatforms.ai";
export const SITE_NAME = "Colab Platforms AI";

export const HOME_TITLE =
  "Colab Platforms AI - Multi-Model LLM Chat Platform | Claude, Gemini, Perplexity";

export const HOME_DESCRIPTION =
  "Colab Platforms AI lets you chat with multiple LLM models at once, including Gemini, Claude and Perplexity, in one workspace.";

export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Colab Platforms AI - Multi-Model LLM Chat Platform",
} as const;

/** Public URLs that belong in the sitemap. Paths are on the www host. */
export const PUBLIC_PATHS = [
  "/",
  "/try",
  "/business",
  "/support",
  "/privacy-policy",
  "/terms",
  "/cookie-policy",
] as const;

export const noindexMetadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Runs only on the homepage, before the marketing markup is parsed, when a
 * signed-in user is already stored. Crawlers have no token, so they receive
 * the page. Mirrors the admin check in context/auth-context.tsx.
 */
export const HOME_SESSION_REDIRECT_SCRIPT = `(function(){try{if(location.pathname!=="/")return;var token=localStorage.getItem("token");var raw=localStorage.getItem("user");if(!token||!raw)return;var user=JSON.parse(raw);var roles=(user&&user.userRoles)||[];var admin=false;for(var i=0;i<roles.length;i++){var name=(roles[i]&&roles[i].role&&roles[i].role.name)||"";var n=String(name).replace(/_/g,"").toUpperCase();if(n==="ADMIN"||n==="SUPERADMIN")admin=true;}location.replace(admin?"/admin":"/home"+(location.search||""));}catch(e){}})();`;

export function publicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
