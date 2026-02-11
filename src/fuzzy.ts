const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const bigrams = (value: string): Set<string> => {
  const set = new Set<string>();
  if (value.length < 2) {
    if (value.length === 1) {
      set.add(value);
    }
    return set;
  }

  for (let index = 0; index < value.length - 1; index += 1) {
    set.add(value.slice(index, index + 2));
  }

  return set;
};

const jaccard = (left: Set<string>, right: Set<string>): number => {
  const union = new Set<string>([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
};

export const scoreCandidate = (query: string, iconId: string): number => {
  const normalizedQuery = normalize(query);
  const normalizedId = normalize(iconId);
  const normalizedName = normalize(iconId.includes(":") ? iconId.split(":", 2)[1] : iconId);

  if (normalizedQuery.length === 0) {
    return 0;
  }

  if (normalizedId === normalizedQuery || normalizedName === normalizedQuery) {
    return 1;
  }

  if (normalizedId.startsWith(normalizedQuery) || normalizedName.startsWith(normalizedQuery)) {
    return 0.92;
  }

  if (normalizedId.includes(normalizedQuery) || normalizedName.includes(normalizedQuery)) {
    return 0.82;
  }

  return jaccard(bigrams(normalizedQuery), bigrams(normalizedName));
};
