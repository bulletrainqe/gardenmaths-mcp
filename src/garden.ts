/**
 * GardenMaths' formulas, ported from the site's browser scripts, where they
 * live inside private closures: assets/planner.js (raised beds and pots,
 * lines 209-259 and 420-465) and assets/calc.js (bagsFor line 13, area x
 * depth lines 107-140, potting mix lines 147-229). Each port keeps the site's
 * units and rounding, so the results match the figures its browser tests pin
 * (test/garden.test.ts).
 */

/* -------------------------------------------------------------------------
 * Raised bed planner (assets/planner.js)
 * ---------------------------------------------------------------------- */

export const PLANNER_MATERIALS = {
  topsoil: "Topsoil / garden mix",
  compost: "Compost",
  mulch: "Mulch / bark",
  gravel: "Gravel / drainage",
  potting_mix: "Potting mix",
} as const;
export type PlannerMaterial = keyof typeof PLANNER_MATERIALS;
export const PLANNER_MATERIAL_KEYS = Object.keys(PLANNER_MATERIALS) as PlannerMaterial[];

/** The bag sizes the planner offers, in litres; 30 L is its default. */
export const PLANNER_BAG_SIZES = [25, 30, 40, 50, 60] as const;

export type Layer = { material: PlannerMaterial; depthMm: number };
export type Structure = {
  type: "bed" | "pot";
  lengthMm: number;
  widthMm: number;
  diameterMm: number;
  depthMm: number;
  quantity: number;
  layers: Layer[];
};

/** The planner's form takes centimetres and stores whole millimetres (planner.js line 171). */
export function cmToMm(cm: number): number {
  return Math.round(cm * 10);
}

export function rectVolL(lMm: number, wMm: number, dMm: number): number {
  return (lMm / 1000) * (wMm / 1000) * (dMm / 1000) * 1000;
}

export function roundVolL(diaMm: number, dMm: number): number {
  const r = diaMm / 2 / 1000;
  const d = dMm / 1000;
  return Math.PI * r * r * d * 1000;
}

export function structVolL(s: Structure): number {
  return s.type === "bed" ? rectVolL(s.lengthMm, s.widthMm, s.depthMm) : roundVolL(s.diameterMm, s.depthMm);
}

export type LayerCheck =
  | { ok: true; used: number; rem: number }
  | { ok: false; err: "NO_DEPTH" | "OVERFLOW"; used: number; over: number };

export function validateLayers(depthMm: number, layers: Layer[]): LayerCheck {
  if (depthMm <= 0) return { ok: false, err: "NO_DEPTH", used: 0, over: 0 };
  const used = layers.reduce((sum, layer) => sum + layer.depthMm, 0);
  const rem = depthMm - used;
  if (rem < 0) return { ok: false, err: "OVERFLOW", used, over: Math.abs(rem) };
  return { ok: true, used, rem };
}

export type Project = {
  totalL: number;
  totalM3: number;
  unfilledL: number;
  structs: number;
  /** Litres per material, in the order the materials first appear. */
  mats: Partial<Record<PlannerMaterial, number>>;
  errs: number;
};

/** planner.js computeProject, taking the structures as an argument instead of the page state. */
export function computeProject(structures: Structure[]): Project {
  let totalL = 0;
  let unfilledL = 0;
  let structs = 0;
  let errs = 0;
  const mats: Partial<Record<PlannerMaterial, number>> = {};
  for (const s of structures) {
    const check = validateLayers(s.depthMm, s.layers);
    if (!check.ok) {
      if (check.err === "OVERFLOW") errs++;
      continue;
    }
    const qty = s.quantity || 1;
    const vol = structVolL(s);
    structs += qty;
    unfilledL += (vol * qty * check.rem) / s.depthMm;
    for (const layer of s.layers) {
      const lv = s.depthMm > 0 ? (layer.depthMm / s.depthMm) * vol * qty : 0;
      if (lv <= 0) continue;
      totalL += lv;
      mats[layer.material] = (mats[layer.material] ?? 0) + lv;
    }
  }
  return { totalL, totalM3: totalL / 1000, unfilledL, structs, mats, errs };
}

/** Bags per material, rounded up separately: different products come in separate bags. */
export function materialBags(mats: Partial<Record<PlannerMaterial, number>>, bagSize: number) {
  const counts: Partial<Record<PlannerMaterial, number>> = {};
  let total = 0;
  for (const key of Object.keys(mats) as PlannerMaterial[]) {
    const exact = (mats[key] ?? 0) / bagSize;
    // The site's guard against an extra bag caused only by floating-point noise.
    const count = Math.ceil(exact - Number.EPSILON * Math.max(1, exact) * 8);
    counts[key] = count;
    total += count;
  }
  return { counts, total };
}

