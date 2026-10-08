# House-style UI redesign — Design Spec

**Status:** Approved
**Date:** 2026-10-08

## Objective / why

Replace poker.pot's ad-hoc dark-only styling (single `global.css`, hardcoded
hex, heavy drop shadows) with the user's house design system: semantic OKLCH
tokens, Light / Dark / OLED themes, six switchable accents, house density and
component patterns, and a navigation shell with bottom tabs. The app must feel
intentional on a phone passed around a poker table and stay honest on desktop
without becoming a different product.

This spec is also the design note the `design` skill requires before UI code is
written: palette, themes, typeface, layout shell, and density are all recorded
here. `~/.config/opencode/skills/design/references/house-style.md` is the
normative source for palettes, the twelve Bans, and the accessibility floor;
where this spec and that reference disagree, the reference wins.

## Success criteria / definition of done

1. All screens and overlays (Sessions, Session, Match, Settings, Setup, all
   sheets, dialogs, numpad, pickers, history) render in Light, Dark, and OLED
   with no hardcoded color values in JSX or component CSS — only semantic
   tokens.
2. Six accents (blue default, teal, green, orange, rose, violet) switch at
   runtime from Settings → Appearance; the choice and theme persist in
   `localStorage`; first run follows `prefers-color-scheme`; OLED is opt-in;
   there is no light flash on load.
3. Bans 1–12 hold on every touched surface: no decorative gradients,
   glassmorphism, emoji chrome, stock art, marketing heroes, AI-SaaS look,
   heavy shadows, competing accents, raw hex in components, physical
   left/right CSS, decorative numbering, or multi-family type.
4. Accessibility floor passes in all themes: body text ≥ 4.5:1 contrast
   (automated test over all 18 accent × theme combinations), visible keyboard
   focus, ≥ 48px touch targets, semantic HTML with programmatic labels,
   meaning never by color alone, full keyboard operability including dialog
   focus traps and Escape-to-close.
5. House density and radii: 64px top bar and tab bar, 48px touch controls
   (40px desktop), 4px spacing steps, radii 6/8/12/16/full, safe-area insets
   handled by the shell.
6. Navigation is a bottom tab bar (Sessions, Settings) on root screens only;
   session and match screens keep back navigation and get full height.
7. Match screen has a sticky pot header, a scrollable player grid, a
   next-player highlight with scroll-into-view, and the others unchanged.
8. Sessions screen uses a floating action button for New session; with zero
   players it navigates to Settings instead of being disabled.
9. `bun run test`, `bun run typecheck`, and `bun run lint` pass; the committed
   `styles/tokens.css` is byte-identical to fresh generator output.
10. `bun run screenshots` regenerates the six README screenshots in Dark plus a
    three-image theme strip (Match screen in Light / Dark / OLED) using port
    7407; README and AGENTS.md reflect the new UI, scripts, ports, and Design
    record.
11. No behavioral change to the domain, server, API, or stored data; all
    existing tests remain green without weakening assertions.

## Scope

### In scope

- `src/client/` styling, layout, components, and screens.
- New token generator: `scripts/theme.ts` → `src/client/styles/tokens.css`.
- CSS reorganization into `styles/tokens.css` (generated), `styles/base.css`,
  `styles/components.css`.
- Theme/accent runtime, pre-paint script, inline SVG icon set, bottom tabs,
  FAB, sticky pot header, next-player highlight.
- Dialog/sheet accessibility hardening (semantics, focus trap, Escape, focus
  restore, labels).
- `index.html` (pre-paint script, meta theme-color), `public/manifest.webmanifest`
  (static colors), `scripts/screenshots.ts` (port 7407, theme strip).
- Tests: theme resolution/persistence, token generator invariants, contrast
  checks, updated UI smoke tests.
- Docs: README (screenshots, scripts), AGENTS.md (ports table, Design record,
  token generation note).

### Non-goals (explicitly out)

- No changes to `src/domain/`, `src/server/`, `src/shared/`, REST API, or
  on-disk data formats.
- No new betting features and no ledger behavior changes.
- No i18n/RTL work; English-only (logical CSS properties are still used, per
  Ban 10).
- No new runtime dependencies.
- No visual regression tooling.
- No desktop-specific alternative layouts beyond the centered column.
- No density setting or additional themes/accents beyond house defaults.

## Decision log

