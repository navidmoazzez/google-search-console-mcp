/**
 * Getting a valid access token, three ways, in the order they are tried.
 *
 *   1. GSC_ACCESS_TOKEN         a token minted elsewhere. Never refreshed.
 *   2. a service account key     signed JWT, no browser. For servers and CI.
 *   3. a cached OAuth grant      from `login`, refreshed automatically.
 *
 * Why three. A service account cannot log in to a browser, and a laptop user
 * should not have to mint a key file and then remember to add its robot email
 * as a user on every property. Supporting both means neither audience is told
 * to use the setup built for the other one.
 *
 * The OAuth flow is a loopback redirect on 127.0.0.1, which is what Google
 * documents for installed applications. It needs no hosted callback and no
 * secret in a browser.
 */

import { createSign, randomBytes, createHash } from "node:crypto"
import { createServer } from "node:http"
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import { dirname } from "node:path"
import { Config, scopes, tokenStorePath } from "./config.js"

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"

export interface StoredAccount {
  /** The Google account's email, used as the account name in tool calls. */
  email: string
  refresh_token: string
  /** Cached to avoid a refresh round trip on every single call. */
  access_token?: string
  expires_at?: number
  scopes?: string[]
}

interface TokenStore {
  version: 1
  accounts: StoredAccount[]
  default?: string
}

async function readStore(): Promise<TokenStore> {
  try {
    const raw = await readFile(tokenStorePath(), "utf8")
    const parsed = JSON.parse(raw) as TokenStore
    if (!parsed.accounts) return { version: 1, accounts: [] }
    return parsed
  } catch {
    return { version: 1, accounts: [] }
  }
}

async function writeStore(store: TokenStore): Promise<void> {
  const p = tokenStorePath()
  await mkdir(dirname(p), { recursive: true, mode: 0o700 })
  await writeFile(p, JSON.stringify(store, null, 2), { mode: 0o600 })
  /* writeFile's mode only applies when it creates the file, so an existing
     store written under a looser umask would keep its old permissions. */
  await chmod(p, 0o600)
}

export class AuthError extends Error {}

/* ────────────────────────── service account ────────────────────────── */

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

async function loadServiceAccount(cfg: Config): Promise<ServiceAccountKey | null> {
  let raw: string | null = null
  if (cfg.serviceAccountKeyJson) {
    /* Accept both raw JSON and base64, because a JSON blob with newlines in the
       private key does not survive most shells or a client's env block. */
    const v = cfg.serviceAccountKeyJson
    raw = v.trim().startsWith("{") ? v : Buffer.from(v, "base64").toString("utf8")
  } else if (cfg.serviceAccountKeyPath) {
    try {
      raw = await readFile(cfg.serviceAccountKeyPath, "utf8")
    } catch (e) {
      throw new AuthError(
        `Could not read the service account key at ${cfg.serviceAccountKeyPath}: ${(e as Error).message}`,
      )
    }
  }
  if (!raw) return null
  let key: ServiceAccountKey
  try {
    key = JSON.parse(raw)
  } catch {
    throw new AuthError("The service account key is not valid JSON. If you passed it base64-encoded, check it decoded cleanly.")
  }
  if (!key.client_email || !key.private_key) {
    throw new AuthError("The service account key is missing client_email or private_key. Download the JSON key again from Google Cloud.")
  }
  return key
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function serviceAccountToken(key: ServiceAccountKey): Promise<{ token: string; expiresAt: number; email: string }> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: scopes().join(" "),
      aud: key.token_uri || TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${claims}`)
  /* A key pasted through an env var usually arrives with literal \n rather
     than real newlines, and node's PEM parser rejects it with a message that
     says nothing useful. */
  const pem = key.private_key.includes("\\n") ? key.private_key.replace(/\\n/g, "\n") : key.private_key
  const signature = b64url(signer.sign(pem))
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(key.token_uri || TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  const body = await res.json().catch(() => ({}) as Record<string, unknown>)
  if (!res.ok) {
    const err = (body as Record<string, string>).error_description || (body as Record<string, string>).error || `HTTP ${res.status}`
    throw new AuthError(
      `The service account could not get a token: ${err}. Check the Search Console API is enabled on the project that owns this key.`,
    )
  }
  const b = body as { access_token: string; expires_in: number }
  return { token: b.access_token, expiresAt: Date.now() + (b.expires_in - 60) * 1000, email: key.client_email }
}

/* ────────────────────────── oauth refresh ────────────────────────── */

async function refresh(cfg: Config, account: StoredAccount): Promise<StoredAccount> {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new AuthError(
      "A cached sign-in exists but GSC_CLIENT_ID and GSC_CLIENT_SECRET are not set, so the token cannot be refreshed. Put them back in the client config.",
    )
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, string | number>
  if (!res.ok) {
    const err = String(body.error || `HTTP ${res.status}`)
    if (err === "invalid_grant") {
      throw new AuthError(
        `The saved sign-in for ${account.email} is no longer valid. This happens when access is revoked at myaccount.google.com/permissions, or when a testing-mode OAuth app expires its grants after seven days. Run \`login\` again.`,
      )
    }
    if (err === "unauthorized_client" || err === "invalid_client") {
      throw new AuthError(
        `Google rejected the OAuth client for ${account.email}. A refresh token only works with the exact client that minted it, so this usually means GSC_CLIENT_ID now points at a different client than the one used at login. Run \`login\` again.`,
      )
    }
    throw new AuthError(`Refreshing the token for ${account.email} failed: ${err}`)
  }
  const updated: StoredAccount = {
    ...account,
    access_token: String(body.access_token),
    expires_at: Date.now() + (Number(body.expires_in) - 60) * 1000,
  }
  const store = await readStore()
  store.accounts = store.accounts.map((a) => (a.email === account.email ? updated : a))
  await writeStore(store)
  return updated
}

