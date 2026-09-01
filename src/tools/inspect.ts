import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { request, normalizeSite, SC_BASE } from "../api/client.js"
import { ACCOUNT, SITE, tool, type ToolContext } from "./shared.js"

export function registerInspectTools(server: McpServer, ctx: ToolContext): void {
  tool(server, ctx, {
    name: "inspect_url",
    kind: "read",
    description:
      "Ask Google what it actually knows about one URL: whether it is indexed, which sitemap it was found in, the canonical Google picked against the one the page declares, the last crawl, mobile usability, rich results and any AMP version. This is the tool for \"why is this page not showing up\". Two constraints worth knowing before a loop: the URL has to sit under the property, and the quota is roughly 2000 inspections a day and 600 a minute per property, so inspect the pages that matter rather than a whole site.",
    schema: {
      site: SITE,
      url: z.string().describe("The full URL to inspect. Must be under the property."),
      language_code: z.string().optional().describe('BCP-47 language for the messages Google returns, e.g. "en-US".'),
      account: ACCOUNT,
    },
    run: async ({ site, url, language_code }, token) => {
      const body: Record<string, unknown> = { inspectionUrl: url, siteUrl: normalizeSite(site) }
      if (language_code) body.languageCode = language_code
      const res = await request<{ inspectionResult?: Record<string, unknown> }>(
        token,
        `${SC_BASE}/v1/urlInspection/index:inspect`,
        { method: "POST", body },
      )
      const index = res.inspectionResult?.indexStatusResult as Record<string, unknown> | undefined
      return {
        url,
        site: normalizeSite(site),
        /* The nested result is easy to misread, and the one line everybody
           wants is buried three levels down. Surfacing the verdict costs
           nothing and the full payload is still right there. */
        verdict: index?.verdict ?? null,
        coverage_state: index?.coverageState ?? null,
        google_canonical: index?.googleCanonical ?? null,
        user_canonical: index?.userCanonical ?? null,
        last_crawl: index?.lastCrawlTime ?? null,
        ...res,
      }
    },
  })

  tool(server, ctx, {
    name: "inspect_urls",
    kind: "read",
    description:
      "Inspect several URLs on the same property in one call and get a compact table back: indexed or not, the canonical Google chose, and the last crawl. Use it to check a batch of pages after a launch or a migration. Requests run a few at a time to stay inside the per-minute quota, and one URL failing does not sink the rest. Keep batches small: the daily quota is about 2000 inspections per property.",
    schema: {
      site: SITE,
      urls: z.array(z.string()).min(1).max(50).describe("Up to 50 URLs, all under the property."),
      account: ACCOUNT,
    },
    run: async ({ site, urls }, token) => {
      const target = normalizeSite(site)
      const out: Record<string, unknown>[] = []
      const CONCURRENCY = 5
      for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY)
        const settled = await Promise.all(
          batch.map(async (url: string) => {
            try {
              const res = await request<{ inspectionResult?: { indexStatusResult?: Record<string, unknown> } }>(
                token,
                `${SC_BASE}/v1/urlInspection/index:inspect`,
                { method: "POST", body: { inspectionUrl: url, siteUrl: target } },
              )
              const s = res.inspectionResult?.indexStatusResult
              return {
                url,
                verdict: s?.verdict ?? null,
                coverage_state: s?.coverageState ?? null,
                google_canonical: s?.googleCanonical ?? null,
                last_crawl: s?.lastCrawlTime ?? null,
              }
            } catch (e) {
              /* Reported inline rather than thrown. One 403 on a URL that
                 turned out to be on a different property must not hide the
                 forty-nine results that worked. */
              return { url, error: (e as Error).message }
            }
          }),
        )
        out.push(...settled)
      }
      return {
        site: target,
        inspected: out.length,
        indexed: out.filter((r) => r.verdict === "PASS").length,
        results: out,
      }
    },
  })
}
