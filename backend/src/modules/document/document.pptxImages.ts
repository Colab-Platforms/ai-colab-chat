import { searchPexelsPhoto } from "@/utils/pexels.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { dlog, dlogBlock } from "./document.logger.js";
import { getPptxTemplateTokens } from "./document.pptxTemplates.js";
import { MAX_BLOCKS_PER_SLIDE, type PresentationSpec } from "./document.types.js";

const MAX_QUERY_CHARS = 80;

/**
 * Turns a title/subtitle into a Pexels search query.
 *
 * Slide titles are often full statements ("Revenue grew 40% in Q3"), which
 * makes a poor photo query verbatim - Pexels has no concept of the numbers
 * in it. Stripping trailing punctuation and truncating keeps it a short
 * keyword phrase without trying to be clever about extraction.
 */
const buildQuery = (...parts: Array<string | undefined>): string =>
  parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .replace(/[.!?:;,]+$/g, "")
    .slice(0, MAX_QUERY_CHARS)
    .trim();

/**
 * Fetches a topic-relevant stock photo for the cover slide, and for a
 * handful of content slides when the template makes room for one, then
 * re-hosts each on Cloudinary - the only host every renderer allows through
 * `isAllowedImageUrl`.
 *
 * Called once, right after spec generation and before the spec is persisted
 * (see document.generation.service.ts) - a later template switch re-renders
 * from the already-enriched spec rather than re-querying Pexels.
 *
 * Never throws: a Pexels miss, a rate limit, or a Cloudinary upload failure
 * for any single slide just leaves that slide without a photo. The renderer
 * (document.pptx.ts) already falls back to a photo-less layout.
 */
export const enrichPresentationImages = async (
  spec: PresentationSpec,
  theme: string,
): Promise<PresentationSpec> => {
  const template = getPptxTemplateTokens(theme);
  const maxPhotos = Number(process.env.PPTX_MAX_STOCK_PHOTOS ?? 3);
  if (maxPhotos <= 0) return spec;

  const jobs: Array<{ query: string; apply: (url: string) => void }> = [];

  if (template.titleLayout !== "solid") {
    jobs.push({
      query: buildQuery(spec.title, spec.subtitle),
      apply: (url) => {
        spec.coverPhotoUrl = url;
      },
    });
  }

  if (template.contentImageLayout && jobs.length < maxPhotos) {
    const candidates = spec.slides.filter(
      (slide) =>
        (slide.layout ?? "content") === "content" &&
        slide.blocks.length < MAX_BLOCKS_PER_SLIDE,
    );
    for (const slide of candidates) {
      if (jobs.length >= maxPhotos) break;
      jobs.push({
        query: buildQuery(slide.title),
        apply: (url) => {
          slide.photoUrl = url;
        },
      });
    }
  }

  if (jobs.length === 0) return spec;

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const photo = await searchPexelsPhoto(job.query);
      if (!photo) return false;

      const uploaded = await uploadToCloudinary(photo.url, {
        folder: "generated-documents/stock-photos",
        resourceType: "image",
      });
      job.apply(uploaded.url);
      return true;
    }),
  );

  const found = results.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
  dlogBlock("pptx:images", `${found}/${jobs.length} stock photo(s) attached`, {
    theme,
    queries: jobs.map((job) => job.query),
  });
  results.forEach((result) => {
    if (result.status === "rejected") {
      dlog("pptx:images", `photo job failed: ${result.reason?.message ?? result.reason}`);
    }
  });

  return spec;
};
