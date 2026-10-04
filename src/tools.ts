import frostData from "@gardenmaths/data/frost-dates.json";
import plantingData from "@gardenmaths/data/planting.json";
import {
  AREA_MATERIALS,
  PLANNER_BAG_SIZES,
  PLANNER_MATERIALS,
  POTTING_BAG_SIZES,
  TOPSOIL_DENSITIES,
  TRAILER_PAYLOAD_KG,
  areaVolume,
  bagsFor,
  cmToMm,
  compareCost,
  computeProject,
  materialBags,
  potLitres,
  structVolL,
  validateLayers,
  type AreaMaterial,
  type Layer,
  type PlannerMaterial,
  type PotShape,
  type Structure,
} from "./garden";

/**
 * The demo's five tools as plain functions over GardenMaths' formulas
 * (./garden.ts) and its planting and frost data. This layer validates input
 * and words the answer so a model can use it in one reading; the wording
 * follows the site's own labels. ./mcp.ts wraps it for the protocol.
 */

export type ToolText = { ok: boolean; text: string };

const ok = (text: string): ToolText => ({ ok: true, text });
const fail = (text: string): ToolText => ({ ok: false, text });

const SITE = "https://gardenmaths.com";
const ESTIMATE = "Estimate only: confirm quantities with your supplier before you buy.";
export type Currency = "AUD" | "NZD";

/** Fixed decimals, for computed figures. */
const fmt = (value: number, digits = 2) =>
  value.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Up to `max` decimals, for echoing what the caller sent. */
const num = (value: number, max = 2) => value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: max });
const litres = (value: number) => `${fmt(value, 1)} L`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** site.js money: the same figures, labelled $ or NZ$; there is no exchange rate. */
const money = (value: number, currency: Currency = "AUD") => `${currency === "NZD" ? "NZ$" : "$"}${fmt(value, 2)}`;

/** Lower-case ASCII words joined by dashes: "Whangārei" and "whangarei" compare equal. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
}

type Prices = {
  price_per_bag?: number | undefined;
  price_per_m3?: number | undefined;
  delivery?: number | undefined;
  currency?: Currency | undefined;
};

function costLines(bags: number, bagL: number, m3: number, prices: Prices, example: string): string[] {
  const currency = prices.currency ?? "AUD";
  const perBag = prices.price_per_bag;
  const perM3 = prices.price_per_m3;
  if (!perBag && !perM3) {
    return [
      `Cost: pass price_per_bag and price_per_m3 (plus delivery) from a local quote to compare bagged with bulk. GardenMaths' example prices are ${example} (illustrative AUD figures, not quotes).`,
    ];
  }
  const delivery = prices.delivery ?? 0;
  const { bagCost, bulkCost, winner, savingCents } = compareCost(bags, m3, perBag ?? 0, perM3 ?? 0, delivery);
  const lines = [`Cost at your prices (${currency}):`];
  if (perBag) lines.push(`- Bagged: ${plural(bags, "bag", "bags")} of ${bagL} L at ${money(perBag, currency)} = ${money(bagCost, currency)}.`);
  if (perM3) {
    lines.push(`- Bulk: ${fmt(m3, 3)} m³ at ${money(perM3, currency)} + ${money(delivery, currency)} delivery = ${money(bulkCost, currency)}.`);
  }
  if (perBag && perM3) {
    lines.push(
      winner === "tie"
        ? `Bagged and bulk cost the same: ${money(bagCost, currency)}.`
        : `${winner === "bagged" ? "Bagged" : "Bulk delivery"} is cheaper by ${money(savingCents / 100, currency)}.`,
    );
  }
  return lines;
}

/* -------------------------------------------------------------------------
 * raised_bed_soil
 * ---------------------------------------------------------------------- */

export type BedInput = {
  shape: "rectangle" | "round";
  is_pot?: boolean | undefined;
  length_cm?: number | undefined;
  width_cm?: number | undefined;
  diameter_cm?: number | undefined;
  depth_cm: number;
  quantity?: number | undefined;
  layers?: { material: PlannerMaterial; depth_cm: number }[] | undefined;
};

/** Beyond this the cost cents stop being exact; the site's calculators refuse such input too. */
const MAX_LITRES = 1e9;

