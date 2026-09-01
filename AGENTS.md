# Working on this repo

For an agent editing this server. Installation and usage live in the README.

## Run it

```bash
npm install
npm run build
npm test           # vitest, no network, no credentials
npm run typecheck
node dist/index.js doctor
```

Tests never touch the network and never need a token. A test that needs
credentials is a test nobody runs, CI least of all. `tests/helpers.ts` has the
faked fetch every test goes through.

## Layout

| | |
|---|---|
| `src/index.ts` | argv parsing and transport selection, nothing else |
| `src/server.ts` | assembles the server and holds the instructions string |
| `src/config.ts` | every environment variable is read here and nowhere else |
| `src/auth.ts` | the three credential routes, the loopback login, refresh |
| `src/safety.ts` | annotations, registration gating, audit log, injection framing |
| `src/doctor.ts` | one check per way this can be broken |
| `src/api/client.ts` | the HTTP layer, error mapping, property normalization |
| `src/tools/` | one module per group, grouped by what they reach |
| `src/format/rows.ts` | shaping API output for a model |

## Decisions already made

**Writes are on by default.** Only `delete_site` and `delete_sitemap` require
`confirm`. Adding `confirm` to `submit_sitemap` would teach a model to pass it
reflexively, which is worse than not having it.

**Gating happens at registration, not at call time.** `shouldRegister` decides
whether a tool exists. An error saying "writes are disabled" is an invitation
to try a different tool; an absent tool is not.

**Property strings are normalized in `api/client.ts`, once.** Do not add
per-tool normalization.

**Every default window ends three days back.** Search Console finalises data on
a lag and a window ending today reads as a broken connector. `DATA_LAG_DAYS` in
`format/rows.ts` is the single place that number lives.

**Average position is weighted by impressions in `totals()`.** A plain mean lets
a three-impression query move the number as much as a thirty-thousand-impression
one.

## Adding a tool

Register it through the `tool()` helper in `src/tools/shared.ts` rather than
calling `server.registerTool` directly. The helper handles the account argument,
read-only gating, annotations and the audit log, and skipping it means a tool
that ignores `GSC_READ_ONLY`.

Pick the `kind` honestly. `read` for anything that changes nothing,
`destructive` only for what cannot be undone.

The description is the interface. A model reads it and cannot see the code, so
say what the tool reaches, what it costs, and what will surprise the caller.
Platform constraints belong in the description, not only in the README: quota
limits and the property-string trap prevent a whole class of failed calls when
they are stated where the model reads them.

## Before claiming it works

`npm test` is not enough. Run a real client handshake:

```bash
npm run build
node dist/index.js doctor
```

and connect it from an actual MCP client. A tool can build, typecheck and pass
unit tests while failing to register.

## Do not

Do not write to stdout from the stdio transport. stdout is the JSON-RPC channel
and a stray `console.log` corrupts it, which surfaces as the client seeing no
tools at all and no error anywhere.

Do not add a `mobileFriendlyTest` tool. It is still in Google's discovery
document but the service was retired, so it returns errors.

Do not let a failed audit-log write fail the action it was recording. It is a
record, not a control.
