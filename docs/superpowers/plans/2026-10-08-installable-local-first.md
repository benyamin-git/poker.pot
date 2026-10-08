# Installable Local-First poker.pot — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-08-installable-local-first-design.md`
**Date:** 2026-10-08

## Global constraints

- Display name `poker.pot`; Android identifier `com.pokerpot.app`; artifact
  `poker.pot-<version>-android-universal.apk`; version stays `0.1.0`.
- Bun only (runtime, package manager, scripts). Pinned additions:
  `dexie@4.4.6`, `zod@4.6.5`, `vite-plugin-pwa@2.0.0`, `@tauri-apps/cli@^2`.
- Ports: `7403` live static preview (`bun start`), `7404` Vite dev,
  `7407` transient screenshots. No renumbering.
- Public repo `benyamin-git/poker.pot`; Pages URL
  `https://benyamin-git.github.io/poker.pot/`, so `VITE_BASE=/poker.pot/`.
- Every task ends with: `bun run test`, `bun run typecheck`, `bun run lint`
  all clean (except where a task explicitly deletes the affected suite).
- Biome formatting applies to every new file. No code comments (AGENTS.md).
- Load the `design` skill for T6/T5/T7 UI work; load the `readme` skill for T12.
- Never commit a keystore, `keystore.properties`, or generated `release/`
  artifacts. Never hand-edit `dist/`, `tokens.css`, or `gen/android` outputs
  except the documented `build.gradle.kts` signing patch in T10.
- Non-goals (verbatim from spec): Windows/desktop builds; native iOS; sync;
  APK auto-updater; per-session export; rule/domain/theme changes; Android PWA
  install path.

## Task order

```
T1 storage ─► T2 backup ─► T3 client swap ─► T4 backup flows ─► T5 onboarding
T6 icons ─────────────────────────────────────► T7 PWA
T3 ─► T8 static server ─► T9 screenshots
T6 ─► T10 tauri android ─► T11 CI/CD + keystore ─► T12 docs
```

T4 depends on T2+T3. T7 depends on T3, T4, T6. T9 depends on T5, T6, T8.
T11 depends on T10. T12 depends on everything.

---

## T1 — Dexie storage layer

**Depends:** none.
**Commit:** `feat(client): add dexie storage layer`

**Files**

- `package.json` — add `"dexie": "4.4.6"` to dependencies.
- `src/client/storage/db.ts` (new).
- `src/client/storage/index.ts` (new).
- `tests/storage.test.ts` (new).

**Interfaces**

```ts
// src/client/storage/db.ts
import Dexie, { type Table } from "dexie";
export interface ConfigRow { key: "config"; value: AppConfig }
export interface MetaRow { key: string; value: unknown }
export class PokerDb extends Dexie {
  config!: Table<ConfigRow, string>;
  sessions!: Table<Session, string>;
  meta!: Table<MetaRow, string>;
  constructor(name?: string); // super(name ?? "poker.pot")
}
export function createDb(name?: string): PokerDb;
export const db: PokerDb;
// version(1).stores({ config: "key", sessions: "id, updatedAt, createdAt", meta: "key" })

// src/client/storage/index.ts
export interface SessionSummary {
  id: string; name: string; status: Session["status"];
  createdAt: string; updatedAt: string; matchCount: number;
  balances: Record<string, number>;
}
export interface Store {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<AppConfig>;
  listSessions(): Promise<Session[]>;
  listSessionSummaries(): Promise<SessionSummary[]>;
  createSession(name: string, playerIds: string[]): Promise<Session>;
  getSession(id: string): Promise<Session>;
  renameSession(id: string, name: string): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  command(id: string, command: Command): Promise<Session>;
  isOnboarded(): Promise<boolean>;
  completeOnboarding(): Promise<void>;
  getRevision(): Promise<number>;
  getLastBackupAt(): Promise<string | null>;
  getLastBackupRevision(): Promise<number | null>;
  markBackedUp(at?: string): Promise<void>;
  exportData(): Promise<{ config: AppConfig; sessions: Session[] }>;
  replaceAll(config: AppConfig, sessions: Session[]): Promise<void>;
  putSessions(sessions: Session[]): Promise<void>;
  putConfig(config: AppConfig): Promise<void>;
}
export const DEFAULT_CONFIG: AppConfig = { players: [], minRaise: 5, maxBet: 100 };
export function createStore(database: PokerDb): Store;
export const store: Store;
export function summarize(session: Session, config: AppConfig): SessionSummary;
```

