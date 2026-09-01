import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ToolContext } from "./shared.js"
import { registerSiteTools } from "./sites.js"
import { registerAnalyticsTools } from "./analytics.js"
import { registerSitemapTools } from "./sitemaps.js"
import { registerInspectTools } from "./inspect.js"
import { registerVerificationTools } from "./verification.js"

/* Grouped by what they reach, not by which endpoint they call. The reader's
   question is always "what can this see", never "which URL is behind it". */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerSiteTools(server, ctx)
  registerAnalyticsTools(server, ctx)
  registerSitemapTools(server, ctx)
  registerInspectTools(server, ctx)
  registerVerificationTools(server, ctx)
}
