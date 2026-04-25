import { Link, useParams } from "react-router-dom";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

export default function RoutePlaceholderPage({ kind }) {
  const params = useParams();

  if (kind === "month") {
    const monthNumber = Number(params.month);
    const monthLabel = MONTHS[Math.max(0, monthNumber - 1)] || "месяца";

    return (
      <div className="shell">
        <main className="main">
          <section className="section placeholder-page">
            <span className="eyebrow">Month milestone</span>
            <h1>{monthLabel} {params.year}</h1>
            <p>
              Маршрут месяца уже заведен в runtime shell для переходов с главной, но сама страница остается
              за следующим milestone `SC-009`.
            </p>
            <div className="placeholder-actions">
              <Link className="header-link" to="/">Вернуться на главную</Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="main">
        <section className="section placeholder-page">
          <span className="eyebrow">Detail milestone</span>
          <h1>Запись {params.recordId}</h1>
          <p>
            Safe route placeholder подключен только для архитектуры home-pass. Полная detail-page остается
            в milestone `SC-010`.
          </p>
          <div className="placeholder-actions">
            <Link className="header-link" to="/">Вернуться на главную</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
