import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, fetchYear } from "../api.js";
import { LogoMark, SearchIcon } from "../ui/icons.jsx";
import ProjectCreateButton from "../ui/ProjectCreateButton.jsx";
import {
  buildCanonicalStageStats,
  getCanonicalStageLabel,
  getCanonicalStageOptions,
  getCanonicalStageToneClass,
  getCanonicalStageValue
} from "../uiStage.js";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const SEARCH_PLACEHOLDER = "Поиск по проектам, заказчикам и статусам";
const HEADER_SUBTITLE = "Утром - деньги, вечером - стулья";
const LATEST_GRID_SIZE = 9;
const HOME_STAGE_FILTERS = getCanonicalStageOptions();

export default function HomePage() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const { status, data, error } = useHomePageData();
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (stageFilter !== "all" && !HOME_STAGE_FILTERS.some((item) => item.value === stageFilter)) {
      setStageFilter("all");
    }
  }, [stageFilter]);

  const hasActiveStageFilter = stageFilter !== "all";
  const latestCards = useMemo(() => buildLatestGrid(data.allRecords), [data.allRecords]);
  const stageScopeRecords = useMemo(() => getYearRecords(data.years, data.current.year), [data.years, data.current.year]);
  const stageResults = useMemo(() => filterRecordsByStage(stageScopeRecords, stageFilter), [stageScopeRecords, stageFilter]);
  const searchResults = useMemo(() => searchRecords(data.allRecords, query), [data.allRecords, query]);

  return (
    <div className="shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>

          <div className="brand-copy">
            <b>Scoring</b>
            <span>{HEADER_SUBTITLE}</span>
          </div>
        </Link>

        <div className="header-side">
          <button
            aria-controls="search-panel"
            aria-expanded={isSearchOpen}
            aria-label="Открыть поиск"
            className={`icon-button ${isSearchOpen ? "active" : ""}`.trim()}
            onClick={() => setIsSearchOpen((value) => !value)}
            type="button"
          >
            <SearchIcon />
          </button>

          <ProjectCreateButton className="header-link">
            + Добавить проект
          </ProjectCreateButton>
        </div>
      </header>

      <section className={`search-panel ${isSearchOpen ? "open" : ""}`.trim()} id="search-panel">
        <label className="search-field" htmlFor="home-search">
          <span className="search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="home-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            type="search"
            value={query}
          />
        </label>
      </section>

      {status === "loading" ? <RuntimeBanner>Загружаем архив проектов.</RuntimeBanner> : null}
      {status === "error" ? <RuntimeBanner tone="error">Не удалось загрузить архив проектов: {error}</RuntimeBanner> : null}

      <main className="main">
        <section className="section" id="latest">
          <div className="section-head">
            <div className="section-head-copy">
              <h2>Последние проекты</h2>

              <div className="filter-row" role="tablist" aria-label="Фильтры по стадиям">
                <button
                  className={`filter-chip ${stageFilter === "all" ? "active" : ""}`.trim()}
                  onClick={() => setStageFilter("all")}
                  type="button"
                >
                  Все стадии
                </button>

                {HOME_STAGE_FILTERS.map((item) => (
                  <button
                    className={`filter-chip ${stageFilter === item.value ? "active" : ""}`.trim()}
                    key={item.value}
                    onClick={() => setStageFilter(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <Link className="section-link home-archive-link" to={buildMonthPath(data.current.year, data.current.month)}>
              Текущий месяц
            </Link>
          </div>

          <div className="latest-list">
            {hasActiveStageFilter ? (
              stageResults.length ? (
                stageResults.map((record) => (
                  <RecordCard key={record.id} record={record} variant="latest" />
                ))
              ) : (
                <div className="results-empty latest-empty">На выбранной стадии пока нет проектов.</div>
              )
            ) : (
              latestCards.map((record) => (
                <RecordCard key={record.id} record={record} variant="latest" />
              ))
            )}
          </div>
        </section>

        {trimmedQuery ? (
          <section className="section results show" id="results">
            <div className="section-head">
              <div className="section-head-copy">
                <span className="eyebrow">Результаты поиска</span>
                <h2>Найдено {searchResults.length}</h2>
              </div>
            </div>

            <div className="results-list">
              {searchResults.length ? (
                searchResults.map((record) => (
                  <RecordCard key={record.id} record={record} variant="result" />
                ))
              ) : (
                <div className="results-empty">По этому запросу пока ничего не найдено.</div>
              )}
            </div>
          </section>
        ) : null}

        <section className="archive" id="archive">
          {data.years.map((yearBlock) => (
            <YearSection current={data.current} key={yearBlock.year} yearBlock={yearBlock} />
          ))}
        </section>
      </main>

      <footer className="footer home-footer">
        <span className="footer-note">Архив проектов scoring</span>
        <span className="footer-copy">Scoring</span>
      </footer>
    </div>
  );
}

function RuntimeBanner({ children, tone = "neutral" }) {
  return <div className={`runtime-banner ${tone === "error" ? "runtime-banner-error" : ""}`.trim()}>{children}</div>;
}

function YearSection({ yearBlock, current }) {
  const months = useMemo(() => expandYearMonths(yearBlock, current), [yearBlock, current]);

  return (
    <section className="section year">
      <div className="year-head">
        <h2>{yearBlock.year}</h2>
      </div>

      <div className="months-grid">
        {months.map((monthBlock) => {
          const isCurrent = yearBlock.year === current.year && monthBlock.month === current.month;
          const monthPath = buildMonthPath(yearBlock.year, monthBlock.month);
          const stageStats = buildCanonicalStageStats(monthBlock.records).filter((item) => item.count > 0);
          const monthBodyClass = [
            "month-card",
            isCurrent ? "current" : "",
            monthBlock.totalRecords ? "" : "empty"
          ].join(" ").trim();

          return (
            <Link className={monthBodyClass} key={`${yearBlock.year}-${monthBlock.month}`} to={monthPath}>
              <div className="month-copy">
                <strong>{formatMonth(monthBlock.month)}</strong>
                {monthBlock.totalRecords ? <span className="count-chip">{monthBlock.totalRecords} проектов</span> : null}
              </div>

              {stageStats.length ? (
                <div className="month-stats">
                  {stageStats.map((item) => (
                    <span className={`month-stat ${item.toneClass}`.trim()} key={item.value}>
                      <span className="month-stat-label">
                        <span className="month-stat-dot"></span>
                        <span>{item.label}</span>
                      </span>
                      <strong>{item.count}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecordCard({ record, variant }) {
  const className = [
    variant === "result" ? "result-card" : "latest-card",
    record.placeholder ? "placeholder" : ""
  ].join(" ").trim();
  const statusLabel = record.placeholder
    ? String(record.stage || record.status || "Скоро")
    : getCanonicalStageLabel(record.stage, record.status);
  const toneClass = record.placeholder && statusLabel === "Скоро"
    ? "status-neutral"
    : getCanonicalStageToneClass(record.stage, record.status);

  if (record.placeholder) {
    return (
      <article className={className}>
        <div className="row-top">
          <span className={`status-chip ${toneClass}`.trim()}>{statusLabel}</span>
          <span className="latest-meta"></span>
        </div>
        <h3>{record.shortTitle}</h3>
        <p>{record.title}</p>
        <div className="row-meta">
          <span>{record.customer}</span>
        </div>
      </article>
    );
  }

  return (
    <Link className={className} to={buildRecordPath(record.id)}>
      <div className="row-top">
        <span className={`status-chip ${toneClass}`.trim()}>{statusLabel}</span>
        <span className="latest-meta">{formatDate(record.publishedAt)}</span>
      </div>
      <h3>{record.shortTitle || record.title}</h3>
      <p>{record.summary || record.description || record.title}</p>
      <div className="row-meta">
        <span>{record.customer || "Заказчик не указан"}</span>
      </div>
    </Link>
  );
}

function useHomePageData() {
  const [state, setState] = useState(() => ({
    status: "loading",
    data: createHomeData(),
    error: ""
  }));

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const dashboard = await fetchDashboard();
        const yearResponses = await Promise.all(
          (dashboard?.years || []).map(async (yearItem) => {
            try {
              return await fetchYear(yearItem.year);
            } catch {
              return null;
            }
          })
        );

        if (!active) {
          return;
        }

        setState({
          status: "success",
          data: createHomeData(dashboard, yearResponses.filter(Boolean)),
          error: ""
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          data: createHomeData(),
          error: loadError instanceof Error ? loadError.message : "unexpected_error"
        });
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return state;
}

function createHomeData(dashboard = null, yearViews = []) {
  const now = new Date();
  const fallbackCurrent = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    monthLabel: formatMonth(now.getMonth() + 1),
    totalRecords: 0,
    projectCount: 0,
    dayCount: 0,
    readyForHandoffCount: 0,
    withDocumentsCount: 0,
    archiveCount: 0
  };
  const current = normalizeCurrent(dashboard?.current, fallbackCurrent);
  const years = normalizeYears(dashboard, yearViews, current);
  const allRecords = sortRecordsDesc(mergeRecords(dashboard?.latestRecords || [], years));

  return {
    current,
    years,
    allRecords
  };
}

function normalizeCurrent(current, fallbackCurrent) {
  return {
    ...fallbackCurrent,
    ...(current || {}),
    year: Number(current?.year || fallbackCurrent.year),
    month: Number(current?.month || fallbackCurrent.month),
    monthLabel: current?.monthLabel || fallbackCurrent.monthLabel
  };
}

function normalizeYears(dashboard, yearViews, current) {
  const viewMap = new Map(yearViews.map((view) => [Number(view.year), normalizeYearView(view)]));
  const years = [];

  for (const yearItem of dashboard?.years || []) {
    const targetYear = Number(yearItem.year);
    const directView = viewMap.get(targetYear);

    if (directView) {
      years.push(directView);
      continue;
    }

    if (targetYear === current.year && dashboard?.monthView?.year === current.year) {
      years.push(normalizeDashboardMonthView(dashboard.monthView));
    }
  }

  return years.sort((left, right) => right.year - left.year);
}

function normalizeYearView(view) {
  return {
    year: Number(view.year),
    totalRecords: Number(view.totalRecords || 0),
    months: (view.months || []).map((month) => normalizeMonthBlock(month))
  };
}

function normalizeDashboardMonthView(monthView) {
  return {
    year: Number(monthView.year),
    totalRecords: Number(monthView.totalRecords || 0),
    months: [
      normalizeMonthBlock({
        month: monthView.month,
        totalRecords: monthView.totalRecords,
        dayCount: monthView.days?.length || 0,
        records: monthView.projects || []
      })
    ]
  };
}

function normalizeMonthBlock(month) {
  const records = (month.records || []).map((record) => ({
    id: String(record.id || ""),
    title: String(record.title || ""),
    shortTitle: String(record.shortTitle || record.title || ""),
    summary: String(record.summary || record.notes || ""),
    description: String(record.description || ""),
    customer: String(record.customer || ""),
    contractor: String(record.contractor || record.executor || record.supplier || ""),
    status: String(record.status || ""),
    stage: String(record.stage || ""),
    publishedAt: String(record.publishedAt || ""),
    deadlineAt: String(record.deadlineAt || ""),
    documentsCount: Number(record.documentsCount || 0)
  }));

  return {
    month: Number(month.month),
    totalRecords: Number(month.totalRecords || month.total || records.length || 0),
    dayCount: Number(month.dayCount || 0),
    records,
    latestPublishedAt: sortRecordsDesc(records)[0]?.publishedAt || ""
  };
}

function mergeRecords(latestRecords, years) {
  const map = new Map();

  for (const record of latestRecords || []) {
    if (record?.id) {
      map.set(record.id, normalizeRecord(record));
    }
  }

  for (const yearBlock of years) {
    for (const monthBlock of yearBlock.months) {
      for (const record of monthBlock.records) {
        if (record?.id && !map.has(record.id)) {
          map.set(record.id, normalizeRecord(record));
        }
      }
    }
  }

  return [...map.values()];
}

function normalizeRecord(record) {
  return {
    id: String(record.id || ""),
    title: String(record.title || ""),
    shortTitle: String(record.shortTitle || record.title || ""),
    summary: String(record.summary || record.notes || ""),
    description: String(record.description || ""),
    customer: String(record.customer || ""),
    contractor: String(record.contractor || record.executor || record.supplier || ""),
    status: String(record.status || ""),
    stage: String(record.stage || ""),
    publishedAt: String(record.publishedAt || ""),
    deadlineAt: String(record.deadlineAt || ""),
    documentsCount: Number(record.documentsCount || 0)
  };
}

function buildLatestGrid(records) {
  const filteredRecords = sortRecordsDesc(records).slice(0, LATEST_GRID_SIZE);

  const filledRecords = [...filteredRecords];

  while (filledRecords.length < LATEST_GRID_SIZE) {
    filledRecords.push(createPlaceholderRecord(filledRecords.length + 1, "all"));
  }

  return filledRecords;
}

function filterRecordsByStage(records, stageFilter) {
  const sortedRecords = sortRecordsDesc(records);

  if (stageFilter === "all") {
    return sortedRecords;
  }

  return sortedRecords.filter((record) => getCanonicalStageValue(record.stage, record.status) === stageFilter);
}

function getYearRecords(years, targetYear) {
  const yearBlock = years.find((item) => item.year === Number(targetYear));

  if (!yearBlock) {
    return [];
  }

  const records = [];

  for (const monthBlock of yearBlock.months || []) {
    for (const record of monthBlock.records || []) {
      records.push(record);
    }
  }

  return records;
}

function createPlaceholderRecord(index, stageFilter) {
  const label = stageFilter === "all"
    ? "Скоро"
    : HOME_STAGE_FILTERS.find((item) => item.value === stageFilter)?.label || "Скоро";

  return {
    id: `placeholder-${stageFilter}-${index}`,
    title:
      stageFilter === "all"
        ? "Здесь появится следующий проект из live-ленты."
        : `Здесь появится проект на стадии «${label}».`,
    shortTitle: "Свободный слот",
    customer: "Данные ожидаются",
    stage: label,
    status: label,
    placeholder: true,
    publishedAt: ""
  };
}

function searchRecords(records, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return sortRecordsDesc(records)
    .filter((record) => {
      const haystack = [
        record.title,
        record.shortTitle,
        record.summary,
        record.description,
        record.customer,
        record.contractor,
        record.stage,
        record.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const canonicalStage = getCanonicalStageLabel(record.stage, record.status).toLowerCase();

      return `${haystack} ${canonicalStage}`.includes(normalizedQuery);
    });
}

function expandYearMonths(yearBlock, current) {
  const lastMonth = yearBlock.year === current.year ? current.month : 12;
  const monthsMap = new Map(yearBlock.months.map((month) => [month.month, month]));

  return Array.from({ length: lastMonth }, (_, index) => lastMonth - index).map((monthNumber) => {
    const monthBlock = monthsMap.get(monthNumber);

    if (monthBlock) {
      return monthBlock;
    }

    return {
      month: monthNumber,
      totalRecords: 0,
      dayCount: 0,
      records: [],
      latestPublishedAt: ""
    };
  });
}

function buildMonthPath(year, month) {
  return `/years/${year}/months/${month}`;
}

function buildRecordPath(recordId) {
  return `/records/${recordId}`;
}

function sortRecordsDesc(records) {
  return [...records].sort((left, right) => {
    const rightTime = parseDate(right.publishedAt);
    const leftTime = parseDate(left.publishedAt);

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return String(left.title || "").localeCompare(String(right.title || ""), "ru-RU");
  });
}

function parseDate(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value) {
  if (!value) {
    return "без даты";
  }

  const parsed = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short"
  });
}

function formatMonth(month) {
  return MONTHS[Math.max(0, Number(month) - 1)] || "Месяц";
}
