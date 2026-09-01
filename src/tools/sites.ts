import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { request, normalizeSite, seg, WMX_BASE } from "../api/client.js"
import { listStoredAccounts, resolveToken } from "../auth.js"
import { ACCOUNT, SITE, tool, type ToolContext } from "./shared.js"

interface SiteEntry {
  siteUrl: string
  permissionLevel: string
}

export function registerSiteTools(server: McpServer, ctx: ToolContext): void {
  tool(server, ctx, {
    name: "list_accounts",
    kind: "read",
    description:
      "List the Google accounts this server can act as, and which one is used when a tool call does not name one. Pass an email as the `account` argument on any other tool to switch.",
    schema: {},
    run: async () => {
      const { accounts, default: def } = await listStoredAccounts()
      const resolved = await resolveToken(ctx.cfg).catch(() => null)
      return {
        signed_in: accounts.map((a) => ({ email: a.email, scopes: a.scopes })),
        default: def ?? accounts[0]?.email ?? null,
        active: resolved ? { account: resolved.account, source: resolved.source } : null,
        note:
          accounts.length === 0
            ? "No browser sign-in stored. The server is running on a service account or a static token, or is not authenticated at all."
            : undefined,
      }
    },
  })

  tool(server, ctx, {
    name: "list_sites",
    kind: "read",
    description:
      "Every Search Console property this Google account can reach, with the permission level on each: siteOwner, siteFullUser, siteRestrictedUser or siteUnverifiedUser. Start here. The siteUrl strings it returns are the exact values every other tool wants, and copying one avoids the trailing-slash and sc-domain: mismatch that surfaces as a permissions error.",
    schema: { account: ACCOUNT },
    run: async (_args, token) => {
      const res = await request<{ siteEntry?: SiteEntry[] }>(token, `${WMX_BASE}/sites`)
      const sites = res.siteEntry || []
      return {
        count: sites.length,
        sites,
        /* Restricted users can read search analytics but cannot touch sitemaps
           or properties, and finding that out at the point of a write is a
           worse experience than seeing it here. */
        writable: sites.filter((s) => s.permissionLevel === "siteOwner" || s.permissionLevel === "siteFullUser").map((s) => s.siteUrl),
      }
    },
  })

  tool(server, ctx, {
    name: "get_site",
    kind: "read",
    description: "One property and the permission level this account holds on it.",
    schema: { site: SITE, account: ACCOUNT },
    run: async ({ site }, token) => request(token, `${WMX_BASE}/sites/${seg(normalizeSite(site))}`),
  })

  tool(server, ctx, {
    name: "add_site",
    kind: "write",
    description:
      "Register a property in Search Console. This only adds it: the property stays unverified and returns no data until ownership is proven, so follow with get_verification_token and verify_site. Adding a property that is already there is a no-op rather than an error.",
    schema: { site: SITE, account: ACCOUNT },
    run: async ({ site }, token) => {
      const target = normalizeSite(site)
      await request(token, `${WMX_BASE}/sites/${seg(target)}`, { method: "PUT" })
      return { added: target, verified: false, next: "get_verification_token, publish the token, then verify_site" }
    },
  })

  tool(server, ctx, {
    name: "delete_site",
    kind: "destructive",
    description:
      "Remove a property from this Google account's Search Console. The site's history is no longer readable by this account until the property is re-added and re-verified, and Google does not offer an undo. Set confirm to true to proceed.",
    schema: {
      site: SITE,
      confirm: z
        .boolean()
        .default(false)
        .describe("Removing a property cuts this account off from its search history until it is re-added and re-verified. Set true to proceed."),
      account: ACCOUNT,
    },
    run: async ({ site, confirm }, token) => {
      if (!confirm) throw new Error("Not deleting. Confirm which property this removes, then call again with confirm: true.")
      const target = normalizeSite(site)
      await request(token, `${WMX_BASE}/sites/${seg(target)}`, { method: "DELETE" })
      return { deleted: target }
    },
  })
}