export function raisedBedSoil(input: { beds: BedInput[]; bag_size_l?: number | undefined } & Prices): ToolText {
  const bagL = input.bag_size_l ?? 30;
  if (!(PLANNER_BAG_SIZES as readonly number[]).includes(bagL)) {
    return fail(`bag_size_l must be one of ${PLANNER_BAG_SIZES.join(", ")} litres.`);
  }
  if (input.beds.length === 0) return fail("Give at least one bed or pot.");

  const structures: Structure[] = [];
  const described: string[] = [];
  const problems: string[] = [];
  input.beds.forEach((bed, index) => {
    const n = `Bed ${index + 1}`;
    if (bed.shape === "rectangle" && (!bed.length_cm || !bed.width_cm)) {
      problems.push(`${n} is a rectangle, so it needs length_cm and width_cm.`);
      return;
    }
    if (bed.shape === "round" && !bed.diameter_cm) {
      problems.push(`${n} is round, so it needs diameter_cm.`);
      return;
    }
    const defaultFill: PlannerMaterial = bed.is_pot ? "potting_mix" : "topsoil";
    const given = bed.layers ?? [{ material: defaultFill, depth_cm: bed.depth_cm }];
    const layers: Layer[] = given.map((layer) => ({ material: layer.material, depthMm: cmToMm(layer.depth_cm) }));
    const structure: Structure = {
      type: bed.shape === "rectangle" ? "bed" : "pot",
      lengthMm: cmToMm(bed.length_cm ?? 0),
      widthMm: cmToMm(bed.width_cm ?? 0),
      diameterMm: cmToMm(bed.diameter_cm ?? 0),
      depthMm: cmToMm(bed.depth_cm),
      quantity: Math.max(1, Math.round(bed.quantity ?? 1)),
      layers,
    };
    const sizes = structure.type === "bed" ? [structure.lengthMm, structure.widthMm] : [structure.diameterMm];
    if ([...sizes, structure.depthMm].some((mm) => mm <= 0) || layers.some((layer) => layer.depthMm <= 0)) {
      problems.push(`${n}: a size or layer depth rounds to 0 mm; the planner works in whole millimetres.`);
      return;
    }
    const check = validateLayers(structure.depthMm, structure.layers);
    if (!check.ok) {
      const rounded = structure.layers.map((layer) => num(layer.depthMm / 10, 1)).join(" + ");
      problems.push(`${n}: its layers (${rounded} cm, each rounded to the nearest mm) add up to ${num(check.used / 10, 1)} cm, deeper than the bed's ${num(structure.depthMm / 10, 1)} cm, so it was left out.`);
      return;
    }
    structures.push(structure);
    const kind = bed.is_pot ? "pot" : structure.type === "bed" ? "rectangular bed" : "round bed";
    const size =
      structure.type === "bed"
        ? `${num(structure.lengthMm / 10, 1)} x ${num(structure.widthMm / 10, 1)} cm`
        : `${num(structure.diameterMm / 10, 1)} cm across`;
    const layerText = structure.layers.length
      ? structure.layers.map((layer) => `${PLANNER_MATERIALS[layer.material].toLowerCase()} ${num(layer.depthMm / 10, 1)} cm`).join(", ")
      : "none given, so nothing is filled (omit layers to fill it)";
    described.push(
      `- ${n}: ${structure.quantity > 1 ? `${structure.quantity} x ` : ""}${kind} ${size}, ${num(structure.depthMm / 10, 1)} cm deep, ${litres(structVolL(structure) * structure.quantity)}; layers: ${layerText}.`,
    );
  });
  if (structures.length === 0) return fail(problems.join("\n"));

  const project = computeProject(structures);
  if (!Number.isFinite(project.totalL) || project.totalL > MAX_LITRES) {
    return fail("This volume is too large to calculate accurately. Check the units: sizes are in centimetres.");
  }
  const bags = materialBags(project.mats, bagL);
  const lines = ["Raised beds and pots:", ...described];
  if (problems.length) lines.push(`Totals cover ${structures.length} of ${input.beds.length} beds; see the notes below.`);
  if (project.totalL <= 0) {
    lines.push("Nothing to fill: the layers given hold no soil.");
  } else {
    lines.push(`Soil and materials (${bagL} L bags, rounded up for each material):`);
    for (const key of Object.keys(project.mats) as PlannerMaterial[]) {
      lines.push(`- ${PLANNER_MATERIALS[key]}: ${litres(project.mats[key] ?? 0)}, ${plural(bags.counts[key] ?? 0, "bag", "bags")}.`);
    }
    lines.push(`Total: ${litres(project.totalL)} (${fmt(project.totalM3, 3)} m³), ${plural(bags.total, "bag", "bags")} of ${bagL} L.`);
  }
  if (project.unfilledL > 0.05) lines.push(`Left unfilled by the layers: ${litres(project.unfilledL)}.`);
  lines.push(...problems);
  if (project.totalL > 0) lines.push(...costLines(bags.total, bagL, project.totalM3, input, "$9 a bag, $85 a m³ and $70 delivery"));
  lines.push(
    `${ESTIMATE} Fresh soil mixes settle, so allow 10-15% extra; these are exact volumes with no allowance added.`,
    `Formulas: GardenMaths raised bed soil calculator, ${SITE}/.`,
  );
  return ok(lines.join("\n"));
}

