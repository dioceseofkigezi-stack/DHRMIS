import { useId, useMemo, useState, type KeyboardEvent } from "react";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  name?: string;
  value: string;
  options: SearchableOption[];
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export default function SearchableSelect({
  id,
  name,
  value,
  options,
  placeholder = "Search by name…",
  emptyLabel = "No matching records",
  loading = false,
  required = false,
  disabled = false,
  onChange,
}: SearchableSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  const matchingOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
      : options;
  }, [options, query]);
  const visibleOptions = matchingOptions.slice(0, 12);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function choose(option: SearchableOption) {
    onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, visibleOptions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    }
  }

  return (
    <div className="searchable-select">
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && visibleOptions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        required={required && !value}
        disabled={disabled || loading}
        value={open ? query : selected?.label ?? ""}
        placeholder={loading ? "Loading choices…" : value && !selected ? "Selected record is unavailable" : placeholder}
        onFocus={() => {
          setQuery("");
          setActiveIndex(0);
          setOpen(true);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setActiveIndex(0);
          setOpen(true);
          onChange("");
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
      />
      {value && !disabled && (
        <button
          type="button"
          className="searchable-select-clear"
          aria-label="Clear selection"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            close();
          }}
        >
          ×
        </button>
      )}
      {open && !disabled && !loading && (
        <div className="searchable-select-options" id={listId} role="listbox">
          {visibleOptions.length ? visibleOptions.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              id={`${listId}-option-${index}`}
              className={index === activeIndex ? "searchable-select-option is-active" : "searchable-select-option"}
              key={option.value}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          )) : <div className="searchable-select-empty" role="status">{emptyLabel}</div>}
          {matchingOptions.length > visibleOptions.length && <div className="searchable-select-hint">Keep typing to narrow the choices.</div>}
        </div>
      )}
    </div>
  );
}
