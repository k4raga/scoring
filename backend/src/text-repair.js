const LATIN1_MOJIBAKE_PATTERN = /[À-ÿ]/u;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/gu;

export function repairTextEncoding(value) {
  const source = String(value ?? "");

  if (!source || looksPathLike(source) || !LATIN1_MOJIBAKE_PATTERN.test(source)) {
    return source;
  }

  try {
    const repaired = Buffer.from(source, "latin1").toString("utf8");

    if (isImproved(source, repaired)) {
      return repaired;
    }
  } catch {
    return source;
  }

  return source;
}

function looksPathLike(value) {
  return /^(?:[a-z]+:)?[\\/]/iu.test(value) || value.includes("\\") || value.includes("/") || /^https?:/iu.test(value);
}

function isImproved(source, repaired) {
  if (!repaired || repaired.includes("\uFFFD")) {
    return false;
  }

  return countCyrillic(repaired) > countCyrillic(source);
}

function countCyrillic(value) {
  return (value.match(CYRILLIC_PATTERN) || []).length;
}
