import express from "express"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { buildServer } from "../server.js"
import { loadConfig } from "../config.js"

/**
 * Streamable HTTP, for claude.ai and anything else that cannot run a local
 * command.
 *
 * It binds to loopback unless GSC_HTTP_TOKEN is set. The credential this server
 * holds can read a site's entire search history and delete its properties, so
 * anything that can reach the port can do that too. Refusing to bind publicly
 * without a token is the difference between hosting a connector and publishing
 * one.
 */
export async function runHttp(opts: { port: number; host?: string }): Promise<void> {
  const cfg = loadConfig()
  const bearer = process.env.GSC_HTTP_TOKEN?.trim() || null
  const requestedHost = opts.host || process.env.GSC_HTTP_HOST?.trim() || "127.0.0.1"
  const isLoopback = requestedHost === "127.0.0.1" || requestedHost === "localhost" || requestedHost === "::1"

  if (!isLoopback && !bearer) {
    throw new Error(
      `Refusing to bind ${requestedHost} without GSC_HTTP_TOKEN. Anything that can reach the port would be able to read this site's search history and delete its properties. Set GSC_HTTP_TOKEN to a long random string and send it as an Authorization: Bearer header, or bind 127.0.0.1 and put a reverse proxy in front.`,
    )
  }

  const app = express()
  app.use(express.json({ limit: "4mb" }))

  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: "google-search-console-mcp" })
  })

  app.post("/mcp", async (req, res) => {
    if (bearer) {
      const header = req.header("authorization") || ""
      const supplied = header.replace(/^Bearer\s+/i, "")
      /* Length-independent compare is overkill for a config token, but a plain
         !== leaks length through timing and costs nothing to avoid. */
      if (supplied.length !== bearer.length || supplied !== bearer) {
        res.status(401).json({ error: "unauthorized" })
        return
      }
    }
    /* A fresh server and transport per request. Sharing one across concurrent
       requests interleaves their responses on the same stream. */
    const server = buildServer(cfg)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
    res.on("close", () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  await new Promise<void>((resolve) => {
    app.listen(opts.port, requestedHost, () => {
      process.stderr.write(
        `google-search-console-mcp listening on http://${requestedHost}:${opts.port}/mcp${bearer ? " (bearer token required)" : ""}\n`,
      )
      resolve()
    })
  })
}
