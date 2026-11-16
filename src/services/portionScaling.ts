import { RecipeIngredient } from '../types';

function formatScaledNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round(value * 100) / 100;
  // Prefer German comma for decimals if non-integer, or clean integer
  if (Math.abs(rounded - Math.round(rounded)) < 0.01) {
    return String(Math.round(rounded));
  }
  const oneDec = Math.round(rounded * 10) / 10;
  if (Math.abs(rounded - oneDec) < 0.02) {
    return String(oneDec).replace('.', ',');
  }
  return String(rounded).replace('.', ',');
}

export function scaleAmountText(text: string, factor: number): string {
  if (!text || !Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.001) {
    return text;
  }

  // Matches fractions (e.g. 1/2) or decimals/integers (e.g. 250, 1,5, 2.5)
  // Avoid scaling numbers immediately followed by ° or % (e.g. 180°C, 3,5% Milch)
  return text.replace(/(?<![\w.,])(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)(?!\s*[°%])/g, (match) => {
    let num: number;
    if (match.includes('/')) {
      const [a, b] = match.split('/').map((p) => parseFloat(p.replace(',', '.').trim()));
      if (!b || Number.isNaN(a) || Number.isNaN(b)) return match;
      num = a / b;
    } else {
      num = parseFloat(match.replace(',', '.'));
      if (Number.isNaN(num)) return match;
    }
    return formatScaledNumber(num * factor);
  });
}

export function getScaledIngredientDisplay(
  ing: RecipeIngredient,
  basePortions: number,
  targetPortions: number
): { name: string; amount: string; factor: number } {
  const safeBase = Math.max(1, basePortions || 1);
  const safeTarget = Math.max(1, targetPortions || safeBase);
  const factor = safeTarget / safeBase;

  if (Math.abs(factor - 1) < 0.001) {
    return { name: ing.name, amount: ing.amount, factor: 1 };
  }

  if (ing.amount && ing.amount.trim()) {
    return {
      name: ing.name,
      amount: scaleAmountText(ing.amount, factor),
      factor,
    };
  }

  return {
    name: scaleAmountText(ing.name, factor),
    amount: '',
    factor,
  };
}
