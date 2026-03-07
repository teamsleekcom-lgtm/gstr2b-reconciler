# GSTR-2B Reconciliation Tool (Browser Edition)

A 100% client-side web application that automates the monthly reconciliation between Books of Accounts (Tally `.xls` export) and Government GSTR-2B (`.xlsx` download).

## Architecture

* **Frontend Framework:** React + Vite + Tailwind CSS
* **Matching Engine:** Pure JavaScript (`fuzzball` for fuzzy string matching)
* **Excel Parsing/Generation:** `xlsx` and `exceljs`

This tool runs entirely in your browser tab. **No data ever leaves your device.** There is no server, no database, and zero cloud API calls.

## How to Test Locally

1. Make sure you have Node.js 18+ installed.
2. Open terminal in the `frontend` folder:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

## Cloud Deployment (Zero Cost)

Because this tool is completely static (HTML/JS/CSS), you can host it anywhere for free:

### Vercel
Simply import this repository into Vercel and it will automatically detect the Vite builder.

### GitHub Pages
1. Change the `base` in `vite.config.js` if necessary.
2. Run `npm run build` inside `frontend`.
3. Push the `dist` folder to your `gh-pages` branch.
