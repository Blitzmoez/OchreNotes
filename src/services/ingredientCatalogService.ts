import { Recipe, IngredientMeta } from '../types';

export interface CollectedIngredient {
  key: string;
  displayName: string;
  recipeCount: number;
  recipeTitles: string[];
  recipeIds: string[];
  sampleAmounts: string[];
  excludeFromShoppingList: boolean;
}

export interface IngredientDuplicatePair {
  pairKey: string;
  left: CollectedIngredient;
  right: CollectedIngredient;
  reason: string;
}

export function cleanIngredientDisplayName(rawName: string): string {
  // Strip optional leading quantity if someone entered e.g. "200g Feta" cleanly when normalizing
  return (rawName || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeIngredientKey(name: string): string {
  let clean = (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');

  // Strip leading numeric amount if stored directly inside name (legacy entries)
  const leading = clean.match(/^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?\s*(?:g|gr|kg|ml|cl|l|el|tl|stk|stück|st\.|prise|prisen|bund|dose|dosen|packung|becher|glas|zehe|zehen|scheibe|scheiben)?\s+(.+)$/);
  if (leading && leading[1]) {
    clean = leading[1].trim();
  }
  return clean;
}

function stripParenthesesAndFiller(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(frisch|frische|frischer|frisches|zart|zarte|extra|vergine|gemahlen|gehackt|gerieben|getrocknet|bio|klein|groß|grosse|roter|rote|gelb|gelbe|grüne|grün|oder|und)\b/g, ' ')
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeGermanStem(word: string): string {
  if (word.length <= 3) return word;
  return word
    .replace(/(innen|ern|en|er|es|em|n|e|s)$/i, '')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function duplicatePairKey(keyA: string, keyB: string): string {
  return [keyA, keyB].sort((x, y) => x.localeCompare(y, 'de')).join('||');
}

export function collectIngredientsFromRecipes(
  recipes: Recipe[],
  ingredientMeta: Record<string, IngredientMeta> = {}
): CollectedIngredient[] {
  const ownRecipes = recipes.filter((r) => !r.sharedFrom);
  const buckets = new Map<
    string,
    {
      key: string;
      displayName: string;
      recipeIds: Set<string>;
      recipeTitles: Set<string>;
      sampleAmounts: Set<string>;
    }
  >();

  for (const recipe of ownRecipes) {
    for (const ing of recipe.ingredients || []) {
      const rawName = cleanIngredientDisplayName(ing.name);
      if (!rawName) continue;
      const key = normalizeIngredientKey(rawName);
      if (!key) continue;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          key,
          displayName: ingredientMeta[key]?.displayName || rawName,
          recipeIds: new Set(),
          recipeTitles: new Set(),
          sampleAmounts: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.recipeIds.add(recipe.id);
      bucket.recipeTitles.add(recipe.title);
      if (ing.amount?.trim()) {
        bucket.sampleAmounts.add(ing.amount.trim());
      }
    }
  }

  return Array.from(buckets.values())
    .map((b) => ({
      key: b.key,
      displayName: b.displayName,
      recipeCount: b.recipeIds.size,
      recipeTitles: Array.from(b.recipeTitles),
      recipeIds: Array.from(b.recipeIds),
      sampleAmounts: Array.from(b.sampleAmounts),
      excludeFromShoppingList: !!ingredientMeta[b.key]?.excludeFromShoppingList,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' }));
}

export function findIngredientDuplicates(
  collected: CollectedIngredient[],
  dismissedPairs: string[] = []
): IngredientDuplicatePair[] {
  const dismissedSet = new Set(dismissedPairs);
  const pairs: IngredientDuplicatePair[] = [];

  for (let i = 0; i < collected.length; i++) {
    for (let j = i + 1; j < collected.length; j++) {
      const a = collected[i];
      const b = collected[j];
      const pKey = duplicatePairKey(a.key, b.key);
      if (dismissedSet.has(pKey)) continue;

      const cleanA = stripParenthesesAndFiller(a.key);
      const cleanB = stripParenthesesAndFiller(b.key);
      if (!cleanA || !cleanB) continue;

      let reason = '';

      // 1. Exact stem after stripping descriptors/parentheses (e.g. "Kichererbsen (Dose)" vs "Kichererbsen")
      if (cleanA === cleanB) {
        reason = 'Identischer Grundbegriff / Zusatz';
      } else {
        const wordsA = cleanA.split(' ').filter((w) => w.length >= 2);
        const wordsB = cleanB.split(' ').filter((w) => w.length >= 2);
        const stemsA = wordsA.map(singularizeGermanStem);
        const stemsB = wordsB.map(singularizeGermanStem);

        // 2. Singular/Plural match (e.g. "Tomate" vs "Tomaten", "Zwiebel" vs "Zwiebeln")
        if (stemsA.join(' ') === stemsB.join(' ') && stemsA.join(' ').length >= 3) {
          reason = 'Einzahl / Mehrzahl Variante';
        } else if (
          cleanA.length >= 4 &&
          cleanB.length >= 4 &&
          (cleanA === cleanB || levenshtein(cleanA, cleanB) <= (Math.min(cleanA.length, cleanB.length) >= 7 ? 2 : 1))
        ) {
          // 3. Typo / Spelling variation (e.g. "Mozarella" vs "Mozzarella")
          reason = 'Ähnliche Schreibweise / Tippfehler';
        } else if (wordsA.length === 1 || wordsB.length === 1) {
          // 4. Shared core noun (e.g. "Salz" vs "Meersalz" or "Olivenöl" vs "Olivenöl extra")
          const shorter = wordsA.length === 1 ? cleanA : cleanB;
          const longer = wordsA.length === 1 ? cleanB : cleanA;
          if (shorter.length >= 4 && longer.split(' ').some((w) => w === shorter || singularizeGermanStem(w) === singularizeGermanStem(shorter))) {
            reason = 'Gemeinsamer Wortstamm';
          } else if (shorter.length >= 4 && longer.endsWith(shorter) && longer.length - shorter.length <= 8) {
            reason = 'Zusammengesetzte Zutat (z. B. Sorte)';
          }
        }
      }

      if (reason) {
        pairs.push({
          pairKey: pKey,
          left: a,
          right: b,
          reason,
        });
      }
    }
  }

  return pairs;
}

export function mergeIngredientInRecipes(
  recipes: Recipe[],
  masterDisplayName: string,
  sourceKeyToReplace: string
): Recipe[] {
  const masterClean = cleanIngredientDisplayName(masterDisplayName);
  const replaceNorm = normalizeIngredientKey(sourceKeyToReplace);
  if (!masterClean || !replaceNorm) return recipes;

  return recipes.map((recipe) => {
    if (recipe.sharedFrom) return recipe;
    let changed = false;
    const nextIngredients = (recipe.ingredients || []).map((ing) => {
      const k = normalizeIngredientKey(ing.name);
      if (k === replaceNorm) {
        changed = true;
        return { ...ing, name: masterClean };
      }
      return ing;
    });
    return changed ? { ...recipe, ingredients: nextIngredients } : recipe;
  });
}
