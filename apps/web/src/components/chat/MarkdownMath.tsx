import { lazy, memo, Suspense, useEffect, useRef } from "react";
import { observeResize } from "~/lib/observeResize";

import { RenderErrorBoundary } from "../RenderErrorBoundary";

const MathTypeset = lazy(() => import("./MathTypeset"));

/**
 * One formula from `remarkChatMath`. Shows its TeX until KaTeX loads, and
 * keeps showing it when KaTeX cannot parse it, such as mid-stream. Copying
 * any part of a formula copies its whole TeX source.
 */
export const MarkdownMath = memo(function MarkdownMath(props: {
  tex: string;
  display: boolean;
  focusable?: boolean;
}) {
  const tex = props.tex.trim();
  const source = props.display ? `\\[\n${tex}\n\\]` : `\\(${tex}\\)`;
  const fallback = <span className="chat-markdown-math-source">{source}</span>;
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scroller = viewport.current;
    const body = content.current;
    const bar = track.current;
    const handle = thumb.current;
    if (!scroller || !body || !bar || !handle) return;
    const update = () => {
      const width = scroller.clientWidth;
      const total = scroller.scrollWidth;
      bar.hidden = total <= width + 1;
      if (!bar.hidden) {
        handle.style.width = `${(width / total) * 100}%`;
        handle.style.left = `${(scroller.scrollLeft / total) * 100}%`;
      }
    };
    // Observe the content too: loading KaTeX can change its width without
    // resizing the viewport. Scroll updates never rerender the formula.
    const stopObserving = observeResize([scroller, body], update);
    scroller.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      stopObserving();
      scroller.removeEventListener("scroll", update);
    };
  }, []);

  const scrollToPointer = (clientX: number) => {
    const scroller = viewport.current;
    const bounds = track.current?.getBoundingClientRect();
    if (!scroller || !bounds || !bounds.width) return;
    scroller.scrollLeft =
      ((clientX - bounds.left) / bounds.width) * scroller.scrollWidth - scroller.clientWidth / 2;
  };
  return (
    <span
      className={props.display ? "chat-markdown-math-display" : "chat-markdown-math-inline"}
      data-markdown-math={props.display ? "display" : "inline"}
      data-markdown-copy={props.display ? `${source}\n\n` : source}
      role="group"
      aria-label={props.display ? "Display equation" : "Inline equation"}
    >
      <span
        ref={viewport}
        className="chat-markdown-math-viewport"
        tabIndex={props.focusable === false ? undefined : 0}
        aria-label={props.display ? "Scroll display equation" : "Scroll inline equation"}
      >
        <span ref={content} className="chat-markdown-math-content">
          <RenderErrorBoundary resetKeys={[tex]} fallback={fallback}>
            <Suspense fallback={fallback}>
              <MathTypeset tex={tex} display={props.display} fallback={fallback} />
            </Suspense>
          </RenderErrorBoundary>
        </span>
      </span>
      <span
        ref={track}
        className="chat-markdown-math-scrollbar"
        aria-hidden="true"
        hidden
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          scrollToPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            scrollToPointer(event.clientX);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <span ref={thumb} className="chat-markdown-math-scroll-thumb" />
      </span>
    </span>
  );
});
