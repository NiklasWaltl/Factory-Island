// Module-scoped id counter shared across all callers. Extracted from
// reducer.ts so handler modules can value-import `makeId` directly
// without creating an ESM cycle through `../reducer`.

let counter = 0;

/** Returns a unique string id with the given prefix (default "a"). */
export function makeId(prefix: string = "a"): string {
  return `${prefix}${Date.now()}_${counter++}`;
}