/* -------------------------------------------------------------------------
 * area_material
 * ---------------------------------------------------------------------- */

export function areaMaterial(
  input: {
    material: AreaMaterial;
    shape: "rectangle" | "circle" | "area";
    length_m?: number | undefined;
    width_m?: number | undefined;
    diameter_m?: number | undefined;
    area_m2?: number | undefined;
    depth_mm: number;
    quantity?: number | undefined;
    allow_settling?: boolean | undefined;
    bag_size_l?: number | undefined;
    topsoil_density?: number | undefined;
  } & Prices,
): ToolText {
  const info = AREA_MATERIALS[input.material];
  let area: number;
  if (input.shape === "rectangle") {
    if (!input.length_m || !input.width_m) return fail("A rectangle needs length_m and width_m.");
    area = input.length_m * input.width_m;
  } else if (input.shape === "circle") {
    if (!input.diameter_m) return fail("A circle needs diameter_m.");
    const r = input.diameter_m / 2;
    area = Math.PI * r * r;
  } else {
    if (!input.area_m2) return fail("Give area_m2 for a known area.");
    area = input.area_m2;
  }
  const bagL = input.bag_size_l ?? info.defaultBag;
  if (!(info.bagSizes as readonly number[]).includes(bagL)) {
    return fail(`${info.name} comes in ${info.bagSizes.join(", ")} L bags on GardenMaths; pick one of those.`);
  }
  const density = input.topsoil_density ?? 1.3;
  const densityLabel = TOPSOIL_DENSITIES[density as keyof typeof TOPSOIL_DENSITIES];
  if (input.material === "topsoil" && !densityLabel) {
    return fail(`topsoil_density must be one of ${Object.keys(TOPSOIL_DENSITIES).join(", ")} t/m³.`);
  }
  const qty = Math.max(1, Math.round(input.quantity ?? 1));
  const settle = input.allow_settling ? info.settlePct : null;
  const { m3, litres: l } = areaVolume(area, input.depth_mm, qty, settle);
  const bags = bagsFor(l, bagL);
  const depth = num(input.depth_mm);

  const lines = [
    `${info.name}: ${fmt(area * qty, 2)} m² at ${depth} mm deep${settle !== null ? `, plus ${settle}% ${info.allowance}` : ""}:`,
    `- ${fmt(m3, 3)} m³ (${litres(l)}), ${plural(bags, "bag", "bags")} of ${bagL} L.`,
    `- At ${depth} mm, 1 m³ covers ${fmt(1000 / input.depth_mm, 1)} m² and one ${bagL} L bag covers ${fmt(bagL / input.depth_mm, 2)} m².`,
  ];
  if (input.material === "topsoil" && densityLabel) {
    const tonnes = m3 * density;
    const loads = Math.ceil((tonnes * 1000) / TRAILER_PAYLOAD_KG - 1e-9);
    lines.push(
      `- About ${fmt(tonnes, 2)} tonnes at ${density} t/m³ (${densityLabel.toLowerCase()}): ${plural(loads, "load", "loads")} in a 6x4 box trailer rated 750 kg with about 250 kg tare (${TRAILER_PAYLOAD_KG} kg payload). Soil delivered wet can weigh a fifth more; follow your trailer's plate and local road rules.`,
    );
  }
  if (settle === null) lines.push(`No allowance added; set allow_settling to add GardenMaths' ${info.settlePct}% ${info.allowance}.`);
  const example: Record<AreaMaterial, string> = {
    mulch: "$12 a bag, $75 a m³ and $70 delivery",
    compost: "$9 a bag, $80 a m³ and $70 delivery",
    topsoil: "$8 a bag, $75 a m³ and $80 delivery",
    top_dressing: "$9 a bag, $95 a m³ and $70 delivery",
  };
  lines.push(...costLines(bags, bagL, m3, input, example[input.material]));
  lines.push(ESTIMATE, `Formulas: GardenMaths ${info.name.toLowerCase()} calculator, ${SITE}/${info.page}/.`);
  return ok(lines.join("\n"));
}

/* -------------------------------------------------------------------------
 * potting_mix
 * ---------------------------------------------------------------------- */

