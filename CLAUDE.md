# grue — assistant rules

1. On ANY build request (local or CI), first ask Rich the version number, offering the current one (from src-tauri/tauri.conf.json) as the Enter-default. Never invent/increment versions. Versions live in exactly: src-tauri/tauri.conf.json, package.json, src-tauri/Cargo.toml — update all three only after Rich confirms.
2. Never commit or push unless Rich asks. Never close GitHub issues.
3. Build: `npx tauri build` from repo root; artifacts src-tauri/target/release (exe), .../bundle/nsis (installer). Defender exclusion + Dropbox-ignore already applied to target/.
4. Roadmap = GitHub issue #3 (Keep/Done checklists); tick Done boxes when features land.