**Behavior**

- `getConfig` returns `DEFAULT_CONFIG` when the row is absent; `saveConfig`
  validates with `validateConfig` before writing.
- `createSession` mirrors the retired server: default name `"Poker night"`,
  `resolvePlayers(config, playerIds)`, throw `DomainError("roster-empty", …)`
  when empty, ids via `newId()` from `src/client/id.ts`, timestamps
  `new Date().toISOString()`.
- `command` runs `applyCommand` inside
  `database.transaction("rw", database.sessions, database.meta, …)`;
  `getSession` throws `DomainError("unknown-match", "unknown session: <id>")`.
  Error codes stay identical to the server's (`invalid-config`,
  `roster-empty`, `unknown-match`, `unknown-player`, `match-in-progress`,
  `session-locked`, `action-not-allowed`).
- Meta keys: `revision` (incremented on every mutation), `onboarded`,
  `lastBackupAt`, `lastBackupRevision`.

**Verify**

1. `bun run test tests/storage.test.ts` → all pass. Tests cover: default
   config; invalid config rejection; createSession + recordAction balances;
   unknown session rejection; rename/delete; onboarding flag; revision
   increments; data persists across two `createStore` instances sharing a DB
   name (fake-indexeddb).
2. `bun run typecheck` → 0 errors; `bun run lint` → clean.

---

## T2 — Backup bundles and merge planning

**Depends:** T1.
**Commit:** `feat(client): add yaml backup bundles and merge planning`

**Files**

- `package.json` — add `"zod": "4.6.5"` to dependencies.
- `src/client/platform.ts` (new) — `isIos()`, `isStandalone()` (clytrade
  patterns).
- `src/client/backup.ts` (new).
- `tests/backup.test.ts` (new).

**Interfaces**

```ts
export const BACKUP_APP = "poker.pot";
export const BACKUP_SCHEMA_VERSION = 1;
export interface BackupBundle {
  app: "poker.pot";
  schemaVersion: number;
  exportedAt: string;
  data: { config: AppConfig; sessions: Session[] };
}
export class BackupError extends Error {
  code: "invalid-yaml" | "invalid-bundle" | "future-version";
}
export function buildBundle(config: AppConfig, sessions: Session[], exportedAt: string): BackupBundle;
export function bundleToYaml(bundle: BackupBundle): string;
export function parseBundle(text: string): BackupBundle; // throws BackupError
export function exportFilename(now: Date): string;       // poker.pot-backup-2026-10-08-143012.yaml
export interface MergeConflict { local: Session; incoming: Session }
export interface MergePlan { added: Session[]; conflicts: MergeConflict[]; config: AppConfig }
export function planMerge(
  local: { config: AppConfig; sessions: Session[] },
  incoming: { config: AppConfig; sessions: Session[] },
): MergePlan;
export function applyResolutions(
  plan: MergePlan,
  resolutions: Map<string, "local" | "incoming">,
): { config: AppConfig; sessions: Session[] };
export function saveBackupFile(bundle: BackupBundle): Promise<"shared" | "downloaded" | "cancelled">;
export function readBackupFile(file: File): Promise<BackupBundle>;
```

**Behavior**

- zod schemas mirror every domain shape (action → round → match → session,
  config with `maxBet >= minRaise`); `parseBundle` parses YAML with the `yaml`
  package, validates, and raises `future-version` when
  `schemaVersion > BACKUP_SCHEMA_VERSION`.
- `saveBackupFile`: on iOS with `navigator.canShare({files})` use
  `navigator.share` (AbortError → `"cancelled"`); otherwise anchor-download a
  blob. Content type `application/yaml`.
- `planMerge` config: local players plus incoming players whose id is absent;
  local `minRaise`/`maxBet`/`currencyLabel` win.
