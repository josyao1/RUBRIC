/**
 * parseJsonArray — Safe JSON array parser that returns [] on failure
 *
 * Attempts to parse a JSON string as a string array. If parsing fails
 * for any reason, returns an empty array instead of throwing.
 */
export function parseJsonArray(str: string): string[] {
  try {
    return JSON.parse(str);
  } catch {
    return [];
  }
}
