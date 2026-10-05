import { dlog } from "@/modules/document/document.logger.js";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const FETCH_TIMEOUT_MS = 8000;

export interface PexelsPhoto {
  url: string;
  photographer: string;
}

interface PexelsSearchResponse {
  photos?: Array<{
    src?: { large2x?: string; large?: string; landscape?: string };
    photographer?: string;
  }>;
}

/**
 * Looks up one landscape stock photo for a query.
 *
 * Never throws: a missing key, a rate limit, a timeout, or an empty result
 * set all resolve to `null` so callers can treat a photo as a nice-to-have
 * rather than a step that can fail document generation.
 */
export const searchPexelsPhoto = async (
  query: string,
): Promise<PexelsPhoto | null> => {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    dlog("pexels", "skipped — PEXELS_API_KEY is not set");
    return null;
  }

  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&per_page=3&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      dlog("pexels", `HTTP ${response.status} for query "${trimmed}"`);
      return null;
    }

    const data = (await response.json()) as PexelsSearchResponse;
    const photo = data.photos?.[0];
    const photoUrl =
      photo?.src?.large2x ?? photo?.src?.large ?? photo?.src?.landscape;
    if (!photoUrl) {
      dlog("pexels", `no results for query "${trimmed}"`);
      return null;
    }

    return { url: photoUrl, photographer: photo?.photographer ?? "Pexels" };
  } catch (error: any) {
    dlog("pexels", `lookup failed for "${trimmed}": ${error?.message ?? error}`);
    return null;
  }
};
