import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { request, VERIFY_BASE } from "../api/client.js"
import { ACCOUNT, tool, type ToolContext } from "./shared.js"

/**
 * Site Verification is a separate Google API from Search Console, and the
 * reason it is here is that "add a property" and "prove you own it" are one
 * job. Without these tools every new site ends at a browser step.
 */

const TYPE = z
  .enum(["SITE", "INET_DOMAIN"])
  .describe("INET_DOMAIN for a domain property (sc-domain:), SITE for a URL-prefix property.")

const METHOD = z
  .enum(["DNS_TXT", "META", "FILE"])
  .describe("DNS_TXT is the only method a domain property accepts. A URL-prefix property can also use META or FILE.")

export function registerVerificationTools(server: McpServer, ctx: ToolContext): void {
  tool(server, ctx, {
    name: "get_verification_token",
    kind: "read",
    description:
      "Mint the token that proves ownership of a site or domain, so a new property can be verified without opening the Search Console UI. A domain property must use DNS: publish the returned token as a TXT record on the apex. A URL-prefix property can instead use META, a tag in the homepage head, or FILE, a file served at the site root. Publish the token first, then call verify_site. Minting a token changes nothing on its own.",
    schema: {
      identifier: z
        .string()
        .describe('The site URL for SITE ("https://navid.me/"), or the bare domain for INET_DOMAIN ("navid.me").'),
      type: TYPE,
      method: METHOD,
      account: ACCOUNT,
    },
    run: async ({ identifier, type, method }, token) => {
      if (type === "INET_DOMAIN" && method !== "DNS_TXT") {
        throw new Error("A domain (INET_DOMAIN) can only be verified by DNS_TXT. Use SITE with a full URL for META or FILE.")
      }
      const res = await request<{ token?: string; method?: string }>(token, `${VERIFY_BASE}/token`, {
        method: "POST",
        body: { verificationMethod: method, site: { type, identifier } },
      })
      const next =
        method === "DNS_TXT"
          ? "Publish the token as a TXT record on the apex domain, wait for it to propagate, then call verify_site with the same identifier, type and method."
          : method === "META"
            ? "Put the returned tag in the homepage <head>, deploy, then call verify_site."
            : "Serve a file with the returned name at the site root, then call verify_site."
      return { ...res, next }
    },
  })

  tool(server, ctx, {
    name: "verify_site",
    kind: "write",
    description:
      "Claim ownership once the token from get_verification_token is live. Google fetches the DNS record, meta tag or file and, if it matches, marks this Google account an owner of the site. It fails until the token is actually reachable, which with DNS means waiting for propagation, sometimes several minutes. Retrying is safe.",
    schema: {
      identifier: z.string().describe("The same identifier passed to get_verification_token."),
      type: TYPE,
      method: METHOD.describe("The same method the token was minted for."),
      account: ACCOUNT,
    },
    run: async ({ identifier, type, method }, token) =>
      request(token, `${VERIFY_BASE}/webResource`, {
        method: "POST",
        params: { verificationMethod: method },
        body: { site: { type, identifier } },
      }),
  })

  tool(server, ctx, {
    name: "list_verified_sites",
    kind: "read",
    description:
      "Every site and domain this Google account has verified ownership of, across all Google products. This is a wider list than list_sites, because a verified domain is not automatically a Search Console property. Use it to tell \"not verified yet\" apart from \"verified but never added\", which are two different fixes.",
    schema: { account: ACCOUNT },
    run: async (_a, token) => request(token, `${VERIFY_BASE}/webResource`),
  })
}
