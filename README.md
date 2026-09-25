# Hydrous Layer Silicates (HLS) Database — static site

Read-only public website for the HLS crystallography database, served as a static
site from GitHub Pages. There is no backend, no database and no Django here: the
data under `static_site/data/` is prebuilt and committed, and the frontend is a
dependency-free single-page app.

This repository is public. The private authoring repository (Django admin, source
of truth) is separate and is not part of this one.

## Structure

- `static_site/app/` — frontend: `index.html`, `assets/app.js`, `assets/app.css`, `404.html`
- `static_site/data/` — generated JSON (materials, layer types, references, textblocks)
- `static_site/tailwind.css` — Tailwind source; compiled into `app/assets/tailwind.css`
- `static_site/build_site.py` — assembles the deployable bundle into `static_site/site/`
- `mediafiles/` — only the media files referenced by the data (CIFs, plots, layer-type images)
- `staticfiles/database/jsmol/` — JSmol assets for the 3D structure viewer
- `.github/workflows/deploy-static-site.yml` — builds and publishes to GitHub Pages

## Local build

```bash
npm ci
npm run build:css
python static_site/build_site.py --output static_site/site --data static_site/data
python -m http.server --directory static_site/site
```

Then open `http://localhost:8000`. Do not open `static_site/app/index.html` via
`file://` — the app requires HTTP.

The CSS build must run before `build_site.py`, because the latter copies
`static_site/app/assets/` wholesale into the bundle.

## Deploy

Pushes to `main` trigger the GitHub Actions workflow, which builds the bundle and
publishes `static_site/site/` as the Pages artifact. In the repository settings,
**Pages → Build and deployment → Source** must be set to **GitHub Actions**.

Custom domain and HTTPS are configured in **Settings → Pages**. Do not put an
`index.html` or other site files in the repository root: Pages must deploy from
the Actions artifact, not from the branch root.

## Updating the data

This repository is a snapshot and has no generator for the raw database. To update
it, regenerate `static_site/data/` (and, if relevant, the referenced `mediafiles/`)
in the private authoring repository and copy the result here. Nothing else needs
to run.
