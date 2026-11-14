# India for All — D1 database and reviewed publishing API

This backend is **committed but not deployed**. The existing static website is unchanged and remains live.

## One-time Cloudflare setup

1. In Cloudflare Dashboard → Storage & databases → D1, create a database named `india-for-all-research`.
2. Copy its **database ID** from Cloudflare.
3. Use a Cloudflare API token or Wrangler login locally with access to this account.
4. In this `backend` directory, copy `wrangler.example.jsonc` to `wrangler.jsonc` and replace `REPLACE_WITH_REAL_D1_DATABASE_ID`.
5. Install Wrangler using `npm install --save-dev wrangler` (or run via `npx wrangler`).
6. Apply the schema: `npx wrangler d1 execute india-for-all-research --remote --file=./schema.sql`.
7. Set a long, random admin secret: `npx wrangler secret put ADMIN_TOKEN`.
8. Deploy **from the backend directory**: `npx wrangler deploy`.
9. Copy the resulting API URL; do not assume it is the same hostname as the existing website.

**Do not configure the existing website's deploy command to point at this backend folder.** It is intentionally a separate Worker to avoid breaking the public site.

## Publishing workflow

- `POST /api/admin/research`: create a draft with a required official source, reporting period and evidence summary.
- `POST /api/admin/research/:id/submit`: mark draft as in review.
- `POST /api/admin/research/:id/publish`: publish only after human review; requires a JSON `note` explaining verification.
- `POST /api/admin/research/:id/reject`: reject.
- `GET /api/admin/research?status=in_review`: private review queue.
- `GET /api/research`: public endpoint; returns **published only**.
- `GET /api/health`: health check.

Admin calls require `Authorization: Bearer <ADMIN_TOKEN>`. **Never** put the admin token into public HTML, browser JavaScript, GitHub, or screenshots. Use a trusted server-side client (or curl locally). This initial API has one shared admin token, not separate submitter/reviewer identities. For production editorial teams, add authentication, roles and rate limiting.

### Example (from your own terminal, not browser developer console)

```bash
export API_BASE='https://YOUR-API-WORKER.workers.dev'
read -rs ADMIN_TOKEN
curl -X POST "$API_BASE/api/admin/research" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example draft — do not publish","summary":"Source and definitions must be checked","category":"education","region":"India","source_name":"Official report","source_url":"https://education.gov.in/","reporting_period":"2024–25"}'
```

## Daily research integration

The existing ChatGPT daily research automation produces reports but **cannot directly write to D1**. A future scheduled importer can create *drafts only*, with a distinct restricted service token and source validation; a human must approve publication. Never configure automatic publish for scraped or AI-generated claims.

## Security and data policy

- All public reads filter `status='published'`.
- Review actions append to an audit trail.
- Do not accept personal health stories, names, or sensitive personal data in this database.
- Restrict CORS and admin access before connecting a browser-based admin console.
- Back up D1 regularly and test restore; plan migrations and monitoring.
- The review token is shared and audit identity is generic `admin` until authenticated accounts are added.
