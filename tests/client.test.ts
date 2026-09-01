import { describe, it, expect, vi, afterEach } from "vitest"
import { request, normalizeSite, ApiError, WMX_BASE } from "../src/api/client.js"
import { fakeFetch, errorResponse } from "./helpers.js"

afterEach(() => vi.unstubAllGlobals())

describe("normalizeSite", () => {
  it("keeps a domain property untouched", () => {
    expect(normalizeSite("sc-domain:navid.me")).toBe("sc-domain:navid.me")
  })

  it("adds the trailing slash a URL-prefix property needs", () => {
    expect(normalizeSite("https://navid.me")).toBe("https://navid.me/")
    expect(normalizeSite("https://navid.me/")).toBe("https://navid.me/")
  })

  it("reads a bare hostname as a domain property", () => {
    expect(normalizeSite("navid.me")).toBe("sc-domain:navid.me")
  })

  it("does not mangle a path on a URL-prefix property", () => {
    expect(normalizeSite("https://navid.me/blog/")).toBe("https://navid.me/blog/")
  })
})

describe("request", () => {
  it("sends the verb it was asked for", async () => {
    /* Code that branches on GET versus everything-else sends a POST where it
       meant a DELETE, the API answers 200, and the tool reports success while
       changing nothing. Asserting the verb is the only way that shows up. */
    const { impl, calls } = fakeFetch({ "/sitemaps/": {} })
    vi.stubGlobal("fetch", impl)
    await request("t", `${WMX_BASE}/sites/x/sitemaps/y`, { method: "DELETE" })
    expect(calls[0].method).toBe("DELETE")
  })

  it("carries the bearer token", async () => {
    const { impl, calls } = fakeFetch({ "/sites": { siteEntry: [] } })
    vi.stubGlobal("fetch", impl)
    await request("secret-token", `${WMX_BASE}/sites`)
    expect(calls[0].headers.Authorization).toBe("Bearer secret-token")
  })

  it("drops empty query params rather than sending them blank", async () => {
    const { impl, calls } = fakeFetch({ "/sitemaps": {} })
    vi.stubGlobal("fetch", impl)
    await request("t", `${WMX_BASE}/sites/x/sitemaps`, { params: { sitemapIndex: undefined, other: "kept" } })
    expect(calls[0].url).not.toContain("sitemapIndex")
    expect(calls[0].url).toContain("other=kept")
  })

  it("turns a 403 into an explanation of the property-string trap", async () => {
    const { impl } = fakeFetch({ "/sites": () => errorResponse(403, "User does not have sufficient permission.", "insufficientPermissions") })
    vi.stubGlobal("fetch", impl)
    await expect(request("t", `${WMX_BASE}/sites`)).rejects.toThrow(/trailing slash/)
  })

  it("explains a 429 with the real per-property limits", async () => {
    const { impl } = fakeFetch({ "/sites": () => errorResponse(429, "Quota exceeded.") })
    vi.stubGlobal("fetch", impl)
    await expect(request("t", `${WMX_BASE}/sites`)).rejects.toThrow(/per property/)
  })

  it("keeps the status on the error so callers can branch on it", async () => {
    /* A Response body can only be read once, so the route is a factory. */
    const { impl } = fakeFetch({ "/sites": () => errorResponse(404, "Not found.") })
    vi.stubGlobal("fetch", impl)
    await expect(request("t", `${WMX_BASE}/sites`)).rejects.toMatchObject({ status: 404 })
    await expect(request("t", `${WMX_BASE}/sites`)).rejects.toBeInstanceOf(ApiError)
  })
})
