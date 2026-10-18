import type { CDPSession, Page } from "playwright-core";
import { describe, expect, it, vi } from "vite-plus/test";

import { installPdfDocumentRenderer } from "./PdfDocumentRenderer.ts";

const source = "https://environment.test/api/assets/signed-token/files/Study%20guide.PDF";
const html =
  '<!doctype html><html><head></head><body><div id="viewer-container"></div></body></html>';

function fixture() {
  const response = {
    ok: () => true,
    headers: () => ({ "content-type": "text/html; charset=utf-8" }),
    text: async () => html,
    url: () => "https://environment.test/pdf-viewer.html",
    dispose: vi.fn(async () => {}),
  };
  const get = vi.fn(async () => response);
  const completed = Promise.withResolvers<{ method: string; params: Record<string, unknown> }>();
  let paused: (event: {
    requestId: string;
    frameId: string;
    request: { url: string; method: string };
  }) => void = () => {
    throw new Error("Renderer was not installed");
  };
  const send = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main" } } };
    if (method === "Fetch.fulfillRequest" || method === "Fetch.continueRequest") {
      completed.resolve({ method, params });
    }
    return {};
  });
  const cdp = {
    send,
    on: (_name: string, listener: typeof paused) => {
      paused = listener;
    },
  } as unknown as CDPSession;
  const page = { request: { get } } as unknown as Page;
  return {
    page,
    cdp,
    get,
    response,
    navigate: (url = source, frameId = "main", method = "GET") => {
      paused({ requestId: "request-1", frameId, request: { url, method } });
      return completed.promise;
    },
  };
}

describe("PDF document rendering", () => {
  it("renders the client document at the PDF URL without fetching or redirecting its bytes", async () => {
    const test = fixture();
    await installPdfDocumentRenderer(test.page, test.cdp);
    const { method, params } = await test.navigate();
    expect(method).toBe("Fetch.fulfillRequest");
    expect(params).toMatchObject({ responseCode: 200, requestId: "request-1" });
    expect(params.responseHeaders).toEqual([
      { name: "Content-Type", value: "text/html; charset=utf-8" },
      { name: "Cache-Control", value: "no-store" },
      { name: "X-Content-Type-Options", value: "nosniff" },
    ]);
    expect(Buffer.from(String(params.body), "base64").toString()).toBe(
      '<!doctype html><html data-pdf-document><head><base href="https://environment.test/pdf-viewer.html"></head><body><div id="viewer-container"></div></body></html>',
    );
    expect(test.get.mock.calls).toEqual([["https://environment.test/pdf-viewer.html"]]);
  });

  it.each([
    ["https://environment.test/api/assets/token/index.html", "main", "GET"],
    ["https://example.com/paper.pdf", "main", "GET"],
    [source, "subframe", "GET"],
    [source, "main", "POST"],
  ])("leaves other browser requests alone: %s, %s, %s", async (url, frameId, method) => {
    const test = fixture();
    await installPdfDocumentRenderer(test.page, test.cdp);
    expect(await test.navigate(url, frameId, method)).toEqual({
      method: "Fetch.continueRequest",
      params: { requestId: "request-1" },
    });
    expect(test.get).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "missing", "network failure"])(
    "resumes the original request when the client renderer is %s",
    async (failure) => {
      const test = fixture();
      if (failure === "unavailable") test.response.ok = () => false;
      if (failure === "missing") test.response.text = async () => "<html>App</html>";
      if (failure === "network failure") test.get.mockRejectedValueOnce(new Error("Offline"));
      await installPdfDocumentRenderer(test.page, test.cdp);
      expect(await test.navigate()).toEqual({
        method: "Fetch.continueRequest",
        params: { requestId: "request-1" },
      });
    },
  );
});
