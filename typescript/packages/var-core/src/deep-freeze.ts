// Recursively freezes the own enumerable properties of PLAIN objects and arrays
// (descending into nested plain data) and returns the same reference. Class
// instances — any value whose prototype is not Object.prototype, null, or an
// array — are left live and NOT recursed into, so a stateful collaborator held
// in state (a Library, page object, DB client, the system under test, Date, Map,
// Set, …) keeps working through its mutating methods. Primitives, null, and
// already-frozen values pass through untouched. Symbol-keyed properties are not
// traversed. Assumes acyclic input (test state is). Pure except for the in-place
// Object.freeze on the plain data it is handed.
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  // Freeze plain data only; leave class instances (non-plain prototype) live.
  const proto = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    return value
  }
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return Object.freeze(value)
}
