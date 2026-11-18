# India for All research backend

The API and D1 database are deployed independently of the public static website.

## Daily research intake

The existing India Public Impact Research task runs each morning around 08:00 Asia/Kolkata. It researches original public sources and uses connected GitHub tools to update `backend/intake/research.json` on main. The file is public: include research candidates only, never personal information or credentials. If GitHub tools are unavailable during a scheduled run, the task must report that intake was not updated.

The API Worker runs `17 * * * *` (UTC), hourly at minute 17. Its scheduled handler fetches the intake file from the fixed GitHub URL, validates the whole batch (maximum 50 items), and inserts only unpublished drafts. The identity is a hash of source URL, reporting period, region and title. Repeated runs skip existing identities, never reset editorial decisions, and append an audit event only for a new insertion. Changed titles or URLs can create a new candidate; editors must still check semantic duplicates. Removing a candidate from GitHub does not remove its database record.

Each candidate requires title, summary, category, region, source_name, source_url and reporting_period. Include evidence_note with source table/page and limitations. Optional string fields are source_published_on, metric_value and metric_unit. Category: education, healthcare, public_spending, crime, other. Read source documents before adding claims. Do not include status or review fields; importer ignores them and forces draft status.

The importer has no public write endpoint and requires no ADMIN_TOKEN. Only existing GitHub repository writers can change the fixed intake file. Source quality is checked by researchers and editors; structural validation does not establish factual accuracy.

## Editorial workflow

Open `/admin` on the research API Worker and use the existing secret privately. Select Drafts to see imported candidates. Submit a candidate for review, inspect its original source, then publish with a verification note or reject. The public `/api/research` returns published records only. Public website JavaScript must never contain the token. Cloudflare Access has not been configured.

Admin routes require Bearer authorization: GET/POST `/api/admin/research`, POST `/api/admin/research/:id/submit`, `/publish`, or `/reject`. `/api/health` checks Worker configuration; `/api/research` queries D1. Health alone does not establish database health.

## Operations

Git pushes to main trigger automatic builds for both Workers. The backend root is `backend`; keep the static site's configuration separate. D1 binding DB points to india-for-all-research. ADMIN_TOKEN remains a Cloudflare secret. Intake logs report candidates/imported counts without payloads or credentials. Check scheduled invocation logs for failures; never claim ingestion succeeded from a Git commit alone. No automatic publication is permitted.

## Automatic reviewed publication

The hourly Worker cron imports candidates, then applies `backend/intake/approved.json`.
Each approval holds the entire reviewed item snapshot, source-check note, review date,
and `automated-source-review` attribution. Only exact matching draft/in-review records
are published; rejected records and changed content are never automatically approved.
Publication and its review event use a D1 batch. ADMIN_TOKEN is neither required nor
stored in the public manifest. This is automated source review, not a claim of human
or independent professional review.

The research automation must check original sources and all seven translations before
committing an approval. Unverifiable candidates stay unapproved. New approved snapshots
are picked up on the next hourly cron without deploying the website again. The Worker
must first be deployed with `publication.js`. Publication is confirmed only when the
public `/api/research` endpoint returns the records; a GitHub commit alone is insufficient.
