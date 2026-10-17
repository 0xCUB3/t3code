import type { WorkflowOpening } from "@t3tools/client-runtime/state/subagentRuntime";
import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { MarkdownFindContext } from "./markdownFindContext";
import { useThreadFindHighlights } from "./threadFindHighlights";
import { WorkflowOpeningBlock } from "./WorkflowOpeningBlock";

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const providers = Atom.make([]).pipe(Atom.keepAlive);
  return { ...actual, providersIgnoringCheckedAtAtom: (() => providers) as never };
});

const opening: WorkflowOpening = {
  messageId: "message-script",
  script: "export const meta = { name: 'repo-check' }\nagent('Run SCRIPTONLY with Bash')",
  name: "repo-check",
  description: "Two agents each inspect one file",
  driver: null,
  providerInstanceId: null,
  group: null,
};

function Find(props: { readonly container: HTMLElement | null; readonly query: string }) {
  useThreadFindHighlights({
    container: props.container,
    query: props.query,
    activeRowId: "opening",
    activeOccurrence: 0,
    onActiveRange: () => undefined,
  });
  return null;
}

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("CSS", { highlights: new Map() });
  vi.stubGlobal(
    "Highlight",
    class extends Set<Range> {
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(query: string) {
  await act(async () =>
    root.render(
      <AppAtomRegistryProvider>
        <MarkdownFindContext value={query.length > 0}>
          <div data-timeline-row-id="opening">
            <WorkflowOpeningBlock
              opening={opening}
              environmentId={EnvironmentId.make("environment-local")}
              onOpenThread={() => undefined}
            />
          </div>
        </MarkdownFindContext>
        <Find container={host} query={query} />
      </AppAtomRegistryProvider>,
    ),
  );
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

const scriptToggle = () => host.querySelector('[aria-label$="workflow script"]');

it("finds the workflow's name and its collapsed script, opening the script on a match", async () => {
  await render("repo-check");
  expect(CSS.highlights.get("t3-thread-find-active")?.size).toBe(1);
  expect(scriptToggle()?.getAttribute("aria-expanded")).toBe("false");

  await render("SCRIPTONLY");
  expect(CSS.highlights.get("t3-thread-find-active")?.size).toBe(1);
  expect(scriptToggle()?.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector("pre")?.hidden).toBe(false);
});

it("keeps a closed script out of the page until find starts", async () => {
  await render("");
  expect(host.querySelector("pre")).toBeNull();
});