/**
 * planner.js updateCost: bagged against bulk delivery. The winner is decided
 * on the cents a reader sees, so equal displayed prices are a tie. The area
 * pages (calc.js costBlock) compare raw amounts and let bags win a tie; the
 * server uses the planner's rule for every tool on purpose, so one answer
 * never calls a $0.00 difference a saving.
 */
export function compareCost(bags: number, m3: number, pricePerBag: number, pricePerM3: number, delivery: number) {
  const bagCost = bags * pricePerBag;
  const bulkCost = m3 * pricePerM3 + delivery;
  const bagCents = Math.round(Number(bagCost.toFixed(2)) * 100);
  const bulkCents = Math.round(Number(bulkCost.toFixed(2)) * 100);
  const winner: "bagged" | "bulk" | "tie" = bagCents === bulkCents ? "tie" : bagCents < bulkCents ? "bagged" : "bulk";
  return { bagCost, bulkCost, winner, savingCents: Math.abs(bagCents - bulkCents) };
}

/* -------------------------------------------------------------------------
 * Single-purpose calculators (assets/calc.js)
 * ---------------------------------------------------------------------- */

export function bagsFor(litres: number, bagL: number): number {
  return bagL > 0 ? Math.ceil(litres / bagL - 1e-9) : 0;
}

/** Legal payload of a typical 6x4 box trailer: 750 kg ATM minus about 250 kg tare (calc.js line 17). */
export const TRAILER_PAYLOAD_KG = 500;

/**
 * The area x depth calculators. Bag sizes, the default bag and the settling
 * allowance come from each page's markup (src/pages/*-calculator.html); the
 * allowance applies only when the reader ticks it.
 */
export const AREA_MATERIALS = {
  mulch: {
    name: "Mulch",
    page: "mulch-calculator",
    bagSizes: [25, 40, 50, 60, 70],
    defaultBag: 60,
    settlePct: 10,
    allowance: "for settling and uneven ground",
  },
  compost: { name: "Compost", page: "compost-calculator", bagSizes: [25, 30, 40, 50, 60], defaultBag: 30, settlePct: 10, allowance: "extra" },
  topsoil: {
    name: "Topsoil",
    page: "topsoil-calculator",
    bagSizes: [25, 30, 40, 50],
    defaultBag: 30,
    settlePct: 15,
    allowance: "for settling and compaction",
  },
  top_dressing: {
    name: "Lawn top dressing",
    page: "lawn-top-dressing-calculator",
    bagSizes: [25, 30, 40, 50, 60],
    defaultBag: 30,
    settlePct: 10,
    allowance: "for hollows",
  },
} as const;
export type AreaMaterial = keyof typeof AREA_MATERIALS;

/** The topsoil page's density options, tonnes per cubic metre; 1.3 is selected. */
export const TOPSOIL_DENSITIES = {
  1.3: "Topsoil / garden soil, moist",
  1.4: "Sandy loam / turf underlay",
  1.2: "Dry screened topsoil",
} as const;

export function areaVolume(areaM2: number, depthMm: number, quantity: number, settlePct: number | null) {
  let m3 = areaM2 * (depthMm / 1000) * quantity;
  if (settlePct !== null) m3 *= 1 + settlePct / 100;
  return { m3, litres: m3 * 1000 };
}

/** The potting-mix page's bag sizes, litres; 25 L is selected. */
export const POTTING_BAG_SIZES = [10, 25, 30, 40, 50] as const;

export type PotShape = "tapered" | "straight" | "square";

/** calc.js potLitres: a round pot is a cone frustum (a cylinder when straight), in litres. */
export function potLitres(
  shape: PotShape,
  dims: { topCm?: number; bottomCm?: number; lengthCm?: number; widthCm?: number; heightCm: number },
): number {
  const h = dims.heightCm;
  let cm3: number;
  if (shape === "square") {
    cm3 = (dims.lengthCm ?? 0) * (dims.widthCm ?? 0) * h;
  } else {
    const R = (dims.topCm ?? 0) / 2;
    const r = shape === "tapered" ? (dims.bottomCm ?? 0) / 2 : R;
    cm3 = ((Math.PI * h) / 3) * (R * R + R * r + r * r);
  }
  return cm3 / 1000;
}