/* ────────────────────────── the public surface ────────────────────────── */

export interface Resolved {
  token: string
  /** How the token was obtained, for `doctor` and for error messages. */
  source: "static" | "service_account" | "oauth"
  account: string
}

/**
 * Pick an account and hand back a live token.
 *
 * `wanted` is matched against the stored email. An exact match wins over a
 * substring match, so an account named as a prefix of another one still
 * resolves to itself rather than to whichever was stored first.
 */
export async function resolveToken(cfg: Config, wanted?: string | null): Promise<Resolved> {
  if (cfg.staticAccessToken && !wanted) {
    return { token: cfg.staticAccessToken, source: "static", account: "(GSC_ACCESS_TOKEN)" }
  }

  const key = await loadServiceAccount(cfg)
  if (key && !wanted) {
    const t = await serviceAccountToken(key)
    return { token: t.token, source: "service_account", account: t.email }
  }

  const store = await readStore()
  if (!store.accounts.length) {
    if (cfg.staticAccessToken) return { token: cfg.staticAccessToken, source: "static", account: "(GSC_ACCESS_TOKEN)" }
    if (key) {
      const t = await serviceAccountToken(key)
      return { token: t.token, source: "service_account", account: t.email }
    }
    throw new AuthError(
      "Not signed in. Run `npx -y @thenavidm/google-search-console-mcp@latest login` on this machine, or set GSC_SERVICE_ACCOUNT_KEY.",
    )
  }

  let picked: StoredAccount | undefined
  if (wanted) {
    const norm = wanted.trim().toLowerCase()
    picked =
      store.accounts.find((a) => a.email.toLowerCase() === norm) ||
      store.accounts.find((a) => a.email.toLowerCase().includes(norm))
    if (!picked) {
      throw new AuthError(
        `No signed-in Google account matches "${wanted}". Signed in: ${store.accounts.map((a) => a.email).join(", ")}.`,
      )
    }
  } else {
    picked = store.accounts.find((a) => a.email === store.default) || store.accounts[0]
  }

  if (picked.access_token && picked.expires_at && picked.expires_at > Date.now()) {
    return { token: picked.access_token, source: "oauth", account: picked.email }
  }
  const fresh = await refresh(cfg, picked)
  return { token: fresh.access_token!, source: "oauth", account: fresh.email }
}

export async function listStoredAccounts(): Promise<{ accounts: StoredAccount[]; default?: string }> {
  const store = await readStore()
  return { accounts: store.accounts, default: store.default }
}

export async function forgetAccount(email: string): Promise<boolean> {
  const store = await readStore()
  const before = store.accounts.length
  store.accounts = store.accounts.filter((a) => a.email.toLowerCase() !== email.toLowerCase())
  if (store.default?.toLowerCase() === email.toLowerCase()) store.default = store.accounts[0]?.email
  await writeStore(store)
  return store.accounts.length < before
}

