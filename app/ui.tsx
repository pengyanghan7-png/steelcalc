import { useId, useState, type ReactNode } from "react";

const paths = {
  plate: "M2 10 12 4l10 6-10 6L2 10Zm0 0v4l10 6 10-6v-4M12 16v4",
  folder: "M3 6h6l2 2h10v11H3z",
  plus: "M12 5v14M5 12h14",
  right: "M4 12h15m-6-6 6 6-6 6",
  left: "M20 12H5m6-6-6 6 6 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4",
  upload: "M12 15V3m-5 5 5-5 5 5M4 16v4h16v-4",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  trash: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5",
  check: "m5 12 4 4 10-10",
  circle: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  square: "M4 4h16v16H4z",
  edit: "m4 15 11-11 5 5L9 20H4v-5Zm9-9 5 5",
  close: "m6 6 12 12M18 6 6 18",
};

export function Icon({ name, size = 17 }: { name: keyof typeof paths; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

type FieldProps = {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
  unit?: string; error?: string; type?: "number" | "date"; integer?: boolean; wide?: boolean;
};

export function Field({ label, value, onChange, placeholder, unit, error, type, integer, wide }: FieldProps) {
  return <label className={wide ? "field wide" : "field"}>
    <span>{label}</span>
    <span className="input-wrap">
      <input value={value} placeholder={placeholder} type={type ?? "text"} aria-invalid={!!error}
        aria-label={label + (unit ? "（" + unit + "）" : "")}
        step={type === "number" ? integer ? "1" : "any" : undefined}
        inputMode={type === "number" ? integer ? "numeric" : "decimal" : undefined}
        onChange={(event) => onChange(event.target.value)} />
      {unit && <span className="unit" aria-hidden="true">{unit}</span>}
    </span>
    {error && <small className="error-text">{error}</small>}
  </label>;
}

export function SelectField<T extends string>({ label, value, options, onChange, error }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; error?: string;
}) {
  return <label className="field">
    <span>{label}</span>
    <select value={value} aria-invalid={!!error} onChange={(event) => onChange(event.target.value as T)}>
      {options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}
    </select>
    {error && <small className="error-text">{error}</small>}
  </label>;
}

type Suggestion = { name: string; detail?: string };

export function SearchField({ label, value, options, onChange, onAdd, placeholder }: {
  label: string; value: string; options: Suggestion[]; onChange: (value: string) => void;
  onAdd?: (value: string) => void; placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const key = (text: string) => text.trim().normalize("NFKC").toLowerCase();
  const visible = options.filter((option) => key(option.name).includes(key(query))).slice(0, 10);
  const candidate = value.trim();
  const canAdd = !!onAdd && !!candidate && !options.some((option) => key(option.name) === key(candidate));
  const choices = canAdd ? [...visible, { name: candidate, detail: "新增客户" }] : visible;
  const showing = open && choices.length > 0;

  function choose(index: number) {
    const item = choices[index];
    if (!item) return;
    if (canAdd && index === visible.length) onAdd?.(item.name);
    else onChange(item.name);
    setOpen(false);
    setHighlight(-1);
  }

  return <div className="field search-field">
    <label htmlFor={listId + "-input"}>{label}</label>
    <input id={listId + "-input"} type="text" role="combobox" value={value} placeholder={placeholder}
      autoComplete="off" aria-autocomplete="list" aria-expanded={showing} aria-controls={listId}
      aria-activedescendant={showing && highlight >= 0 ? listId + "-" + highlight : undefined}
      onFocus={() => { setOpen(true); setQuery(""); setHighlight(-1); }}
      onClick={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={(event) => { onChange(event.target.value); setQuery(event.target.value); setOpen(true); setHighlight(-1); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") setOpen(false);
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length) {
          event.preventDefault();
          setOpen(true);
          const step = event.key === "ArrowDown" ? 1 : -1;
          const position = !open ? -1 : highlight;
          setHighlight(position < 0 && step < 0 ? choices.length - 1 : (position + step + choices.length) % choices.length);
        }
        if (event.key === "Enter" && showing) {
          event.preventDefault();
          choose(highlight < 0 ? canAdd ? visible.length : 0 : highlight);
        }
      }} />
    <ul className="suggestions" id={listId} role="listbox" aria-label={label + "建议"} hidden={!showing}>
      {choices.map((item, index) => <li key={item.name} id={listId + "-" + index} role="option"
        aria-selected={index === highlight} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
        <span>{canAdd && index === visible.length && <Icon name="plus" size={14} />} {item.name}</span>
        {item.detail && <small>{item.detail}</small>}
      </li>)}
    </ul>
  </div>;
}

export function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="card">
    <div className="card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
    {children}
  </section>;
}

export function PlateDiagram() {
  return <svg className="diagram" viewBox="0 0 302 174" role="img" aria-label="矩形钢板长、宽、厚及两种贯穿孔的示意图">
    <defs>
      <pattern id="grid" width="15" height="15" patternUnits="userSpaceOnUse">
        <path d="M15 0H0V15" fill="none" stroke="#c7d9e8" strokeWidth=".6" />
      </pattern>
    </defs>
    <rect width="302" height="174" fill="url(#grid)" />
    <path d="m48 91 68-46 134 39v13l-69 47-133-40Z" fill="#9cbad0" stroke="#274d6d" strokeWidth="1.4" />
    <path d="m48 91 68-46 134 39-69 47Z" fill="#d8e8f3" stroke="#274d6d" strokeWidth="1.4" />
    <path d="M181 131v13m-53-54 20-13 37 11-20 14Z" fill="#edf5fb" stroke="#274d6d" strokeWidth="1.4" />
    <ellipse cx="105" cy="82" rx="13" ry="7" fill="#edf5fb" stroke="#274d6d" strokeWidth="1.4" />
    <ellipse cx="195" cy="108" rx="12" ry="6" fill="#edf5fb" stroke="#274d6d" strokeWidth="1.4" />
    <path d="m44 79 66-45m-69 41 6 8m60-53 6 8m8-4 133 38m-132-43-3 10m137 28-3 10m12 7v13m-4-13h8m-8 13h8" fill="none" stroke="#52799a" />
    <g fill="#274d6d" fontFamily="sans-serif" fontSize="12" fontWeight="600">
      <text x="62" y="49">宽</text><text x="182" y="44">长</text><text x="274" y="94">厚</text>
    </g>
  </svg>;
}