export function pottingMix(input: {
  shape: PotShape;
  top_diameter_cm?: number | undefined;
  bottom_diameter_cm?: number | undefined;
  length_cm?: number | undefined;
  width_cm?: number | undefined;
  height_cm: number;
  fill_pct?: number | undefined;
  quantity?: number | undefined;
  bag_size_l?: number | undefined;
  price_per_bag?: number | undefined;
  currency?: Currency | undefined;
}): ToolText {
  const needs: Record<PotShape, (keyof typeof input)[]> = {
    tapered: ["top_diameter_cm", "bottom_diameter_cm"],
    straight: ["top_diameter_cm"],
    square: ["length_cm", "width_cm"],
  };
  const missing = needs[input.shape].filter((key) => !(Number(input[key]) > 0));
  if (missing.length) return fail(`A ${input.shape} pot needs ${missing.join(" and ")} above zero (inside measurements, cm).`);
  const fillPct = input.fill_pct ?? 90;
  const qty = input.quantity ?? 1;
  if (!(fillPct > 0 && fillPct <= 100)) return fail("fill_pct must be above 0 and up to 100.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 9999) return fail("quantity must be a whole number from 1 to 9,999.");
  const bagL = input.bag_size_l ?? 25;
  if (!(POTTING_BAG_SIZES as readonly number[]).includes(bagL)) {
    return fail(`bag_size_l must be one of ${POTTING_BAG_SIZES.join(", ")} litres.`);
  }

  const per = potLitres(input.shape, {
    topCm: input.top_diameter_cm,
    bottomCm: input.bottom_diameter_cm,
    lengthCm: input.length_cm,
    widthCm: input.width_cm,
    heightCm: input.height_cm,
  });
  const perFilled = per * (fillPct / 100);
  const total = perFilled * qty;
  const bags = bagsFor(total, bagL);
  if (!Number.isFinite(total) || !Number.isSafeInteger(bags)) {
    return fail("This volume is too large to calculate accurately. Check the units and dimensions.");
  }
  const size =
    input.shape === "square"
      ? `${num(input.length_cm ?? 0, 1)} x ${num(input.width_cm ?? 0, 1)} cm`
      : input.shape === "tapered"
        ? `${num(input.top_diameter_cm ?? 0, 1)} cm across the top and ${num(input.bottom_diameter_cm ?? 0, 1)} cm at the base`
        : `${num(input.top_diameter_cm ?? 0, 1)} cm across`;
  const lines = [
    `Potting mix for ${qty} ${input.shape} pot${qty > 1 ? "s" : ""}, ${size}, ${num(input.height_cm, 1)} cm high, filled to ${num(fillPct, 1)}%:`,
    `- ${litres(perFilled)} per pot, ${litres(total)} in all: ${plural(bags, "bag", "bags")} of ${bagL} L.`,
  ];
  if (input.price_per_bag !== undefined) {
    const currency = input.currency ?? "AUD";
    const cents = Math.round((input.price_per_bag + Number.EPSILON) * 100);
    lines.push(`- At ${money(cents / 100, currency)} a bag: ${money((bags * cents) / 100, currency)}, before delivery.`);
  }
  if (input.shape === "tapered") lines.push("A tapered round pot is measured as a cone frustum from its inside top and base diameters.");
  lines.push(ESTIMATE, `Formulas: GardenMaths potting mix calculator, ${SITE}/potting-mix-calculator/.`);
  return ok(lines.join("\n"));
}

/* -------------------------------------------------------------------------
 * planting_calendar
 * ---------------------------------------------------------------------- */

type Zone = { key: string; country: string; name: string; slug: string; tagline: string };
type Crop = {
  id: string;
  name: string;
  cat: string;
  method: string;
  days?: [number, number];
  from?: string;
  spacing?: string;
  sow: Record<string, number[]>;
  note?: string;
  tender?: boolean;
  unsure?: string[];
  harvest?: string;
  perennial?: string;
};
type Town = {
  name: string;
  zone: string;
  station?: string;
  period?: string;
  /** Average frost nights by month; absent where no station record was found. */
  frost?: number[];
  fy?: number;
  /** "ground" where NIWA counts ground frosts rather than screen frosts. */
  fdef?: string;
  note?: string;
  bom?: string;
  niwa?: string;
};

const PLANTING = plantingData as unknown as { zones: Zone[]; categories: { key: string; name: string }[]; crops: Crop[]; towns: Town[] };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NIWA_CITE = "NIWA (now Earth Sciences New Zealand), mean number of days of ground frost, 1991-2020";
const GROUND_FROST = "NIWA counts a ground frost when the air just above short grass falls to -1 °C or lower";

/** planting.js frostUnit: NIWA ground frosts in New Zealand, BOM nights at 2 °C or below in Australia. */
function frostUnit(town: Town, many = true): string {
  if (town.fdef === "ground") return many ? "ground frosts" : "ground frost";
  return many ? "nights at 2 °C or below" : "night at 2 °C or below";
}

function stationText(town: Town): string {
  return town.bom ? `BOM station ${town.bom}, ${town.station}` : town.niwa ? `NIWA station ${town.niwa}, ${town.station}` : (town.station ?? "station");
}

const STATE_WORDS = new Set([
  "nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt", "nz", "au", "aus", "australia", "new-zealand",
  "new-south-wales", "victoria", "queensland", "western-australia", "south-australia", "tasmania",
  "northern-territory", "australian-capital-territory",
]);

/** A town name as typed: no state or country after it, "Mt" read as "Mount". */
function placeKey(text: string): string {
  let key = normalize(text.split(",")[0] ?? "");
  for (const word of STATE_WORDS) {
    if (key.endsWith(`-${word}`)) key = key.slice(0, -word.length - 1);
  }
  return key.replace(/^mt-/, "mount-");
}

function findTown(name: string): Town | undefined {
  const wanted = placeKey(name);
  if (!wanted) return undefined;
  return PLANTING.towns.find((town) => normalize(town.name) === wanted) ?? PLANTING.towns.find((town) => normalize(town.name).startsWith(wanted));
}

function findZone(name: string): Zone | undefined {
  const wanted = normalize(name);
  return PLANTING.zones.find((zone) => zone.key === wanted || normalize(zone.name) === wanted || zone.slug === wanted);
}

const CROP_ALIASES: Record<string, string> = {
  corn: "sweetcorn",
  "pak-choi": "asiangreens",
  "pak-choy": "asiangreens",
  "bok-choi": "asiangreens",
  "silver-beet": "silverbeet",
  chard: "silverbeet",
  spinach: "spinach",
  pepper: "capsicum",
  "bell-pepper": "capsicum",
  courgette: "zucchini",
  aubergine: "eggplant",
  cantaloupe: "rockmelon",
  cilantro: "coriander",
  "snow-pea": "peas",
  kumara: "sweetpotato",
};

/** Singular and compact forms, so "Lettuces", "snow peas" and "silver beet" all match. */
function cropForms(text: string): string[] {
  const base = normalize(text);
  const forms = new Set([base]);
  if (base.endsWith("ies")) forms.add(`${base.slice(0, -3)}y`);
  if (base.endsWith("oes")) forms.add(base.slice(0, -2));
  if (base.endsWith("es")) forms.add(base.slice(0, -2));
  if (base.endsWith("s")) forms.add(base.slice(0, -1));
  for (const form of [...forms]) forms.add(form.replace(/-/g, ""));
  return [...forms];
}

function cropNames(crop: Crop): string[] {
  const names = [crop.id, crop.name, crop.name.replace(/\s*\(.*\)/, "")];
  const bracket = crop.name.match(/\((.*)\)/)?.[1];
  if (bracket) names.push(bracket);
  for (const part of crop.name.split(" and ")) names.push(part);
  return names.flatMap(cropForms);
}

function findCrop(name: string): Crop | undefined {
  const wanted = cropForms(name);
  const alias = wanted.map((form) => CROP_ALIASES[form]).find(Boolean);
  if (alias) return PLANTING.crops.find((crop) => crop.id === alias);
  return PLANTING.crops.find((crop) => cropNames(crop).some((form) => wanted.includes(form)));
}

/** planting.js monthRanges: "September to December", runs wrapping the year joined up. */
function monthRanges(months: number[]): string {
  if (!months.length) return "";
  const on = new Set(months);
  if (on.size === 12) return "all year";
  let start = 1;
  while (on.has(start)) start++;
  const runs: string[] = [];
  for (let i = 0, m = start; i < 12; i++, m = (m % 12) + 1) {
    if (on.has(m) && !on.has(((m + 10) % 12) + 1)) {
      let end = m;
      while (on.has((end % 12) + 1)) end = (end % 12) + 1;
      runs.push(end === m ? MONTHS[m - 1]! : `${MONTHS[m - 1]} to ${MONTHS[end - 1]}`);
    }
  }
  return runs.join(", ");
}

const METHOD_LABELS: Record<string, string> = {
  direct: "sow direct",
  seedlings: "seedlings",
  either: "seed or seedlings",
  cloves: "cloves",
  tubers: "seed potatoes",
  crowns: "crowns",
  runners: "runners",
  slips: "slips",
};

/** planting.js harvestText: weeks from the range, the month from its middle. */
function harvestText(crop: Crop, month: number): string {
  if (crop.perennial) return `perennial: ${crop.perennial}`;
  if (crop.harvest) return crop.harvest;
  if (!crop.days) return "";
  const w0 = Math.round(crop.days[0] / 7);
  const w1 = Math.round(crop.days[1] / 7);
  const weeks = `${w0}${w1 !== w0 ? `-${w1}` : ""} weeks`;
  const ready = MONTHS[(month - 1 + Math.round((crop.days[0] + crop.days[1]) / 2 / 30.44)) % 12];
  if (crop.method === "seedlings" || (crop.method === "either" && crop.from === "plant")) return `ready about ${weeks} after planting out, around ${ready}`;
  if (crop.from === "plant") return `ready about ${weeks} after planting, around ${ready}`;
  return `ready about ${weeks} after sowing, around ${ready}`;
}

/** planting.js frostRisk: a tender crop is flagged at one frost or more this month or next (next month only for seed potatoes). */
function frostRiskMonth(crop: Crop, town: Town | undefined, month: number): { month: number; nights: number } | null {
  if (!town?.frost || !crop.tender) return null;
  const next = (month % 12) + 1;
  const now = crop.method === "tubers" ? 0 : (town.frost[month - 1] ?? 0);
  const then = town.frost[next - 1] ?? 0;
  if (now < 1 && then < 1) return null;
  return now >= 1 ? { month, nights: now } : { month: next, nights: then };
}

function frostAdvice(crop: Crop): string {
  if (crop.method === "tubers") return "frost-tender shoots: time planting so they come up after the last frost";
  const verb = crop.method === "direct" ? "sow" : crop.method === "either" ? "sow or plant" : "plant out";
  return `frost-tender: ${verb} after the last frost, or cover the plants on cold nights`;
}

function townNote(town: Town, zone: Zone): string {
  let text = `${town.name} is in the ${zone.name} zone.`;
  if (town.frost) {
    const total = town.fy ?? town.frost.reduce((a, b) => a + b, 0);
    const frostMonths = town.frost.map((v, i) => (v >= 1 ? i + 1 : 0)).filter(Boolean);
    const source = ` (${stationText(town)}${town.period ? `, ${town.period}` : ""})`;
    if (total < 0.05) text += ` Frost-free${source}.`;
    else if (!frostMonths.length) text += ` Frost is rare: about ${fmt(total, 1)} ${frostUnit(town)} a year${source}.`;
    else text += ` Frost: about ${fmt(total, 1)} ${frostUnit(town)} a year, ${monthRanges(frostMonths)}${source}.`;
  }
  if (town.note) text += ` ${town.note}`;
  return text;
}

function currentMonth(): number {
  return Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "numeric" }).format(new Date()));
}

