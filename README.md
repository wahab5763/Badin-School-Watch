# Badin School Watch v3

A runnable Vite + React + Express project with:

- cinematic landing page
- operational dashboard route
- filters, maps, charts, icons, and priority tables
- mock dataset generated from your `school_data.csv`
- live API adapter shaped from your attached scraper reference for attendance, census, enrollment, and textbooks

The live adapter is based on the endpoint flow in your attached API scripts and the school lookup CSV. fileciteturn1file0

## What is included

- **Landing page**: public overview and CTA into the dashboard
- **Dashboard**: attendance, census, enrollment, textbook, risk, and district insights
- **Live mode**: server can fetch from the MNE endpoints when your headers/network are available
- **Mock mode**: immediately usable offline with realistic seeded data for all 1,429 schools from `school_data.csv`
- **Academic year support**: configurable date window via `.env`

## Run locally

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and the API server runs on `http://localhost:8787`.

## Live API setup

1. Copy `.env.example` to `.env`
2. Paste your working API headers into `MNE_API_HEADERS_JSON`
3. Keep `school_data.csv` in the project root, or change `SCHOOL_DATA_PATH`
4. Build a live cache:

```bash
npm run sync:live
```

Then open the dashboard and switch the source to **Live cache**.

## Notes about live fetching

- The provided scraper reference shows the endpoint sequence, but it does not include the concrete `header` values from `MneDict`, so this project exposes them through environment variables instead.
- The dashboard defaults to **Auto** mode, which uses live cache when available and otherwise falls back to the seeded dataset.
- Full live sync can take time because it iterates over all schools and multiple endpoint calls.

## Project structure

```text
src/               React app
server/            Express API + live/mock data adapters
public/            static assets
school_data.csv    school id / name / semis reference
```


## Install fix for local machines

This package intentionally does **not** include a lockfile, so npm will resolve packages from the public npm registry.

### Run locally

```bash
npm install
npm run dev
```

### If you still see registry/proxy errors

```bash
npm config set registry https://registry.npmjs.org/
rm -rf node_modules package-lock.json
npm install
```

On Windows PowerShell, use:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm config set registry https://registry.npmjs.org/
npm install
```
