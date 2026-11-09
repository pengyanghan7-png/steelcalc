import { useState, type FormEvent, type ReactNode } from "react";
import { fixed, type Operations } from "../lib/operations";
import { Icon } from "./ui";

export type Mutate = (update: (state: Operations) => Operations, message: string) => Promise<boolean>;
export type Submit = (data: FormData) => Promise<boolean> | boolean;
export const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

export function numeric(data: FormData, name: string, digits: number, label: string, optional = false) {
  const input = value(data, name);
  if (!input && optional) return null;
  const result = fixed(input, digits);
  if (result === null) throw new Error("请填写有效的" + label + (digits ? "，最多 " + digits + " 位小数。" : "。"));
  return result;
}

export function attachment(data: FormData, name: string) {
  const file = data.get(name);
  if (!(file instanceof File) || !file.size) return undefined;
  if (file.size > 12 * 1024 * 1024) throw new Error("单个附件须小于或等于 12 MB。");
  return file;
}

export function Form({ children, onSubmit, busy }: { children: ReactNode; onSubmit: Submit; busy?: boolean }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    try {
      if (await onSubmit(new FormData(form))) form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "处理失败，请重试。");
    }
  }
  return <form onSubmit={submit}>
    <fieldset className="ops-fieldset" disabled={busy}>{children}</fieldset>
    {error && <p role="alert" className="alert ops-inline-alert">{error}</p>}
  </form>;
}

export function Input({ label, name, type = "text", initial, placeholder, required, step, min, accept }: {
  label: string; name: string; type?: string; initial?: string; placeholder?: string; required?: boolean;
  step?: string; min?: string; accept?: string;
}) {
  return <label className="field ops-field"><span>{label}</span>
    <input name={name} type={type} defaultValue={initial} placeholder={placeholder} required={required}
      step={step} min={min} accept={accept} />
  </label>;
}

export function Dropdown({ label, name, options, initial, required }: {
  label: string; name: string; options: readonly (readonly [string, string])[]; initial?: string; required?: boolean;
}) {
  return <label className="field"><span>{label}</span>
    <select name={name} defaultValue={initial} required={required}>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select>
  </label>;
}

export function Picker({ label, items, selected, choose, empty = "请选择" }: {
  label: string; items: { id: string; label: string }[]; selected: string; choose: (id: string) => void; empty?: string;
}) {
  const [query, setQuery] = useState("");
  const matchesQuery = (label: string, text: string) => label.toLowerCase().includes(text.trim().toLowerCase());
  const matches = items.filter((item) => item.id === selected || matchesQuery(item.label, query));
  return <div className="ops-picker">
    <label className="field ops-field"><span>搜索{label}</span>
      <input type="search" value={query} placeholder="输入编号、客户或项目"
        onChange={(event) => {
          const search = event.target.value;
          setQuery(search);
          const current = items.find(({ id }) => id === selected);
          if (current && !matchesQuery(current.label, search)) choose("");
        }} /></label>
    <label className="field"><span>{label}</span>
      <select value={matches.some(({ id }) => id === selected) ? selected : ""} onChange={(event) => choose(event.target.value)}>
        <option value="">{empty}</option>
        {matches.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
      </select>
    </label>
  </div>;
}

export function Proof({ file }: { file?: File }) {
  if (!file) return <span className="muted">—</span>;
  return <button className="button secondary compact" type="button" onClick={() => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }}><Icon name="download" size={14} /> {file.name}</button>;
}

export function GridTable({ headers, rows, empty = "暂无记录。" }: { headers: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="empty-line">{empty}</p>;
  return <div className="table-wrap ops-table" tabIndex={0} aria-label={headers.join("、")}>
    <table><thead><tr>{headers.map((label, index) => <th scope="col" key={index}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
  </div>;
}
