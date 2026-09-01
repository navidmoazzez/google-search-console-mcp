/**
 * The command that says what is actually broken.
 *
 * Worth building because an integration fails for about six reasons and all of
 * them look identical from inside an MCP client, which reports "the tool
 * errored" and nothing else. Each check here maps to one of those six and names
 * the fix.
 */

import { loadConfig, scopes, tokenStorePath } from "./config.js"
import { listStoredAccounts, resolveToken } from "./auth.js"
import { request, WMX_BASE, VERIFY_BASE } from "./api/client.js"
import { VERSION } from "./server.js"

type Status = "ok" | "warn" | "fail"

function line(status: Status, label: string, detail: string): string {
  const mark = status === "ok" ? "✓" : status === "warn" ? "!" : "✗"
  return `${mark} ${label}\n    ${detail}`
}

export async function doctor(): Promise<number> {
  const cfg = loadConfig()
  const out: string[] = [`google-search-console-mcp ${VERSION}`, `node ${process.version}`, ""]
  let worst: Status = "ok"
  const note = (s: Status, label: string, detail: string) => {
    out.push(line(s, label, detail))
    if (s === "fail") worst = "fail"
    else if (s === "warn" && (worst as Status) === "ok") worst = "warn"
  }

  const major = Number(process.version.slice(1).split(".")[0])
  if (major < 20) note("fail", "Node version", `Node 20 or newer is required, found ${process.version}.`)
  else note("ok", "Node version", process.version)

  // ── which credential is configured ──
  const { accounts } = await listStoredAccounts()
  const haveOAuthClient = Boolean(cfg.clientId && cfg.clientSecret)
  const haveServiceAccount = Boolean(cfg.serviceAccountKeyPath || cfg.serviceAccountKeyJson)

  if (accounts.length) {
    note("ok", "Signed-in accounts", `${accounts.map((a) => a.email).join(", ")} (stored at ${tokenStorePath()})`)
    if (!haveOAuthClient) {
      note(
        "fail",
        "OAuth client",
        "A sign-in is stored but GSC_CLIENT_ID and GSC_CLIENT_SECRET are not set, so the token cannot be refreshed. Calls will work until the current hour is up, then fail.",
      )
    } else {
      note("ok", "OAuth client", "GSC_CLIENT_ID and GSC_CLIENT_SECRET are set, so tokens refresh automatically.")
    }
  } else if (haveServiceAccount) {
    note("ok", "Credential", "Using a service account key. No browser sign-in needed.")
  } else if (cfg.staticAccessToken) {
    note(
      "warn",
      "Credential",
      "Using GSC_ACCESS_TOKEN. This is never refreshed, so it stops working roughly an hour after it was minted.",
    )
  } else {
    note("fail", "Credential", "Nothing is configured. Run `login`, or set GSC_SERVICE_ACCOUNT_KEY.")
  }

  // ── does the credential actually work ──
  let token: string | null = null
  try {
    const resolved = await resolveToken(cfg)
    token = resolved.token
    note("ok", "Token", `Got a live token for ${resolved.account} via ${resolved.source}.`)
  } catch (e) {
    note("fail", "Token", (e as Error).message)
  }

  // ── can it reach Search Console, and what does it own ──
  if (token) {
    try {
      const res = await request<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, `${WMX_BASE}/sites`)
      const sites = res.siteEntry || []
      if (!sites.length) {
        note(
          "warn",
          "Search Console access",
          haveServiceAccount
            ? "The API answered but this account owns no properties. A service account is a separate identity: add its client_email as a user on each property in Search Console under Settings, Users and permissions."
            : "The API answered but this account owns no properties. Sign in with the Google account that actually owns them.",
        )
      } else {
        const writable = sites.filter((s) => s.permissionLevel === "siteOwner" || s.permissionLevel === "siteFullUser")
        note(
          "ok",
          "Search Console access",
          `${sites.length} propert${sites.length === 1 ? "y" : "ies"}, ${writable.length} writable. First: ${sites[0].siteUrl}`,
        )
      }
    } catch (e) {
      note("fail", "Search Console access", (e as Error).message)
    }

    // ── the verification scope is optional and its absence should not read as breakage ──
    if (scopes().some((s) => s.includes("siteverification"))) {
      try {
        await request(token, `${VERIFY_BASE}/webResource`)
        note("ok", "Site verification", "The siteverification scope works, so add_site and verify_site can stand up a new property.")
      } catch (e) {
        note(
          "warn",
          "Site verification",
          `Verification is unavailable: ${(e as Error).message} Everything else still works; only get_verification_token and verify_site need this.`,
        )
      }
    } else {
      note("warn", "Site verification", "GSC_SCOPES excludes siteverification, so the verification tools will fail. Everything else works.")
    }
  }

  // ── safety switches, so a surprised user can see why a tool vanished ──
  if (cfg.readOnly) note("warn", "Read-only mode", "GSC_READ_ONLY is on. Every write tool is unregistered, which is why they do not appear in the tool list.")
  else if (!cfg.allowDestructive) note("ok", "Write mode", "Reversible writes are on, irreversible ones are off (GSC_ALLOW_DESTRUCTIVE=0).")
  else note("ok", "Write mode", "Writes are on. delete_site and delete_sitemap additionally require confirm: true.")

  if (cfg.auditLog) note("ok", "Audit log", cfg.auditLog)

  out.push("")
  const summary: Record<Status, string> = {
    ok: "Everything checks out.",
    warn: "Working, with the caveats above.",
    fail: "Something is broken. See the ✗ lines.",
  }
  out.push(summary[worst])
  process.stdout.write(`${out.join("\n")}\n`)
  return (worst as Status) === "fail" ? 1 : 0
}
