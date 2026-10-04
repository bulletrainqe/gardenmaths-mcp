# Eval report

Model: `claude-sonnet-5-5` through Claude Code (`claude -p`), with only this server connected. Endpoint: https://mcp.gardenmaths.com/mcp. Run on 2026-10-04.

- **Tasks passed: 10/10.** A task passes when the model called every required tool and its answer contains the figure the tools return.
- **Right tools chosen: 10/10.**
- **Median tokens per task: 92,206** (input, output and cache, as Claude Code reports them). Most of it is Claude Code's own system prompt and built-in tools, read again from cache on every model turn; this server's tool list is about 1,600 tokens.
- `ToolSearch` in the tool calls is Claude Code loading this server's tool definitions on demand. It is not a call to this server.

| # | Task | Tool calls | Right tools | Answer matches tools | Tokens |
|---|---|---|---|---|---|
| 1 | My raised bed is 2 m long, 1 m wide and 30 cm deep. I'll put 5 cm of gravel, then 10 cm of compost, then 15 cm of topsoil. How many litres in total, and how many 30 L bags of each? | ToolSearch → raised_bed_soil | yes | yes | 92,734 |
| 2 | For that same 2 m by 1 m, 30 cm deep bed (5 cm gravel, 10 cm compost, 15 cm topsoil): bags cost $9 each, or bulk soil is $85 per cubic metre plus $70 delivery. Which is cheaper? | ToolSearch → raised_bed_soil | yes | yes | 92,922 |
| 3 | How much potting mix do I need for two square pots, 60 by 25 cm inside and 27 cm deep, filled to 90%? How many 25 L bags is that? | ToolSearch → potting_mix | yes | yes | 91,706 |
| 4 | How many 60 L bags of mulch do I need for a 4 m by 2 m garden bed, 75 mm deep? | ToolSearch → area_material | yes | yes | 92,206 |
| 5 | I need topsoil for a new lawn area 10 m by 6 m, 100 mm deep. How many tonnes is that, and how many loads in a 6x4 box trailer? | ToolSearch → area_material | yes | yes | 92,487 |
| 6 | What vegetables can I plant in Melbourne in October? | ToolSearch → planting_calendar → frost_risk | yes | yes | 94,070 |
| 7 | When should I plant tomatoes in Auckland? | ToolSearch → planting_calendar → frost_risk | yes | yes | 92,161 |
| 8 | How often does Canberra get a frost after Melbourne Cup Day? | ToolSearch → frost_risk | yes | yes | 91,386 |
| 9 | In Cooma, when does the last frost of spring usually come? | ToolSearch → frost_risk | yes | yes | 91,051 |
| 10 | How many 30 L bags of compost do I need to top-dress a round bed 3 m across, 50 mm deep? | ToolSearch → area_material | yes | yes | 92,159 |

Reproduce: `node eval/run.mjs <mcp-url> <model>`. Raw transcripts are written to `eval/out/`.
