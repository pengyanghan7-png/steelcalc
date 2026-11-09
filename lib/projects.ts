import type { Part, Project } from "./calculate";
import { EMPTY_CATALOG, type Catalog } from "./history";

export const STORAGE_KEY = "steelcalc.projects.v1";
export type Drafts = { projects: Project[]; active: string; catalog: Catalog; addedCustomers: string[] };

export const partDefaults = {
  kind: "plate", spec: "", manualHoles: "", manualWeight: "", quantity: "1",
  finish: "", billing: "", price: "", tax: "", priceNotes: "",
} satisfies Pick<Part, "kind" | "spec" | "manualHoles" | "manualWeight" | "quantity" | "finish" | "billing" | "price" | "tax" | "priceNotes">;

export function id() {
  return globalThis.crypto.randomUUID?.() ?? Array.from(
    globalThis.crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)
  ).join("-");
}

export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format();
}

export function newPart(existing: Part[]): Part {
  let index = 1;
  while (existing.some((part) => part.number.trim() === partNumber(index))) index++;
  return { ...partDefaults, id: id(), number: partNumber(index), drawing: "", length: "", width: "", thickness: "", notes: "", circles: [], rectangles: [] };
}

function partNumber(index: number) {
  return "P-" + String(index).padStart(3, "0");
}

export function newProject(): Project {
  return { id: id(), name: "", customer: "", drawing: "", date: today(), notes: "", parts: [newPart([])] };
}

export function newDrafts(): Drafts {
  const project = newProject();
  return { projects: [project], active: project.id, catalog: EMPTY_CATALOG, addedCustomers: [] };
}

export function readDrafts(): Drafts | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw) as Drafts;
  if (!Array.isArray(data?.projects) || !data.projects.some((project) => project.id === data.active)) {
    throw new Error("无法读取本地项目");
  }
  return {
    ...data,
    catalog: data.catalog ?? EMPTY_CATALOG,
    addedCustomers: data.addedCustomers ?? data.projects.map((project) => project.customer.trim()).filter(Boolean),
    projects: data.projects.map((project) => ({
      ...project,
      parts: project.parts.map((part) => ({ ...partDefaults, ...part })),
    })),
  };
}