- `applyResolutions` requires an entry for every conflict (UI enforces; the
  function throws `BackupError("invalid-bundle")` if one is missing).

**Verify**

1. `bun run test tests/backup.test.ts` → passes: YAML round-trip; invalid YAML,
   wrong `app`, and future version rejected; merge adds new sessions and
   reports conflicts; roster union + local limits; `applyResolutions` uses the
   chosen side per conflict.
2. `bun run typecheck`, `bun run lint` → clean.

---

## T3 — Run the client from on-device storage

**Depends:** T1.
**Commit:** `feat(client): run the ledger from on-device storage`

**Files**

- Delete `src/client/api.ts`, `src/client/screens/SetupScreen.tsx`.
- `src/client/state/config.tsx` — use `store.getConfig` / `store.saveConfig`.
- `src/client/state/useSession.ts` — use `store.getSession` / `store.command`;
  drop the `localStorage` cache (IndexedDB is the source of truth); keep the
  `{ session, loading, sending, error, send, refresh }` shape.
- `src/client/state/useSessions.ts` — use `store.listSessionSummaries` /
  `store.deleteSession`; import `SessionSummary` from `../storage`.
- `src/client/screens/SessionsScreen.tsx` — import `SessionSummary` from
  `../storage`.
- `src/client/screens/SessionScreen.tsx`, `src/client/components/NewSessionSheet.tsx`
  — `api.*` → `store.*`.
- `src/client/App.tsx` — remove `ConfiguredApp` setup-status gate and the
  `/setup` route; render the route tree directly.
- `tests/ui.test.tsx` — remove the `SetupScreen` import and its render test;
  assert the Sessions empty state instead.

**Verify**

1. `grep -rn "from \"../api\"\|from \"./api\"\|shared/api" src/client` → no
   matches (server still references `shared/api` until T8).
2. `bun run test` → all suites except `server` untouched and passing.
3. Manual: `bun run dev`, open `http://localhost:7404`, add a session and a
   player, record an action, hard-reload — data persists with no API server
   running.
4. `bun run typecheck`, `bun run lint` → clean.

---

## T4 — Backup export/import flows and conflict sheet

**Depends:** T2, T3.
**Commit:** `feat(client): add backup export and import flows`

**Files**

- `src/client/backup.ts` — add store orchestration:
  `exportFromStore(store: Store): Promise<"shared" | "downloaded" | "cancelled">`
  (build bundle → save → `store.markBackedUp()`),
  `importIntoStore(store: Store, bundle: BackupBundle, mode: "replace" | "merge", resolutions?: Map<string, "local" | "incoming">): Promise<void>`.
- `src/client/components/ImportBackupSheet.tsx` (new) — mode choice and, for
  merge, the conflict list. Each row shows local vs imported name,
  `updatedAt`, and `matches.length`; per-row Keep local / Use imported; an
  apply-to-all toggle applies the next choice to every conflict; the confirm
  button stays disabled until every conflict is chosen.
- `src/client/screens/SettingsScreen.tsx` — Data card: Export backup button,
  Import backup file input (`accept=".yaml,.yml,application/yaml"`), last
  backup line, and a nudge banner shown when
  `getRevision() !== getLastBackupRevision()`. Replace mode goes through a
  confirmation dialog; success/failure feedback uses existing `.positive` /
  `.negative` styles.
- `tests/backup-flow.test.ts` (new) — fake-indexeddb round trips: export →
  wipe → replace import; merge into existing data (new session added,
  conflict resolution both ways, roster union); nudge flag updates after
  export.

**Verify**

1. `bun run test tests/backup-flow.test.ts` → passes.
2. `bun run test`, `bun run typecheck`, `bun run lint` → clean.
3. Manual: dev server → export downloads a `.yaml`; delete data via replace
   import of the same file; merge a modified bundle and resolve a conflict;
   nudge disappears after export.

---

## T5 — Onboarding wizard

**Depends:** T4.
**Commit:** `feat(client): add first-run onboarding wizard`

**Files**

- `src/client/components/ConfigEditors.tsx` (new) — extract the Players card
  and Rules card out of `SettingsScreen` as `PlayersEditor({ value, onChange })`
  and `RulesEditor({ value, onChange })` (`AppConfig` in/out).
