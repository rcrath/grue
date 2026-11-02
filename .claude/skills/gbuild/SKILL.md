# /gbuild — Build grue locally and install the exe to ~/bin/GrUE

Local build-and-install routine for day-to-day testing. Does not touch git — never
commits, pushes, or tags (that's `/publish-grue`, the only place git writes happen).

## Invocation

User types `/gbuild`.

## Steps

1. **Version gate (repo CLAUDE.md rule 1 — never skip this).** Read `version` from
   `src-tauri/tauri.conf.json`. Confirm `package.json` and `src-tauri/Cargo.toml` carry
   the identical string — if any of the three disagrees, stop and tell Rich, don't
   guess which is right.
   Ask Rich for the version number, offering the current one as the Enter-default.
   - If Rich keeps the current version, skip straight to step 3.
   - If Rich gives a new version: it must be plain semver for these files —
     `MAJOR.MINOR.PATCH` optionally followed by `-label` (e.g. `0.3.0`, `0.3.0-alpha`).
     No leading `v` — `Cargo.toml`'s version field is parsed by the semver crate and a
     `v` prefix fails the build. If Rich gives one with a `v` (e.g. for eventual git-tag
     use), strip it for these three files and confirm that's what he means; the `v`
     belongs on the git tag at `/publish-grue` time, not here.
     Never invent or increment a version yourself.

2. **Write the version** (only if it changed) to all three files, only after Rich
   confirms: `src-tauri/tauri.conf.json` (`version` field), `package.json` (`version`
   field), `src-tauri/Cargo.toml` (`version` field under `[package]`).

3. **Build.** From `E:/Dropbox/audio/git/grue`, run `npx tauri build`. This runs
   `tsc && vite build` first (fast) then the Rust release compile (~3-4 min) — run it
   in the background and report when done, don't block/poll.
   - **Known failure mode:** Dropbox syncing can lock files under `src-tauri/target/`
     mid-compile, producing an "os error 32" archive/link failure. If this happens,
     tell Rich to pause Dropbox syncing and retry — don't work around it another way.
   - On any other failure, report the actual error; don't guess a fix silently.

4. **Install.** On success, copy `src-tauri/target/release/grue.exe` to
   `~/bin/GrUE/grue.exe`, overwriting whatever's there (create the `~/bin/GrUE`
   directory first if it doesn't exist). This is a local copy for Rich's own testing —
   not a release artifact, not a git action.

5. **Linux copy to Dropbox — from the source tree only, method TBD.** Rich wants the
   Linux executable of the SAME source just built, placed at
   `E:/Dropbox/computing/linux/bin/GrUE/grue` for Dropbox to sync to his Linux box.
   The local Windows build produces only `grue.exe`, so a Linux binary of the current
   tree must be built from the source tree on a Linux environment (his Linux box or
   WSL — Rich hasn't picked the method yet). Until he does, skip this step and say so
   in the report.
   - **NEVER get the Linux binary from GitHub.** GitHub holds only old published
     releases in Rich's workflow — anything fetched from there is stale by
     definition. No `gh` reads (runs, artifacts, releases) in this skill at all.
   - No symbolic link is made on Windows — links don't survive Dropbox sync across
     operating systems. On Linux, Rich has a one-time launcher script at `~/bin/GrUE`
     that re-applies execute permission and runs the Dropbox copy; each new synced
     build needs nothing redone.

6. **Report.** State the version built, confirm the exe was copied to `~/bin/GrUE`,
   state which Linux version landed in `E:/Dropbox/computing` (flagging any version
   mismatch), and note the NSIS installer's path
   (`src-tauri/target/release/bundle/nsis/`) exists too in case Rich wants it instead.

## Don'ts

- Never commit, push, or tag — that's `/publish-grue` only.
- Never read from GitHub either (runs, artifacts, releases, issues) — everything in
  this skill is local. GitHub only holds old published builds.
- Never bump the version without Rich's explicit confirmation of the exact string.
- Never silently strip/alter a version string without telling Rich what you did and why.
- Never close GitHub issues.
