import { useEffect, useMemo, useRef, useState } from "react";

export function CustomSelect({ onChange, options, placeholder = "", value }) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = useMemo(() => {
    return (options || []).map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  }, [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`detail-select ${isOpen ? "open" : ""}`.trim()} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        className="detail-select-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className={`detail-select-value ${selectedOption ? "" : "is-placeholder"}`.trim()}>
          {selectedOption ? <SelectOptionLabel option={selectedOption} /> : placeholder}
        </span>
        <span aria-hidden="true" className="detail-select-caret"></span>
      </button>

      {isOpen ? (
        <div className="detail-select-menu" role="listbox">
          {normalizedOptions.map((option) => (
            <button
              className={`detail-select-option ${option.value === value ? "is-active" : ""}`.trim()}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              type="button"
            >
              <SelectOptionLabel option={option} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SelectOptionLabel({ option }) {
  if (option?.tone) {
    return (
      <span className={`detail-select-pill tone-${option.tone}`}>
        {option.label}
      </span>
    );
  }

  return option?.label || "";
}
