# EditPDF

**Live:** https://reda-ghafla.github.io/test/

A private, browser-only PDF editor. Files are opened and edited entirely on your
device: there is no backend, and nothing is uploaded.

Built with React, Vite, TypeScript, Tailwind CSS, [pdf.js](https://github.com/mozilla/pdf.js)
(rendering) and [pdf-lib](https://pdf-lib.js.org/) (writing the edited PDF).

## Status

| # | Feature | Status |
|---|---------|--------|
| 1 | Landing page with drag-and-drop upload (PDF only, max 50 MB) | ✅ |
| 2 | Editor: render all pages, zoom, thumbnail sidebar | ✅ |
| 3 | Toolbar tools (text, white-out, highlight, draw, shapes, image, signature, date, check) | ⏳ next |
| 4 | Page tools (rotate, delete, reorder, blank page, merge) | ⏳ |
| 5 | Undo / redo, clear page | ⏳ |
| 6 | Download edited PDF | ⏳ |
| 7 | Fill AcroForm fields | ⏳ |

## Run locally

You need Node.js 20 or newer.

```bash
cd editpdf
npm install
npm run dev
```

Then open http://localhost:5173 and drop a PDF onto the page.

Other scripts:

```bash
npm run build      # type-check, then build a production bundle into dist/
npm run preview    # serve the production build at http://localhost:4173
npm run typecheck  # type-check only
```

### Editor shortcuts

- `Ctrl/Cmd +` and `Ctrl/Cmd -` zoom in and out. `Ctrl/Cmd 0` fits the page to the window width.
- `Ctrl/Cmd` + mouse wheel (or a trackpad pinch) zooms.
- Click the zoom percentage to fit the page to the window width.
- Click a thumbnail to jump to that page.

## Project structure

```
src/
  App.tsx                 opens the file, holds the document, warns before a refresh
  components/
    Landing.tsx           landing page
    UploadZone.tsx        drag-and-drop / file picker with validation
    Editor.tsx            editor layout, zoom, current-page tracking
    Toolbar.tsx           top bar (zoom controls; editing tools come next)
    PageCanvas.tsx        renders one page, only once it scrolls near the view
    Thumbnails.tsx        page thumbnail sidebar
    Logo.tsx              EditPDF wordmark
  lib/
    pdfjs.ts              pdf.js setup (bundled worker) and loader
    types.ts              editor document model (sources + page references)
    useRenderPage.ts      hook that renders a page to a high-DPI canvas
    useInView.ts          IntersectionObserver hook for lazy rendering
```

Pages are stored as references (`sourceId` + `sourceIndex` + `rotation`) into the
loaded PDFs. Reordering, deleting and merging can then work without touching the
original bytes, which pdf-lib reads at export time.

## Deploy

The build is a static site in `dist/`, so it can be hosted anywhere.

### Vercel

1. Push the repository to GitHub, then choose **Add New → Project** in Vercel and import it.
2. Set **Root Directory** to `editpdf`.
3. Vercel detects Vite automatically: the build command is `npm run build` and the output directory is `dist`.
4. Click **Deploy**.

Or deploy from the CLI:

```bash
cd editpdf
npx vercel        # preview deploy
npx vercel --prod # production deploy
```

### GitHub Pages

GitHub Pages serves the site from `https://<user>.github.io/<repo>/`, so the build
needs that sub-path as its base URL. Set it with `VITE_BASE`.

**Option A: GitHub Actions (recommended).** This repository already includes
`.github/workflows/deploy-editpdf.yml`. To use it:

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `master` (the default branch), or start the workflow from the **Actions** tab.

The workflow builds with `VITE_BASE=/<repo>/` and publishes `editpdf/dist`.

**Option B: manual, using the `gh-pages` branch.**

```bash
cd editpdf
VITE_BASE=/<repo>/ npm run build
npx gh-pages -d dist
```

Then set **Settings → Pages → Source** to the `gh-pages` branch.

## Privacy

The PDF is read with the browser's File API and handled in memory by pdf.js and
pdf-lib, which run in your tab (pdf.js uses a Web Worker that is bundled with the
app). There is no network request that carries the document, no analytics and no
storage. Closing or refreshing the tab discards everything, and the app asks you
to confirm before that happens.
