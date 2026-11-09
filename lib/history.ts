import { FINISHES, nonnegative, type Billing, type Project, type Tax } from "./calculate";

export type CustomerUse = { name: string; count: number; lastUsed: string };
export type PriceUse = { customer: string; finish: string; billing: Billing; price: number; date: string; tax: Tax; notes: string };
export type Catalog = { customers: CustomerUse[]; finishes: string[]; prices: PriceUse[] };
export type Usage = { customer: string; usedOn: string; prices: PriceUse[] };
export const EMPTY_CATALOG: Catalog = { customers: [], finishes: [], prices: [] };

export function nameKey(name: string) {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function priceKey(customer: string, finish: string, billing: string) {
  return JSON.stringify([nameKey(customer), finish.trim(), billing]);
}

export function recordUsage(project: Project, usedOn: string): Usage {
  const customer = project.customer.trim();
  const date = project.date || usedOn;
  const prices = project.parts.flatMap((part): PriceUse[] => {
    const price = nonnegative(part.price);
    const finish = part.finish.trim();
    if (!customer || !finish || !part.billing || price === null || date > usedOn) return [];
    return [{ customer, finish, billing: part.billing, price, date, tax: part.tax, notes: part.priceNotes.trim() }];
  });
  return { customer, usedOn, prices };
}

export function addCustomer(map: Map<string, CustomerUse>, customer: CustomerUse) {
  const key = nameKey(customer.name);
  if (!key) return;
  const previous = map.get(key);
  const latest = !previous || customer.lastUsed >= previous.lastUsed ? customer : previous;
  map.set(key, {
    name: latest.name,
    count: customer.count + (previous?.count ?? 0),
    lastUsed: latest.lastUsed,
  });
}

export function keepRecent(records: PriceUse[], record: PriceUse) {
  const duplicate = records.findIndex((entry) => entry.date === record.date && entry.price === record.price && entry.tax === record.tax);
  if (duplicate !== -1) records.splice(duplicate, 1);
  records.unshift(record);
  records.sort((a, b) => b.date.localeCompare(a.date));
  if (records.length > 3) records.pop();
}

export function optionsFor(catalog: Catalog, projects: Project[], addedCustomers: string[]) {
  const names = new Map<string, CustomerUse>();
  const finishes = new Set([...FINISHES, ...catalog.finishes]);
  const prices = new Map<string, PriceUse[]>();
  for (const item of catalog.customers) addCustomer(names, item);
  for (const name of addedCustomers) addCustomer(names, { name, count: 0, lastUsed: "" });
  const uses: PriceUse[] = [...catalog.prices];
  for (const project of projects) {
    const usage = project.usage;
    if (usage?.customer) addCustomer(names, { name: usage.customer, count: 1, lastUsed: usage.usedOn });
    for (const part of project.parts) if (part.finish.trim()) finishes.add(part.finish.trim());
    if (usage) uses.push(...usage.prices);
  }
  for (const record of uses) {
    const key = priceKey(record.customer, record.finish, record.billing);
    const entries = prices.get(key) ?? [];
    keepRecent(entries, record);
    prices.set(key, entries);
  }
  const customers = [...names.values()];
  const frequent = [...customers].sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed) || a.name.localeCompare(b.name, "zh-CN"));
  const recent = customers.filter((item) => item.lastUsed)
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed) || b.count - a.count).slice(0, 5);
  const ranked = [...new Set([...recent, ...frequent])];
  return { customers: ranked, finishes: [...finishes], prices };
}
