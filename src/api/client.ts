/**
 * The Search Console HTTP client.
 *
 * Two APIs sit behind this. The Search Console API v1 still serves its sites,
 * sitemaps and search analytics methods under `webmasters/v3` paths, and only
 * URL inspection lives under `v1`. Site verification is a separate service
 * entirely. All three are wrapped here so the tool modules never assemble a
 * URL by hand.
 *
 * Verified against the live discovery document, revision 20260830.
 */

export const SC_BASE = "https://searchconsole.googleapis.com"
export const WMX_BASE = `${SC_BASE}/webmasters/v3`
export const VERIFY_BASE = "https://www.googleapis.com/siteVerification/v1"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message)
  }
}

/**
 * A property is identified by the exact string Search Console holds, and there
 * are two shapes that are not interchangeable:
 *
 *   https://navid.me/     a URL-prefix property, trailing slash and all
 *   sc-domain:navid.me    a domain property, covering every subdomain and scheme
 *
 * Passing one where the account owns the other returns 403 "User does not have
 * sufficient permission", which reads like a scope problem and sends people
 * back to the consent screen when the fix is a trailing slash. Normalizing here
 * removes the most common version of that mistake.
 */
export function normalizeSite(site: string): string {
  const t = site.trim()
  if (t.startsWith("sc-domain:")) return t
  if (/^https?:\/\//i.test(t)) return t.endsWith("/") ? t : `${t}/`
  return `sc-domain:${t.replace(/^\/+|\/+$/g, "")}`
}

function explain(status: number, message: string, reason?: string): string {
  switch (status) {
    case 401:
      return `${message} The access token was rejected. Run \`login\` again, or check GSC_ACCESS_TOKEN has not expired.`
    case 403:
      if (reason === "insufficientPermissions" || /insufficient/i.test(message)) {
        return `${message} Two things cause this. The property string may not match one this account owns exactly, so call list_sites and copy it; a URL-prefix property needs its trailing slash and is a different property from the sc-domain: one for the same site. Or the sign-in did not grant the scope this call needs, in which case run \`login\` again.`
      }
      return `${message} Check the Search Console API is enabled on the Google Cloud project behind this credential.`
    case 404:
      return `${message} The property or sitemap does not exist under this account. list_sites shows what does.`
    case 429:
      return `${message} Rate limited. Search Console allows roughly 1200 queries per minute per property and 2000 URL inspections per day, and the limits are per property rather than per token.`
    default:
      return message
  }
}

export interface RequestOpts {
  method?: string
  params?: Record<string, unknown>
  body?: unknown
}

export async function request<T = unknown>(token: string, url: string, opts: RequestOpts = {}): Promise<T> {
  const u = new URL(url)
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === "") continue
    u.searchParams.set(k, String(v))
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(u.toString(), { method: opts.method || "GET", headers, body })
  const text = await res.text()

  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    if (!res.ok) throw new ApiError(explain(res.status, `Search Console returned ${res.status}: ${text.slice(0, 400)}`), res.status)
    return {} as T
  }

  if (!res.ok) {
    const e = (parsed as { error?: { message?: string; errors?: { reason?: string }[] } }).error
    const reason = e?.errors?.[0]?.reason
    const msg = e?.message || `HTTP ${res.status}`
    throw new ApiError(explain(res.status, msg, reason), res.status, reason)
  }
  return parsed as T
}

/** Path segment encoding. A siteUrl contains `:` and `/`, both of which have to survive. */
export function seg(value: string): string {
  return encodeURIComponent(value)
}
