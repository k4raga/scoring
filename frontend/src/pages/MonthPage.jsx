import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMonth, fetchYear } from "../api.js";
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

const HEADER_SUBTITLE = "Утром - деньги, вечером - стулья";
const SEARCH_PLACEHOLDER = "Поиск по проекту";
const MONTH_STAGE_FILTERS = getCanonicalStageOptions();

export default function MonthPage() {
  const params = useParams();
  const year = Number(params.year);
  const month = Number(params.month);
  const introRef = useRef(null);
  const searchInputRef = useRef(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const { status, data, error } = useMonthPageData(year, month);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const node = introRef.current;

    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShow = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setIsStickyVisible(shouldShow);
      },
      { threshold: 0.08 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (stageFilter !== "all" && !MONTH_STAGE_FILTERS.some((item) => item.value === stageFilter)) {
      setStageFilter("all");
    }
  }, [stageFilter]);

  const visibleProjects = useMemo(
    () => filterProjects(data.projects, stageFilter, query),
    [data.projects, query, stageFilter]
  );
  const summary = useMemo(() => buildMonthSummary(data.projects, data.dayCount), [data.dayCount, data.projects]);
  const monthTitle = `${formatMonth(month)} ${year}`;

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
            aria-controls="month-search-panel"
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

      <section className={`search-panel ${isSearchOpen ? "open" : ""}`.trim()} id="month-search-panel">
        <label className="search-field" htmlFor="month-search">
          <span className="search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="month-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            ref={searchInputRef}
            type="search"
            value={query}
          />
        </label>
      </section>

      {status === "loading" ? <RuntimeBanner>Загружаем проекты месяца.</RuntimeBanner> : null}
      {status === "error" ? <RuntimeBanner tone="error">Не удалось загрузить проекты месяца: {error}</RuntimeBanner> : null}

      <div className={`sticky-month-toolbar ${isStickyVisible ? "visible" : ""}`.trim()}>
        <div className="sticky-month-toolbar-inner">
          <div className="sticky-month-toolbar-content">
            <div className="controls-group">
              <span className="controls-label">Месяцы</span>
              <div className="month-anchor-nav">
                {data.monthLinks.map((item) => (
                  <Link
                    className={`month-anchor-chip ${item.month === month ? "active" : ""}`.trim()}
                    key={item.month}
                    to={buildMonthPath(year, item.month)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="controls-group">
              <span className="controls-label">Фильтр по стадии</span>
              <div className="filter-row">
                <button
                  className={`filter-chip month-filter-chip ${stageFilter === "all" ? "active" : ""}`.trim()}
                  onClick={() => setStageFilter("all")}
                  type="button"
                >
                  Все стадии
                </button>
                {MONTH_STAGE_FILTERS.map((item) => (
                  <button
                    className={`filter-chip month-filter-chip ${stageFilter === item.value ? "active" : ""}`.trim()}
                    key={item.value}
                    onClick={() => setStageFilter(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="main">
        <section className="section month-intro" ref={introRef}>
          <div className="year-head">
            <h1>{year}</h1>
              Архивный срез за {monthTitle}. Выберите нужную стадию или откройте соседний месяц в том же контуре.
          </div>

          <div className="month-controls">
            <div className="controls-group">
              <span className="controls-label">Месяцы</span>
              <div className="month-anchor-nav">
                {data.monthLinks.map((item) => (
                  <Link
                    className={`month-anchor-chip ${item.month === month ? "active" : ""}`.trim()}
                    key={item.month}
                    to={buildMonthPath(year, item.month)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="controls-group">
              <span className="controls-label">Фильтр по стадии</span>
              <div className="filter-row">
                <button
                  className={`filter-chip month-filter-chip ${stageFilter === "all" ? "active" : ""}`.trim()}
                  onClick={() => setStageFilter("all")}
                  type="button"
                >
                  Все стадии
                </button>
                {MONTH_STAGE_FILTERS.map((item) => (
                  <button
                    className={`filter-chip month-filter-chip ${stageFilter === item.value ? "active" : ""}`.trim()}
                    key={item.value}
                    onClick={() => setStageFilter(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="month-summary-bar">
            <span className="count-chip">{summary.totalProjects} проектов</span>
            <span className="month-summary-note">{summary.totalDays} дней с проектами</span>
            {summary.withDocuments ? (
              <span className="month-summary-note">С документами: {summary.withDocuments}</span>
            ) : null}

            <div className="month-summary-stats">
              {summary.stageStats
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span className={`month-stat ${item.toneClass}`.trim()} key={item.value}>
                    <span className="month-stat-label">
                      <span className="month-stat-dot"></span>
                      <span>{item.label}</span>
                    </span>
                    <strong>{item.count}</strong>
                  </span>
                ))}
            </div>
          </div>
        </section>

        <section className="section month-section" id="month-projects">
          <div className="month-head">
            <div className="month-head-copy">
              <h2>{formatMonth(month)}</h2>
              <p className="section-note">
                {query.trim()
                  ? `Найдено ${visibleProjects.length} проектов по запросу «${query.trim()}».`
                  : `${visibleProjects.length} проектов в выбранной подборке.`}
              </p>
            </div>

            <Link className="section-link month-home-link" to="/">
              На главную
            </Link>
          </div>

          <div className="projects-grid">
            {visibleProjects.length ? (
              visibleProjects.map((project) => (
                <Link className="project-card" key={project.id} to={buildRecordPath(project.id)}>
                  <div className="project-card-top">
                    <span className={`status-chip ${getCanonicalStageToneClass(project.stage, project.status)}`.trim()}>
                      {getCanonicalStageLabel(project.stage, project.status)}
                    </span>
                    <span className="project-meta">{formatDate(project.publishedAt)}</span>
                  </div>

                  <h3>{project.projectTitle || project.shortTitle || project.title}</h3>
                  <p className="project-description">{project.title}</p>

                  <div className="project-meta project-card-footer">
                    <span>{project.customer || "Заказчик не указан"}</span>
                    <span>{formatDate(project.deadlineAt || project.publishedAt)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <article className="project-card empty">
                <p className="empty-copy">По выбранным фильтрам в этом месяце проектов пока нет.</p>
              </article>
            )}
          </div>
        </section>
      </main>

      <footer className="footer month-footer">
        <span>{monthTitle}</span>
        <span className="footer-copy">Scoring</span>
      </footer>
    </div>
  );
}

function RuntimeBanner({ children, tone = "neutral" }) {
  return <div className={`runtime-banner ${tone === "error" ? "runtime-banner-error" : ""}`.trim()}>{children}</div>;
}

function useMonthPageData(year, month) {
  const [state, setState] = useState(() => ({
    status: "loading",
    data: createMonthPageData(year, month),
    error: ""
  }));

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const monthView = await fetchMonth(year, month);
        let yearView = null;

        try {
          yearView = await fetchYear(year);
        } catch {
          yearView = null;
        }

        if (!active) {
          return;
        }

        setState({
          status: "success",
          data: createMonthPageData(year, month, monthView, yearView),
          error: ""
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          data: createMonthPageData(year, month),
          error: loadError instanceof Error ? loadError.message : "unexpected_error"
        });
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [month, year]);

  return state;
}

function createMonthPageData(year, month, monthView = null, yearView = null) {
  const projects = normalizeProjects(monthView?.projects || []);
  const dayCount = Number(monthView?.days?.length || 0);
  const monthLinks = buildMonthLinks(year, month, yearView);

  return {
    year,
    month,
    dayCount,
    projects,
    monthLinks
  };
}

function normalizeProjects(projects) {
  return sortProjectsDesc(
    (projects || []).map((project) => ({
      id: String(project.id || ""),
      projectTitle: String(project.projectTitle || ""),
      title: String(project.title || ""),
      shortTitle: String(project.shortTitle || project.title || ""),
      customer: String(project.customer || ""),
      status: String(project.status || ""),
      stage: String(project.stage || ""),
      publishedAt: String(project.publishedAt || ""),
      deadlineAt: String(project.deadlineAt || ""),
      documentsCount: Number(project.documentsCount || 0)
    }))
  );
}

function buildMonthLinks(year, currentMonth, yearView) {
  const months = new Map();

  for (const monthItem of yearView?.months || []) {
    months.set(Number(monthItem.month), {
      month: Number(monthItem.month),
      label: formatMonth(monthItem.month),
      to: buildMonthPath(year, monthItem.month)
    });
  }

  if (!months.has(currentMonth)) {
    months.set(currentMonth, {
      month: currentMonth,
      label: formatMonth(currentMonth),
      to: buildMonthPath(year, currentMonth)
    });
  }

  return [...months.values()].sort((left, right) => right.month - left.month);
}

function buildMonthSummary(projects, dayCount) {
  const withDocuments = projects.filter((project) => project.documentsCount > 0).length;

  return {
    totalProjects: projects.length,
    totalDays: dayCount,
    withDocuments,
    stageStats: buildCanonicalStageStats(projects)
  };
}

function filterProjects(projects, stageFilter, query) {
  const normalizedQuery = query.trim().toLowerCase();

  return projects.filter((project) => {
    const matchesStage =
      stageFilter === "all" || getCanonicalStageValue(project.stage, project.status) === stageFilter;

    if (!matchesStage) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      project.title,
      project.projectTitle,
      project.shortTitle,
      project.customer,
      project.status,
      project.stage,
      getCanonicalStageLabel(project.stage, project.status)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function sortProjectsDesc(projects) {
  return [...projects].sort((left, right) => {
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

function buildMonthPath(year, month) {
  return `/years/${year}/months/${month}`;
}

function buildRecordPath(recordId) {
  return `/records/${recordId}`;
}
