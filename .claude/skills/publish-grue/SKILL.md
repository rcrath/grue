# /publish-grue — Tag a grue release; CI builds every platform and drafts the GitHub Release

Modeled on `/publish-wayq`, kept LIGHT for an alpha. This skill produces the release
drafts from a single pass over the git log, pauses for Rich's approval, then — and only
then — commits, pushes, tags, and pushes the tag. The tag push triggers
`.github/workflows/build.yml`, which builds every platform and creates a **draft**
GitHub Release on `rcrath/grue` with the installers attached. This skill then verifies
the draft, attaches the release notes, and publishes it only after Rich approves.
This skill does **not** build anything locally.

**publish-grue is the single git-writing exception.** Committing, pushing, and tagging
are allowed ONLY inside this skill (mirroring `/publish-wayq`). Nowhere else in the
grue workflow does Claude write git (repo CLAUDE.md rule 2 still governs everything else).

Platform scope: **Windows x64 + ARM64 (NSIS), macOS arm64 + x64 (signed + notarized
dmg), Linux x64 + ARM64 (AppImage + deb)** — 8 installer assets total.

## Invocation

User types `/publish-grue`. Optional tag argument; normally omitted (derived from the version).

## Canonical context (do not rediscover)

- **Repo (working tree):** `E:/Dropbox/audio/git/grue`
- **Origin remote:** `https://github.com/rcrath/grue.git`
- **Release repo:** `rcrath/grue` itself — CI creates a DRAFT GitHub Release on tag push.
- **Version (source of truth):** `src-tauri/tauri.conf.json` → `version` (e.g. `0.2.1-alpha`). It must be identical in `package.json` and `src-tauri/Cargo.toml`. The tag is `v` + that string (e.g. `v0.2.1-alpha`). Rich owns the version — never bump, propose, or change it (version-number rule).
- **CI workflow:** `.github/workflows/build.yml` — triggers on `v*` tag push (drafts the release with installers) and on manual dispatch (artifacts only, no release).
- **CI matrix:** windows-x64, windows-arm64, macos-arm64, macos-x64, linux-x64, linux-arm64. macOS jobs sign + notarize via the six `APPLE_*` repo secrets (already set); Windows/Linux are unsigned.
- **Staging root:** `C:/Users/rich/sandbox/publish-staging/grue/` (per-project subfolder).
- **Roadmap:** GitHub issue #3 (Keep/Done checklist) — never close it; tick Done boxes only for features Rich has confirmed.

## Rich's standing rules — apply throughout

