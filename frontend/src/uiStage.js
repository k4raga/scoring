const STAGE_MODEL = [
  { value: "скоринг", label: "Скоринг", toneClass: "status-scoring" },
  { value: "предоценка", label: "Предоценка", toneClass: "status-precheck" },
  { value: "оценка", label: "Оценка", toneClass: "status-estimate" },
  { value: "подано", label: "Подано", toneClass: "status-submitted" },
  { value: "получен ответ", label: "Получен ответ", toneClass: "status-response" }
];

const FALLBACK_STAGE = { value: "", label: "Без статуса", toneClass: "status-neutral" };

const STAGE_MATCHERS = [
  {
    value: "получен ответ",
    patterns: ["получен ответ", "ответ", "архив", "заверш", "закрыт", "closed", "completed", "complete"]
  },
  {
    value: "подано",
    patterns: ["подано", "handoff", "готов", "подготов", "submit", "submitted"]
  },
  {
    value: "оценка",
    patterns: ["оцен", "детал", "чернов", "review"]
  },
  {
    value: "предоценка",
    patterns: ["пред", "анализ", "precheck", "analysis"]
  },
  {
    value: "скоринг",
    patterns: ["скоринг", "кодинг", "coding"]
  }
];

export function getCanonicalStageOptions() {
  return STAGE_MODEL.map(({ value, label }) => ({ value, label }));
}

export function getCanonicalStageMeta(...sources) {
  for (const source of sources) {
    const normalized = normalizeStageText(source);

    if (!normalized) {
      continue;
    }

    const directMatch = STAGE_MODEL.find((item) => item.value === normalized);

    if (directMatch) {
      return directMatch;
    }

    const matchedStage = STAGE_MATCHERS.find((item) => {
      return item.patterns.some((pattern) => normalized.includes(pattern));
    });

    if (matchedStage) {
      return STAGE_MODEL.find((item) => item.value === matchedStage.value) || FALLBACK_STAGE;
    }
  }

  return FALLBACK_STAGE;
}

export function getCanonicalStageLabel(...sources) {
  return getCanonicalStageMeta(...sources).label;
}

export function getCanonicalStageValue(...sources) {
  return getCanonicalStageMeta(...sources).value;
}

export function getCanonicalStageToneClass(...sources) {
  return getCanonicalStageMeta(...sources).toneClass;
}

export function buildCanonicalStageStats(records, resolveSources) {
  const counts = new Map(STAGE_MODEL.map((item) => [item.value, 0]));

  for (const record of records || []) {
    const sources = typeof resolveSources === "function"
      ? resolveSources(record)
      : [record?.stage, record?.status];
    const meta = Array.isArray(sources)
      ? getCanonicalStageMeta(...sources)
      : getCanonicalStageMeta(sources);

    if (meta.value) {
      counts.set(meta.value, (counts.get(meta.value) || 0) + 1);
    }
  }

  return STAGE_MODEL.map((item) => ({
    ...item,
    count: counts.get(item.value) || 0
  }));
}

export function normalizeStageText(value) {
  return String(value || "").trim().toLowerCase();
}
