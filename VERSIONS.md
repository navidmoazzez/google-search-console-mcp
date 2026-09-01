# Versions

| Component | Version | Checked |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | 2026-09-01 |
| `zod` | 4.5.4 | 2026-09-01 |
| `express` | 5.1.0 | 2026-09-01 |
| Google Search Console API | v1, discovery revision 20260830 | 2026-09-01 |
| Google Site Verification API | v1 | 2026-09-01 |
| Node | >= 20 | |

## 0.1.0

First release. 19 tools over the Search Console API and the Site Verification
API.

Search performance: `top_queries`, `top_pages`, `compare_periods`,
`striking_distance`, `query_search_analytics`. The middle two answer questions
the API cannot express in a single call and the Search Console UI cannot express
at all without an export.

Indexing: `inspect_url`, `inspect_urls`.

Sitemaps: `list_sitemaps`, `get_sitemap`, `submit_sitemap`, `delete_sitemap`.

Properties: `list_sites`, `get_site`, `add_site`, `delete_site`,
`list_accounts`.

Verification: `get_verification_token`, `verify_site`, `list_verified_sites`.

Three credential routes: browser sign-in with automatic refresh, service account
for headless environments, and a static token for anyone who already has one.
Multiple Google accounts on the same install, selected per call.

stdio and streamable HTTP transports. The HTTP transport refuses to bind
anything but loopback without `GSC_HTTP_TOKEN`.