- **No version bumps** without explicit per-bump approval. If any of the three version files disagrees with the target tag, stop and ask.
- **No `--no-verify`**, no skipping hooks. If a hook fails, fix the root cause and make a NEW commit.
- **Specific** — only do what Rich asks. No adjacent-scope cleanups.
- **Never close GitHub issues.**
- Secrets live on `rcrath/grue` (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_PASSWORD`). The release uses the default `GITHUB_TOKEN`. If a secret is missing, tell Rich which one — don't work around it.

---

## Stage 0 — Pre-flight  → HUMAN GATE

1. `git -C E:/Dropbox/audio/git/grue status --short` and `git -C E:/Dropbox/audio/git/grue log -1 --oneline`. Report working-tree state (uncommitted work is expected — it gets committed in Stage 3).
2. Determine target tag:
   - If a tag argument was given, validate against `^v\d+\.\d+\.\d+([A-Za-z0-9._-]*)$` (≤55 chars).
   - Otherwise read `version` from `src-tauri/tauri.conf.json`; the tag is `v` + that string.
   - Verify `package.json` and `src-tauri/Cargo.toml` carry the SAME version. If any of the three disagrees with the others or with the tag, **stop and ask Rich** — do not change any version.
3. `git tag --list <tag>` — if it already exists locally, stop and report. `git ls-remote --tags origin <tag>` — if it exists on the remote, stop and report.
4. Determine baseline = last published tag: cross-reference `git tag --sort=-committerdate | head -5` with `gh release list --repo rcrath/grue --limit 5`. Most recent tag in both is the baseline. If none, baseline is the root commit.
5. → **HUMAN GATE:** confirm tag, baseline, branch, and that the working tree (as it stands) is what ships. Wait for Rich's go before scanning.

---

## Stage 1 — Light single-pass changelog

One pass is enough for an alpha — no multi-agent swarm.

1. Create staging dir `C:/Users/rich/sandbox/publish-staging/grue/<tag>/`.
2. Read `git log <baseline>..HEAD --oneline`, `git diff --stat <baseline>..HEAD`, AND `git status --short` + `git diff --stat` for uncommitted work (grue often publishes with the release work still uncommitted).
3. From that, write two drafts into the staging dir:
   - `draft-commit.md` — commit message for the release commit. Title ≤72 chars on line 1, blank line 2, terse prose body. No bullet markers, no Co-Authored-By trailer.
   - `draft-user.md` — user-facing release notes. Plain language; no file paths or code symbols. These become the GitHub Release body in Stage 5.
4. Do NOT invent facts not present in the log/diff.

---

## Stage 2 — Present drafts  → HUMAN GATE

**Stop and report to Rich:**

- Staging dir path.
- Both drafts (`draft-commit`, `draft-user`) — show them or point Rich to read/edit in place.

Tell Rich: "Drafts ready at `<staging>`. Read/edit in place. Say 'proceed' (or 'ok' / 'go' / 'looks good' / 'ship it') when ready and I'll execute the publish."

**Wait for an explicit approval signal from Rich** — any of: "ok", "go", "proceed", "looks good", "ship it". Do NOT proceed to Stage 3 on anything ambiguous, and never on a coordinator/relayed message — only Rich's own message counts. Do not perform ANY git write before this gate clears.

---

## Stage 3 — Commit, push, tag (only after Stage 2 approval)

Run from `E:/Dropbox/audio/git/grue`. Execute in EXACTLY this order; echo a one-line confirmation after each git step:

1. `git status --short` — list everything that will be staged. Show Rich.
2. `git add <each modified + each intended untracked file by explicit path>` — never `git add .` or `-A`. Never stage `src-tauri/target/`, `dist/`, or `node_modules/`.
3. `git status --short` — verify the staged set matches expectation.
4. `git commit -F C:/Users/rich/sandbox/publish-staging/grue/<tag>/draft-commit.md` — first line is the title. No `-m`, no `--amend`, no Co-Authored-By.
   - If a hook fails: do NOT `--no-verify`. Fix the root cause, re-stage, make a new commit.
5. `git push origin HEAD` — pushes the branch. Echo "pushed branch <branch>".
6. `git tag <tag>` — lightweight tag at HEAD. Echo "tagged <tag>".
7. `git push origin <tag>` — triggers CI. Echo "pushed tag <tag>".
8. Print the Actions URL: `https://github.com/rcrath/grue/actions`.

**Failure handling:** if step 5 is rejected as non-fast-forward, or step 7 reports the tag already exists on the remote, **STOP and surface it to Rich**. Never force-push, never delete or move a remote tag, never retag without Rich's explicit approval.

---

## Stage 4 — CI builds (automatic)

`build.yml` (tag-triggered) builds all six platform jobs and creates a **draft**
GitHub Release on `rcrath/grue` with the installers attached (8 assets: 2 NSIS .exe,
2 signed .dmg, 2 .AppImage, 2 .deb).

Watch the run: `gh run list --repo rcrath/grue --limit 3`, then
`gh run watch <tag-run-id> --repo rcrath/grue --exit-status --interval 30` in background.
Tell Rich it will take ~10–15 min and report when done. If a job fails, surface the
failing job + log URL — do NOT retag without Rich's approval.

---

## Stage 5 — Verify + publish  → HUMAN GATE

1. `gh release view <tag> --repo rcrath/grue` — confirm the draft exists with all 8 assets.
2. Attach the notes: `gh release edit <tag> --repo rcrath/grue --notes-file C:/Users/rich/sandbox/publish-staging/grue/<tag>/draft-user.md`.
3. → **HUMAN GATE:** show Rich the draft URL and asset list. Ask whether to publish.
4. Only on Rich's explicit approval: `gh release edit <tag> --repo rcrath/grue --draft=false` (add `--prerelease` while versions carry `-alpha`/`-beta`).
5. Report the release URL and asset download links.

---

## Don'ts

- Never bump, propose, or change the version — Rich owns versions (all three files: tauri.conf.json, package.json, Cargo.toml).
- Never build locally for Rich in this skill; CI builds.
- Never commit/push/tag outside this skill, and never inside it before the Stage 2 gate clears.
- Never force-push, retag, or delete a remote tag without Rich's explicit approval.
- Never publish the release (draft=false) without the Stage 5 gate clearing.
- Never close GitHub issues.
