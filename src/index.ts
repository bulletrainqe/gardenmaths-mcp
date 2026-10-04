import { createMcpHandler } from "agents/mcp/server";
import { createServer } from "./mcp";

interface Env {
  /** Workers Rate Limiting binding; absent in tests and plain local runs. */
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

// Host and Origin checks guard a local run against DNS rebinding and pin
// production to its two names. Server-side clients (claude.ai, ChatGPT) send no
// Origin; their web origins are allowed too, in case a client starts sending one.
const HOSTNAMES = ["mcp.gardenmaths.com", "gardenmaths-mcp.burak-410.workers.dev", "localhost", "127.0.0.1", "[::1]"];
const CLIENT_ORIGINS = ["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com"];
const mcp = createMcpHandler(createServer, {
  route: "/mcp",
  allowedHostnames: HOSTNAMES,
  allowedOriginHostnames: [...HOSTNAMES, ...CLIENT_ORIGINS],
});

function landing(origin: string): string {
  return [
    "GardenMaths MCP server: metric garden soil, mulch and potting-mix maths, planting calendars and frost odds for Australia and New Zealand, inside Claude, ChatGPT, Cursor and VS Code.",
    "",
    `MCP endpoint (Streamable HTTP, no sign-in): ${origin}/mcp`,
    "",
    "claude.ai: Settings > Connectors > Add custom connector, paste the URL above.",
    `Claude Code: claude mcp add --transport http gardenmaths ${origin}/mcp`,
    "",
    "Tools: raised_bed_soil, area_material, potting_mix, planting_calendar, frost_risk.",
    "Data: GardenMaths (gardenmaths.com). Frost odds: \"GardenMaths analysis of Bureau of Meteorology data via SILO\", https://gardenmaths.com/guides/frost-after-melbourne-cup-day/ (CC BY 4.0). NZ frost averages: NIWA (now Earth Sciences New Zealand).",
  ].join("\n");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(landing(url.origin), {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/mcp" && env.RATE_LIMITER) {
      const key = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) {
        return new Response("Rate limit: 60 requests a minute per IP address.", {
          status: 429,
          headers: { "retry-after": "60" },
        });
      }
    }

    return mcp(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
