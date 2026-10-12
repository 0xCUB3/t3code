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
const builder = NodeURL.fileURLToPath(new URL("./build-ratex.mjs", import.meta.url));

describe("RaTeX snapshot rebuild", () => {
  it.each([true, false])(
    "publishes both platforms only after a successful build, failAndroid=%s",
    (failAndroid) => {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-ratex-rebuild-"));
      try {
        const fixtureDeps = NodePath.join(root, "deps");
        const scripts = NodePath.join(root, "scripts");
        const bin = NodePath.join(root, "bin");
        for (const dir of [fixtureDeps, scripts, bin]) NodeFS.mkdirSync(dir);
        NodeFS.copyFileSync(builder, NodePath.join(scripts, "build-ratex.mjs"));
        const manifest = JSON.parse(
          NodeFS.readFileSync(NodePath.join(deps, "ratex-version.json"), "utf8"),
        );
        const sha256 = (value: string) =>
          NodeCrypto.createHash("sha256").update(value).digest("hex");
        manifest.source.sha256 = sha256("download");
        manifest.android.baseArtifact.sha256 = sha256("download");
        const originalManifest = JSON.stringify(manifest);
        NodeFS.writeFileSync(NodePath.join(fixtureDeps, "ratex-version.json"), originalManifest);
        NodeFS.writeFileSync(NodePath.join(fixtureDeps, "ratex-Cargo.lock"), "pinned lock");
        NodeFS.writeFileSync(NodePath.join(fixtureDeps, manifest.xcframework.url), "original ios");
        NodeFS.writeFileSync(
          NodePath.join(fixtureDeps, manifest.android.artifact),
          "original android",
        );
        NodeFS.writeFileSync(
          NodePath.join(root, "source.properties"),
          `Pkg.Revision = ${manifest.build.androidNdkVersion}`,
        );
        // Exercise the real CLI without downloading or compiling the native engine.
        const command = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
switch (path.basename(process.argv[1])) {
  case 'curl': fs.writeFileSync(args[args.indexOf('-o') + 1], 'download'); break;
  case 'tar': fs.mkdirSync(path.join(args[args.indexOf('-C') + 1], ${JSON.stringify(manifest.source.prefix)})); break;
  case 'bash':
    if (args[0].includes('android') && process.env.RATEX_TEST_FAIL_ANDROID === 'true') {
      console.error('Android fixture build failed'); process.exit(1);
    }
    break;
  case 'python3': if (args[0] === '-c') fs.writeFileSync(args.at(-1), 'rebuilt artifact'); break;
}
`;
        for (const name of ["curl", "tar", "rustup", "cargo", "bash", "python3"]) {
          NodeFS.writeFileSync(NodePath.join(bin, name), command, { mode: 0o755 });
        }
        // The fixture replaces the native build commands, including the macOS build.
        const preload = NodePath.join(root, "host.cjs");
        NodeFS.writeFileSync(
          preload,
          "require('node:os').platform = () => 'darwin'; require('node:module').syncBuiltinESMExports();",
        );
        const result = NodeChildProcess.spawnSync(
          process.execPath,
          ["--require", preload, NodePath.join(scripts, "build-ratex.mjs"), "all"],
          {
            env: {
              ...process.env,
              PATH: bin,
              ANDROID_NDK_HOME: root,
              RATEX_TEST_FAIL_ANDROID: String(failAndroid),
            },
            encoding: "utf8",
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(failAndroid ? 1 : 0);
        const ios = NodeFS.readFileSync(
          NodePath.join(fixtureDeps, manifest.xcframework.url),
          "utf8",
        );
        const android = NodeFS.readFileSync(
          NodePath.join(fixtureDeps, manifest.android.artifact),
          "utf8",
        );
        const publishedManifest = NodeFS.readFileSync(
          NodePath.join(fixtureDeps, "ratex-version.json"),
          "utf8",
        );
        if (failAndroid) {
          expect(result.stderr).toContain("Android fixture build failed");
          expect(ios).toBe("original ios");
          expect(android).toBe("original android");
          expect(publishedManifest).toBe(originalManifest);
        } else {
          expect(ios).toBe("rebuilt artifact");
          expect(android).toBe("rebuilt artifact");
          const published = JSON.parse(publishedManifest);
          expect(published.xcframework.sha256).toBe(sha256(ios));
          expect(published.android.sha256).toBe(sha256(android));
        }
      } finally {
        NodeFS.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

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
