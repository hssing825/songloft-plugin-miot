# Automatic releases

Pushing to `main` runs Release Plugin, which builds each unpublished non-documentation business commit in mainline order. Batch pushes and commits arriving during a build each receive a package unless they only change documentation. Commits changing only Markdown (`.md` / `.mdx`) or documents/assets under `docs/` produce no package and consume no revision. Mixed code or build-configuration changes still produce packages. Both workflow path filters and the pending-commit queue exclude documentation-only commits, so manual dispatch or a later code push never backfills them. Generated `chore(release): bump to v...` commits do not produce another release. Manual workflow dispatch resumes unfinished code commits.

Versions use `YYYY.M.D.N` with Beijing dates. Normally the first package each day is `.0`; later packages increment the largest existing tag revision (`.9` is followed by `.10`). Tags include `v`; manifest versions omit it. Existing tags and Releases are preserved. Allocated revisions are never reused, so a failed publication may leave a gap.

Migration begins from the already published three-component `2026.10.15`. Until the actual date catches up, use `2026.10.15.x`. The first migration package is `.1` because three components and `.0` compare equally. Once the date catches up, continue that date's existing sequence; the next new date starts at `.0`.

Every package passes type checks, plugin/frontend tests, build, and validation first. Its tag points to the matching source commit plus version metadata, never to newer source for an older artifact. `Source commit` in release notes and `plugin.json.releaseSource` record the business commit. The mainline version commit synchronizes version, download URL, and package hashes.

If publication succeeds but the mainline metadata push fails, a retry adopts that commit's published version without releasing it twice. Failed checks leave the queue position intact for a later workflow to resume.

Validate release logic locally:

```bash
node --test tests/release_pipeline.test.mjs
```

Tests use temporary local Git remotes and a mocked GitHub Release API. They cover day rollover, revisions, migration, batch pushes, commits arriving during builds, skipped documentation additions/deletions, later code publication, retry recovery, duplicate prevention, and tag/source correspondence without publishing to a real repository.
