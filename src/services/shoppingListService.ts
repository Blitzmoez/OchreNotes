import { Recipe, IngredientMeta } from '../types';
import { getScaledIngredientDisplay } from './portionScaling';
import { normalizeIngredientKey } from './ingredientCatalogService';

export interface ShoppingSourceEntry {
  date: string;
  weekday: string;
  recipeTitle: string;
  portions: number;
  amountText: string;
}

export interface AggregatedShoppingItem {
  key: string;
  name: string;
  totalAmountDisplay: string;
  occurrences: number;
  sources: ShoppingSourceEntry[];
}

export interface WeeklyShoppingSummary {
  items: AggregatedShoppingItem[];
  includedRecipeCount: number;
  excludedRecipeTitles: string[];
  excludedIngredientNames: string[];
}

export interface CalendarDayInput {
  date: string;
  weekday: string;
  recipeIds: string[];
  portions: number;
}

interface ParsedMeasure {
  value: number | null;
  unit: string;
  unitDisplay: string;
  rawText: string;
}

const UNIT_ALIASES: Record<string, { norm: string; display: string }> = {
  g: { norm: 'g', display: 'g' },
  gr: { norm: 'g', display: 'g' },
  gramm: { norm: 'g', display: 'g' },
  kg: { norm: 'kg', display: 'kg' },
  kilogramm: { norm: 'kg', display: 'kg' },
  ml: { norm: 'ml', display: 'ml' },
  milliliter: { norm: 'ml', display: 'ml' },
  cl: { norm: 'cl', display: 'cl' },
  l: { norm: 'l', display: 'l' },
  liter: { norm: 'l', display: 'l' },
  el: { norm: 'el', display: 'EL' },
  essloeffel: { norm: 'el', display: 'EL' },
  esslöffel: { norm: 'el', display: 'EL' },
  tl: { norm: 'tl', display: 'TL' },
  teeloeffel: { norm: 'tl', display: 'TL' },
  teelöffel: { norm: 'tl', display: 'TL' },
  st: { norm: 'stueck', display: 'Stück' },
  stk: { norm: 'stueck', display: 'Stück' },
  stück: { norm: 'stueck', display: 'Stück' },
  stueck: { norm: 'stueck', display: 'Stück' },
  prise: { norm: 'prise', display: 'Prise' },
  prisen: { norm: 'prise', display: 'Prise' },
  bund: { norm: 'bund', display: 'Bund' },
  bündel: { norm: 'bund', display: 'Bund' },
  dose: { norm: 'dose', display: 'Dose' },
  dosen: { norm: 'dose', display: 'Dosen' },
  packung: { norm: 'packung', display: 'Packung' },
  packungen: { norm: 'packung', display: 'Packungen' },
  pck: { norm: 'packung', display: 'Packung' },
  pkg: { norm: 'packung', display: 'Packung' },
  becher: { norm: 'becher', display: 'Becher' },
  glas: { norm: 'glas', display: 'Glas' },
  gläser: { norm: 'glas', display: 'Gläser' },
  zehe: { norm: 'zehe', display: 'Zehe' },
  zehen: { norm: 'zehe', display: 'Zehen' },
  scheibe: { norm: 'scheibe', display: 'Scheibe' },
  scheiben: { norm: 'scheibe', display: 'Scheiben' },
  flasche: { norm: 'flasche', display: 'Flasche' },
  flaschen: { norm: 'flasche', display: 'Flaschen' },
  tasse: { norm: 'tasse', display: 'Tasse' },
  tassen: { norm: 'tasse', display: 'Tassen' },
  handvoll: { norm: 'handvoll', display: 'Handvoll' },
};

function formatGermanNumber(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.01) {
    return String(Math.round(rounded));
  }
  const oneDec = Math.round(rounded * 10) / 10;
  if (Math.abs(rounded - oneDec) < 0.02) {
    return String(oneDec).replace('.', ',');
  }
  return String(rounded).replace('.', ',');
}

