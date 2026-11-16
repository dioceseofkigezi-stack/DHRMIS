import { displayValue } from "./displayValue";

/**
 * Encode a CSV cell and neutralize spreadsheet formulas supplied as text.
 * Numeric values remain numeric, including legitimate negative amounts.
 */
export function csvCell(value: unknown) {
  const text = displayValue(value);
  const formulaLikeText = typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text);
  const safeText = formulaLikeText ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
