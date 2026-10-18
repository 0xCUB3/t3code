import { constVoid } from "effect/Function";
import type { CDPSession, Page } from "playwright-core";

const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export const isPdfAssetUrl = (url: string) => {
  const { pathname } = new URL(url);
  return pathname.startsWith("/api/assets/") && /\.pdf$/i.test(pathname);
};

export async function installPdfDocumentRenderer(page: Page, cdp: CDPSession) {
  const { frameTree } = await cdp.send("Page.getFrameTree");
  // Fulfill the navigation with the client's renderer so Chromium keeps the PDF's
  // URL and history, and screenshots and remote viewers see the same document.
  cdp.on("Fetch.requestPaused", (event) => {
    const { requestId, request, frameId } = event;
    const proceed = () => cdp.send("Fetch.continueRequest", { requestId });
    void (async () => {
      const url = new URL(request.url);
      if (
        request.method !== "GET" ||
        frameId !== frameTree.frame.id ||
        !isPdfAssetUrl(request.url)
      ) {
        await proceed();
        return;
      }
      const response = await page.request.get(new URL("/pdf-viewer.html", url).href);
      try {
        if (!response.ok() || !response.headers()["content-type"]?.startsWith("text/html")) {
          await proceed();
          return;
        }
        const html = await response.text();
        if (!html.includes('id="viewer-container"')) {
          await proceed();
          return;
        }
        await cdp.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "text/html; charset=utf-8" },
            { name: "Cache-Control", value: "no-store" },
            { name: "X-Content-Type-Options", value: "nosniff" },
          ],
          body: Buffer.from(
            html
              .replace("<html", "<html data-pdf-document")
              .replace("<head>", `<head><base href="${escapeAttribute(response.url())}">`),
          ).toString("base64"),
        });
      } finally {
        await response.dispose();
      }
    })().catch(() => proceed().catch(constVoid));
  });
  // Playwright routing disables the HTTP cache for the entire tab. Fetch only
  // pauses asset documents, leaving scripts, images, and PDF byte fetches alone.
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/assets/*", resourceType: "Document", requestStage: "Request" }],
  });
}