- `src/client/screens/SettingsScreen.tsx` — use the extracted editors (no
  behavior change).
- `src/client/screens/OnboardingScreen.tsx` (new) — steps:
  `welcome` (Start fresh / Import backup, reusing `ImportBackupSheet`) →
  `players` → `limits` → `finish`. Finish saves config via `store.saveConfig`
  and calls `store.completeOnboarding()`.
- `src/client/App.tsx` — gate: while loading `store.isOnboarded()` show the
  existing `Loading…` screen; if not onboarded render `OnboardingScreen`;
  otherwise the route tree.
- `tests/onboarding.test.tsx` (new) — SSR smoke render of each step; update
  `tests/ui.test.tsx` if `AppShell` rendering changes.

**Verify**

1. `bun run test tests/onboarding.test.tsx` → passes.
2. Manual: fresh profile (or `indexedDB.deleteDatabase("poker.pot")` in
   devtools) → wizard appears; each path (fresh and import) completes and
   lands on an empty Sessions screen; relaunch skips the wizard.
3. `bun run test`, `bun run typecheck`, `bun run lint` → clean.

---

## T6 — Icon redesign and generated sets

**Depends:** none (must land before T7 and T10).
**Commit:** `feat(brand): replace the icon with a pot mark and generated sets`

**Files**

- `public/icon.svg` — new pot/chips motif in the design skill's default blue on
  the theme's dark tile; works at 48 px; art inside the maskable safe zone.
  Load the `design` skill before drawing.
- `scripts/icons.ts` (new) — rasterizes `public/icon.svg` with the existing
  Playwright dependency into:
  `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (extra
  padding), `apple-touch-icon-180.png` (opaque), `icon-1024.png` (source for
  `tauri icon`).
- `package.json` — `"icons": "bun scripts/icons.ts"`.
- `tests/icons.test.ts` (new) — parses each PNG's IHDR and asserts dimensions;
  asserts `icon.svg` exists.

**Verify**

1. `bun run icons` → writes the five PNGs plus `public/icons/icon-1024.png`.
2. `bun run test tests/icons.test.ts` → passes.
3. Visual check of `icon-192.png` and `maskable-512.png` at small size.
4. `bun run typecheck`, `bun run lint` → clean.

---

## T7 — PWA installability, update prompt, hash routing

**Depends:** T3, T4, T6.
**Commit:** `feat(pwa): make the app installable with an update prompt`

**Files**

- `package.json` — add `"vite-plugin-pwa": "2.0.0"` (devDependency).
- `vite.config.ts` — `base: process.env.VITE_BASE ?? "/"`;
  `define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_PLATFORM__: JSON.stringify(process.env.TAURI_ENV_PLATFORM ?? "web") }`;
  add `VitePWA({ disable: isNativeBuild, registerType: "prompt", injectRegister: false, includeAssets: ["icon.svg"], manifest: { name: "poker.pot", short_name: "poker.pot", description, start_url: ".", scope: ".", display: "standalone", orientation: "portrait", background_color/themes from tokens, icons: icon-192, icon-512, maskable-512 }, workbox: { globPatterns: ["**/*.{js,css,html,svg,png}"] }, devOptions: { enabled: false } })`.
- Delete `public/manifest.webmanifest` (plugin generates it).
- `index.html` — drop the static manifest link; point
  `apple-touch-icon` at `/icons/apple-touch-icon-180.png`; keep the
  theme-color runtime script.
- `src/client/App.tsx` — `BrowserRouter` → `HashRouter`; render
  `<UpdateBanner />` inside `AppShell`.
- `src/client/components/UpdateBanner.tsx` (new) — `useRegisterSW` from
  `virtual:pwa-register/react`; slim dismissible banner with Reload calling
  `updateServiceWorker(true)`; never reloads by itself.
- `src/client/main.tsx` — best-effort `void navigator.storage?.persist?.()`.
- `src/client/types.d.ts` (new) — `/// <reference types="vite-plugin-pwa/client" />`,
  `declare const __APP_VERSION__: string`, `declare const __APP_PLATFORM__: string`.
