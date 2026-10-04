import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PLANNER_MATERIAL_KEYS } from "./garden";
import { areaMaterial, frostRisk, plantingCalendar, pottingMix, raisedBedSoil, type ToolText } from "./tools";

/**
 * The MCP surface: five read-only tools over ./tools.ts.
 *
 * Descriptions are short on purpose. Every tool description is sent with every
 * request, so they say what the tool is for and what it needs, and nothing else.
 */

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const prices = {
  price_per_bag: z.number().min(0).max(10_000).optional().describe("Your price per bag, to compare bagged with bulk"),
  price_per_m3: z.number().min(0).max(10_000).optional().describe("Your bulk price per cubic metre"),
  delivery: z.number().min(0).max(10_000).optional().describe("Bulk delivery fee"),
  currency: z.enum(["AUD", "NZD"]).optional().describe("Defaults to AUD"),
};

function respond(result: ToolText) {
  return {
    content: [{ type: "text" as const, text: result.text }],
    ...(result.ok ? {} : { isError: true }),
  };
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "gardenmaths", version: "1.0.0" },
    {
      instructions:
        "Metric garden maths for Australia and New Zealand from GardenMaths: soil, compost, mulch and potting mix in litres, m³ and bags, bagged vs bulk at the user's prices, what to sow by month and town, and frost odds after Melbourne Cup Day.",
    },
  );

  server.registerTool(
    "raised_bed_soil",
    {
      title: "Soil for raised beds and pots",
      description:
        "Litres and bags of each material for one or more raised beds or round pots, filled in layers, and bagged vs bulk at the user's prices.",
      inputSchema: z.object({
        beds: z
          .array(
            z.object({
              shape: z.enum(["rectangle", "round"]),
              is_pot: z.boolean().optional().describe("A container rather than a garden bed: filled with potting mix by default"),
              length_cm: z.number().positive().max(100_000).optional(),
              width_cm: z.number().positive().max(100_000).optional(),
              diameter_cm: z.number().positive().max(100_000).optional().describe("For round beds and pots"),
              depth_cm: z.number().positive().max(1_000),
              quantity: z.number().int().min(1).max(9999).optional(),
              layers: z
                .array(z.object({ material: z.enum(PLANNER_MATERIAL_KEYS as [string, ...string[]]), depth_cm: z.number().positive() }))
                .max(20)
                .optional()
                .describe("Bottom to top. Omit to fill with topsoil (beds) or potting mix (pots)."),
            }),
          )
          .min(1)
          .max(60),
        bag_size_l: z.number().optional().describe("25, 30, 40, 50 or 60. Defaults to 30."),
        ...prices,
      }),
      annotations: READ_ONLY,
    },
    async (args) => respond(raisedBedSoil(args as Parameters<typeof raisedBedSoil>[0])),
  );

  server.registerTool(
    "area_material",
    {
      title: "Mulch, compost, topsoil or top dressing for an area",
      description:
        "Cubic metres, litres and bags of mulch, compost, topsoil or lawn top dressing for an area at a depth; topsoil also in tonnes and trailer loads.",
      inputSchema: z.object({
        material: z.enum(["mulch", "compost", "topsoil", "top_dressing"]),
        shape: z.enum(["rectangle", "circle", "area"]),
        length_m: z.number().positive().max(10_000).optional(),
        width_m: z.number().positive().max(10_000).optional(),
        diameter_m: z.number().positive().max(10_000).optional(),
        area_m2: z.number().positive().max(1_000_000).optional(),
        depth_mm: z.number().positive().max(2_000),
        quantity: z.number().int().min(1).max(9999).optional(),
        allow_settling: z.boolean().optional().describe("Add the page's allowance: 15% topsoil, 10% the others"),
        bag_size_l: z.number().optional().describe("Defaults to the page's usual bag (60 L mulch, 30 L others)"),
        topsoil_density: z.number().optional().describe("Topsoil only: 1.3 (moist, default), 1.4 (sandy loam) or 1.2 (dry screened) t/m³"),
        ...prices,
      }),
      annotations: READ_ONLY,
    },
    async (args) => respond(areaMaterial(args)),
  );

  server.registerTool(
    "potting_mix",
    {
      title: "Potting mix for pots",
      description: "Litres per pot, total litres and bags of potting mix for tapered, straight or square pots.",
      inputSchema: z.object({
        shape: z.enum(["tapered", "straight", "square"]),
        top_diameter_cm: z.number().positive().max(1_000).optional().describe("Inside diameter at the top (round pots)"),
        bottom_diameter_cm: z.number().positive().max(1_000).optional().describe("Inside diameter at the base (tapered pots)"),
        length_cm: z.number().positive().max(1_000).optional(),
        width_cm: z.number().positive().max(1_000).optional(),
        height_cm: z.number().positive().max(1_000),
        fill_pct: z.number().optional().describe("How full, in percent. Defaults to 90."),
        quantity: z.number().int().optional(),
        bag_size_l: z.number().optional().describe("10, 25, 30, 40 or 50. Defaults to 25."),
        price_per_bag: prices.price_per_bag,
        currency: prices.currency,
      }),
      annotations: READ_ONLY,
    },
    async (args) => respond(pottingMix(args)),
  );

  server.registerTool(
    "planting_calendar",
    {
      title: "What to sow",
      description:
        "What to sow or plant in a month for an Australian or New Zealand town or climate zone, or the months for one crop there.",
      inputSchema: z.object({
        place: z.string().optional().describe("Town, e.g. \"Melbourne\" or \"Auckland\""),
        zone: z.string().optional().describe("Climate zone instead of a town, e.g. \"temperate\" or \"nz-cool\""),
        month: z.number().int().min(1).max(12).optional().describe("1-12. Defaults to the current month in Australia."),
        crop: z.string().optional().describe("One crop, e.g. \"tomato\", for its months instead of a monthly list"),
      }),
      annotations: READ_ONLY,
    },
    async (args) => respond(plantingCalendar(args)),
  );

  server.registerTool(
    "frost_risk",
    {
      title: "Frost after Melbourne Cup Day",
      description:
        "How often an Australian town has had a frosty night after Melbourne Cup Day, and when the last frost usually comes (GardenMaths' analysis of daily BOM records). Other towns get their monthly station frost averages (BOM, or NIWA in New Zealand).",
      inputSchema: z.object({ town: z.string().describe("Town, e.g. \"Canberra\" or \"Ballarat\"") }),
      annotations: READ_ONLY,
    },
    async (args) => respond(frostRisk(args)),
  );

  return server;
}
