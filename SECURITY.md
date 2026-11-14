# Community launch checks — 14 November 2026

The community feature is a browser-based opinion poll, not a verified electoral system. Signed browser sessions prevent direct impersonation, but new browsers, cleared storage and distributed clients can create additional identities. Public names and cities are self-reported and opt-in.

## Implemented controls

- Cloudflare edge rate limits: public reads, writes, session creation, and failed admin authentication have separate buckets. Counters are approximate and local to each Cloudflare location, not a global DDoS guarantee. Shared networks may encounter throttling.
- Admin endpoints retain the existing private ADMIN_TOKEN. Ten failed attempts per minute per hashed network identity are allowed at an edge location; later invalid attempts return 429. Correct credentials are not locked out by other clients' failures. No administrator secret is shipped to the public website.
- Signed 180-day participation tokens, strict origin checks on public writes, small streamed request bodies, input length/type checks, prepared SQL, foreign keys, depth-limited threads and paginated reads.
- SQL triggers update vote/reaction totals transactionally when choices change or are withdrawn. Repeating a vote does not add another vote for the same session.
- Public text is rendered with textContent, never HTML. User names, cities and comments are displayed as authored and excluded from automatic translation. Reports and authenticated hide/restore moderation are provided.
- Public read caching (15 seconds at the edge), normalized cache keys, and hidden-tab polling suppression reduce database load. Static pages remain independent of the community API and show a graceful error when it is unavailable.
- Public scripts are externalized and protected by a same-origin script CSP. Admin script responses use per-response nonces. Anti-framing, MIME-sniffing, referrer, HSTS and browser-permission headers are configured.
- Optional analytics records daily pseudonymous browser keys, broad Cloudflare region/country, device category and allowlisted page paths. No raw IP, precise location, names or full user-agent are stored in analytics. Opt-out stops heartbeats and deletes the current browser's retained visitor rows. Aggregate page totals remain. Scheduled retention removes visitor rows and daily page totals after 30 days.

## Validation performed

Run `node backend/tests/community.test.mjs` using Node 24 or later. Tests use an isolated in-memory SQLite database and test-only credentials. They cover consent, auth/origin checks, forged sessions, vote updates/withdrawals, reactions, nested-depth enforcement, moderation, private analytics, deletion ownership, SQL-injection input, oversized bodies, malformed choices, cache-key normalization, rate-limit responses, 2,000 simulated simultaneous sessions and 50 simulated failed admin logins. This is a functional/concurrency exercise, not a Cloudflare capacity benchmark or independent penetration-test certification.

Production checks are bounded and read-only for community participation: deployment, API stats, empty/public thread reads, unauthenticated admin rejection, UI rendering, translations and browser console errors. Do not flood production or third-party services and do not fabricate public participation.

## Capacity and operational limits

No deployment can promise unlimited traffic or zero downtime. Workers Free and D1 Free have daily request/read/write quotas; exceeding them can disable dynamic functionality until reset. Database writes and analytics heartbeats consume quota, including index writes. Move to appropriate paid capacity before a major launch, configure spend/usage alerts, observe D1 latency/error rates and 429/5xx rates, and consider queued analytics or database sharding for sustained heavy writes. Do not silently incur charges.

There is no CAPTCHA/Turnstile verification or authenticated one-person identity at this stage. Rate limiting reduces abuse but cannot stop distributed vote manipulation or all spam. Comments publish immediately after consent; moderation is reactive, not an automated safety guarantee. Moderation retains hidden comments unless their author erases the text. Public copies and cached text may persist briefly.

Visitor counts represent consenting browser activity, not all people; active means seen in the past five minutes. Owner statistics refresh every 30 seconds and use UTC daily boundaries. Geographic data is approximate. Platform outage, network failure, quota exhaustion and large attacks remain possible. Test backups and recovery procedures before treating this as a critical service.

## Post-deployment checks and follow-up fixes

The public homepage returned HTTP 200 with CSP, anti-framing, nosniff, HSTS and permissions headers. Public community counters and empty thread/profile lists rendered successfully in the connected browser with no console errors. The private admin panel rendered and rejected invalid credentials. A bounded five-click invalid-login exercise (multiple protected reads per click) reached the failed-login throttle; no real secret was read or exposed. Command-line urllib probes were blocked by a 403 before their planned checks completed; browser observations, not those probes, establish API availability.

Additional fixes make comment cooldown enforcement atomic, reject late analytics heartbeats after opt-out until explicit re-consent, and prevent in-flight admin results from repopulating the page after token clearing. Tests include ten simultaneous same-session comment attempts (one insertion, nine throttled) and opt-out/re-consent races. Live authenticated owner analytics were not inspected without a user-entered token; positive analytics authorization was tested in the isolated environment.
