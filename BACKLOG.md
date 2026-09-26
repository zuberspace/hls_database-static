# Backlog

Known issues and deferred work. Not user-visible; nothing here blocks the site.

## Reference data

- **[59]** is only a fragment: `Condensation of disilicic acid to cristobalite`
  (no authors, journal, year, pages).
- **[60]** is broken: `M. E. Leonowicz,4.` — looks truncated/merged.
- Both defects are present in the upstream Django dump (`textblocks.menu`), so they
  were imported, not introduced here. They can only be fixed with the original
  publication details, which are not available.
- [14] and [58] both cite MCM-22 but are different papers (Science 1994 vs.
  Science 2000) — not a duplicate, leave as is.

## Deferred optimisation

- Layer-type and structure images are served as-is (200–394 kB each PNG/JPG).
  Candidate for resize + WebP/AVIF.
- `data/index.json` is one 192 kB file holding materials, references and the peak
  table; the home page uses only part of it. Could be split per view.
- gzip only, no Brotli; `Cache-Control: max-age=600` on all assets even for
  `?rev=<build>` URLs. Both are GitHub Pages limitations (see below).

## Hosting note

GitHub Pages does not let the origin set Brotli or security headers, and fixes the
cache TTL. Putting Cloudflare (free tier) in front of the custom domain would add
Brotli, long-lived immutable caching for `?rev=` assets, and HSTS/CSP/etc. Only
worth it if those matter.