- `src/client/screens/SettingsScreen.tsx` — show `Version <__APP_VERSION__>`
  in the Data card.
- `tests/ui.test.tsx` — `vi.mock("virtual:pwa-register/react", …)` so SSR
  smoke renders keep working.

**Verify**

1. `bun run build` → `dist/sw.js`, `dist/manifest.webmanifest`,
   `dist/icons/*.png` exist; `dist/index.html` references the manifest and
   `/icons/apple-touch-icon-180.png`.
2. `VITE_BASE=/poker.pot/ bun run build` → asset URLs are prefixed with
   `/poker.pot/`.
3. `TAURI_ENV_PLATFORM=android bun run build` → no `dist/sw.js` (native
   bundles skip the service worker).
4. Manual (Chrome, `bunx vite preview` on localhost): installable, offline
   reload works; with a rebuilt bundle the banner shows.
5. `bun run test`, `bun run typecheck`, `bun run lint` → clean.

---

## T8 — Retire the API server for a static preview

**Depends:** T3.
**Commit:** `refactor: retire the api server for a static preview`

**Files**

- `src/server/index.ts` — rewrite as a static server only: `Bun.serve` on
  `process.env.PORT ?? 7403`, hostname `0.0.0.0`, serve `dist/` with an
  `index.html` fallback, path-traversal-safe path resolution, and the existing
  "Client build not found" 404 when `dist/` is missing.
- Delete `src/server/api.ts`, `src/server/storage.ts`, `src/shared/api.ts`,
  `tests/server.test.ts`, `location.example.yaml`.
- `vite.config.ts` — remove the `/api` proxy block.
- `package.json` — `"dev": "vite"`; remove `concurrently` from devDependencies.
- `scripts/live.sh` — comment only ("static preview"); behavior, port, log and
  pid file unchanged.
- `.gitignore` — remove the `location.yaml`, `data/`, `sessions/`,
  `*.local.yaml` entries; keep `dist/`, `.screenshots/`.

**Verify**

1. `bun run build && PORT=7460 bun src/server/index.ts &` then
   `curl -s localhost:7460 | grep -q "poker.pot"` → found;
   `curl -s -o /dev/null -w "%{http_code}" localhost:7460/anything` → `200`
   (fallback); stop the process.
2. `grep -rn "shared/api\|location.yaml\|POKER_LOCATION_FILE" src tests scripts`
   → no matches.
3. `bun run test`, `bun run typecheck`, `bun run lint` → clean.

---

## T9 — Screenshot rework

**Depends:** T5, T6, T8.
**Commit:** `chore(scripts): seed on-device storage for screenshots`

**Files**

- `scripts/screenshots.ts` — build, serve `dist/` with `Bun.serve` on
  `SCREENSHOTS_PORT ?? 7407`, then in Playwright: navigate, seed IndexedDB
  (`poker.pot` v1: `config` row, `sessions` rows, meta `onboarded: true`,
  `revision`/`lastBackupRevision`), reload, capture the screen set and the
  Light/Dark/OLED strip into `docs/screenshots/`.
- `package.json` — script unchanged (`bun run build && bun scripts/screenshots.ts`).

**Verify**

1. `bun run screenshots` → regenerates all `docs/screenshots/*.png`; print
   file list with dimensions.
2. Open `docs/screenshots/match.png` and `theme-oled.png`; demo data is
   present and the wizard is skipped.
3. `bun run typecheck`, `bun run lint` → clean.

---

## T10 — Tauri v2 Android shell and project bootstrap

**Depends:** T6, T7.
**Commit:** `feat(android): add tauri v2 shell for the apk` (commits for the
generated `gen/android` project may be split: `chore(android): commit the
generated android project`).

**Files**

- `package.json` — devDependency `@tauri-apps/cli@^2`; scripts
  `"tauri": "tauri"`, `"android:init": "tauri android init --ci"`,
  `"android:apk": "tauri android build --apk --ci"`.
- `src-tauri/` — created with
  `bun tauri init --ci -A poker.pot -W poker.pot -D ../dist -P http://localhost:7404 --before-dev-command "bun run dev" --before-build-command "bun run build"`,
  then edited: `identifier: "com.pokerpot.app"`, `version: "../package.json"`,
  window title `poker.pot`, `bundle.android.debugApplicationIdSuffix: ".debug"`,
  bundle metadata (publisher `benyamin-git`, category, descriptions), icon list.
