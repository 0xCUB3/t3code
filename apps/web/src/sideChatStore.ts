import type { ThreadId } from "@t3tools/contracts";
import type { RefObject } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import { resolveStorage } from "./lib/storage";

export type SideChatHistoryChoice = "with" | "without";

interface SideChatPreferenceState {
  /** What the split "+" starts, so the common choice is one click. */
  history: SideChatHistoryChoice;
  setHistory: (history: SideChatHistoryChoice) => void;
}

export const useSideChatPreferenceStore = create<SideChatPreferenceState>()(
  persist(
    (set) => ({
      history: "with",
      setHistory: (history) => set({ history }),
    }),
    {
      name: "t3code:side-chat-preference:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ history: state.history }),
    },
  ),
);

interface SideChatFocusState {
  /**
   * Parent thread key to the side chat its composer is talking to. While set,
   * the parent's composer slot shows the side chat's composer instead.
   */
  byParent: Record<string, ThreadId>;
  /** The parent's composer slot, where the focused side chat's composer renders. */
  slots: Record<string, HTMLElement>;
  focus: (parentKey: string, childThreadId: ThreadId) => void;
  /** Back to the parent; with a child id, only if that side chat still has focus. */
  release: (parentKey: string, childThreadId?: ThreadId) => void;
  setSlot: (parentKey: string, slot: HTMLElement | null) => void;
}

export const useSideChatFocusStore = create<SideChatFocusState>()((set) => ({
  byParent: {},
  slots: {},
  focus: (parentKey, childThreadId) =>
    set((state) =>
      state.byParent[parentKey] === childThreadId
        ? state
        : { byParent: { ...state.byParent, [parentKey]: childThreadId } },
    ),
  release: (parentKey, childThreadId) =>
    set((state) => {
      const current = state.byParent[parentKey];
      if (current === undefined || (childThreadId !== undefined && current !== childThreadId)) {
        return state;
      }
      const { [parentKey]: _released, ...byParent } = state.byParent;
      return { byParent };
    }),
  setSlot: (parentKey, slot) =>
    set((state) => {
      if ((state.slots[parentKey] ?? null) === slot) return state;
      const { [parentKey]: _previous, ...slots } = state.slots;
      return { slots: slot === null ? slots : { ...slots, [parentKey]: slot } };
    }),
}));

// The focused side chat's composer, so keys typed or pasted anywhere in the
// parent go where the user is talking. Not state: nothing renders from it.
const sideComposerHandles = new Map<string, RefObject<ChatComposerHandle | null>>();

export function setSideComposerHandle(
  parentKey: string,
  handle: RefObject<ChatComposerHandle | null> | null,
) {
  if (handle === null) sideComposerHandles.delete(parentKey);
  else sideComposerHandles.set(parentKey, handle);
}

export function sideComposerHandleFor(parentKey: string): ChatComposerHandle | null {
  return sideComposerHandles.get(parentKey)?.current ?? null;
}

const mountedSideChatViews = new Map<string, number>();

/**
 * Marks a side chat view as mounted. When the last one unmounts, focus goes
 * back to the parent, unless it mounts again first (a StrictMode remount).
 */
export function retainSideChatView(parentKey: string, childThreadId: ThreadId): () => void {
  const key = `${parentKey}\u0000${childThreadId}`;
  mountedSideChatViews.set(key, (mountedSideChatViews.get(key) ?? 0) + 1);
  return () => {
    const remaining = (mountedSideChatViews.get(key) ?? 1) - 1;
    if (remaining > 0) {
      mountedSideChatViews.set(key, remaining);
      return;
    }
    mountedSideChatViews.delete(key);
    queueMicrotask(() => {
      if (!mountedSideChatViews.has(key)) {
        useSideChatFocusStore.getState().release(parentKey, childThreadId);
      }
    });
  };
}
