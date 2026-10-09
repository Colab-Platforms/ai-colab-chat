import { withPage } from "@/utils/browserPool.js";
import { dlog } from "./document.logger.js";
import { isAllowedImageUrl, renderDocumentHtml } from "./document.html.js";
import { getRunningHeadCss } from "./document.theme.js";
import type { DocumentSpec, DocumentTheme } from "./document.types.js";

const RENDER_TIMEOUT_MS = Number(process.env.PDF_RENDER_TIMEOUT_MS ?? 45_000);

const escapeForTemplate = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildFooterTemplate = (theme: DocumentTheme, title: string): string => `
  <div style="${getRunningHeadCss(theme)} font-size:8pt; width:100%; padding:0 14mm; display:flex; justify-content:space-between;">
    <span>${escapeForTemplate(title)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;

/**
 * Renders a validated spec to a PDF buffer.
 *
 * The page is sandboxed on two axes because the content originates from a
 * model: JavaScript is off entirely, and every network request is blocked
 * unless it is an image on the allowlist. Without the request filter, a
 * model-supplied URL could reach cloud metadata endpoints or internal hosts
 * from inside our own network.
 */
export const renderSpecToPdf = async (
  spec: DocumentSpec,
  theme: DocumentTheme,
): Promise<Buffer> => {
  const html = renderDocumentHtml(spec, theme);
  dlog(
    "render",
    `theme=${theme} blocks=${spec.blocks.length} html=${html.length} chars — starting Chromium render`,
  );

  return withPage(async (page) => {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      const url = request.url();

      // The document itself is injected via setContent, not fetched.
      if (url.startsWith("data:")) {
        void request.continue();
        return;
      }

      if (request.resourceType() === "image" && isAllowedImageUrl(url)) {
        dlog("render", `allowed image request: ${url.slice(0, 120)}`);
        void request.continue();
        return;
      }

      // Worth surfacing: a blocked request means the spec referenced something
      // outside the allowlist, which is either a bad image URL or an attempt
      // to make the renderer fetch something it should not.
      dlog(
        "render",
        `BLOCKED ${request.resourceType()} request: ${url.slice(0, 120)}`,
      );
      void request.abort();
    });

    // "load" already waits for images, which are the only external resource
    // the allowlist permits — this Puppeteer version does not accept the
    // networkidle variants on setContent.
    await page.setContent(html, {
      waitUntil: "load",
      timeout: RENDER_TIMEOUT_MS,
    });

    const showPageNumbers = spec.showPageNumbers !== false;

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: "18mm",
        bottom: showPageNumbers ? "20mm" : "18mm",
        left: "16mm",
        right: "16mm",
      },
      displayHeaderFooter: showPageNumbers,
      headerTemplate: "<div></div>",
      footerTemplate: showPageNumbers
        ? buildFooterTemplate(theme, spec.title)
        : "<div></div>",
      timeout: RENDER_TIMEOUT_MS,
    });

    return Buffer.from(pdf);
  });
};