function parseNumberToken(numStr: string): number | null {
  const clean = numStr.trim();
  if (!clean) return null;
  if (clean.includes('/')) {
    const [a, b] = clean.split('/').map((s) => parseFloat(s.replace(',', '.').trim()));
    if (!b || Number.isNaN(a) || Number.isNaN(b)) return null;
    return a / b;
  }
  const parsed = parseFloat(clean.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeUnit(rawUnit: string): { norm: string; display: string } {
  const stripped = rawUnit.trim().replace(/\.$/, '');
  const lower = stripped.toLowerCase();
  if (!lower) return { norm: 'count', display: '' };
  const mapped = UNIT_ALIASES[lower];
  if (mapped) return mapped;
  return { norm: lower, display: stripped };
}

function parseMeasureText(text: string): ParsedMeasure {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { value: null, unit: '', unitDisplay: '', rawText: '' };
  }
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (!match) {
    return { value: null, unit: '', unitDisplay: '', rawText: trimmed };
  }
  const value = parseNumberToken(match[1]);
  const rest = match[2].trim();
  if (value === null) {
    return { value: null, unit: '', unitDisplay: '', rawText: trimmed };
  }
  // Take first token as unit when short/alphabetical
  const unitMatch = rest.match(/^([^\s,()]+)(?:\s+(.*))?$/);
  const rawUnit = unitMatch ? unitMatch[1] : rest;
  const { norm, display } = normalizeUnit(rawUnit);
  return {
    value,
    unit: norm,
    unitDisplay: display,
    rawText: trimmed,
  };
}

function splitNameAndAmount(rawName: string, rawAmount: string): { cleanName: string; measure: ParsedMeasure } {
  const nameTrimmed = (rawName || '').trim();
  const amountTrimmed = (rawAmount || '').trim();

  if (amountTrimmed) {
    return {
      cleanName: nameTrimmed,
      measure: parseMeasureText(amountTrimmed),
    };
  }

  // Fallback for legacy single-string entries like "200g Lachsfilet" or "2 EL Olivenöl"
  const leadingMatch = nameTrimmed.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*([A-Za-zÄÖÜäöüß.]+)?\s+(.+)$/);
  if (leadingMatch) {
    const val = parseNumberToken(leadingMatch[1]);
    const maybeUnit = (leadingMatch[2] || '').trim();
    const restName = leadingMatch[3].trim();
    const { norm, display } = normalizeUnit(maybeUnit);
    if (val !== null && restName) {
      return {
        cleanName: restName,
        measure: {
          value: val,
          unit: norm,
          unitDisplay: display,
          rawText: `${leadingMatch[1]}${maybeUnit ? ' ' + maybeUnit : ''}`.trim(),
        },
      };
    }
  }

  return {
    cleanName: nameTrimmed,
    measure: { value: null, unit: '', unitDisplay: '', rawText: '' },
  };
}

function formatUnitTotal(value: number, normUnit: string, fallbackDisplay: string): string {
  // Normalize large grams to kg and large ml to l when clean
  if (normUnit === 'g' && value >= 1000) {
    return `${formatGermanNumber(value / 1000)} kg`;
  }
  if (normUnit === 'ml' && value >= 1000) {
    return `${formatGermanNumber(value / 1000)} l`;
  }
  if (normUnit === 'dose') {
    return `${formatGermanNumber(value)} ${value > 1 ? 'Dosen' : 'Dose'}`;
  }
  if (normUnit === 'packung') {
    return `${formatGermanNumber(value)} ${value > 1 ? 'Packungen' : 'Packung'}`;
  }
  if (normUnit === 'zehe') {
    return `${formatGermanNumber(value)} ${value > 1 ? 'Zehen' : 'Zehe'}`;
  }
  if (normUnit === 'scheibe') {
    return `${formatGermanNumber(value)} ${value > 1 ? 'Scheiben' : 'Scheibe'}`;
  }
  if (normUnit === 'count' || !fallbackDisplay) {
    return `${formatGermanNumber(value)}×`;
  }
  return `${formatGermanNumber(value)} ${fallbackDisplay}`;
}

