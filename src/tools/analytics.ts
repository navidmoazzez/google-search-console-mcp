import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { request, normalizeSite, seg, WMX_BASE } from "../api/client.js"
import { labelRows, isoDaysAgo, totals, DATA_LAG_DAYS, type RawRow } from "../format/rows.js"
import { ACCOUNT, SITE, tool, type ToolContext } from "./shared.js"

const DIMENSION = z.enum(["query", "page", "country", "device", "searchAppearance", "date", "hour"])

const FILTER = z.object({
  dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
  operator: z
    .enum(["equals", "notEquals", "contains", "notContains", "includingRegex", "excludingRegex"])
    .default("contains"),
  expression: z.string(),
})

const SEARCH_TYPE = z
  .enum(["web", "image", "video", "news", "discover", "googleNews"])
  .describe(
    'Which surface to report on. Defaults to web. "discover" and "googleNews" carry no query or device dimension at all, so asking for one returns an error rather than empty rows.',
  )

interface QueryResponse {
  rows?: RawRow[]
  responseAggregationType?: string
}

async function query(token: string, site: string, body: Record<string, unknown>): Promise<QueryResponse> {
  return request<QueryResponse>(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}/searchAnalytics/query`, {
    method: "POST",
    body,
  })
}

function filterGroups(filters: z.infer<typeof FILTER>[] | undefined) {
  if (!filters?.length) return undefined
  return [{ groupType: "and", filters }]
}

export function registerAnalyticsTools(server: McpServer, ctx: ToolContext): void {
  tool(server, ctx, {
    name: "query_search_analytics",
    kind: "read",
    description:
      "The core report: clicks, impressions, CTR and average position from Google Search, grouped by any combination of query, page, country, device, searchAppearance, date or hour. This is the full-control tool. For the questions people actually ask, top_queries, top_pages, striking_distance and compare_periods are one call instead of a hand-assembled body. Two things to know before reading a result as bad news. Data finalises on a two to three day lag, so a window ending today is short at the end. And Google withholds rare queries for privacy, which is why the query breakdown reliably sums to fewer clicks than the site total.",
    schema: {
      site: SITE,
      start_date: z.string().describe("YYYY-MM-DD, in PST. About 16 months of history is available."),
      end_date: z.string().describe("YYYY-MM-DD, in PST."),
      dimensions: z.array(DIMENSION).optional().describe('Group-by columns, e.g. ["query"] or ["page","device"]. Omit for site totals.'),
      type: SEARCH_TYPE.optional(),
      filters: z.array(FILTER).optional().describe("Combined with AND."),
      row_limit: z.number().int().min(1).max(25000).optional().describe("Default 1000, max 25000."),
      start_row: z.number().int().min(0).optional().describe("Zero-based offset, for paging past row_limit."),
      aggregation_type: z.enum(["auto", "byProperty", "byPage"]).optional(),
      data_state: z
        .enum(["final", "all"])
        .optional()
        .describe('"all" includes the most recent partial days, which is the only way to see the last two or three at all. Defaults to final.'),
      account: ACCOUNT,
    },
    run: async (a, token) => {
      const body: Record<string, unknown> = { startDate: a.start_date, endDate: a.end_date }
      if (a.dimensions?.length) body.dimensions = a.dimensions
      if (a.type) body.type = a.type
      const groups = filterGroups(a.filters)
      if (groups) body.dimensionFilterGroups = groups
      if (a.row_limit !== undefined) body.rowLimit = a.row_limit
      if (a.start_row !== undefined) body.startRow = a.start_row
      if (a.aggregation_type) body.aggregationType = a.aggregation_type
      if (a.data_state) body.dataState = a.data_state

      const res = await query(token, a.site, body)
      const dims = a.dimensions ?? []
      return {
        site: normalizeSite(a.site),
        range: { start_date: a.start_date, end_date: a.end_date },
        dimensions: dims,
        totals: totals(res.rows),
        rows: dims.length ? labelRows(res.rows, dims) : res.rows,
        responseAggregationType: res.responseAggregationType,
      }
    },
  })

  tool(server, ctx, {
    name: "top_queries",
    kind: "read",
    description:
      "The search queries bringing the most clicks to a property, with impressions, CTR and average position. Defaults to the last 28 days ending three days ago, because Search Console lags and a window ending today reads as empty.",
    schema: {
      site: SITE,
      days: z.number().int().min(1).max(480).default(28).describe("Window length."),
      limit: z.number().int().min(1).max(25000).default(25),
      page_filter: z.string().optional().describe('Only queries that landed on pages whose URL contains this, e.g. "/blog/".'),
      country: z.string().optional().describe('Three-letter country code, e.g. "usa", "gbr", "swe".'),
      type: SEARCH_TYPE.optional(),
      account: ACCOUNT,
    },
    run: async (a, token) => {
      const end = isoDaysAgo(DATA_LAG_DAYS)
      const start = isoDaysAgo(DATA_LAG_DAYS + a.days)
      const filters: z.infer<typeof FILTER>[] = []
      if (a.page_filter) filters.push({ dimension: "page", operator: "contains", expression: a.page_filter })
      if (a.country) filters.push({ dimension: "country", operator: "equals", expression: a.country.toLowerCase() })
      const body: Record<string, unknown> = { startDate: start, endDate: end, dimensions: ["query"], rowLimit: a.limit }
      const groups = filterGroups(filters)
      if (groups) body.dimensionFilterGroups = groups
      if (a.type) body.type = a.type
      const res = await query(token, a.site, body)
      return { site: normalizeSite(a.site), range: { start, end }, totals: totals(res.rows), rows: labelRows(res.rows, ["query"]) }
    },
  })

  tool(server, ctx, {
    name: "top_pages",
    kind: "read",
    description:
      "The pages on a property earning the most clicks from Google Search, with impressions, CTR and average position. Defaults to the last 28 days ending three days ago.",
    schema: {
      site: SITE,
      days: z.number().int().min(1).max(480).default(28),
      limit: z.number().int().min(1).max(25000).default(25),
      query_filter: z.string().optional().describe("Only clicks that came from queries containing this."),
      country: z.string().optional().describe('Three-letter country code, e.g. "usa".'),
      type: SEARCH_TYPE.optional(),
      account: ACCOUNT,
    },
    run: async (a, token) => {
      const end = isoDaysAgo(DATA_LAG_DAYS)
      const start = isoDaysAgo(DATA_LAG_DAYS + a.days)
      const filters: z.infer<typeof FILTER>[] = []
      if (a.query_filter) filters.push({ dimension: "query", operator: "contains", expression: a.query_filter })
      if (a.country) filters.push({ dimension: "country", operator: "equals", expression: a.country.toLowerCase() })
      const body: Record<string, unknown> = { startDate: start, endDate: end, dimensions: ["page"], rowLimit: a.limit }
      const groups = filterGroups(filters)
      if (groups) body.dimensionFilterGroups = groups
      if (a.type) body.type = a.type
      const res = await query(token, a.site, body)
      return { site: normalizeSite(a.site), range: { start, end }, totals: totals(res.rows), rows: labelRows(res.rows, ["page"]) }
    },
  })

  tool(server, ctx, {
    name: "compare_periods",
    kind: "read",
    description:
      "Two equal windows side by side with the deltas already computed: what went up, what fell, per query, page, country or device. This is the tool for \"what changed\", \"are we up or down\" and \"which pages lost traffic\". The default compares the last 28 days against the 28 before them. Rows are sorted by click change, so the biggest losses are at the bottom and the biggest gains at the top.",
    schema: {
      site: SITE,
      dimension: z.enum(["query", "page", "country", "device"]).default("query"),
      days: z.number().int().min(1).max(240).default(28).describe("Length of each window."),
      limit: z.number().int().min(1).max(5000).default(100).describe("Rows pulled per window before joining."),
      type: SEARCH_TYPE.optional(),
      account: ACCOUNT,
    },
    run: async (a, token) => {
      const currentEnd = isoDaysAgo(DATA_LAG_DAYS)
      const currentStart = isoDaysAgo(DATA_LAG_DAYS + a.days)
      /* The prior window ends the day before the current one starts, so the two
         never share a day. An overlapping pair makes every delta look smaller
         than it is, in the direction that hides a decline. */
      const priorEnd = isoDaysAgo(DATA_LAG_DAYS + a.days + 1)
      const priorStart = isoDaysAgo(DATA_LAG_DAYS + a.days * 2 + 1)

      const base: Record<string, unknown> = { dimensions: [a.dimension], rowLimit: a.limit }
      if (a.type) base.type = a.type
      const [cur, prev] = await Promise.all([
        query(token, a.site, { ...base, startDate: currentStart, endDate: currentEnd }),
        query(token, a.site, { ...base, startDate: priorStart, endDate: priorEnd }),
      ])

      const index = (r: QueryResponse) => new Map((r.rows || []).map((row) => [String(row.keys?.[0]), row]))
      const now = index(cur)
      const before = index(prev)

      const rows = [...new Set([...now.keys(), ...before.keys()])].map((key) => {
        const c = now.get(key)
        const p = before.get(key)
        return {
          [a.dimension]: key,
          clicks: c?.clicks ?? 0,
          clicks_prior: p?.clicks ?? 0,
          clicks_delta: (c?.clicks ?? 0) - (p?.clicks ?? 0),
          impressions: c?.impressions ?? 0,
          impressions_prior: p?.impressions ?? 0,
          impressions_delta: (c?.impressions ?? 0) - (p?.impressions ?? 0),
          ctr: c?.ctr ?? 0,
          ctr_prior: p?.ctr ?? 0,
          position: c?.position ?? null,
          position_prior: p?.position ?? null,
          /* Position is a rank, so lower is better. This delta is signed so
             positive always means improved, matching clicks and impressions.
             Reporting the raw arithmetic here is how "position went up" ends up
             describing a page that fell off the first screen. */
          position_delta: c?.position != null && p?.position != null ? p.position - c.position : null,
          /* A row present in one window and absent from the other is the
             interesting case, and a zero in the other column hides it. */
          state: c && p ? "both" : c ? "new" : "lost",
        }
      })
      rows.sort((x, y) => (y.clicks_delta as number) - (x.clicks_delta as number))

      return {
        site: normalizeSite(a.site),
        dimension: a.dimension,
        current: { start: currentStart, end: currentEnd, ...totals(cur.rows) },
        prior: { start: priorStart, end: priorEnd, ...totals(prev.rows) },
        note: "position_delta is positive when the ranking improved, meaning it moved closer to 1.",
        rows,
      }
    },
  })

  tool(server, ctx, {
    name: "striking_distance",
    kind: "read",
    description:
      "Queries a property already ranks for on the edge of page one, between positions 5 and 20 by default, ordered by the impressions being left on the table. These are the pages where a title rewrite or a section of added depth moves traffic, because the ranking work is already done. The single most useful report in Search Console and the UI makes you build it by hand every time.",
    schema: {
      site: SITE,
      min_position: z.number().min(1).max(100).default(5),
      max_position: z.number().min(1).max(100).default(20),
      min_impressions: z.number().int().min(0).default(20).describe("Ignore queries too rare to be worth acting on."),
      days: z.number().int().min(1).max(480).default(28),
      limit: z.number().int().min(1).max(1000).default(50),
      account: ACCOUNT,
    },
    run: async (a, token) => {
      const end = isoDaysAgo(DATA_LAG_DAYS)
      const start = isoDaysAgo(DATA_LAG_DAYS + a.days)
      /* Position is a metric, not a dimension, so the API cannot filter on it.
         Pull a wide page of queries and filter here. 25000 is the API maximum
         and a single request, which is cheaper than paging. */
      const res = await query(token, a.site, {
        startDate: start,
        endDate: end,
        dimensions: ["query", "page"],
        rowLimit: 25000,
      })
      const rows = labelRows(res.rows, ["query", "page"])
        .filter(
          (r) =>
            r.position != null &&
            r.position >= a.min_position &&
            r.position <= a.max_position &&
            r.impressions >= a.min_impressions,
        )
        .sort((x, y) => y.impressions - x.impressions)
        .slice(0, a.limit)
      return {
        site: normalizeSite(a.site),
        range: { start, end },
        criteria: { position: [a.min_position, a.max_position], min_impressions: a.min_impressions },
        count: rows.length,
        rows,
      }
    },
  })
}
