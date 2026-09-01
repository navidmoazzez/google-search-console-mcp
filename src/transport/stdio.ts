import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildServer } from "../server.js"
import { loadConfig } from "../config.js"

export async function runStdio(): Promise<void> {
  const server = buildServer(loadConfig())
  const transport = new StdioServerTransport()
  await server.connect(transport)
  /* Never write to stdout here. stdout is the JSON-RPC channel, and a stray
     console.log corrupts the stream in a way that surfaces as the client
     silently failing to see any tools. */
  process.stderr.write("google-search-console-mcp ready on stdio\n")
}
