import { describe, expect, test } from "vitest";
import { areaMaterial, frostRisk, plantingCalendar, pottingMix, raisedBedSoil } from "../src/tools";

/**
 * The raised-bed and potting-mix figures are the ones GardenMaths' own browser
 * tests pin (tests/calc-inputs.mjs and tests/purchase-flows.mjs in the site's
 * repository), so the ported formulas must give the site's answers. The frost
 * figures are the ones its frost guide prints.
 */

const DEFAULT_BED = {
  shape: "rectangle" as const,
  length_cm: 200,
  width_cm: 100,
  depth_cm: 30,
  layers: [
    { material: "gravel" as const, depth_cm: 5 },
    { material: "compost" as const, depth_cm: 10 },
    { material: "topsoil" as const, depth_cm: 15 },
  ],
};

describe("raised_bed_soil (site test: calc-inputs.mjs)", () => {
  test("the default project: 600 L, 4 + 7 + 10 bags, $189 bagged vs $121 bulk", () => {
    const text = raisedBedSoil({ beds: [DEFAULT_BED], price_per_bag: 9, price_per_m3: 85, delivery: 70 }).text;
    expect(text).toContain("Gravel / drainage: 100.0 L, 4 bags.");
    expect(text).toContain("Compost: 200.0 L, 7 bags.");
    expect(text).toContain("Topsoil / garden mix: 300.0 L, 10 bags.");
    expect(text).toContain("Total: 600.0 L (0.600 m³), 21 bags of 30 L.");
    expect(text).toContain("= $189.00");
    expect(text).toContain("= $121.00");
    expect(text).toContain("Bulk delivery is cheaper by $68.00.");
  });

  test("a partly filled bed: 200 L, 7 bags, 400 L unfilled, $63 vs $87", () => {
    const bed = { ...DEFAULT_BED, layers: [{ material: "topsoil" as const, depth_cm: 10 }] };
    const text = raisedBedSoil({ beds: [bed], price_per_bag: 9, price_per_m3: 85, delivery: 70 }).text;
    expect(text).toContain("Total: 200.0 L");
    expect(text).toContain("7 bags of 30 L");
    expect(text).toContain("Left unfilled by the layers: 400.0 L.");
    expect(text).toContain("= $63.00");
    expect(text).toContain("= $87.00");
  });

  test("a round pot 100 cm across and 30 cm deep: 235.6 L, 8 bags", () => {
    const text = raisedBedSoil({ beds: [{ shape: "round", is_pot: true, diameter_cm: 100, depth_cm: 30 }] }).text;
    expect(text).toContain("Potting mix: 235.6 L");
    expect(text).toContain("Total: 235.6 L");
    expect(text).toContain("8 bags of 30 L");
  });

  test("an exact boundary does not round up: 240 L is 8 bags", () => {
    const text = raisedBedSoil({ beds: [{ shape: "rectangle", length_cm: 120, width_cm: 100, depth_cm: 20 }] }).text;
    expect(text).toContain("Total: 240.0 L");
    expect(text).toContain("8 bags of 30 L");
  });

  test("layers deeper than the bed are reported, not counted", () => {
    const bed = { ...DEFAULT_BED, layers: [{ material: "topsoil" as const, depth_cm: 40 }] };
    const result = raisedBedSoil({ beds: [bed] });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("deeper than the bed's 30 cm");
  });
});

describe("potting_mix (site test: purchase-flows.mjs)", () => {
  test("a straight 30 cm pot, 27 cm high, 90% full: 17.2 L, 1 bag, $14.00 at $14", () => {
    const text = pottingMix({ shape: "straight", top_diameter_cm: 30, height_cm: 27, price_per_bag: 14 }).text;
    expect(text).toContain("17.2 L per pot");
    expect(text).toContain("1 bag of 25 L");
    expect(text).toContain("$14.00 a bag: $14.00");
  });

  test("two square pots 60 x 25 x 27 cm: 72.9 L, 3 bags, $42.00", () => {
    const text = pottingMix({ shape: "square", length_cm: 60, width_cm: 25, height_cm: 27, quantity: 2, price_per_bag: 14 }).text;
    expect(text).toContain("36.5 L per pot, 72.9 L in all: 3 bags of 25 L");
    expect(text).toContain("$42.00");
  });
});

describe("area_material", () => {
  test("mulch for 4 x 2 m at 75 mm: 0.6 m³, 10 bags of 60 L", () => {
    const text = areaMaterial({ material: "mulch", shape: "rectangle", length_m: 4, width_m: 2, depth_mm: 75 }).text;
    expect(text).toContain("0.600 m³ (600.0 L), 10 bags of 60 L");
  });

  test("topsoil adds tonnes and trailer loads, and settling only when asked", () => {
    const text = areaMaterial({ material: "topsoil", shape: "rectangle", length_m: 10, width_m: 6, depth_mm: 100, allow_settling: true }).text;
    expect(text).toContain("plus 15% for settling");
    expect(text).toContain("6.900 m³");
    expect(text).toContain("8.97 tonnes");
    expect(text).toContain("18 loads");
  });
});

