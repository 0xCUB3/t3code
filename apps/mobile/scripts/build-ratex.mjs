// Rebuild the committed native engine artifacts from the pinned upstream source
// and Cargo lock. Normal installs consume these artifacts without needing Rust.
// Usage: node scripts/build-ratex.mjs ios|android|all
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeURL from "node:url";
import * as NodeChildProcess from "node:child_process";

const deps = NodeURL.fileURLToPath(new URL("../deps/", import.meta.url));
const manifestPath = NodePath.join(deps, "ratex-version.json");
const manifest = JSON.parse(NodeFS.readFileSync(manifestPath, "utf8"));
const platform = process.argv[2];
if (!["ios", "android", "all"].includes(platform)) {
  throw new Error("Choose ios, android, or all.");
}
// oxlint-disable-next-line t3code/no-global-process-runtime -- Native artifact builds run on the host OS.
if (platform !== "android" && NodeOS.platform() !== "darwin") {
  throw new Error("The iOS artifact requires macOS and Xcode.");
}
const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-ratex-build-"));
const artifacts = [];
const digest = (file) =>
  NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(file)).digest("hex");
function run(command, args, cwd = temporary, env = {}) {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
function download(asset, file) {
  run("curl", ["-fLsS", "--retry", "3", asset.url, "-o", file]);
  if (digest(file) !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.url}`);
}

try {
  const sourceArchive = NodePath.join(temporary, "source.tar.gz");
  download(manifest.source, sourceArchive);
  run("tar", ["-xzf", sourceArchive, "-C", temporary]);
  const source = NodePath.join(temporary, manifest.source.prefix);
  NodeFS.copyFileSync(NodePath.join(deps, "ratex-Cargo.lock"), NodePath.join(source, "Cargo.lock"));
  const originalLock = digest(NodePath.join(source, "Cargo.lock"));

  if (platform !== "android") {
    const toolchain = manifest.build.iosRustToolchain;
    run("rustup", [
      "toolchain",
      "install",
      toolchain,
      "--profile",
      "minimal",
      "--component",
      "rust-src",
    ]);
    run("rustup", [
      "target",
      "add",
      "--toolchain",
      toolchain,
      "aarch64-apple-ios",
      "aarch64-apple-ios-sim",
      "x86_64-apple-ios",
    ]);
    run("bash", ["scripts/build-apple-xcframework.sh", "--ios"], source, {
      RATEX_IOS_RUST_TOOLCHAIN: toolchain,
    });
    const output = NodePath.join(temporary, manifest.xcframework.url);
    run("python3", [
      "-c",
      `
from pathlib import Path
import sys, zipfile
root, output = Path(sys.argv[1]), Path(sys.argv[2])
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted((root / 'RaTeX.xcframework').rglob('*')):
        if file.is_file():
            info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (1980,1,1,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, file.read_bytes())
`,
      NodePath.join(source, "platforms/ios"),
      output,
    ]);
    manifest.xcframework.sha256 = digest(output);
    artifacts.push({ source: output, destination: NodePath.join(deps, manifest.xcframework.url) });
  }

  if (platform !== "ios") {
    const toolchain = manifest.build.androidRustToolchain;
    run("rustup", ["toolchain", "install", toolchain, "--profile", "minimal"]);
    run("rustup", [
      "target",
      "add",
      "--toolchain",
      toolchain,
      "aarch64-linux-android",
      "armv7-linux-androideabi",
      "x86_64-linux-android",
    ]);
    run("cargo", [
      `+${toolchain}`,
      "install",
      "cargo-ndk",
      "--version",
      manifest.build.cargoNdkVersion,
      "--locked",
    ]);
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    const ndk =
      process.env.ANDROID_NDK_HOME ??
      (sdk && NodePath.join(sdk, "ndk", manifest.build.androidNdkVersion));
    if (!ndk || !NodeFS.existsSync(NodePath.join(ndk, "source.properties"))) {
      throw new Error("Set ANDROID_NDK_HOME, or install the pinned NDK under ANDROID_HOME.");
    }
    const ndkVersion = NodeFS.readFileSync(NodePath.join(ndk, "source.properties"), "utf8").match(
      /^Pkg\.Revision\s*=\s*(\S+)/m,
    )?.[1];
    if (ndkVersion !== manifest.build.androidNdkVersion) {
      throw new Error(`Expected NDK ${manifest.build.androidNdkVersion}, found ${ndkVersion}.`);
    }
    run("bash", ["platforms/android/build-android.sh"], source, {
      RUSTUP_TOOLCHAIN: toolchain,
      ANDROID_NDK_HOME: ndk,
    });
    const base = NodePath.join(temporary, "release.aar");
    download(manifest.android.baseArtifact, base);
    const output = NodePath.join(temporary, manifest.android.artifact);
    // Android's Kotlin wrapper and JNI API are unchanged since v0.1.14. Keep its
    // classes/fonts and replace every Rust library, so no released engine remains.
    run("python3", [
      "-c",
      `
from pathlib import Path
import sys, zipfile
root, base, output = map(Path, sys.argv[1:])
replacements = {f'jni/{abi}/libratex_ffi.so': (root / f'platforms/android/src/main/jniLibs/{abi}/libratex_ffi.so').read_bytes()
                for abi in ['arm64-v8a', 'armeabi-v7a', 'x86_64']}
with zipfile.ZipFile(base) as source, zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    assert replacements.keys() <= set(source.namelist())
    for name in sorted(source.namelist()):
        info = zipfile.ZipInfo(name, (1980,1,1,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, replacements.get(name, source.read(name)))
`,
      source,
      base,
      output,
    ]);
    run("python3", ["scripts/verify_android_elf.py", output], source);
    manifest.android.sha256 = digest(output);
    artifacts.push({ source: output, destination: NodePath.join(deps, manifest.android.artifact) });
  }

  if (digest(NodePath.join(source, "Cargo.lock")) !== originalLock) {
    throw new Error("The build changed the pinned Cargo lock.");
  }
  for (const artifact of artifacts) {
    NodeFS.copyFileSync(artifact.source, artifact.destination);
  }
  NodeFS.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} finally {
  NodeFS.rmSync(temporary, { recursive: true, force: true });
}