export function generateWeeklyShoppingList(params: {
  calendarDays: CalendarDayInput[];
  getRecipeById: (id: string) => Recipe | undefined;
  ingredientMeta?: Record<string, IngredientMeta>;
}): WeeklyShoppingSummary {
  const { calendarDays, getRecipeById, ingredientMeta } = params;

  const excludedTitlesSet = new Set<string>();
  const excludedIngredientsSet = new Set<string>();
  let includedRecipeCount = 0;

  interface Bucket {
    displayName: string;
    unitTotals: Map<string, { sum: number; display: string }>;
    rawExtras: string[];
    occurrences: number;
    sources: ShoppingSourceEntry[];
  }

  const buckets = new Map<string, Bucket>();

  for (const day of calendarDays) {
    for (const rid of day.recipeIds) {
      const recipe = getRecipeById(rid);
      if (!recipe) continue;

      if (recipe.excludeFromShoppingList) {
        excludedTitlesSet.add(recipe.title);
        continue;
      }

      includedRecipeCount += 1;

      for (const ing of recipe.ingredients || []) {
        const scaled = getScaledIngredientDisplay(ing, recipe.portions, day.portions);
        const { cleanName, measure } = splitNameAndAmount(scaled.name, scaled.amount);
        if (!cleanName) continue;

        const key = normalizeIngredientKey(cleanName);
        if (!key) continue;

        if (ingredientMeta?.[key]?.excludeFromShoppingList) {
          excludedIngredientsSet.add(ingredientMeta[key]?.displayName || cleanName);
          continue;
        }

        const preferredDisplay = ingredientMeta?.[key]?.displayName || cleanName;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            displayName: preferredDisplay,
            unitTotals: new Map(),
            rawExtras: [],
            occurrences: 0,
            sources: [],
          };
          buckets.set(key, bucket);
        }

        bucket.occurrences += 1;

        const amountLabel =
          measure.rawText ||
          (measure.value !== null ? formatUnitTotal(measure.value, measure.unit, measure.unitDisplay) : 'nach Bedarf');
        bucket.sources.push({
          date: day.date,
          weekday: day.weekday,
          recipeTitle: recipe.title,
          portions: day.portions,
          amountText: amountLabel,
        });

        if (measure.value !== null) {
          // Convert kg -> g and l -> ml before summing so both units merge cleanly!
          let addVal = measure.value;
          let targetUnit = measure.unit || 'count';
          let targetDisplay = measure.unitDisplay;
          if (targetUnit === 'kg') {
            addVal *= 1000;
            targetUnit = 'g';
            targetDisplay = 'g';
          } else if (targetUnit === 'l') {
            addVal *= 1000;
            targetUnit = 'ml';
            targetDisplay = 'ml';
          } else if (targetUnit === 'cl') {
            addVal *= 10;
            targetUnit = 'ml';
            targetDisplay = 'ml';
          }

          const existing = bucket.unitTotals.get(targetUnit);
          if (existing) {
            existing.sum += addVal;
          } else {
            bucket.unitTotals.set(targetUnit, { sum: addVal, display: targetDisplay });
          }
        } else if (measure.rawText) {
          if (!bucket.rawExtras.includes(measure.rawText)) {
            bucket.rawExtras.push(measure.rawText);
          }
        }
      }
    }
  }

  const items: AggregatedShoppingItem[] = Array.from(buckets.entries()).map(([key, bucket]) => {
    const parts: string[] = [];
    bucket.unitTotals.forEach(({ sum, display }, normUnit) => {
      parts.push(formatUnitTotal(sum, normUnit, display));
    });
    bucket.rawExtras.forEach((extra) => parts.push(extra));

    const totalAmountDisplay =
      parts.length > 0
        ? parts.join(' + ')
        : bucket.occurrences > 1
        ? `${bucket.occurrences}× (Menge nach Bedarf)`
        : 'nach Bedarf';

    return {
      key,
      name: bucket.displayName,
      totalAmountDisplay,
      occurrences: bucket.occurrences,
      sources: bucket.sources,
    };
  });

  items.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));

  return {
    items,
    includedRecipeCount,
    excludedRecipeTitles: Array.from(excludedTitlesSet),
    excludedIngredientNames: Array.from(excludedIngredientsSet),
  };
}