/* ────────────────────────── the login flow ────────────────────────── */

/**
 * Loopback OAuth. Opens a browser, listens on an ephemeral port on 127.0.0.1,
 * takes the code Google redirects back with, and stores the refresh token.
 *
 * PKCE is used even though this client has a secret. An installed app's secret
 * is not really secret, since it ships in whatever config the user pastes it
 * into, and PKCE is what actually binds the returned code to this process.
 */
export async function login(cfg: Config, opts: { port?: number } = {}): Promise<StoredAccount> {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new AuthError(
      "Set GSC_CLIENT_ID and GSC_CLIENT_SECRET first. Both come from a Desktop OAuth client in Google Cloud, and the setup guide walks through creating one: https://github.com/navidmoazzez/google-search-console-mcp/blob/main/references/setup.md",
    )
  }

  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash("sha256").update(verifier).digest())
  const state = b64url(randomBytes(16))

  const { server, port } = await listen(opts.port)
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const url = new URL(AUTH_ENDPOINT)
  url.searchParams.set("client_id", cfg.clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", scopes().join(" "))
  url.searchParams.set("access_type", "offline")
  /* Without prompt=consent Google skips the screen for an already-authorized
     app and returns no refresh token, so the second sign-in on a machine
     silently produces a grant that cannot be renewed. */
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", state)

  process.stderr.write(`\nOpen this URL to sign in:\n\n${url.toString()}\n\n`)
  void openBrowser(url.toString())

  const code = await waitForCode(server, state)
  server.close()

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, string | number>
  if (!res.ok) {
    throw new AuthError(`Exchanging the sign-in code failed: ${body.error_description || body.error || res.status}`)
  }
  if (!body.refresh_token) {
    throw new AuthError(
      "Google returned no refresh token, so the sign-in would expire in an hour. Revoke this app at https://myaccount.google.com/permissions and run login again.",
    )
  }

  const email = await whoami(String(body.access_token))
  const account: StoredAccount = {
    email,
    refresh_token: String(body.refresh_token),
    access_token: String(body.access_token),
    expires_at: Date.now() + (Number(body.expires_in) - 60) * 1000,
    scopes: scopes(),
  }
  const store = await readStore()
  store.accounts = [...store.accounts.filter((a) => a.email !== email), account]
  store.default ||= email
  await writeStore(store)
  return account
}

async function whoami(accessToken: string): Promise<string> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    /* Not fatal. The email is a label for picking between accounts, and a
       token that works for Search Console is still usable without it. */
    return "(unknown account)"
  }
  const body = (await res.json()) as { email?: string }
  return body.email || "(unknown account)"
}

function listen(preferred?: number): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(preferred ?? 0, "127.0.0.1", () => {
      const addr = server.address()
      if (!addr || typeof addr === "string") return reject(new AuthError("Could not open a local port for the sign-in redirect."))
      resolve({ server, port: addr.port })
    })
  })
}

function waitForCode(server: ReturnType<typeof createServer>, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthError("Timed out waiting for the sign-in to finish.")), 5 * 60 * 1000)
    server.on("request", (req, res) => {
      const u = new URL(req.url || "/", "http://127.0.0.1")
      if (!u.pathname.startsWith("/callback")) {
        res.writeHead(404).end()
        return
      }
      const err = u.searchParams.get("error")
      const code = u.searchParams.get("code")
      const state = u.searchParams.get("state")
      const done = (msg: string) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(`<!doctype html><meta charset="utf-8"><title>Google Search Console MCP</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>${msg}</p></body>`)
      }
      clearTimeout(timer)
      if (err) {
        done("Sign-in was cancelled. You can close this tab.")
        reject(new AuthError(`Google returned an error at the consent screen: ${err}`))
        return
      }
      /* The state check is what stops another page on this machine from
         driving the callback with a code of its own. */
      if (state !== expectedState) {
        done("Something went wrong. You can close this tab.")
        reject(new AuthError("The sign-in response did not match this request. Run login again."))
        return
      }
      if (!code) {
        done("Something went wrong. You can close this tab.")
        reject(new AuthError("Google returned no authorization code."))
        return
      }
      done("Signed in. You can close this tab and go back to your terminal.")
      resolve(code)
    })
  })
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process")
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref()
  } catch {
    /* Headless machines have no browser. The URL is already on stderr, so the
       user can paste it somewhere that does. */
  }
}