describe("planting_calendar", () => {
  test("Melbourne in October includes tomatoes and the frost note", () => {
    const text = plantingCalendar({ place: "Melbourne", month: 10 }).text;
    expect(text).toContain("Melbourne is in the Cool zone.");
    expect(text).toContain("Tomato (seedlings): ready about 8-12 weeks after planting out");
    expect(text).toContain("nights at 2 °C or below a year, June to August");
  });

  test("one crop's months for a New Zealand town, macrons optional", () => {
    expect(plantingCalendar({ place: "Auckland", crop: "tomatoes" }).text).toContain("plant September to January");
    expect(plantingCalendar({ place: "Whangarei", month: 3 }).ok).toBe(true);
  });

  test("an unknown town lists the zones", () => {
    const result = plantingCalendar({ place: "Paris" });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("nz-cool");
  });
});

describe("frost_risk (figures from the site's frost guide)", () => {
  test("Cooma: 29 of 30 springs, typically 11 December, latest 28 December 2004", () => {
    const text = frostRisk({ town: "Cooma" }).text;
    expect(text).toContain("in 29 of 30 springs");
    expect(text).toContain("typically comes on 11 December");
    expect(text).toContain("28 December 2004");
    expect(text).toContain("CC BY 4.0");
  });

  test("Melbourne: none after Cup Day in 126 springs, typically 12 August", () => {
    const text = frostRisk({ town: "Melbourne" }).text;
    expect(text).toContain("in 0 of 126 springs");
    expect(text).toContain("typically comes on 12 August");
  });

  test("Canberra: frosts over by 20 November in 4 springs of 5", () => {
    expect(frostRisk({ town: "Canberra" }).text).toContain("over by 20 November in 4 springs of 5");
  });

  test("a New Zealand town falls back to its station averages", () => {
    const text = frostRisk({ town: "Christchurch" }).text;
    expect(text).toContain("covers Australian stations only");
    expect(text).toContain("ground frosts");
    expect(text).toContain("NIWA");
  });
});

// Regressions for the findings of the independent review (formula parity,
// claims and live edge cases) before release.
describe("review fixes", () => {
  test("a round bed is filled with topsoil unless it is a pot", () => {
    expect(raisedBedSoil({ beds: [{ shape: "round", diameter_cm: 120, depth_cm: 60 }] }).text).toContain("Topsoil / garden mix: 678.6 L");
  });

  test("an empty layer list fills nothing and shows no cost verdict", () => {
    const text = raisedBedSoil({ beds: [{ ...DEFAULT_BED, layers: [] }], price_per_bag: 9, price_per_m3: 85, delivery: 70 }).text;
    expect(text).toContain("Nothing to fill");
    expect(text).not.toContain("cheaper");
  });

  test("dropped beds are announced before the totals", () => {
    const text = raisedBedSoil({ beds: [DEFAULT_BED, { shape: "round", depth_cm: 30 }] }).text;
    expect(text.indexOf("Totals cover 1 of 2 beds")).toBeLessThan(text.indexOf("Total: 600.0 L"));
  });

  test("trailer loads carry the payload assumption, and one load is singular", () => {
    const text = areaMaterial({ material: "topsoil", shape: "rectangle", length_m: 2, width_m: 1, depth_mm: 100 }).text;
    expect(text).toContain("1 load in a 6x4 box trailer rated 750 kg with about 250 kg tare");
  });

  test("each page's own allowance label", () => {
    const text = areaMaterial({ material: "top_dressing", shape: "area", area_m2: 150, depth_mm: 7.5, allow_settling: true }).text;
    expect(text).toContain("at 7.5 mm deep, plus 10% for hollows");
  });

  test("crop names in plural, local and alternative forms", () => {
    for (const name of ["Lettuces", "kumara", "silver beet", "snow peas", "corn", "Strawberries", "bok choy", "Brussels sprout"]) {
      expect(plantingCalendar({ zone: "temperate", crop: name }).ok, name).toBe(true);
    }
  });

  test("town names with a state, or Mt for Mount", () => {
    expect(plantingCalendar({ place: "Hobart TAS", month: 10 }).ok).toBe(true);
    expect(plantingCalendar({ place: "Mt Gambier", month: 10 }).ok).toBe(true);
  });

  test("frost flags follow the site's rule: one or more this month or next, tender crops only", () => {
    expect(plantingCalendar({ place: "Perth", month: 7 }).text).not.toContain("flagged");
    const christchurch = plantingCalendar({ place: "Christchurch", month: 7 }).text;
    expect(christchurch).toContain("ground frosts");
    expect(christchurch).toContain("-1 °C");
  });

  test("Canberra returns both stations, Tuggeranong its own, Queanbeyan the Canberra rows", () => {
    const canberra = frostRisk({ town: "Canberra" }).text;
    expect(canberra).toContain("Canberra (Tuggeranong)");
    expect(frostRisk({ town: "Tuggeranong" }).ok).toBe(true);
    expect(frostRisk({ town: "Queanbeyan" }).text).toContain("covers it with the Canberra rows");
  });

  test("percentile dates print even without a median, and short records are flagged", () => {
    expect(frostRisk({ town: "Adelaide" }).text).toContain("frosts were over by 25 July in 4 springs of 5");
    expect(frostRisk({ town: "Geelong" }).text).toContain("Short record (15 springs)");
  });

  test("the frost credit is the guide's own wording, with the licence", () => {
    const text = frostRisk({ town: "Cooma" }).text;
    expect(text).toContain('"GardenMaths analysis of Bureau of Meteorology data via SILO"');
    expect(text).toContain("creativecommons.org/licenses/by/4.0");
  });
});