- `src-tauri/icons/*` — `bun tauri icon public/icons/icon-1024.png`.
- `.github/workflows/android-init.yml` (new, `workflow_dispatch`) — setup Bun,
  Rust Android targets, JDK 17; `bun tauri android init --ci --skip-targets-install`;
  upload `src-tauri/gen` as artifact `android-gen`.
- `src-tauri/gen/android/**` — downloaded from the artifact, committed, with
  the Tauri-docs signing patch in `app/build.gradle.kts`
  (`signingConfigs.create("release")` reading `keystore.properties`,
  `buildTypes.release.signingConfig = signingConfigs.getByName("release")`);
  re-run `bun tauri icon public/icons/icon-1024.png` to write Android mipmaps.
- `.gitignore` — add `src-tauri/target/`,
  `src-tauri/gen/android/keystore.properties`, `release/`.

**Verify**

1. `bun tauri info` → reports identifier `com.pokerpot.app` and Tauri 2.x.
2. `gh workflow run android-init.yml`, `gh run watch` → success; artifact
   contains `gen/android/app/build.gradle.kts`.
3. After committing: `grep -n "signingConfigs" src-tauri/gen/android/app/build.gradle.kts`
   → release config present; signing cannot be exercised locally (no SDK) —
   proven in T11.

---

## T11 — Keystore, CI/CD, changelog

**Depends:** T10.
**Commit:** `ci: add android release pipeline and pages deploy`

**Files**

- `scripts/collect-artifacts.ts` (new) — find the universal APK under
  `src-tauri/gen/android/app/build/outputs/apk/**`, copy to
  `release/poker.pot-<version>-android-universal.apk`, exit non-zero if none.
- `scripts/version-set.ts` (new) — `bun scripts/version-set.ts <x.y.z>` syncs
  `package.json`, `src-tauri/Cargo.toml`, and the `poker_pot` entry in
  `src-tauri/Cargo.lock`; no git tag. Add `"version:set"` script.
- `.github/workflows/ci.yml` — `workflow_call` plus `push`/`pull_request` on
  `main`: setup Bun, `bun install --frozen-lockfile`, lint, typecheck, test.
- `.github/workflows/pages.yml` — on `v*` tags + `workflow_dispatch`:
  checks, `VITE_BASE=/poker.pot/ bun run build`, configure-pages
  (`enablement: true`), upload `dist`, deploy.
- `.github/workflows/release.yml` — on `v*` tags + `workflow_dispatch`:
  checks → android job (setup Bun, Rust targets, JDK 17, NDK discovery from
  `ANDROID_HOME/ndk/*`, fail on tags when signing secrets are empty, write
  `keystore.properties` + decode `ANDROID_KEY_BASE64` per Tauri docs,
  `bun run android:apk`, collect artifacts, upload) → draft release via
  `softprops/action-gh-release` (`draft: true`, pre-release for `v0.*`).
- `CHANGELOG.md` (new) — Keep a Changelog, `## [0.1.0] - 2026-10-08` with the
  mobile release entry.

**Manual steps (user-assisted, exact commands)**

```bash
# 1. Generate the keystore locally (never in CI):
docker run --rm -v "$PWD/src-tauri:/out" eclipse-temurin:17 \
  keytool -genkey -v -keystore /out/poker.pot-upload.jks -storetype JKS \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
# 2. Move it out of the repo, back it up privately, then:
base64 -w0 poker.pot-upload.jks | gh secret set ANDROID_KEY_BASE64
gh secret set ANDROID_KEY_ALIAS --body upload
gh secret set ANDROID_KEY_PASSWORD
```

**Verify**

1. `gh workflow run release.yml` (dispatch) → android job succeeds; artifact
   contains `poker.pot-0.1.0-android-universal.apk`.
2. Signature check:
   `docker run --rm -v "$PWD:/w" eclipse-temurin:17 keytool -printcert -jarfile /w/release/poker.pot-0.1.0-android-universal.apk`
   → prints the `upload` certificate.
