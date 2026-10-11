import { useComposerHandleContext } from "../../composerHandleContext";

const COMPOSER_FLOATING_LAYER_SELECTOR = [
  '[data-composer-drawer-layer="true"]',
  '[data-chat-composer-floating-layer="true"]',
].join(",");

export const composerFloatingLayerProps = {
  "data-chat-composer-floating-layer": "true",
} as const;

export function useComposerMenuProps() {
  const composerRef = useComposerHandleContext();

  return {
    ...composerFloatingLayerProps,
    finalFocus: composerRef
      ? () => {
          const activeElement = document.activeElement;
          if (activeElement !== document.body && !isInsideComposerFloatingLayer(activeElement)) {
            return false;
          }
          composerRef.current?.focusAtEnd();
          return false;
        }
      : undefined,
  };
}

const EMBEDDED_CHAT_SELECTOR = "[data-chat-embedded]";

// Composer menus portal to document.body, so they have no chat ancestor. Focus
// inside one belongs to the chat that last had focus outside a floating layer.
let lastFocusedChat: Element | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      if (!(event.target instanceof Element) || isInsideComposerFloatingLayer(event.target)) {
        return;
      }
      lastFocusedChat = event.target.closest(EMBEDDED_CHAT_SELECTOR);
    },
    true,
  );
}

/** The embedded side chat root that owns `target`, or null for the host chat. */
export function chatViewOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (isInsideComposerFloatingLayer(target)) return lastFocusedChat;
  return target.closest(EMBEDDED_CHAT_SELECTOR);
}

/**
 * Whether `target` belongs to the same chat view as `own`. A side chat renders
 * a second chat view inside the host's, so window-level composer shortcuts
 * check this to act on one composer only.
 */
export function isInSameChatView(target: EventTarget | null, own: Element | null): boolean {
  return chatViewOf(target) === (own?.closest(EMBEDDED_CHAT_SELECTOR) ?? null);
}

export function isInsideComposerFloatingLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(COMPOSER_FLOATING_LAYER_SELECTOR) !== null;
}

// Banners, the approval row, and the tasks badge dock above the surface. A
// pointer or focus landing on one of them acts on that control and must not
// expand a resting or collapsed composer.
export function isInsideCollapsedComposerControls(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-chat-composer-collapsed-controls="true"]') !== null
  );
}

export function isInsideRestingComposerControlScope(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.closest('[data-chat-composer-resting-controls="true"]') !== null ||
      target.closest('[data-chat-composer-resting-images="true"]') !== null ||
      target.closest("[data-composer-context-control]") !== null ||
      isInsideComposerFloatingLayer(target))
  );
}
