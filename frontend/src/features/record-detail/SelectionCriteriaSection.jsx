import {
  SELECTION_CRITERIA_COVERAGE_OPTIONS,
  SELECTION_CRITERIA_GROUP_OPTIONS
} from "./recordFormModel.js";
import { CustomSelect } from "./RecordControls.jsx";

export function SelectionCriteriaSection({
  coverageOptions = SELECTION_CRITERIA_COVERAGE_OPTIONS,
  groupOptions = SELECTION_CRITERIA_GROUP_OPTIONS,
  onAdd,
  onRemove,
  onUpdate,
  rows
}) {
  const groupedRows = groupSelectionCriteriaRows(rows, groupOptions);

  return (
    <section className="detail-section detail-selection-criteria-section" id="section-selection-criteria">
      <div className="detail-section-head detail-criteria-head">
        <div>
          <h2>Критерии выбора</h2>
          <p>Критерии, по которым организатор тендера выбирает победителя. Одна строка — один критерий или требование.</p>
        </div>
        <button className="section-link detail-add-criteria-button" onClick={onAdd} type="button">
          Добавить строку
        </button>
      </div>

      {rows.length ? (
        <div className="detail-selection-criteria-groups">
          {groupedRows.map((group) => (
            <div className="detail-selection-criteria-group" key={group.value}>
              <div className="detail-selection-criteria-group-head">
                <strong>{group.label}</strong>
                <span>{group.rows.length}</span>
              </div>

              <div className="detail-selection-criteria-list">
                {group.rows.map((row) => (
                  <SelectionCriteriaRow
                    coverageOptions={coverageOptions}
                    groupOptions={groupOptions}
                    key={row.rowId}
                    onRemove={onRemove}
                    onUpdate={onUpdate}
                    row={row}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="detail-criteria-empty detail-selection-criteria-empty">
          Критерии выбора пока не заполнены. Добавьте строки вручную или дождитесь тестового extractor-pass.
        </div>
      )}
    </section>
  );
}

function SelectionCriteriaRow({ coverageOptions, groupOptions, onRemove, onUpdate, row }) {
  const showWeight = row.group !== "requirement";

  return (
    <article className="detail-selection-criteria-row">
      <div className="detail-selection-criteria-row-top">
        <span className="detail-selection-criteria-order">#{row.order}</span>
        <button className="detail-remove-button" onClick={() => onRemove(row.rowId)} type="button">
          Удалить
        </button>
      </div>

      <div className="detail-selection-criteria-grid">
        <div className="detail-field-card detail-selection-criteria-controls">
          <div className="detail-selection-criteria-control">
            <span className="detail-field-label">Группа</span>
            <CustomSelect
              onChange={(value) => onUpdate(row.rowId, "group", value)}
              options={groupOptions}
              value={row.group}
            />
          </div>

          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Вес, %</span>
            <input
              className="detail-control"
              disabled={!showWeight}
              max="100"
              min="0"
              onChange={(event) => onUpdate(row.rowId, "weightPercent", event.target.value)}
              placeholder={showWeight ? "40" : "Без веса"}
              type="number"
              value={showWeight ? row.weightPercent : ""}
            />
          </label>

          <div className="detail-selection-criteria-control">
            <span className="detail-field-label">Закрытие</span>
            <CustomSelect
              onChange={(value) => onUpdate(row.rowId, "coverageStatus", value)}
              options={coverageOptions}
              placeholder="Выберите статус"
              value={row.coverageStatus}
            />
          </div>
        </div>

        <div className="detail-field-card detail-selection-criteria-body">
          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Критерий / требование</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdate(row.rowId, "title", event.target.value)}
              placeholder="Например: минимальная цена, опыт команды или обязательная интеграция"
              rows="3"
              value={row.title}
            />
          </label>

          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Как закрываем</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdate(row.rowId, "coverageNote", event.target.value)}
              placeholder="Что именно в нашем предложении закрывает критерий или почему не закрывает"
              rows="3"
              value={row.coverageNote}
            />
          </label>
        </div>
      </div>
    </article>
  );
}

function groupSelectionCriteriaRows(rows, groupOptions) {
  return groupOptions.map((option) => ({
    ...option,
    rows: rows
      .filter((row) => row.group === option.value)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  })).filter((group) => group.rows.length);
}