3. Install the APK on the Android phone: offline use, relaunch persistence,
   export/import through the real WebView (this is the spec's Android
   download-verification risk gate).
4. `gh workflow run pages.yml` → Pages deployment succeeds; open the URL in
   Safari on iPhone → Add to Home Screen → standalone offline launch.
5. Push tag `v0.1.0` only after 1-4 pass; the draft release appears.

---

## T12 — Documentation

**Depends:** T1–T11.
**Commit:** `docs: document the installable local-first app`

**Files**

- `README.md` — rewrite with the `readme` skill: what the app is, install
  (Android APK from Releases; iPhone/iPad via Pages → Add to Home Screen),
  data-on-device and backup guidance, dev commands (`bun run dev` Vite-only on
  7404, `bun start` static on 7403), tests, screenshots, release/versioning,
  project layout. Remove all server/data-dir/deployment references.
- `AGENTS.md` — ports table update (7403 static preview via `bun start`,
  7404 dev, 7407 transient), commands, release/keystore hard rules, note that
  data is on-device (no server).
- `CHANGELOG.md` — verify the 0.1.0 entry reads correctly.

**Verify**

1. Every command in the README runs as written on a clean checkout
   (`bun install`, `bun run dev`, `bun run build`, `bun start`, `bun run test`,
   `bun run typecheck`, `bun run lint`, `bun run screenshots`, `bun run icons`).
2. `grep -n "location.yaml\|data folder\|/api" README.md AGENTS.md` → no stale
   references.
3. `bun run test`, `bun run typecheck`, `bun run lint` → clean.

---

## Risks + rollback

- **Android WebView downloads (T4/T11):** exporting through the Tauri WebView
  is unproven. Gate it with the T11 device check. If broken, add
  `tauri-plugin-dialog` + `tauri-plugin-fs` and a capability, keep the web
  path for the PWA, and re-run T10's verification.
- **`gen/android` bootstrap (T10):** generated once via the `android-init`
  workflow artifact, then committed. If the workflow cannot init without a
  connected device or emulator, run `tauri android init` in a container with
  the Android SDK instead; the committed output is identical.
- **PWA virtual module in tests (T7):** `virtual:pwa-register/react` is
  mocked in `tests/ui.test.tsx`; if vitest still fails to resolve it, alias
  the module in `vite.config.ts` test settings.
- **Pages first deploy (T11):** requires one-time Settings → Pages → Source:
  GitHub Actions; `configure-pages` with `enablement: true` handles fresh
  setups when the token permits.
- **Keystore loss (T11):** losing the keystore blocks in-place APK updates
  forever. Keep two private backups; never commit it. If lost, users export,
  uninstall, install the new-signature APK, and re-import.
- **iOS storage eviction (T7/T4):** mitigated by `storage.persist()`,
  the backup nudge, and README guidance; irreducible residual risk on WebKit.
- **Rollback:** every task is one commit; `git revert` restores the previous
  state. The retired server and API tests remain in history. On-device data is
  never touched by code rollbacks; test devices should export before
  installing a reverted build.

## Self-review

| Spec item | Task(s) |
| --- | --- |
| Success 1 (installable PWA) | T6, T7 |
| Success 2 (signed APK, draft release) | T10, T11 |
| Success 3 (no server; domain client-side) | T1, T3, T8 |
| Success 4 (onboarding; no data dir) | T5, T8 |
| Success 5 (backup merge/replace/conflicts/validation) | T2, T4 |
| Success 6 (version, last backup, nudge) | T1, T4, T7 |
| Success 7 (update banner) | T7 |
| Success 8 (tests/typecheck/lint) | every task |
| Success 9 (screenshots) | T9 |
| Success 10 (ports 7403/7404/7407) | T8, T9 |
| Success 11 (docs) | T11, T12 |
| Risks + rollback | section above; device gates in T11 |

Names, interfaces, and error codes are consistent across tasks (Dexie schema
in T1 is what T4/T9 seed; `Store` methods used by T3/T4/T5 exist in T1;
`planMerge`/`applyResolutions` from T2 are what T4 consumes). No open
questions.
