# EditPDF

**Live:** https://reda-ghafla.github.io/test/

A private, browser-only PDF editor. Files are opened and edited entirely on your
device: there is no backend, and nothing is uploaded.

Built with React, Vite, TypeScript, Tailwind CSS, [pdf.js](https://github.com/mozilla/pdf.js)
(rendering) and [pdf-lib](https://pdf-lib.js.org/) (writing the edited PDF).

## Features

- **Open:** drag and drop a PDF (up to 50 MB). Nothing is uploaded.
- **View:** all pages render sharply, with zoom (buttons, `Ctrl +/-/0`, `Ctrl` + wheel) and a page thumbnail panel.
- **Edit existing text:** choose **Edit text** and click any words in the PDF. An editable box opens over them with
  the same size, colour, boldness/italics and background, and the original is hidden. Clear the box to delete the words.
  Replacement text is stretched to match the width of the original font.
- **Find & replace:** search every page (match case / whole words) and replace all matches in one step.
- **Add and edit:** every object can be moved, resized and deleted.
  - Text: Sans, Serif or Mono, with size, colour and bold. Double-click (or tap a selected text box) to edit it.
  - White-out boxes to cover existing text, then type new text on top.
  - Highlight, freehand pen (colour and thickness), rectangle, line and arrow.
  - PNG/JPG images.
  - Signature: draw it with mouse or finger, or type your name in one of three script fonts.
  - Date stamp and checkmark.
- **Page tools:** rotate, delete, drag thumbnails to reorder, insert a blank page, merge another PDF.
- **Undo/redo** (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`) and **Clear page**.
- **Forms:** fill in existing text fields, checkboxes, radio buttons and dropdowns.
- **Download PDF:** everything is written into the original file as `<name>-edited.pdf`. Form fields stay fillable.
- **Mobile:** touch drawing and signing, plus a bottom toolbar on phones.

### Known limitations

- Added text uses the standard PDF fonts (Helvetica, Times, Courier), which only cover Latin characters.
  Other characters (for example Arabic or emoji) are replaced with `?` in the downloaded file.
- Edited text is drawn in the closest standard font (sans, serif or mono), not the PDF's own embedded font, so it can look
  slightly different from the text around it. Scanned pages (pictures of text) have no editable text: use White-out + Add text.
- Only horizontal text can be edited in place.
- Password-protected PDFs can't be opened.
- Form fields in a *merged* PDF are flattened (their values are drawn onto the page).

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

### Shortcuts

| Keys | Action |
|------|--------|
| `Ctrl/Cmd Z` | Undo |
| `Ctrl/Cmd Y` or `Ctrl/Cmd Shift Z` | Redo |
| `Delete` / `Backspace` | Delete the selected object |
| `Esc` | Deselect and go back to the Select tool |
| `Ctrl/Cmd +` / `-` / `0` | Zoom in / out / fit width |
| `Ctrl/Cmd` + wheel | Zoom |
| `Ctrl/Cmd Enter` or `Esc` | Finish editing a text box |

## Project structure

```
src/
  App.tsx                   opens the file, warns before a refresh loses work
  components/
    Landing.tsx, UploadZone.tsx   landing page and drag-and-drop upload
    Editor.tsx              editor state: undo history, tools, page operations, download
    TopBar.tsx              file name, zoom, Download PDF
    Toolbar.tsx             editing tools, undo/redo, clear page
    PropertiesBar.tsx       font, size, colour and thickness for the current tool or selection
    PageCanvas.tsx          one page: pdf.js canvas, form layer and object layer
    ObjectLayer.tsx         creates objects from clicks and drags on a page
    ObjectView.tsx          one object: select, move, resize, edit text, delete
    ObjectContent.tsx       draws an object (kept identical to the PDF output)
    FormLayer.tsx           HTML inputs over the PDF's AcroForm fields
    TextEditLayer.tsx       "Edit text" mode: clickable boxes over existing text
    FindReplaceModal.tsx    find and replace across the document
    Thumbnails.tsx          page panel: thumbnails, reorder, rotate, delete, blank page, merge
    SignatureModal.tsx      draw or type a signature
  lib/
    exportPdf.ts            writes the edited PDF with pdf-lib
    geometry.ts             matrices for rotation and coordinate conversion
    objects.ts              object types, text measuring, shared drawing helpers
    history.ts              undo/redo
    sources.ts              loading PDFs, blank pages
    textRuns.ts             reads existing text lines with pdf.js, detects font/size/colour/background
    replaceText.ts          turns a text line into an editable replacement box
    types.ts, pdfjs.ts, useRenderPage.ts, useInView.ts
```

### How coordinates work

Objects are stored in **display space**: PDF points at zoom 1, measured from the top-left
of the page as it is shown, including rotation. The screen only multiplies by the zoom
level. On export, `objectMatrix()` in `exportPdf.ts` builds one transform per object:

1. the object's local frame (y up)
2. its own rotation (objects turn with their page when you rotate it)
3. its position on the displayed page
4. undo the page rotation (the file's `/Rotate` plus any rotation you added)
5. flip into PDF user space (y up), offset by the crop box origin

pdf-lib then draws the object inside that transform. The result lines up exactly with
what you saw, on rotated pages and pages with an offset crop box too.

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
