# India for All

An independent, citizen-led public-interest research website exploring universal access to quality education from LKG through higher education and comprehensive medically necessary healthcare across India.

## Launch status

This is a **static research website prototype**, not an official government website. It is not a live national statistical reporting platform and does not yet have a database or automatic publication.

## Deploy on Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git.
2. Authorize GitHub and select repository **achyuth-chinna/-india-for-all**.
3. Select branch `main`.
4. Choose **None** or **no framework preset**.
5. Build command: **leave empty**.
6. Output directory: **/** (repository root), or follow Cloudflare's static HTML default if the UI allows no output directory.
7. Deploy. Confirm the generated `*.pages.dev` URL actually works.

If the setup UI requires an output directory other than `/`, use a build command `mkdir -p dist && cp index.html robots.txt dist/`, with output directory `dist`. (This only packages files; there is no application compilation.)

## SEO after receiving the public domain

- Set canonical URL, `og:url`, `robots.txt` sitemap reference and `sitemap.xml` to the actual deployed hostname.
- Verify site ownership in [Google Search Console](https://search.google.com/search-console/about), submit sitemap, and request indexing.
- Publish individual state and topic pages with verified sources, update dates, and reviewed translations.
- Search position is not guaranteed.

## Research/editorial rules

- Display each statistic's underlying reporting year, geographical coverage, source, and publication date.
- Never claim a real-time national death/crime count from annual reporting data.
- Distinguish audited irregularities, estimated inefficiency, and confirmed financial losses.
- Do not attribute all crime to educational attainment, or deaths to treatment cost without supporting research.
- Provide an impartial comparison of programme costs, trade-offs and impacts on vulnerable people.
- Verify existing historical headline figures with the original government reports before promoting them as fully audited.

## Current limitations

- English has the main text; some regional languages only have partial translations, with others falling back to English.
- State pages currently provide navigation rather than complete verified state-specific reports.
- No backend, authenticated user support, petition system, database or data pipeline is connected.
- ChatGPT scheduled research reports do not automatically publish to this repository.
- This project is not affiliated with the Government of India.