| # | Decision | Rationale | Status | Source |
| --- | --- | --- | --- | --- |
| D1 | Adopt the full house system, replacing the current dark-only design | Explicit user request to fit `/design`; incremental patching would leave two systems | decided | user |
| D2 | Every screen and overlay is in scope | One coherent system; partial restyles read as broken | decided | user |
| D3 | Desktop renders the app as a centered phone-width column (max 480px) | Honest to the single-phone use case; minimal work; intentional on wide screens | decided | user |
| D4 | Structural changes are allowed within the agreed list (D10) | User chose "open to structural changes" where they serve the house style | decided | user |
| D5 | Spec and implementation plan are committed under `docs/superpowers/` | Traceability; code stays untouched until both gates pass | decided | user |
| D6 | Bottom tab bar with Sessions and Settings roots; hidden on nested screens | Standard mobile pattern; preserves full height for the match grid | decided | user |
| D7 | Replace text glyphs with a hand-rolled inline SVG icon set | Ban 3 (emoji chrome); zero new dependencies; `currentColor` theming | decided | user |
| D8 | Keep the system-UI font stack | Native PWA feel, no font payload, one family (Ban 12) | decided | user |
| D9 | Light/Dark/OLED themes; first run follows OS; OLED opt-in; blue default; six accents; persisted per device | House default behavior | decided | user |
| D10 | Structural scope: sticky pot header, next-player highlight + scroll-into-view, Settings Appearance section; no history-to-table conversion | User selection from the offered list | decided | user |
| D11 | Generate tokens at build time into a committed stylesheet | Exact reproduction of house OKLCH formulas; no runtime math or flash | decided | user |
| D12 | Split CSS into tokens / base / components with vanilla classes | Keeps the repo's existing convention while staying navigable | decided | user |
| D13 | Regenerate six screenshots in Dark + one Light/Dark/OLED theme strip; update README and add the Design record | Documentation must show the new UI | decided | user |
| D14 | Keep tests green, update smoke tests, add theme unit tests and token/contrast invariants | Verifiable correctness without visual regression tooling | decided | user |
| D15 | Move the transient screenshot server to port 7407 | 7405 is allocated to drbm-admin in the dashboard registry | decided | user |
| D16 | Appearance changes apply and persist instantly; Save settings remains for players/rules only | Clear split between local preference and server config | decided | user |
| D17 | Full dialog accessibility: `role=dialog`, `aria-modal`, focus trap, Escape, focus restore, labels | Meets the accessibility floor honestly | decided | user |
| D18 | New session is a FAB; with zero players it opens Settings | User preference; removes a dead disabled control | decided | user |
| D19 | Manifest keeps static house Dark colors; runtime meta theme-color tracks the active theme | Manifest supports one static color; splash muted, live UI correct | decided | user |
| D20 | Non-goals fixed as listed in Scope | Scope control; protects ledger and API | decided | user |
| D21 | `localStorage` keys: `poker.pot:theme`, `poker.pot:accent` | Namespaced, greppable | decided | user |
| D22 | Viewport stays locked (`user-scalable=no`) | User preference for kiosk-like feel | decided | user |
| D23 | Column max-width 480px; top bar and tab bar 64px tall plus safe-area insets | House density scale; comfortable phone column | assumed | recommendation |
| D24 | Theme strip uses the live Match screen; files `theme-light.png`, `theme-dark.png`, `theme-oled.png`; README table row | Most representative live screen | assumed | recommendation |
| D25 | Theme chosen via segmented control; accents via six swatches labeled Blue/Teal/Green/Orange/Rose/Violet | House palette presentation | assumed | recommendation |
| D26 | No glows or drop shadows anywhere; separation via surface steps and outlines | Strict reading of Ban 7; the glow allowance is not required | assumed | recommendation |
| D27 | Focus trap is a hand-rolled hook shared by sheets and dialogs | No new dependency (D7 spirit) | assumed | recommendation |
| D28 | `useAppearance` hook backed by a tiny module-level store; inline pre-paint script applies stored values before first paint and runtime code updates `color-scheme` and meta theme-color | Meets the no-flash requirement; SSR-safe for smoke tests | assumed | recommendation |
| D29 | `bun run theme` runs the generator; `styles/tokens.css` is committed and never hand-edited | Reproducible tokens; follows the repo's generated-file rule | assumed | recommendation |
| D30 | Dark uses house `#1c1b1f`, not current true black; OLED is the true-black option | Deliberate visual change; OLED remains available for dark rooms | assumed | recommendation |
| D31 | Base screenshots use Dark + blue; the theme strip seeds `localStorage` for Light/OLED and the active accent | Deterministic, reviewable captures | assumed | recommendation |
| D32 | Add an `on-surface-variant` neutral role for secondary text, derived per accent/theme and contrast-verified ≥ 4.5:1 | House reference lacks a secondary-text token; muted copy must still meet the floor | assumed | recommendation |

## Architecture

### Token pipeline (build time)

- `scripts/theme.ts` implements the formulas in `house-style.md` exactly: OKLCH
  role generation per accent (six seeds) and theme (light, dark/OLED family),
  chroma-halving gamut clipping, secondary at chroma ×.28, tertiary at hue +60°
  and chroma ×.46, neutral roles re-hued with the active accent, fixed status
  colors, and the five-step container ladders (OLED ladder fixed).