function plantingSources(zone: Zone, town: Town | undefined): string {
  const frost = town?.frost ? (town.niwa ? `; frost averages: ${NIWA_CITE}` : "; frost averages: Bureau of Meteorology") : "";
  return `Source: GardenMaths planting calendar, compiled from the Australian and New Zealand gardening authorities it lists, ${SITE}/planting-calendar/${zone.slug}/${frost}.`;
}

export function plantingCalendar(input: { place?: string | undefined; zone?: string | undefined; month?: number | undefined; crop?: string | undefined }): ToolText {
  const town = input.place ? findTown(input.place) : undefined;
  if (input.place && !town) {
    return fail(
      `"${input.place}" is not one of the ${PLANTING.towns.length} towns in the calendar. Pass the nearest larger town, or the zone that matches the climate: ${PLANTING.zones.map((z) => z.key).join(", ")}.`,
    );
  }
  const asked = input.zone ? findZone(input.zone) : undefined;
  const zone = town ? findZone(town.zone) : asked;
  if (!zone) return fail(`Give a place (an Australian or New Zealand town) or a zone: ${PLANTING.zones.map((z) => z.key).join(", ")}.`);
  const lines: string[] = [town ? townNote(town, zone) : `${zone.name} zone: ${zone.tagline}`];
  if (town && input.zone && asked?.key !== zone.key) lines.push(`The zone given was ignored: ${town.name} is in the ${zone.name} zone.`);

  if (input.crop) {
    const crop = findCrop(input.crop);
    if (!crop) return fail(`"${input.crop}" is not in the calendar. It covers: ${PLANTING.crops.map((c) => c.name).join(", ")}.`);
    const months = crop.sow[zone.key] ?? [];
    const verb = crop.from === "plant" ? "Plant" : "Sow";
    if (months.length) lines.push(`${crop.name} (${METHOD_LABELS[crop.method] ?? crop.method}) in the ${zone.name} zone: ${verb.toLowerCase()} ${monthRanges(months)}.`);
    else lines.push(`${crop.name} in the ${zone.name} zone: ${crop.unsure?.includes(zone.key) ? "no agreed months; the sources disagree" : "not suited"}.`);
    if (input.month && months.length) {
      lines.push(`${MONTHS[input.month - 1]} is ${months.includes(input.month) ? "inside" : "outside"} that window.`);
    }
    const reference = input.month ?? months[0] ?? 1;
    const ready = harvestText(crop, reference);
    lines.push(`- ${ready ? `${ready[0]!.toUpperCase()}${ready.slice(1)}` : ""}${crop.spacing ? `. Space ${crop.spacing}.` : "."}`);
    if (crop.tender) lines.push(`- ${frostAdvice(crop)[0]!.toUpperCase()}${frostAdvice(crop).slice(1)}.`);
    if (crop.note) lines.push(`- ${crop.note}`);
  } else {
    const month = input.month ?? currentMonth();
    const next = (month % 12) + 1;
    const prev = ((month + 10) % 12) + 1;
    const due = PLANTING.crops.filter((crop) => crop.sow[zone.key]?.includes(month));
    const risky = due.filter((crop) => frostRiskMonth(crop, town, month));
    lines.push(`${due.length} crops to sow or plant in ${MONTHS[month - 1]}${input.month ? "" : " (this month in Australia)"}:`);
    if (town?.frost && risky.length) {
      const now = town.frost[month - 1] ?? 0;
      const then = town.frost[next - 1] ?? 0;
      const parts = [now >= 1 ? `${fmt(now, 1)} ${frostUnit(town)} in ${MONTHS[month - 1]}` : null, then >= 1 ? `${fmt(then, 1)} in ${MONTHS[next - 1]}` : null].filter(Boolean);
      lines.push(`${town.name} averages ${parts.join(" and ")}, so ${plural(risky.length, "frost-tender crop is", "frost-tender crops are")} flagged.`);
    }
    if (!due.length) lines.push(`Nothing in this calendar is sown in ${MONTHS[month - 1]} in the ${zone.name} zone: a month to harvest, mulch and prepare beds.`);
    for (const category of PLANTING.categories) {
      const inCategory = due.filter((crop) => crop.cat === category.key).sort((a, b) => a.name.localeCompare(b.name));
      if (!inCategory.length) continue;
      lines.push(`${category.name}:`);
      for (const crop of inCategory) {
        const window = crop.sow[zone.key] ?? [];
        const flag = !window.includes(next) ? "; last month to sow" : !window.includes(prev) && window.length < 12 ? "; window just opened" : "";
        const frost = frostRiskMonth(crop, town, month) ? `; ${frostAdvice(crop)}` : "";
        lines.push(`- ${crop.name} (${METHOD_LABELS[crop.method] ?? crop.method}): ${harvestText(crop, month)}${crop.spacing ? `; space ${crop.spacing}` : ""}${flag}${frost}.`);
      }
    }
    const opening = PLANTING.crops.filter((crop) => (crop.sow[zone.key] ?? []).includes(next) && !(crop.sow[zone.key] ?? []).includes(month));
    if (opening.length) lines.push(`Coming up in ${MONTHS[next - 1]}: ${opening.map((crop) => crop.name).join(", ")}.`);
  }
  if (town?.fdef === "ground") lines.push(`${GROUND_FROST}.`);
  lines.push(plantingSources(zone, town));
  return ok(lines.join("\n"));
}

