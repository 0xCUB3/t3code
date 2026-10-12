import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "@effect/vitest";

const deps = NodeURL.fileURLToPath(new URL("../deps/", import.meta.url));
const installer = NodeURL.fileURLToPath(
  new URL("../node_modules/react-native-enriched-markdown/postinstall.mjs", import.meta.url),
);

describe("RaTeX snapshot installation", () => {
  it("verifies both native artifacts against the pinned engine manifest", () => {
    const manifest = JSON.parse(
      NodeFS.readFileSync(NodePath.join(deps, "ratex-version.json"), "utf8"),
    );
    for (const [file, expected] of [
      [manifest.xcframework.url, manifest.xcframework.sha256],
      [manifest.android.artifact, manifest.android.sha256],
    ]) {
      expect(
        NodeCrypto.createHash("sha256")
          .update(NodeFS.readFileSync(NodePath.join(deps, file)))
          .digest("hex"),
      ).toBe(expected);
    }
    expect(manifest.source.url).toContain(manifest.revision);
    expect(manifest.source.prefix).toBe(`RaTeX-${manifest.revision}`);
  });

  it("finds the app pin when installation starts from either workspace root or app", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-ratex-installer-"));
    try {
      const app = NodePath.join(root, "apps/mobile");
      NodeFS.mkdirSync(app, { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(root, "package.json"),
        JSON.stringify({ workspaces: ["apps/*"] }),
      );
      NodeFS.writeFileSync(
        NodePath.join(app, "package.json"),
        JSON.stringify({
          dependencies: { "react-native-enriched-markdown": "1.2.0-t3.11" },
          "enriched-markdown": { enableMath: true, ratexManifest: "deps/ratex-version.json" },
        }),
      );
      for (const cwd of [root, app]) {
        const result = JSON.parse(
          NodeChildProcess.execFileSync(process.execPath, [installer, "--resolve-config"], {
            env: { ...process.env, INIT_CWD: cwd },
            encoding: "utf8",
          }),
        );
        expect(result.ratexManifest).toBe(NodePath.join(app, "deps/ratex-version.json"));
      }
      NodeFS.writeFileSync(
        NodePath.join(app, "package.json"),
        JSON.stringify({
          dependencies: { "react-native-enriched-markdown": "1.2.0-t3.11" },
          "enriched-markdown": { enableMath: false, ratexManifest: "deps/ratex-version.json" },
        }),
      );
      const disabled = JSON.parse(
        NodeChildProcess.execFileSync(process.execPath, [installer, "--resolve-config"], {
          env: { ...process.env, INIT_CWD: root },
          encoding: "utf8",
        }),
      );
      expect(disabled.config.enableMath).toBe(false);
      expect(disabled.ratexManifest).not.toBe(NodePath.join(app, "deps/ratex-version.json"));
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
});