- Output: `src/client/styles/tokens.css` with, for each of the 18
  combinations, a `:root[data-theme="…"][data-accent="…"]` block defining every
  semantic role: primary family (primary, on-primary, primary-container,
  on-primary-container, surface-tint, inverse-primary), secondary family,
  tertiary family, neutrals (background, on-surface, on-surface-variant,
  outline, container steps 1–5), status (profit, loss, warning), plus shared
  radius/spacing/type-scale variables and `color-scheme` per theme.
- A `:root` fallback block (blue/Light, plus a `prefers-color-scheme: dark`
  rule for no-attribute loads) keeps the app sane without JavaScript.
- The generator is deterministic; the file is committed and verified by test.

### Theme runtime (client)

- `src/client/theme.ts`: `Theme = "light" | "dark" | "oled"`,
  `Accent = "blue" | "teal" | "green" | "orange" | "rose" | "violet"`,
  `resolveFirstTheme(prefersDark)`, `readAppearance()`,
  `applyAppearance({ theme, accent })`, `useAppearance()` (module store +
  `useSyncExternalStore`).
- `applyAppearance` sets `document.documentElement.dataset.theme/accent`, the
  `color-scheme` style, and `meta[name="theme-color"]` (Light `#fffbfe`, Dark
  `#1c1b1f`, OLED `#000000`).
- Inline pre-paint script in `index.html` reads the two keys, falls back to
  `matchMedia("(prefers-color-scheme: dark)")`, and sets the attributes before
  the bundle loads.

### CSS and shell

- `styles/base.css`: reset and base type (closed scale 12/14/16/20/24/32),
  density and radius variables, `.app` shell (centered 480px column, safe-area
  padding), screen layout, focus-visible ring, reduced-motion block.
- `styles/components.css`: buttons (filled/tonal/text/danger), icon buttons,
  cards, pills, inputs, choice buttons, numpad, sheets, dialogs, stat rows,
  player grid, history rows, bottom tabs, FAB, empty/error states.
- `src/client/components/icons.tsx`: inline SVG components (`IconBack`,
  `IconClose`, `IconGear`, `IconList`, `IconHistory`, `IconCheck`, `IconPlus`,
  `IconChevron`, `IconTrash`) at a consistent 24px grid using `currentColor`.
- `src/client/components/ui.tsx`: `Button`, `IconButton`, `Screen`, `TopBar`,
  `Card`, `Pill`, `StatRow`, `Center`, plus new `BottomTabs` and `Fab`.
- App shell renders nav via route awareness: tabs only on `/` and `/settings`;
  nested routes render back navigation.

### Screen changes

- **Sessions:** top bar without gear (Settings is a tab), session cards on
  surface steps, FAB bottom-right above tabs; zero players → FAB routes to
  Settings.
- **Session:** standings card, match cards, bottom action stack restyled.
- **Match:** sticky pot/round card; player grid scrolls in its own region;
  first player to act highlighted and scrolled into view; bottom CTA pinned.
- **Settings:** sections Players, Rules, Appearance (segmented theme control +
  six accent swatches, instant apply).
- **Setup:** restyled to the same system, no tabs.
- **Sheets/dialogs:** shared `Sheet` shell with header, close, `role="dialog"`,
  `aria-modal`, focus trap, Escape close, focus restoration.
- **ActionSheet / numpad:** restyled; same options and ledger behavior.

### Tests and docs

- `tests/theme.test.ts`: generator reproducibility (fresh output equals
  committed file), documented primaries for the blue seed (`#7daeec`, `#35639c`,
  …), every one of the 18 combinations defines every role, and WCAG contrast
  ≥ 4.5:1 for each text/background role pair used for body copy.
- `tests/ui.test.tsx`: smoke tests updated for the shell/components; SSR-safe
  (no `document` at import time).
- `scripts/screenshots.ts`: default port 7407; captures the six Dark
  screenshots and the three theme-strip images by seeding `localStorage` and
  `colorScheme`.
- README: new screenshots section, theme description, `bun run theme` added to
  scripts. AGENTS.md: ports table updated to 7407, Design record added, token
  generation noted.

## Risks + rollback

- **Generator drift from the house reference.** Mitigation: pinned documented
  primaries and contrast tests; the reference stays the normative source.
- **Theme flash on load.** Mitigation: inline pre-paint script; manual check by
  capturing screenshots and reloading in each theme.
- **Light-theme contrast regressions** on status colors and accent containers.
  Mitigation: automated contrast test across all 18 combinations.
- **Focus-trap regressions** in sheets. Mitigation: a single shared hook, smoke
  coverage, manual keyboard pass per screen.
- **Layout regressions on small phones** due to tabs + FAB. Mitigation:
  Pixel-7-based screenshot set plus a narrower viewport spot check.
- **Rollback:** the work is presentation-only; revert the branch. No data
  migration exists, and leftover `localStorage` keys are inert.

## Dependencies / ordering

- Token generator before base/components CSS (values must exist to reference).
- CSS and icon set before screen/component refactors.
- Focus-trap hook before sheet/dialog changes.
- Test updates alongside each area; docs last; screenshots require a build.
- No external dependencies are added.

## Open questions

None.
