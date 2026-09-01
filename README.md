# Google Search Console MCP

Give any AI agent real access to what Google Search actually recorded about your sites. Queries, pages, impressions, rankings, indexing, sitemaps, from Claude Code, Claude Desktop, claude.ai, Cursor, Codex, or any MCP client.

[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)

Built by [Navid Moazzez](https://navid.me).

```
You: what did we lose traffic on last month, and why?

Claude: Comparing the last 28 days to the 28 before.

  Clicks fell 18%, from 4,210 to 3,455. Impressions barely moved,
  so this is a ranking and click-through problem, not a demand one.

  Almost all of it is one page. /guides/setup went from position
  3.1 to 8.4 and lost 620 clicks on its own. Everything else is flat.

  I inspected it. Google is indexing it, but the canonical it picked
  is /guides/setup?ref=nav, not the clean URL. That split happened
  around the 14th.

  Want me to look at what changed in the nav that week?
```

## Contents

| | Section | |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | Node, one command |
| 3 | [Setup](#3-setup-) | Getting a Google credential |
| 4 | [Connect your client](#4-connect-your-client-) | Every client, copy and paste |
| 5 | [Check it worked](#5-check-it-worked-) | `doctor` |
| 6 | [Tools](#6-tools-) | All 19 |
| 7 | [Working safely](#7-working-safely-) | What is guarded, what is not |
| 8 | [What Search Console actually does](#8-what-search-console-actually-does-) | The things that surprise people |
| 9 | [Your data](#9-your-data-) | What is stored, and where |
| 10 | [Running it on a server](#10-running-it-on-a-server-) | For claude.ai |
| 11 | [Troubleshooting](#11-troubleshooting-) | When something breaks |
| 12 | [FAQ](#12-faq-) | Start here if you are new |

---

## 1. What you can ask it 💬

- Which queries lost the most clicks this month compared to last?
- Show me pages ranking between 5 and 20. Which are closest to page one?
- Why is this URL not showing up in Google?
- What are my top queries for the blog, US only?
- Is Google still reading my sitemap?
- We just launched 30 pages. Check which ones are indexed.
- Which of my pages get impressions but almost no clicks?
- Add this new domain to Search Console and verify it.
- Compare mobile against desktop for the last quarter.

The first one is the point. "What changed" is the question anyone actually has, and Search Console's own interface makes you export two reports and join them in a spreadsheet to answer it. Here it is one call, with the deltas already computed.

## 2. Quick install ⚡

Node 20 or newer. Nothing else.

```bash
npx -y @thenavidm/google-search-console-mcp@latest --version
```

That is the whole install. `npx` fetches it on demand, so there is nothing to update later.

## 3. Setup 🔑

You need a Google credential. Google does not hand out Search Console access without a Google Cloud project, so there is a real setup here: about five minutes, once.

**[The full walkthrough is in references/setup.md](./references/setup.md).** Every click, both routes, and what each error means.

### Have an agent do it

The agent cannot sign in to Google for you. Only you can. What it can do is walk you through the console, wire up your client config, and check the connection.

Paste this into Claude Code, Cursor, or any agent with terminal access:

```
Set up @thenavidm/google-search-console-mcp for me.

1. Read https://github.com/navidmoazzez/google-search-console-mcp/blob/main/references/setup.md
2. Walk me through the Google Cloud steps one at a time. Stop and wait
   for me after each one. Do not skip the part about publishing the
   OAuth app: it is why these break after a week.
3. When I give you the client ID and secret, run `login` and then
   `doctor`, and tell me what properties it can see.
4. Then add it to my MCP client config.
```

### The one step people skip

While your OAuth app's publishing status is **Testing**, Google issues refresh tokens that expire after **7 days**. Everything works, and then a week later it stops for no visible reason.

Click **Publish app** on the **Audience** page during setup. The [setup guide](./references/setup.md) covers where that is and why the verification warning does not apply to you.

### Signing in

```bash
export GSC_CLIENT_ID="...apps.googleusercontent.com"
export GSC_CLIENT_SECRET="GOCSPX-..."

npx -y @thenavidm/google-search-console-mcp@latest login
```

A browser opens, you pick your Google account, and the refresh token is saved to `~/.google-search-console-mcp/tokens.json`.

For a server or CI with no browser, use a service account instead. Both routes are in the [setup guide](./references/setup.md).

## 4. Connect your client 🔌

### Claude Code

```bash
claude mcp add google-search-console \
  -e GSC_CLIENT_ID=your-client-id \
  -e GSC_CLIENT_SECRET=your-client-secret \
  -- npx -y @thenavidm/google-search-console-mcp@latest
```

Add `--scope user` to make it available in every project rather than just this one.

### Claude Desktop

| Platform | Config file |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "google-search-console": {
      "command": "npx",
      "args": ["-y", "@thenavidm/google-search-console-mcp@latest"],
      "env": {
        "GSC_CLIENT_ID": "your-client-id",
        "GSC_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

> **Tip**
> Claude Desktop does not inherit your shell PATH. If it cannot find `npx`, use the absolute path from `which npx`.

Quit Claude Desktop completely and reopen it. Closing the window is not enough.

### Cursor

`.cursor/mcp.json`, same JSON shape as Claude Desktop, same `mcpServers` key.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`, same shape, same `mcpServers` key.

### VS Code

`.vscode/mcp.json`. The key here is **`servers`**, not `mcpServers`, and each entry needs `"type": "stdio"`.

```json
{
  "servers": {
    "google-search-console": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thenavidm/google-search-console-mcp@latest"],
      "env": {
        "GSC_CLIENT_ID": "your-client-id",
        "GSC_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.google-search-console]
command = "npx"
args = ["-y", "@thenavidm/google-search-console-mcp@latest"]

[mcp_servers.google-search-console.env]
GSC_CLIENT_ID = "your-client-id"
GSC_CLIENT_SECRET = "your-client-secret"
```

### Gemini CLI

`~/.gemini/settings.json`, same `mcpServers` shape as Claude Desktop.

### Everything else

Any stdio MCP client needs the same three things: the command `npx`, the args array, and the env block.

## 5. Check it worked 🩺

```bash
npx -y @thenavidm/google-search-console-mcp@latest doctor
```

It reports the Node version, which credential is in use, whether a token can actually be minted, how many properties that account reaches, whether verification is available, and which safety switches are on.

```
✓ Signed-in accounts
    you@example.com (stored at ~/.google-search-console-mcp/tokens.json)
✓ Token
    Got a live token for you@example.com via oauth.
✓ Search Console access
    4 properties, 4 writable. First: sc-domain:example.com
```

Two things account for almost every failure, and `doctor` names both: zero properties means you signed in with the wrong Google account, and a refresh failure a week after setup means the OAuth app is still in Testing.

## 6. Tools 🛠️

Nineteen tools. The five marked ● are writes and disappear under `GSC_READ_ONLY=1`.

### Search performance

| Tool | What it does |
|---|---|
| `top_queries` | The queries bringing the most clicks, with CTR and average position |
| `top_pages` | The pages earning the most clicks |
| `compare_periods` | Two equal windows side by side, deltas already computed |
| `striking_distance` | Queries ranking 5 to 20, sorted by impressions left on the table |
| `query_search_analytics` | The full report, any dimensions, filters and date range |

`compare_periods` and `striking_distance` are the two you cannot get from the API in one call and cannot build in the UI at all without exporting to a spreadsheet.

### Indexing

| Tool | What it does |
|---|---|
| `inspect_url` | What Google knows about one URL: indexed, canonical, last crawl, rich results |
| `inspect_urls` | The same for a batch, as a compact table |

### Sitemaps

| Tool | What it does |
|---|---|
| `list_sitemaps` | Every submitted sitemap, when Google last read it, URL counts, errors |
| `get_sitemap` | Details for one |
| ● `submit_sitemap` | Submit or resubmit. The only recrawl signal the API can send |
| ● `delete_sitemap` | Stop tracking one. Needs `confirm: true` |

### Properties

| Tool | What it does |
|---|---|
| `list_sites` | Every property this account reaches, with permission level. Start here |
| `get_site` | One property and the permission held on it |
| ● `add_site` | Register a new property, unverified |
| ● `delete_site` | Remove a property. Needs `confirm: true` |
| `list_accounts` | Which Google accounts are signed in, and which is the default |

### Verification

| Tool | What it does |
|---|---|
| `get_verification_token` | Mint the DNS, meta or file token that proves ownership |
| ● `verify_site` | Claim ownership once the token is live |
| `list_verified_sites` | Everything this account has verified, wider than the property list |

Verification needs the browser sign-in. A service account cannot verify a property, because verification is tied to a human Google account.

## 7. Working safely 🛡️

Writes work by default. Publishing a sitemap is the point of having the tool, and a server where every write needs a flag just teaches you to set the flag once and forget it.

Three things instead.

**`confirm: true` on the two irreversible tools.** `delete_site` and `delete_sitemap`. Not on `submit_sitemap` or `add_site`: both are trivially undone, and asking for confirmation on everything trains the reflex that defeats asking at all.

**`GSC_READ_ONLY=1` removes writes entirely.** They are not registered, so they never appear in the tool list. A model cannot call a tool it cannot see. This is the right setting for an agent working unattended.

**`GSC_ALLOW_DESTRUCTIVE=0`** keeps `submit_sitemap` and `add_site` while dropping the two deletes.

**`GSC_AUDIT_LOG=<path>`** writes one JSON line per attempted write, allowed and failed alike.

Every tool carries MCP annotations so your client can decide what to auto-approve:

| | `readOnlyHint` | `destructiveHint` |
|---|---|---|
| Reads | true | false |
| `submit_sitemap`, `add_site`, `verify_site` | false | false |
| `delete_site`, `delete_sitemap` | false | true |

**On prompt injection.** A search query is whatever a stranger typed into Google, and a title read through URL inspection is whatever that page says. Both reach your model's context. Text from those fields is framed as data rather than instructions, which helps and is not a guarantee. For an agent running unattended against sites you do not control, `GSC_READ_ONLY=1` is the real defence.

## 8. What Search Console actually does 📊

The things that cost people an afternoon.

**Data lags two to three days.** Ask for "the last 7 days ending today" and the last few are empty or partial. Every tool here with a default window already ends three days back and tells you the dates it used. Pass `data_state: "all"` to `query_search_analytics` if you want the partial days anyway.

**The query breakdown never sums to the site total.** Google withholds rare queries to protect the people who typed them, so a per-query report always shows fewer clicks than the property total for the same window. That gap is anonymised traffic, not missing traffic, and it is normally larger than people expect.

**A property is not a website.** `https://example.com/` and `sc-domain:example.com` are two different properties with different data, and `https://example.com` without the trailing slash is not a valid property string at all. Passing the wrong shape returns "User does not have sufficient permission", which reads like a scope problem and sends people back to the consent screen. Run `list_sites` and copy exactly. These tools normalize what they can.

**Average position is a rank, so lower is better.** Position moving from 8 to 5 is an improvement. `compare_periods` returns `position_delta` already signed so positive always means better, because "position went up" is ambiguous in the exact place it matters most.

**There is no "request indexing" endpoint.** The button exists in the UI; Google exposes no API behind it. Resubmitting a sitemap is the only recrawl signal available programmatically. Anything claiming otherwise is either using the Indexing API, which only works for job postings and livestreams, or it is not doing what it says.

**About 16 months of history.** Ask for more and you get what exists, silently.

**Quotas are per property, not per token.** Roughly 1200 search analytics queries per minute, and about 2000 URL inspections per day with 600 per minute. `inspect_urls` paces itself, but a loop over a large site will hit the daily ceiling.

**Discover and Google News are different surfaces.** Pass `type: "discover"` and there is no query dimension and no device dimension at all. Asking for one returns an error rather than empty rows.

## 9. Your data 🔐

There is no backend. Nothing is sent anywhere except Google.

| What | Where |
|---|---|
| Refresh token, one per signed-in account | `~/.google-search-console-mcp/tokens.json`, mode `600` |
| Audit log, only if you set `GSC_AUDIT_LOG` | Wherever you point it |

`GSC_TOKEN_STORE` moves the token file. `logout <email>` deletes an entry from it, and [myaccount.google.com/permissions](https://myaccount.google.com/permissions) revokes Google's side, which is the half that actually matters.

Search Console data is read on demand and never cached to disk.

## 10. Running it on a server 🌐

claude.ai runs connectors from Anthropic's cloud, not from your machine, so it cannot start a local command. It needs a public HTTPS URL, which means the HTTP transport.

```bash
npx -y @thenavidm/google-search-console-mcp@latest --http --port 8000
```

That binds `127.0.0.1`. To bind anything else you must set `GSC_HTTP_TOKEN`, and the server refuses to start without it:

```bash
export GSC_HTTP_TOKEN="$(openssl rand -hex 32)"
npx -y @thenavidm/google-search-console-mcp@latest --http --host 0.0.0.0 --port 8000
```

The refusal is deliberate. Whatever can reach that port can read your site's entire search history and delete its properties.

Then in claude.ai: **Customize**, **Connectors**, **+**, **Add custom connector**, and paste the HTTPS URL ending in `/mcp`. On Team and Enterprise an owner adds it under **Organization settings**, **Connectors** first.

There is a `Dockerfile` if you would rather run it that way.

## 11. Troubleshooting 🔧

Start with `doctor`. It checks each failure mode separately and names the fix.

| What you see | What it is |
|---|---|
| Worked for a week, then every call fails | The OAuth app is still in **Testing** status, so Google expired the refresh token at 7 days. Publish the app and run `login` again. |
| `User does not have sufficient permission` | Wrong property string. `https://example.com/` and `sc-domain:example.com` are different properties. Run `list_sites` and copy one. |
| `doctor` says 0 properties | Signed in with a Google account that owns none. On a service account, its email was never added under **Settings**, **Users and permissions** on each property. |
| `Search Console API has not been used in project` | The API is switched off in your Google Cloud project. Enable it. |
| `unauthorized_client` | `GSC_CLIENT_ID` points at a different OAuth client than the one you signed in with. A refresh token only works with the client that minted it. |
| Empty results for the last few days | The two to three day data lag. Use `data_state: "all"` for partial days. |
| Fewer clicks per query than the site total | Expected. Google withholds rare queries. |
| Claude Desktop cannot find `npx` | It does not inherit your shell PATH. Use the absolute path from `which npx`. |
| Write tools missing from the tool list | `GSC_READ_ONLY=1` is set, which unregisters them. |

## 12. FAQ ❓

<details>
<summary><b>What is an MCP server?</b></summary>

A standard way to give an AI assistant real access to a tool, so it can act instead of guessing. You install it once, your assistant gains a set of tools, and it works in Claude, Cursor, Codex and anything else that speaks MCP.

Without one, an assistant asked about your search traffic can only tell you how Search Console works in general. With one, it reads your actual numbers.

</details>

<details>
<summary><b>What is Google Search Console?</b></summary>

Google's free tool for site owners. It shows what people searched before they landed on your site, which pages Google shows and where they rank, which pages Google has and has not indexed, and what it thinks is broken.

It is the only place Google tells you any of this. Analytics tells you what people did once they arrived; Search Console tells you what happened in Google before that.

</details>

<details>
<summary><b>Do I need to be technical to use this?</b></summary>

You need to be comfortable pasting commands into a terminal and clicking through a few pages in Google Cloud. The [setup guide](./references/setup.md) covers every click, and the prompt in section 3 hands the whole thing to an agent that walks you through it one step at a time.

The Google Cloud part is the hard bit, and it is a one-time five minutes.

</details>

<details>
<summary><b>Is my data sent anywhere? Who can see it?</b></summary>

There is no backend and no telemetry. The server runs on your machine, talks to Google, and returns the answer to your AI client. The only thing written to disk is your refresh token, at `~/.google-search-console-mcp/tokens.json` with `600` permissions.

Your search data does reach whichever AI model you are using, because that is the point. If that matters for a particular site, do not connect it.

</details>

<details>
<summary><b>What can it do that I cannot do in the Search Console UI already?</b></summary>

Two things it cannot do at all, and one it does slowly.

Comparing two periods with per-query deltas is an export-and-spreadsheet job in the UI. Here it is one call. Finding every query ranking between 5 and 20, ordered by impressions, is the same story.

Everything else it does faster: checking 30 URLs after a launch is 30 clicks in the UI and one call here.

</details>

<details>
<summary><b>Can it delete something by accident?</b></summary>

Two tools delete: `delete_site` removes a property from your account, and `delete_sitemap` stops Search Console tracking a sitemap. Both refuse to run without `confirm: true`.

Neither touches your website, and neither removes anything from Google's index. `delete_site` loses your account's access to that property's history until it is re-added and re-verified.

Set `GSC_READ_ONLY=1` and both disappear from the tool list entirely.

</details>

<details>
<summary><b>Does it cost anything?</b></summary>

No. The server is MIT licensed, Search Console is free, and the Google Cloud project you create is free. No card required, no billing to enable.

Your AI assistant costs whatever it already costs.

</details>

<details>
<summary><b>Does it work with ChatGPT, Cursor and claude.ai, or only Claude?</b></summary>

Any MCP client. Section 4 has copy-paste config for Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI and Gemini CLI.

claude.ai is the one that works differently: it runs connectors from Anthropic's cloud rather than your machine, so it needs the HTTP transport and somewhere to host it. See section 10.

</details>

<details>
<summary><b>Can I connect more than one Google account?</b></summary>

Yes. Run `login` again with a different account and both are stored. Every tool takes an optional `account` argument taking an email, and `list_accounts` shows what is signed in.

Useful when your own sites and a client's sit under different Google logins.

</details>

<details>
<summary><b>What happens when my token expires?</b></summary>

Access tokens last an hour and are refreshed automatically. You should never notice.

The exception is the one worth knowing: while your OAuth app's publishing status is **Testing**, Google expires the refresh token after 7 days, and everything stops. Publishing the app fixes it permanently. Section 3 covers it.

</details>

<details>
<summary><b>How do I disconnect it?</b></summary>

Remove the entry from your MCP client's config, then run `logout your@email.com` to delete the local token.

Then revoke Google's side at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). That is the half that matters: deleting the local file leaves a live grant behind.

</details>

<details>
<summary><b>Why can it not tell Google to index a page?</b></summary>

Because Google offers no such endpoint. "Request indexing" exists in the Search Console UI and has no API behind it. The Indexing API exists but only accepts job postings and livestreams.

Resubmitting a sitemap is the only recrawl signal available programmatically, which is what `submit_sitemap` is for.

</details>

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/navidmoazzez/google-search-console-mcp/issues) and I will help.

## About the author

Navid Moazzez is a leading AI business strategist and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. This MCP server is one piece of that system.

**Links**

- Personal website: [navid.me](https://navid.me)
- Store: [navid.bio](https://navid.bio)
- Navid Media: [navid.media](https://navid.media)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

## Dependencies

| Package | Licence | Why |
|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | The MCP protocol implementation |
| [zod](https://github.com/colinhacks/zod) | MIT | Tool input schemas |
| [express](https://github.com/expressjs/express) | MIT | The HTTP transport |

## License

MIT. See [LICENSE](./LICENSE).

Not affiliated with, endorsed by, or sponsored by Google. Google, Google Search Console and Google Cloud are trademarks of Google LLC.

---

© 2026 NM Media. Made with ❤️ by [Navid Moazzez](https://navid.me).
