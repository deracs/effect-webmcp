# Releasing

This repository publishes the `effect-webmcp` npm package.

## Release policy

- The npm package version in `package.json` is the source of truth.
- Every published package version must have one matching annotated Git tag: `vX.Y.Z`.
- Release tags are immutable. Do not move, delete, or reuse a tag after it has been pushed or shared.
- Release from `main` only.
- Trigger npm publication from an annotated release tag after the release commit is on `main`.

## Versioning

Use semantic versioning.

- Patch (`0.1.x`): bug fixes, packaging fixes, build/test/docs/example-only changes.
- Minor (`0.x.0`): backwards-compatible features or meaningful behavior changes.
- Major (`1.0.0` and above): breaking changes.

Because this package is still `0.x`, be conservative: if a change would surprise existing consumers, prefer a minor bump over a patch bump.

## Release checklist

1. Confirm `main` is in a releasable state.
2. Run validation locally:

   ```bash
   pnpm run check
   ```

3. Bump the package version without creating a Git tag automatically:

   ```bash
   pnpm version <version> --no-git-tag-version
   ```

4. Commit the release bump:

   ```bash
   git add package.json pnpm-lock.yaml
   git commit -m "chore: release <version>"
   ```

   If `pnpm-lock.yaml` did not change, do not force it into the commit.

5. Create an annotated tag for the release commit:

   ```bash
   git tag -a v<version> -m "v<version>"
   ```

6. Push the release commit:

   ```bash
   git push origin main
   ```

7. Push the annotated tag to trigger the release workflow:

   ```bash
   git push origin v<version>
   ```

8. The GitHub Actions release workflow will:
   - install dependencies
   - run `pnpm run check`
   - verify `package.json` matches the tag version
   - publish to npm using `NPM_TOKEN`
   - create a GitHub Release with generated notes

9. Verify that the GitHub Actions run succeeded and that the package is available on npm.

## Notes

- Do not publish a package version that is not committed and tagged.
- Do not push a release tag unless the tagged commit is the exact version you intend to publish.
- If a release goes wrong, publish a new version. Do not move an existing tag to different code.
- The release workflow requires an `NPM_TOKEN` repository secret with permission to publish `effect-webmcp`.
- If `v0.1.2` already exists, the next release from current `main` should usually be `0.1.3`, not another `0.1.2`.
