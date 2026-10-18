import { getDocument, GlobalWorkerOptions, PasswordException } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import "./style.css";

const container = document.querySelector<HTMLDivElement>("#viewer-container")!;
const status = document.querySelector<HTMLElement>("#status")!;
const page = document.querySelector<HTMLInputElement>("#page")!;
const previous = document.querySelector<HTMLButtonElement>("#previous")!;
const next = document.querySelector<HTMLButtonElement>("#next")!;
const zoomOut = document.querySelector<HTMLButtonElement>("#zoom-out")!;
const zoomIn = document.querySelector<HTMLButtonElement>("#zoom-in")!;
const download = document.querySelector<HTMLAnchorElement>("#download")!;

async function openPdf() {
  const source = document.documentElement.hasAttribute("data-pdf-document")
    ? location.href
    : new URLSearchParams(location.search).get("file");
  if (!source) throw new Error("No PDF was specified.");
  const url = new URL(source, location.href);
  // The client may be connected to another environment's signed asset URL.
  if (!/^https?:$/.test(url.protocol) || !url.pathname.startsWith("/api/assets/")) {
    throw new Error("This PDF URL is not an environment asset.");
  }
  download.href = url.href;
  document.title = decodeURIComponent(url.pathname.split("/").at(-1) ?? "PDF viewer");
  GlobalWorkerOptions.workerSrc = workerUrl;
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const viewer = new PDFViewer({ container, eventBus, linkService });
  linkService.setViewer(viewer);
  eventBus.on("pagesinit", () => {
    viewer.currentScaleValue = "page-width";
    if (location.hash) linkService.setHash(location.hash.slice(1));
    updateControls();
  });
  const updateControls = () => {
    page.value = String(viewer.currentPageNumber);
    previous.disabled = viewer.currentPageNumber <= 1;
    next.disabled = viewer.currentPageNumber >= viewer.pagesCount;
  };
  eventBus.on("pagechanging", updateControls);
  eventBus.on("pagerendered", ({ error }: { error?: unknown }) => {
    status.hidden = !error;
    if (error) status.textContent = "This page could not be rendered. Download the PDF to open it.";
  });
  const pdf = await getDocument({ url: url.href }).promise;
  viewer.setDocument(pdf);
  linkService.setDocument(pdf);
  page.max = String(pdf.numPages);
  page.disabled = false;
  zoomOut.disabled = false;
  zoomIn.disabled = false;
  document.querySelector("#count")!.textContent = `of ${pdf.numPages}`;
  updateControls();
  previous.addEventListener("click", () => {
    viewer.currentPageNumber -= 1;
  });
  next.addEventListener("click", () => {
    viewer.currentPageNumber += 1;
  });
  page.addEventListener("change", () => {
    const value = page.valueAsNumber;
    if (Number.isInteger(value) && value >= 1 && value <= pdf.numPages) {
      viewer.currentPageNumber = value;
    }
    updateControls();
  });
  zoomOut.addEventListener("click", () => viewer.decreaseScale());
  zoomIn.addEventListener("click", () => viewer.increaseScale());
  window.addEventListener("resize", () => {
    const scale = viewer.currentScaleValue;
    if (scale === "page-width" || scale === "page-fit" || scale === "auto") {
      viewer.currentScaleValue = scale;
    }
    viewer.update();
  });
  window.addEventListener("hashchange", () => {
    if (location.hash) linkService.setHash(location.hash.slice(1));
  });
}

void openPdf().catch((error: unknown) => {
  status.hidden = false;
  status.textContent =
    error instanceof PasswordException
      ? "This PDF requires a password. Download it to open it."
      : error instanceof Error
        ? error.message
        : "The PDF could not be loaded.";
});
