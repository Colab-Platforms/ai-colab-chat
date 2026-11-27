import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Prefixes are matched from the start of the path. Keep them specific:
 * `/c` would also block `/cookie-policy`, so chat threads use `/c/`.
 * A named bot group does not inherit `*`, so each group repeats the list.
 */
const DISALLOW = [
  "/login",
  "/register",
  "/forgot-password",
  "/home",
  "/profile",
  "/new",
  "/admin",
  "/api",
  "/auth",
  "/org",
  "/join",
  "/share",
  "/code-preview",
  "/github",
  "/vercel",
  "/c/",
  "/voice",
  "/assets",
  "/projects",
  "/documents",
  "/image-studio",
  "/video-studio",
  "/starred",
];

const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

export default function robots(): MetadataRoute.Robots {
  const rule = { allow: "/", disallow: DISALLOW };
  return {
    rules: [
      { userAgent: "*", ...rule },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...rule })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
