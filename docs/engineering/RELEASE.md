# Release

## Version locations

Bump the version in all three places and regenerate the lockfile:

- `package.json`
- `src-tauri/Cargo.toml` (and the `barklarm` entry in `src-tauri/Cargo.lock`)
- `src-tauri/tauri.conf.json`

The release workflow triggers on tags matching `v*`.

## Flow

1. Merge the release-ready change set to `main` with `quality`, `e2e`, `rust` and `audit` green.
2. Bump versions, run `bun run check`, `bun run test:e2e` and the Rust checks.
3. Commit (`chore(release): vX.Y.Z`), tag `vX.Y.Z`, push the tag.
4. `.github/workflows/release.yml` calls the reusable CI workflow. Each build job runs `bun run sidecar:fetch` to stage
   the pinned, checksum-verified llama.cpp runtime before `bun run build`. The fetch script fails closed on a checksum
   mismatch.
5. `.github/workflows/release.yml` builds:
   - macOS arm64 (`macos-15`)
   - macOS x64 (`macos-15-intel`)
   - Linux x64 (`ubuntu-24.04`)
   - Linux arm64 (`ubuntu-24.04-arm`)
   - Windows x64 (`windows-latest`)
6. The release job downloads bundles and publishes the GitHub release with generated notes. Bundles include only the
   runtime binary, shared libraries and upstream license files; model weights are never bundled and are downloaded by
   the user on demand.
7. Before a tag, run the manual `Release candidate validation` workflow. It builds and uploads the five target bundles
   without creating a release and without downloading a model. Compilation/packaging is not runtime qualification.

Workflow permissions are least-privilege: repository contents are read-only except the release job, which needs
`contents: write`.

## Artifacts

Builds upload from `src-tauri/target/release/bundle/**/*` and publish `.dmg`, `.deb`, `.rpm`, `.AppImage`, `.msi` and
`.exe` files. Builds are currently unsigned/not notarized; changing that requires human-owned Apple/Microsoft
credentials and secrets.

## Local native smoke test

```sh
bun install --frozen-lockfile
bun run sidecar:fetch
bun run build
ls src-tauri/target/release/bundle/
```

Managed-runtime packages must additionally verify that the sidecar and its libraries launch with the bundled model:

```sh
bun run sidecar:smoke:runtime
```

State the exact platform/architecture and do not claim cross-platform execution from one host. Passing the version
check or compiling a bundle is not runtime qualification.

This requires the platform Tauri dependencies and takes several minutes. Agents may validate TypeScript, browser
behavior and Rust checks without producing installers; report the native build as unrun if it was not executed.

## Remote settings requiring human authorization

These are recommendations; this repository does not modify them automatically.

- Protect `main`: require a pull request, at least one review, conversation resolution, and no force pushes or
  deletions.
- Require these status checks: `Quality gate`, `Browser end-to-end`, `Rust native checks`,
  `Production dependency audit`.
- Require branches to be up to date before merging.
- Recommended: linear history and squash merges.
- Protect release tags (`v*`) from updates and deletion.
- Keep Dependabot alerts and security updates enabled.
- Do not grant workflows write access beyond the release job.

## Rollback

Prefer a new patch release over moving a published tag. If a release is broken:

1. Publish a fixed `vX.Y.(Z+1)` from `main`.
2. Mark the previous release as superseded in its notes if necessary.
3. Do not rewrite tags or force-push `main` without explicit human authorization.
