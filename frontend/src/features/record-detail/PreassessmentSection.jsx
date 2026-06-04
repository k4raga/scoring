import {
  PREASSESSMENT_CRITICALITY_OPTIONS,
  PREASSESSMENT_SUMMARY_DECISION_OPTIONS,
  RISK_BASE_URL
} from "./recordFormModel.js";
import { CustomSelect } from "./RecordControls.jsx";

export function PreassessmentSection({
  criticalityOptions = PREASSESSMENT_CRITICALITY_OPTIONS,
  onAdd,
  onFieldChange,
  onRemove,
  onRowUpdate,
  preassessment,
  riskBaseUrl = RISK_BASE_URL,
  summaryDecisionOptions = PREASSESSMENT_SUMMARY_DECISION_OPTIONS
}) {
  const riskRows = preassessment.riskRows || [];

  return (
    <section className="detail-section detail-selection-criteria-section detail-preassessment-section" id="section-preassessment">
      <div className="detail-section-head detail-criteria-head detail-preassessment-head">
        <div>
          <h2>Предоценка</h2>
          <a className="detail-preassessment-base-link" href={riskBaseUrl} rel="noreferrer" target="_blank">
            База рисков
          </a>
        </div>
        <button className="section-link detail-add-criteria-button" onClick={onAdd} type="button">
          Добавить риск
        </button>
      </div>

      {riskRows.length ? (
        <div className="detail-selection-criteria-list detail-preassessment-list">
          {riskRows.map((row) => (
            <PreassessmentRiskRow
              criticalityOptions={criticalityOptions}
              key={row.rowId}
              onRemove={onRemove}
              onUpdate={onRowUpdate}
              row={row}
            />
          ))}
        </div>
      ) : (
        <div className="detail-criteria-empty detail-selection-criteria-empty">
          Строки предоценки пока не заполнены.
        </div>
      )}

      <div className="detail-selection-criteria-row detail-preassessment-summary">
        <div className="detail-field-card detail-preassessment-summary-row">
          <span className="detail-field-label">Решение по итогам предоценки</span>
          <CustomSelect
            onChange={(value) => onFieldChange("summaryDecision", value)}
            options={summaryDecisionOptions}
            value={preassessment.summaryDecision}
          />
        </div>
        <div className="detail-field-card detail-preassessment-summary-row">
          <span className="detail-field-label">Решение Александра</span>
          <CustomSelect
            onChange={(value) => onFieldChange("alexanderDecision", value)}
            options={summaryDecisionOptions}
            value={preassessment.alexanderDecision}
          />
        </div>
        <label className="detail-field-card detail-preassessment-summary-row">
          <span className="detail-field-label">Файл оценки</span>
          <input
            className="detail-control"
            onChange={(event) => onFieldChange("estimateFileUrl", event.target.value)}
            placeholder="https://..."
            type="url"
            value={preassessment.estimateFileUrl}
          />
        </label>
      </div>
    </section>
  );
}

function PreassessmentRiskRow({ criticalityOptions, onRemove, onUpdate, row }) {
  const isIncomplete = row.criticality === "unknown";

  return (
    <article className={`detail-selection-criteria-row detail-preassessment-row ${isIncomplete ? "is-incomplete" : ""}`.trim()}>
      <div className="detail-selection-criteria-row-top">
        <span className="detail-selection-criteria-order">#{row.order}</span>
        <button className="detail-remove-button" onClick={() => onRemove(row.rowId)} type="button">
          Удалить
        </button>
      </div>

      <div className="detail-selection-criteria-grid detail-preassessment-grid">
        <div className="detail-field-card detail-selection-criteria-controls detail-preassessment-controls">
          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Параметр</span>
            <input
              className="detail-control"
              onChange={(event) => onUpdate(row.rowId, "parameter", event.target.value)}
              placeholder="Например: Битрикс24"
              type="text"
              value={row.parameter}
            />
          </label>

          <div className="detail-selection-criteria-control">
            <span className="detail-field-label">Критичность</span>
            <CustomSelect
              onChange={(value) => onUpdate(row.rowId, "criticality", value)}
              options={criticalityOptions}
              value={row.criticality}
            />
          </div>
        </div>

        <div className="detail-field-card detail-selection-criteria-body detail-preassessment-body">
          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Комментарий менеджера</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdate(row.rowId, "managerComment", event.target.value)}
              placeholder="Комментарий менеджера или предложение по обходу риска"
              rows="3"
              value={row.managerComment}
            />
          </label>
        </div>
      </div>
    </article>
  );
}
