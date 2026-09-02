# Security

## Reporting a vulnerability

[Report it privately](https://github.com/navidmoazzez/google-search-console-mcp/security/advisories/new).

Please do not open a public issue for a security problem: an issue is visible to
everyone the moment you file it, including whoever would use the bug.

## What this server can reach

Worth knowing before you install it. With the default scopes, the credential it
holds can:

- Read every search query, page, impression and ranking Google has recorded for any property the signed-in account owns, going back about 16 months
- Read URL inspection results, which include the canonical Google chose and its crawl history for any URL on those properties
- Submit and remove sitemaps
- Add and remove properties from that Google account's Search Console
- With the `siteverification` scope, claim ownership of a site or domain on behalf of that account

It cannot read your email, your Drive, or anything else in the Google account.
The scopes are `webmasters` and `siteverification`, nothing wider.

Narrow it further by setting `GSC_SCOPES` to
`https://www.googleapis.com/auth/webmasters.readonly` and signing in again. The
verification and write tools then fail with Google's own error.

## Where credentials are stored

| | |
|---|---|
| Refresh token, one entry per signed-in account | `~/.google-search-console-mcp/tokens.json`, file mode `600`, directory mode `700` |
| Audit log, only if you set `GSC_AUDIT_LOG` | Wherever you point it |

`GSC_TOKEN_STORE` moves the token file. Nothing else is written to disk, and
Search Console data is never cached.

A service account key is read from wherever you point `GSC_SERVICE_ACCOUNT_KEY`
and is never copied.

`logout <email>` removes the local entry. That does not revoke Google's grant:
do that at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## The HTTP transport

`--http` binds `127.0.0.1` by default. Binding any other interface requires
`GSC_HTTP_TOKEN` and the server refuses to start without it, because anything
that can reach the port inherits everything listed above.

The token is compared on every request. Put TLS in front of it: the server
speaks plain HTTP and a bearer token over plain HTTP on a public network is
not protection.

## Deliberately not implemented

So an omission does not read as an oversight.

**No indexing request.** Google exposes no API behind the "Request indexing"
button. The Indexing API is a different product that only accepts job postings
and livestreams, and wiring it in here would imply a capability that does not
exist.

**No mobile-friendly test.** Still present in Google's discovery document, but
the service was retired and calls return errors.

**No credential-management tools.** Nothing in the MCP tool surface can read,
write or delete the token store. A model driving this server cannot exfiltrate
the credential it is using.

**No tool reads the audit log.** It is a record for you, not an input to the
model.

## Prompt injection

Search Console returns less user-authored text than a social API does, but it
returns some. A search query is whatever a stranger typed into Google, and page
content surfaced through URL inspection is whatever that page says. Both reach
your model's context, and "ignore your previous instructions" is a valid thing
to type into Google.

Two mitigations, and neither is complete. Fields carrying text this server did
not author are framed as data rather than instructions, with any attempt to
close the fence early neutralised. And the server instructions say the rule
before the first tool result arrives.

For an agent running unattended, particularly against properties you do not
control, `GSC_READ_ONLY=1` is the real defence. It unregisters every write tool,
so there is nothing for an injected instruction to reach.

## Good-faith research

Read, run and pull apart anything here. Nobody but the maintainer can change
this repository, so nothing you do while investigating puts it at risk.

The care is owed to the service the tool talks to, not to the code. When
testing, use your own account and your own data. Do not point it at somebody
else's, and do not hammer a shared API to the point where other people notice.
If a test could affect anyone but you, stop and send a private report first.

Research done in that spirit is welcome, and nothing here is a trap.
