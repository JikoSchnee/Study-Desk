export function normalizeSelectValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function matchingOptions(options: string[], query: string, selected: string[] = []) {
  const normalizedQuery = normalizeSelectValue(query);
  const selectedValues = new Set(selected.map(normalizeSelectValue));
  return options.filter((option) => !selectedValues.has(normalizeSelectValue(option)) && (!normalizedQuery || normalizeSelectValue(option).includes(normalizedQuery)));
}

export function appendUniqueValues(values: string[], additions: string[]) {
  const known = new Set(values.map(normalizeSelectValue));
  return additions.reduce<string[]>((result, addition) => {
    const value = addition.trim();
    const key = normalizeSelectValue(value);
    if (!value || known.has(key)) return result;
    known.add(key);
    result.push(value);
    return result;
  }, [...values]);
}
