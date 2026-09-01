import { describe, it, expect } from "vitest"
import { labelRows, totals, isoDaysAgo } from "../src/format/rows.js"

describe("labelRows", () => {
  it("names the positional keys after the dimensions asked for", () => {
    const rows = labelRows([{ keys: ["bread recipe", "MOBILE"], clicks: 4, impressions: 90, ctr: 0.044, position: 8.1 }], ["query", "device"])
    expect(rows[0]).toMatchObject({ query: "bread recipe", device: "MOBILE", clicks: 4 })
  })

  it("survives a response with no rows", () => {
    expect(labelRows(undefined, ["query"])).toEqual([])
  })

  it("fills missing metrics with zero rather than undefined", () => {
    expect(labelRows([{ keys: ["x"] }], ["query"])[0]).toMatchObject({ clicks: 0, impressions: 0, position: null })
  })
})

describe("totals", () => {
  it("weights average position by impressions", () => {
    /* A plain mean lets a query with 1 impression at position 1 cancel out one
       with 999 impressions at position 50, which is how a flat week gets
       reported as a big improvement. */
    const t = totals([
      { clicks: 0, impressions: 1, position: 1 },
      { clicks: 10, impressions: 999, position: 50 },
    ])
    expect(t.position).toBeGreaterThan(49)
    expect(t.clicks).toBe(10)
    expect(t.impressions).toBe(1000)
  })

  it("does not divide by zero on an empty result", () => {
    expect(totals([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: null })
  })

  it("computes CTR from the totals, not as a mean of row CTRs", () => {
    const t = totals([
      { clicks: 1, impressions: 10 },
      { clicks: 9, impressions: 90 },
    ])
    expect(t.ctr).toBeCloseTo(0.1)
  })
})

describe("isoDaysAgo", () => {
  it("counts back in whole days", () => {
    const now = new Date("2026-09-01T12:00:00Z")
    expect(isoDaysAgo(0, now)).toBe("2026-09-01")
    expect(isoDaysAgo(3, now)).toBe("2026-08-29")
    expect(isoDaysAgo(31, now)).toBe("2026-08-01")
  })
})
