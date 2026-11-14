# Public issue posts and family examples

Apply backend/schema-posts.sql after schema-community.sql before deploying. Public text and HTTPS media-link posts require explicit consent and administrator approval. External media is opened only on visitor choice; it is not fetched by the server. Approved posts use existing nested discussions. Admin can publish posts or permanently erase post content and its discussion; individual comment erasure includes descendants. Copies held by other visitors cannot be recalled.

Direct uploads are prepared but disabled without an R2 MEDIA binding. Cloudflare R2 subscription is not activated; accepting its usage-based subscription and terms requires the account owner. No billing change was made. After activation create a private bucket and bind MEDIA; verify image/video streaming and storage quotas before enabling uploads. Local post tests cover the disabled-upload path, not live R2 streaming.

families.html contains fixed illustrative lower/higher lifetime examples, not minimum/maximum prices or a personalized calculator. School inputs reference survey averages; other costs are explicit assumptions. Constant rupees, assumed 80-year horizon, exclusions and public-funding limitations are visible. Tax examples state the applicable regime and assumptions.

Run node backend/tests/community.test.mjs, node backend/tests/posts.test.mjs and node backend/tests/family-math.mjs. Simulated tests do not establish real Cloudflare capacity or guaranteed uptime.
