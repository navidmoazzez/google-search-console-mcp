import { vi } from "vitest"

export interface FakeCall {
  url: string
  method: string
  body: unknown
  headers: Record<string, string>
}

/**
 * A faked fetch. Every test in this suite runs against it, never the network
 * and never a real token: a test that needs credentials is a test nobody runs,
 * including CI.
 */
export function fakeFetch(routes: Record<string, unknown | ((call: FakeCall) => unknown)>) {
  const calls: FakeCall[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const call: FakeCall = {
      url,
      method: init?.method || "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers as Record<string, string>) || {},
    }
    calls.push(call)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (key === undefined) {
      return new Response(JSON.stringify({ error: { message: `no fake route for ${url}` } }), { status: 404 })
    }
    const value = routes[key]
    const resolved = typeof value === "function" ? (value as (c: FakeCall) => unknown)(call) : value
    if (resolved instanceof Response) return resolved
    return new Response(JSON.stringify(resolved), { status: 200, headers: { "Content-Type": "application/json" } })
  })
  return { impl, calls }
}

export function errorResponse(status: number, message: string, reason?: string): Response {
  return new Response(
    JSON.stringify({ error: { message, errors: reason ? [{ reason }] : undefined } }),
    { status, headers: { "Content-Type": "application/json" } },
  )
}