/* -------------------------------------------------------------------------
 * frost_risk
 * ---------------------------------------------------------------------- */

type FrostTown = {
  name: string;
  station: string;
  enough: boolean;
  years: number;
  first: number;
  last_year: number;
  n_after: number;
  pct_after_cup: number;
  pct_after_cup_recent: number;
  recent_years: number;
  frost_free_springs_pct: number;
  median_offset: number | null;
  p80_offset: number | null;
  p95_offset: number | null;
  latest: string | null;
  latest_offset: number | null;
};

const FROST = frostData as unknown as { meta: { threshold_c: number; recent_from: number }; towns: FrostTown[] };
const FROST_GUIDE = `${SITE}/guides/frost-after-melbourne-cup-day/`;
const FROST_CREDIT = `"GardenMaths analysis of Bureau of Meteorology data via SILO", ${FROST_GUIDE}; licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); SILO © Queensland Government`;
/** The guide: "Queanbeyan is left out because its station is not in SILO; the Canberra rows cover it." */
const FROST_STAND_INS: Record<string, string> = { queanbeyan: "canberra" };
const SHORT_RECORD = 20;

/** A day counted from Cup Day, shown for a year when Cup Day falls on 3 November, as the guide does. */
function dayFromCup(offset: number): string {
  const date = new Date(Date.UTC(2026, 10, 3 + offset));
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });
}

function latestDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Every study row for a town: "Canberra" finds the airport and Tuggeranong rows, "Tuggeranong" the second. */
function frostRows(key: string): FrostTown[] {
  return FROST.towns.filter((town) => {
    const base = normalize(town.name.replace(/\s*\(.*\)/, ""));
    const bracket = normalize(town.name.match(/\((.*)\)/)?.[1] ?? "");
    return normalize(town.name) === key || base === key || bracket === key;
  });
}

function rowLines(record: FrostTown, threshold: number): string[] {
  if (!record.enough) return [`${record.name}: the station record is too short for the study.`];
  const lines = [
    `${record.name} (${record.station}, ${record.years} springs, ${record.first}-${record.last_year}): a frosty night (${threshold} °C or below in the screen) after Melbourne Cup Day in ${record.n_after} of ${record.years} springs, ${record.pct_after_cup}%.`,
    `- Since ${FROST.meta.recent_from}: ${record.pct_after_cup_recent}% of ${record.recent_years} springs.`,
  ];
  const dates = [
    record.median_offset !== null ? `the last frosty night typically comes on ${dayFromCup(record.median_offset)}` : null,
    record.p80_offset !== null ? `frosts were over by ${dayFromCup(record.p80_offset)} in 4 springs of 5` : null,
    record.p95_offset !== null ? `by ${dayFromCup(record.p95_offset)} in 19 of 20` : null,
  ].filter(Boolean);
  if (dates.length) lines.push(`- ${dates.join("; ")} (dates for a year when Cup Day is 3 November).`);
  if (record.latest) lines.push(`- Latest frosty night on record: ${latestDate(record.latest)}.`);
  if (record.frost_free_springs_pct) lines.push(`- ${record.frost_free_springs_pct}% of springs had no frosty night at all.`);
  if (record.years < SHORT_RECORD) lines.push(`- Short record (${record.years} springs): less certain.`);
  return lines;
}

