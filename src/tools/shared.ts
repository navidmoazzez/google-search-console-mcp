import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { resolveToken } from "../auth.js"
import type { Config } from "../config.js"
import { annotations, audit, shouldRegister, type Sensitivity } from "../safety.js"

export const ACCOUNT = z
  .string()
  .optional()
  .describe(
    "Which signed-in Google account to act as, by email. Omit to use the default. Call list_accounts to see what is signed in.",
  )

export const SITE = z
  .string()
  .describe(
    'The Search Console property. Either a URL-prefix property ("https://navid.me/", trailing slash included) or a domain property ("sc-domain:navid.me"). A bare hostname is read as a domain property. Call list_sites for the exact strings this account owns, because the two shapes are different properties and mixing them up returns a 403.',
  )

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] }
}

export function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true }
}

export interface ToolContext {
  cfg: Config
  token(account?: string | null): Promise<string>
}

export function makeContext(cfg: Config): ToolContext {
  return {
    cfg,
    async token(account) {
      const resolved = await resolveToken(cfg, account)
      return resolved.token
    },
  }
}

/**
 * Register a tool, honouring read-only mode and logging writes.
 *
 * Gating happens at registration rather than at call time on purpose. A model
 * cannot call a tool it cannot see, whereas an error saying "writes are
 * disabled" is an invitation to try a different tool that might not be.
 */
export function tool<S extends z.ZodRawShape>(
  server: McpServer,
  ctx: ToolContext,
  spec: {
    name: string
    kind: Sensitivity
    description: string
    schema: S
    run: (args: z.infer<z.ZodObject<S>>, token: string) => Promise<unknown>
  },
): void {
  if (!shouldRegister(ctx.cfg, spec.kind)) return

  const run = async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const token = await ctx.token((args.account as string) ?? null)
        const result = await spec.run(args as z.infer<z.ZodObject<S>>, token)
        if (spec.kind !== "read") {
          await audit(ctx.cfg, { tool: spec.name, outcome: "allowed", args: redact(args) })
        }
        return ok(result)
      } catch (e) {
        if (spec.kind !== "read") {
          await audit(ctx.cfg, { tool: spec.name, outcome: "failed", error: String(e), args: redact(args) })
        }
        return fail(e)
      }
  }

  /* The SDK infers its callback signature from the schema, and the schema here
     is a generic that TypeScript cannot resolve at this call site. The cast is
     confined to this one line; every tool module is fully typed above it. */
  server.registerTool(
    spec.name,
    {
      description: spec.description,
      inputSchema: spec.schema,
      annotations: { title: spec.name, ...annotations(spec.kind) },
    },
    run as never,
  )
}

/** Arguments go into a log file on disk, so nothing token-shaped goes with them. */
function redact(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    out[k] = /token|secret|key|password/i.test(k) ? "[redacted]" : v
  }
  return out
}
