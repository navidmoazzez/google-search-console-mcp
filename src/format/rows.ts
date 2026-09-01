/**
 * Shaping Search Console output for a model rather than passing the raw JSON
 * through.
 *
 * The API returns each row as a positional `keys` array that the caller has to
 * line up against the dimensions it asked for. A model reading
 * `{"keys":["how to bake bread","MOBILE"],"clicks":42}` has to remember which
 * dimension it put first. Naming them costs one map and removes a whole class
 * of confidently wrong answers.
 */

export interface RawRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export interface LabelledRow {
  [dimension: string]: unknown
  clicks: number
  impressions: number
  ctr: number
  position: number | null
}

export function labelRows(rows: RawRow[] | undefined, dimensions: string[]): LabelledRow[] {
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    dimensions.forEach((d, i) => {
      out[d] = r.keys?.[i]
    })
    out.clicks = r.clicks ?? 0
    out.impressions = r.impressions ?? 0
    out.ctr = r.ctr ?? 0
    out.position = r.position ?? null
    return out as LabelledRow
  })
}

/**
 * Search Console finalises data on a two to three day lag, so any window ending
 * today is short at the end and reads as a broken connector. Every default
 * window in this server ends three days back for that reason, and every tool
 * that does so says the dates it used in its result.
 */
export const DATA_LAG_DAYS = 3

export function isoDaysAgo(n: number, now: Date = new Date()): string {
  const d = new Date(now.getTime())
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export function totals(rows: RawRow[] | undefined): { clicks: number; impressions: number; ctr: number; position: number | null } {
  const list = rows || []
  const clicks = list.reduce((s, r) => s + (r.clicks ?? 0), 0)
  const impressions = list.reduce((s, r) => s + (r.impressions ?? 0), 0)
  /* Average position has to be weighted by impressions. A plain mean over rows
     lets a query with three impressions move the number as much as one with
     thirty thousand, which is how "our average position improved" gets
     reported on a week where nothing improved. */
  const weighted = list.reduce((s, r) => s + (r.position ?? 0) * (r.impressions ?? 0), 0)
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : null,
  }
}