export function frostRisk(input: { town: string }): ToolText {
  const key = placeKey(input.town);
  const standIn = FROST_STAND_INS[key];
  const rows = frostRows(standIn ?? key);
  const threshold = FROST.meta.threshold_c;

  if (rows.length) {
    const lines: string[] = [];
    if (standIn) lines.push(`${input.town.trim()}'s station is not in SILO, so the frost guide covers it with the Canberra rows.`);
    for (const row of rows) lines.push(...rowLines(row, threshold));
    lines.push(
      "The screen thermometer sits about 1.2 m up; on a clear, still night the ground can be several degrees colder, so 2 °C can mean frost on young plants.",
      `Source: ${FROST_CREDIT}.`,
    );
    return ok(lines.join("\n"));
  }

  const town = findTown(input.town);
  if (!town) {
    return fail(`"${input.town}" is not one of the towns GardenMaths covers. Pass the nearest larger Australian or New Zealand town.`);
  }
  const why =
    town.zone.startsWith("nz-")
      ? "The Cup Day frost study covers Australian stations only"
      : "The Cup Day frost study covers 56 Australian towns with long daily records in SILO, and this one is not among them";
  if (!town.frost) {
    return ok(
      `${why}, and the planting calendar has no station frost record for ${town.name}.${town.note ? ` ${town.note}` : ""}\nSource: GardenMaths planting calendar, ${SITE}/planting-calendar/${town.niwa || town.zone.startsWith("nz-") ? `; ${NIWA_CITE}` : ""}.`,
    );
  }
  const months = town.frost.map((nights, i) => (nights > 0 ? `${MONTHS[i]} ${fmt(nights, 1)}` : null)).filter(Boolean);
  const lines = [
    `${why}. ${town.name}'s monthly station averages give the frost season instead.`,
    `- ${stationText(town)}${town.period ? `, ${town.period}` : ""}: ${fmt(town.fy ?? 0, 1)} ${frostUnit(town)} a year${months.length ? `; by month: ${months.join(", ")}` : "; none in an average year"}.`,
  ];
  if (town.fdef === "ground") lines.push(`${GROUND_FROST}.`);
  lines.push(`Source: ${town.niwa ? NIWA_CITE : "Bureau of Meteorology"}, as compiled in the GardenMaths planting calendar, ${SITE}/planting-calendar/.`);
  return ok(lines.join("\n"));
}
