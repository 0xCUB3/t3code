import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ThreadId } from "@t3tools/contracts";

import { retainSideChatView, useSideChatFocusStore } from "./sideChatStore";

const parentKey = "env:parent";
const first = "first" as ThreadId;
const second = "second" as ThreadId;

const focused = () => useSideChatFocusStore.getState().byParent[parentKey];
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  useSideChatFocusStore.setState({ byParent: {}, slots: {} });
});

describe("side chat focus", () => {
  it("releases only the side chat that still has the composer", () => {
    const { focus, release } = useSideChatFocusStore.getState();
    focus(parentKey, first);
    focus(parentKey, second);

    release(parentKey, first);
    expect(focused()).toBe(second);

    release(parentKey);
    expect(focused()).toBeUndefined();
  });

  it("keeps focus through an unmount that mounts again right away", async () => {
    useSideChatFocusStore.getState().focus(parentKey, first);

    const unmount = retainSideChatView(parentKey, first);
    unmount();
    const remounted = retainSideChatView(parentKey, first);
    await settle();
    expect(focused()).toBe(first);

    remounted();
    await settle();
    expect(focused()).toBeUndefined();
  });

  it("does not take focus from another side chat when one leaves", async () => {
    const leaving = retainSideChatView(parentKey, first);
    useSideChatFocusStore.getState().focus(parentKey, second);

    leaving();
    await settle();
    expect(focused()).toBe(second);
  });
});
