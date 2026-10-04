# GardenMaths MCP server

Metric garden maths for Australia and New Zealand inside Claude, ChatGPT, Cursor and VS Code. You can ask:

- how much soil a layered raised bed takes, and whether bags or bulk delivery is cheaper at your prices;
- how much mulch, compost, topsoil or potting mix a job needs;
- what to sow this month in your town;
- how often your town has had a frost after Melbourne Cup Day.

**Endpoint:** `https://mcp.gardenmaths.com/mcp` (Streamable HTTP, no sign-in)

## Add it in 30 seconds

- **claude.ai:** Settings → Connectors → Add custom connector → paste the endpoint.
- **Claude Code:**
  ```bash
  claude mcp add --transport http gardenmaths https://mcp.gardenmaths.com/mcp
  ```
- **Cursor** (`.cursor/mcp.json`):
  ```json
  { "mcpServers": { "gardenmaths": { "url": "https://mcp.gardenmaths.com/mcp" } } }
  ```
- **VS Code** (`.vscode/mcp.json`):
  ```json
  { "servers": { "gardenmaths": { "type": "http", "url": "https://mcp.gardenmaths.com/mcp" } } }
  ```
- **ChatGPT:** turn on Developer mode (Settings → Security and login), then add a developer-mode app with the endpoint and "No authentication".

Then ask, for example:

> My raised bed is 2 m by 1 m and 30 cm deep: 5 cm gravel, 10 cm compost, 15 cm topsoil. Bags are $9, or bulk is $85 a cubic metre plus $70 delivery. What do I need, and which is cheaper?

The answer: 600 L in all, which is 4, 7 and 10 bags of 30 L. Bagged costs $189 and bulk $121, so bulk delivery is cheaper by $68. These are the same figures the GardenMaths site gives and its own tests pin.

## Tools

| Tool | What it does |
|---|---|
| `raised_bed_soil` | Litres and bags of each material for rectangular or round beds and pots, filled in layers, and bagged vs bulk at the caller's prices |
| `area_material` | Mulch, compost, topsoil or lawn top dressing for an area at a depth. Topsoil also comes in tonnes and trailer loads. |
| `potting_mix` | Litres per pot and bags for tapered, straight or square pots |
| `planting_calendar` | What to sow in a month for one of 87 AU and NZ towns or one of 8 climate zones, or one crop's months. Flags frost-tender crops the way the site does. |
| `frost_risk` | How often a town has had a frosty night after Melbourne Cup Day, and when the last frost usually comes. Covers 56 Australian towns; elsewhere it gives monthly station frost averages. |

All five tools are read-only and say so in their annotations.

## Design

- **Ported formulas, pinned to the site.** GardenMaths keeps its formulas inside browser scripts that cannot be imported. `src/garden.ts` ports them line by line, with the site's units, rounding and tie rules, and cites the file and line of each original. The tests pin the raised-bed and potting-mix results the site's own browser tests pin.
- **The site's own wording.** Each page's allowance label is kept ("for settling and compaction", "for hollows"), along with the method labels, the frost units (BOM nights at 2 °C or below; NIWA ground frosts in New Zealand) and the rule for flagging frost-tender crops.
- **No invented prices.** Costs use the caller's prices. The site's example prices are offered as illustrative AUD figures, never as quotes or retailer prices.
- **Small context cost.** The whole `tools/list` response for the five tools is about 6 KB, roughly 1,600 tokens.
- **Forgiving input.** It accepts "Hobart TAS", "Mt Gambier", "Whangarei" without the macron, "Lettuces", "kumara" and "silver beet". An input it cannot use is named in the result.

## How it's built

- **Stack:** TypeScript, the official MCP TypeScript SDK v2 and Cloudflare's Agents SDK (`createMcpHandler`). It runs as a stateless Streamable HTTP server on Cloudflare Workers.
- **Protection:** Workers Rate Limiting at 60 requests a minute per IP address, and Host/Origin allowlists.
- **Data:** The planting and frost data are bundled at build time from the GardenMaths repository in a sibling folder. This repository holds the ported formulas, the MCP layer, its tests and the eval. To try the server, use the public endpoint.

## Tests and checks

- **27 unit tests** (Vitest). They cover:
  - the figures the site's browser tests pin (600 L and 21 bags, $189 vs $121, a 235.6 L round pot, 17.2 L and 72.9 L of potting mix);
  - the frost guide's figures for Cooma, Melbourne and Canberra;
  - regressions for every finding of the review below.
- **Independent review before release.** Three reviewers checked the server separately:
  - **Formula parity** with the site's JavaScript. This included 800,000 fuzz cases on bag rounding, with no differences.
  - **Claims, attribution and licensing.**
  - **Live edge cases.**

  Their findings were fixed before publishing. Among them were the trailer-payload assumption, NZ ground frosts, frost warnings and name matching.
- **Official MCP conformance scenarios:** `server-initialize`, `ping` and `tools-list` pass.
- **Eval:** `eval/run.mjs` sends 10 realistic questions through Claude Code with only this server connected. It checks that the model called the right tools and quoted the figures they return.
  - Run of 4 Oct 2026, after the review fixes (Claude Sonnet 5.5): **10/10 passed**, right tools 10/10. The run before the fixes also scored 10/10.
  - Full table: [`eval/REPORT.md`](eval/REPORT.md).

## Data and sources

- **Formulas and example prices:** [GardenMaths](https://gardenmaths.com), a DueRiva project. All results are estimates; confirm quantities with your supplier before you buy.
- **Planting calendar:** GardenMaths' compilation of the Australian and New Zealand gardening authorities listed on its [planting calendar](https://gardenmaths.com/planting-calendar/).
- **Frost after Cup Day:** "GardenMaths analysis of Bureau of Meteorology data via SILO", [frost guide](https://gardenmaths.com/guides/frost-after-melbourne-cup-day/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); SILO © Queensland Government.
- **Monthly frost averages:** Bureau of Meteorology in Australia; NIWA (now Earth Sciences New Zealand), mean number of days of ground frost, 1991–2020, in New Zealand.

## Need this for your API?

I build tested MCP servers like this one for other companies' APIs: up to 8 tools in 5 business days for a fixed price, with an eval report. See the **MCP Server Sprint** on [Upwork](https://www.upwork.com/freelancers/~01800cc6ed7fb14088).

## Licence

The code in this repository is MIT licensed. The data is not included here and keeps its own terms: the frost analysis is CC BY 4.0 with the credit above, and the planting data is © GardenMaths.
