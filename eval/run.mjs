// Runs every task in tasks.json through Claude Code (`claude -p`) with only this
// MCP server connected, then writes results.json and REPORT.md.
//
// Usage: node eval/run.mjs [mcp-url] [model]
// A task passes when the model called every required tool and its final answer
// contains the figure the tools return for that question.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "https://mcp.gardenmaths.com/mcp";
const model = process.argv[3] ?? "sonnet";
const tasks = JSON.parse(readFileSync(join(here, "tasks.json"), "utf8"));
const PREFIX = "mcp__gardenmaths__";

mkdirSync(join(here, "out"), { recursive: true });
const config = join(here, "out", "mcp.json");
writeFileSync(config, JSON.stringify({ mcpServers: { gardenmaths: { type: "http", url } } }, null, 2));

const SYSTEM =
  "You are a helpful assistant for gardeners in Australia and New Zealand. Use the available tools. Quote the figures the tools return.";

const results = [];
for (const task of tasks) {
  const started = Date.now();
  const run = spawnSync(
    "claude",
    [
      "-p", task.prompt,
      "--model", model,
      "--output-format", "stream-json",
      "--verbose",
      "--mcp-config", config,
      "--strict-mcp-config",
      "--system-prompt", SYSTEM,
      "--allowedTools", `${PREFIX}raised_bed_soil,${PREFIX}area_material,${PREFIX}potting_mix,${PREFIX}planting_calendar,${PREFIX}frost_risk`,
      "--disallowedTools", "Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Task,Agent,NotebookEdit,TodoWrite",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 300_000 },
  );
  writeFileSync(join(here, "out", `task-${task.id}.jsonl`), run.stdout ?? "");

  const events = (run.stdout ?? "")
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const toolCalls = [];
  let toolErrors = 0;
  for (const event of events) {
    for (const block of event.message?.content ?? []) {
      if (event.type === "assistant" && block.type === "tool_use") toolCalls.push(String(block.name).replace(PREFIX, ""));
      if (event.type === "user" && block.type === "tool_result" && block.is_error) toolErrors += 1;
    }
  }
  const final = events.findLast((event) => event.type === "result") ?? {};
  const answer = String(final.result ?? "");
  const usage = final.usage ?? {};
  const tokens =
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  const toolsOk = task.requiredTools.every((tool) => toolCalls.includes(tool));
  const answerOk =
    (task.mustInclude ?? []).every((text) => answer.includes(text)) &&
    (task.mustIncludeAny ? task.mustIncludeAny.some((text) => answer.toLowerCase().includes(text.toLowerCase())) : true);

  results.push({
    id: task.id,
    prompt: task.prompt,
    toolCalls,
    toolErrors,
    toolsOk,
    answerOk,
    pass: toolsOk && answerOk,
    tokens,
    costUsd: final.total_cost_usd ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
    answer,
  });
  console.log(`task ${task.id}: ${toolsOk && answerOk ? "PASS" : "FAIL"} tools=[${toolCalls.join(", ")}] tokens=${tokens}`);
}

const initEvent = (() => {
  const raw = readFileSync(join(here, "out", `task-${tasks[0].id}.jsonl`), "utf8");
  for (const line of raw.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "system" && event.model) return event;
    } catch {}
  }
  return {};
})();

const passed = results.filter((r) => r.pass).length;
const toolsRight = results.filter((r) => r.toolsOk).length;
const sortedTokens = results.map((r) => r.tokens).sort((a, b) => a - b);
const median = sortedTokens[Math.floor(sortedTokens.length / 2)] ?? 0;
writeFileSync(join(here, "results.json"), JSON.stringify({ url, model: initEvent.model ?? model, results }, null, 2));

const rows = results.map(
  (r) =>
    `| ${r.id} | ${r.prompt.replace(/\|/g, "\\|")} | ${r.toolCalls.join(" → ")} | ${r.toolsOk ? "yes" : "no"} | ${r.answerOk ? "yes" : "no"} | ${r.tokens.toLocaleString("en-US")} |`,
);
writeFileSync(
  join(here, "REPORT.md"),
  [
    "# Eval report",
    "",
    `Model: \`${initEvent.model ?? model}\` through Claude Code (\`claude -p\`), with only this server connected. Endpoint: ${url}. Run on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    `- **Tasks passed: ${passed}/${results.length}.** A task passes when the model called every required tool and its answer contains the figure the tools return.`,
    `- **Right tools chosen: ${toolsRight}/${results.length}.**`,
    `- **Median tokens per task: ${median.toLocaleString("en-US")}** (input, output and cache, as Claude Code reports them). Most of it is Claude Code's own system prompt and built-in tools, read again from cache on every model turn; this server's tool list is about 1,600 tokens.`,
    "- `ToolSearch` in the tool calls is Claude Code loading this server's tool definitions on demand. It is not a call to this server.",
    "",
    "| # | Task | Tool calls | Right tools | Answer matches tools | Tokens |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "Reproduce: `node eval/run.mjs <mcp-url> <model>`. Raw transcripts are written to `eval/out/`.",
    "",
  ].join("\n"),
);
console.log(`passed ${passed}/${results.length}, right tools ${toolsRight}/${results.length}, median tokens ${median}`);
