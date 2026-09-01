import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { request, normalizeSite, seg, WMX_BASE } from "../api/client.js"
import { ACCOUNT, SITE, tool, type ToolContext } from "./shared.js"

export function registerSitemapTools(server: McpServer, ctx: ToolContext): void {
  tool(server, ctx, {
    name: "list_sitemaps",
    kind: "read",
    description:
      "Every sitemap submitted for a property, with when Google last downloaded each one, how many URLs it holds per content type, and any warnings or errors. A sitemap Google has quietly stopped reading shows up here as a lastDownloaded date that stopped moving, which nothing in the UI puts in front of you.",
    schema: {
      site: SITE,
      sitemap_index: z.string().optional().describe("Only list the children of this sitemap index URL."),
      account: ACCOUNT,
    },
    run: async ({ site, sitemap_index }, token) =>
      request(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}/sitemaps`, {
        params: { sitemapIndex: sitemap_index },
      }),
  })

  tool(server, ctx, {
    name: "get_sitemap",
    kind: "read",
    description: "Details for one submitted sitemap: last download, last submitted, URL counts per type, and whether it is pending or errored.",
    schema: {
      site: SITE,
      sitemap_url: z.string().describe("Full URL of the sitemap, e.g. https://navid.me/sitemap.xml"),
      account: ACCOUNT,
    },
    run: async ({ site, sitemap_url }, token) =>
      request(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}/sitemaps/${seg(sitemap_url)}`),
  })

  tool(server, ctx, {
    name: "submit_sitemap",
    kind: "write",
    description:
      "Submit or resubmit a sitemap. This is the only way the API can ask Google to recrawl anything: there is no endpoint behind the \"Request indexing\" button, so resubmitting after publishing is the programmatic equivalent. Returns immediately. Google fetches the file on its own schedule, so read the result back with get_sitemap rather than expecting counts here.",
    schema: {
      site: SITE,
      sitemap_url: z.string().describe("Full URL of the sitemap. Must be on the property it is submitted to."),
      account: ACCOUNT,
    },
    run: async ({ site, sitemap_url }, token) => {
      await request(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}/sitemaps/${seg(sitemap_url)}`, { method: "PUT" })
      return {
        submitted: sitemap_url,
        site: normalizeSite(site),
        note: "Google fetches on its own schedule, usually within a day. Check back with get_sitemap.",
      }
    },
  })

  tool(server, ctx, {
    name: "delete_sitemap",
    kind: "destructive",
    description:
      "Stop tracking a sitemap on a property. It does not deindex the URLs the sitemap listed, and it does not delete the file. What it does lose is the submission history and per-sitemap coverage for it. Set confirm to true to proceed.",
    schema: {
      site: SITE,
      sitemap_url: z.string().describe("Full URL of the sitemap to stop tracking."),
      confirm: z.boolean().default(false).describe("Set true to proceed. The submission history for this sitemap is not recoverable."),
      account: ACCOUNT,
    },
    run: async ({ site, sitemap_url, confirm }, token) => {
      if (!confirm) throw new Error("Not deleting. Call again with confirm: true once you are sure this is the right sitemap.")
      await request(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}/sitemaps/${seg(sitemap_url)}`, { method: "DELETE" })
      return { deleted: sitemap_url, site: normalizeSite(site) }
    },
  })
}
