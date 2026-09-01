#!/usr/bin/env node
/**
 * Entry point. Argument parsing and transport selection only.
 */

import { loadConfig } from "./config.js"
import { forgetAccount, listStoredAccounts, login } from "./auth.js"
import { doctor } from "./doctor.js"
import { VERSION } from "./server.js"

const HELP = `google-search-console-mcp ${VERSION}

  google-search-console-mcp                 run over stdio (what an MCP client does)
  google-search-console-mcp --http [--port 8000] [--host 127.0.0.1]
  google-search-console-mcp login [--port N] sign in to a Google account
  google-search-console-mcp logout <email>   forget a signed-in account
  google-search-console-mcp accounts         list signed-in accounts
  google-search-console-mcp doctor           check what is actually configured
  google-search-console-mcp --version

Credentials, in the order they are tried:

  GSC_ACCESS_TOKEN            a token minted elsewhere. Never refreshed.
  GSC_SERVICE_ACCOUNT_KEY     path to a service account JSON key. No browser needed.
  GSC_SERVICE_ACCOUNT_KEY_JSON  the same key inline, raw or base64.
  GSC_CLIENT_ID / GSC_CLIENT_SECRET   a Desktop OAuth client, used by \`login\`.

Switches:

  GSC_READ_ONLY=1             unregister every write tool
  GSC_ALLOW_DESTRUCTIVE=0     keep reversible writes, drop delete_site and delete_sitemap
  GSC_AUDIT_LOG=<path>        one JSON line per attempted write
  GSC_HTTP_TOKEN=<secret>     required to bind anything but loopback over HTTP

Setup guide: https://github.com/navidmoazzez/google-search-console-mcp/blob/main/references/setup.md
`

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  return argv[i + 1]
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]

  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    process.stdout.write(HELP)
    return
  }
  if (argv.includes("--version") || argv.includes("-v") || command === "version") {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  if (command === "doctor") {
    process.exitCode = await doctor()
    return
  }

  if (command === "login") {
    const port = flagValue(argv, "--port")
    const account = await login(loadConfig(), { port: port ? Number(port) : undefined })
    process.stdout.write(`Signed in as ${account.email}.\nRun \`doctor\` to check what it can reach.\n`)
    return
  }

  if (command === "logout") {
    const email = argv[1]
    if (!email) {
      process.stderr.write("Which account? Pass the email, e.g. `logout you@example.com`. `accounts` lists them.\n")
      process.exitCode = 1
      return
    }
    const removed = await forgetAccount(email)
    process.stdout.write(removed ? `Forgot ${email}.\n` : `No stored account matched ${email}.\n`)
    process.stdout.write(
      "This only removes the local copy. To revoke Google's grant as well, visit https://myaccount.google.com/permissions\n",
    )
    return
  }

  if (command === "accounts") {
    const { accounts, default: def } = await listStoredAccounts()
    if (!accounts.length) {
      process.stdout.write("No accounts signed in. Run `login`.\n")
      return
    }
    for (const a of accounts) process.stdout.write(`${a.email}${a.email === def ? "  (default)" : ""}\n`)
    return
  }

  if (argv.includes("--http")) {
    const { runHttp } = await import("./transport/http.js")
    const port = Number(flagValue(argv, "--port") || process.env.PORT || 8000)
    await runHttp({ port, host: flagValue(argv, "--host") })
    return
  }

  const { runStdio } = await import("./transport/stdio.js")
  await runStdio()
}

main().catch((e: Error) => {
  process.stderr.write(`${e.message}\n`)
  process.exit(1)
})
