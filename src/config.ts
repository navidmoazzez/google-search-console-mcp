/**
 * Settings and accounts, read from the environment once at startup.
 *
 * Environment variables rather than CLI flags throughout. Someone configuring
 * an MCP client is already editing a JSON `env` block; flags mean editing
 * `args` as a separate array, and the two drift.
 */

import { homedir } from "node:os"
import { join } from "node:path"

export const ENV_PREFIX = "GSC"

/** Where the OAuth refresh token is cached between runs. */
export function tokenStorePath(): string {
  const override = process.env.GSC_TOKEN_STORE?.trim()
  if (override) return expandHome(override)
  return join(homedir(), ".google-search-console-mcp", "tokens.json")
}

export function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p
}

export interface Config {
  /** Remove every write tool from the list rather than erroring when called. */
  readOnly: boolean
  /** Keep reversible writes, drop the irreversible ones. */
  allowDestructive: boolean
  /** One JSON line per attempted write, allowed and blocked alike. */
  auditLog: string | null
  /** OAuth client, needed for `login` and for refreshing a cached token. */
  clientId: string | null
  clientSecret: string | null
  /** Service account key, for servers and CI where no browser exists. */
  serviceAccountKeyPath: string | null
  serviceAccountKeyJson: string | null
  /** A token somebody already minted elsewhere, e.g. `gcloud auth print-access-token`. */
  staticAccessToken: string | null
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function envStr(name: string): string | null {
  const v = process.env[name]?.trim()
  return v ? v : null
}

export function loadConfig(): Config {
  return {
    readOnly: envFlag("GSC_READ_ONLY"),
    /* Defaults to allowing destructive writes. A server where every write needs
       a flag teaches the user to set the flag once and forget it, which looks
       like a safeguard while being permanently off. The per-tool `confirm`
       gate is the real speed bump; this switch is for unattended agents. */
    allowDestructive: process.env.GSC_ALLOW_DESTRUCTIVE?.trim() === "0" ? false : true,
    auditLog: envStr("GSC_AUDIT_LOG") ? expandHome(envStr("GSC_AUDIT_LOG")!) : null,
    clientId: envStr("GSC_CLIENT_ID"),
    clientSecret: envStr("GSC_CLIENT_SECRET"),
    serviceAccountKeyPath: envStr("GSC_SERVICE_ACCOUNT_KEY") ? expandHome(envStr("GSC_SERVICE_ACCOUNT_KEY")!) : null,
    serviceAccountKeyJson: envStr("GSC_SERVICE_ACCOUNT_KEY_JSON"),
    staticAccessToken: envStr("GSC_ACCESS_TOKEN"),
  }
}

/**
 * Scopes.
 *
 * `webmasters` covers reading search analytics and writing properties and
 * sitemaps. `siteverification` is what lets the server claim a new domain
 * without a trip to the Search Console UI. Both are requested at login; a
 * read-only deployment can narrow to `webmasters.readonly` by setting
 * GSC_SCOPES, and the verification tools then fail with Google's own message.
 */
export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/siteverification",
]

export function scopes(): string[] {
  const override = process.env.GSC_SCOPES?.trim()
  return override ? override.split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES
}
