# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SurfSesh is a personal PWA for Noosa surf conditions, break scoring, and session logging. Deployed at `https://scottqld.github.io/surf-sesh/` (GitHub Pages) with a Cloudflare Worker backend at `https://surf-worker.scottsurf.workers.dev`.

## Commands

### Preview (local dev)
Use the **surfsesh** server in `.claude/launch.json` — this runs `npx live-server --port=3001 --no-browser .` from the repo root. The app serves from `http://127.0.0.1:3001/`. The SW and manifest reference `/surf-sesh/` paths which 404 locally — this is expected and doesn't affect development.

### Publish app
```bash
git add index.html
git commit -m "..."
git push    # triggers GitHub Pages auto-deploy
```

### Cloudflare Worker (from `worker/` directory)
```bash
npm run dev       # local wrangler dev server
npm run deploy    # deploy to surf-worker.scottsurf.workers.dev
npm test          # vitest
```

## Architecture

### Single-file frontend (`index.html`)
The entire frontend — CSS, HTML, JavaScript — lives in one ~4200-line file. There is no build step; edit and push.

**Key globals:**
- `BREAKS[]` — array of 7 break objects (The Groyne, First Point, Nationals, Tea Tree, Granite Bay, Sunshine Beach, Double Island). Each has scoring parameters: `idealDirs`, `acceptableDirs`, `avoidDirs`, `exposure`, `tidalBias`, `notes`, `photo`, `camUrl`.
- `currentBreak` — integer index into `BREAKS[]`, updated by `setBreak(index)`
- `cachedData` — last successful `/all` response: `{ forecast, tides, swell, buoy, wind }`
- `currentTab` — `'conditions'` | `'planner'` | `'log'`

**Core functions:**
- `loadData(forceRefresh)` — fetches from worker `/all`, populates `cachedData`, calls `renderAll()`
- `renderAll(data)` — top-level render; enriches `cachedData.forecast` with parsed values (`_period`, `_tide`, `_swellDir`, `_periodByDay`, etc.), then calls all section renderers
- `setBreak(index)` — updates `currentBreak`, re-renders break-dependent UI using `cachedData` (no network call)
- `switchTab(tab)` — shows/hides `.tab-section` divs, updates nav active state
- `scoreBreak(breakData, forecast, isCurrent)` → 0–10 — core scoring engine; evaluates swell direction, height, period, wind, and tide against break-specific parameters
- `scoreColor(s)` / `scoreLabel(s)` — convert score to CSS color or text label
- `getBrisbaneNow(offsetDays)` — returns a Date at Brisbane time (UTC+10). Always use this for day-relative logic; never use `new Date()` directly for date calculations
- `buildSparklineHTML(forecast, highlightFirst)` — 7-day score bar chart for the selected break
- `renderPlannerBreakRow(forecast)` — per-day score row on Planner tab
- `renderSessionLog()` — past sessions filtered by `BREAKS[currentBreak].name`
- `renderCalibration()` — algo accuracy per break, current break sorted first
- `generateAiSummary(breakData, forecast, score)` — calls worker `/ai` → Anthropic claude-haiku for a one-line surf read

**Tab structure:** Three tabs — `conditions`, `planner`, `log` — each with a `.tab-section` div toggled by `switchTab()`. The break photo, break selector, and live cam button are in the global layout (always visible across all tabs). The score badge on the photo is only shown on the conditions tab.

**Session storage:** Sessions live in `localStorage`. `getSessions()` reads, `commitLogSession()` writes. Each record: `{ break, score, tod, notes, timestamp }`.

**Night mode:** Between ~9pm–4am Brisbane time, `loadNightMode()` runs instead of `loadData()` — shows a static banner without making API calls.

### Cloudflare Worker (`worker/src/index.js`)
Aggregates multiple data sources and serves them via a single `/all` endpoint. All responses are edge-cached for 30 minutes (`CACHE_TTL = 1800`). Append `?nocache` to bypass.

**Endpoints:**
- `GET /all` — parallel fetch of all sources: BOM forecast + Noosa/Mooloolaba tides + Open-Meteo swell + QLD DES wave buoy + BOM wind obs
- `GET /forecast` — BOM Sunshine Coast Waters marine forecast (HTML scrape)
- `GET /tides?station=noosa|mooloolaba` — MSQ tide gauge CSV
- `GET /swell` — Open-Meteo ECMWF WAM marine model (7-day hourly)
- `POST /ai` — proxies to Anthropic API using `ANTHROPIC_API_KEY` worker secret

**Data sources:**
- BOM scrape: `sunshine-coast-waters.shtml` → winds/seas/swell/weather per day
- BOM obs: `IDQ60801.94570.json` (Tewantin AWS, 10-min wind updates)
- MSQ: QLD Gov tide CSV for Noosa Head and Mooloolaba
- Open-Meteo: ECMWF WAM (wave height/direction/period, SST)
- QLD DES: wave buoy CSV from Mooloolaba / Caloundra

### Deployment
- **App:** `git push` → GitHub Pages deploys from `main`. Live at `https://scottqld.github.io/surf-sesh/`.
- **Worker:** `cd worker && npm run deploy`. The `ANTHROPIC_API_KEY` secret is set in Cloudflare — do not commit it.

### Service Worker (`sw.js`)
- App shell (`/surf-sesh/`): cache-first, background revalidate
- API responses: network-first, cache fallback
- Offline: serves stale cache and posts `{ type: 'STALE_DATA' }` to the page

---

## Coding Guidelines

**Think before coding.** State assumptions explicitly. If multiple interpretations exist, surface them rather than picking silently. If something is unclear, ask before implementing.

**Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no unrequested features. If a solution could be 50 lines instead of 200, write 50.

**Surgical changes.** Touch only what the request requires. Match existing style. Don't "improve" adjacent code. If your changes orphan an import or variable, remove it — but don't clean up pre-existing dead code unless asked.

**Verify before reporting done.** For UI changes, check the preview. For data changes, trace through `renderAll` → `setBreak` to confirm downstream renderers see the new shape.
