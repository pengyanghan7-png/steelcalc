import ExcelJS from "exceljs";
import { type Billing, type Tax } from "./calculate";
import { addCustomer, keepRecent, priceKey, type Catalog, type CustomerUse, type PriceUse } from "./history";
import { today } from "./projects";

const labels = {
  customer: ["客户名称", "客户"],
  spec: ["规格型号", "规格"],
  date: ["日期", "计算日期", "订单日期"],
  finish: ["表面处理", "镀锌"],
  price: ["单价", "价格"],
  billing: ["计价方式"],
  tax: ["是否含税", "含税状态"],
  notes: ["价格备注"],
};

function value(cell: ExcelJS.Cell) {
  const data = cell.value;
  if (data && typeof data === "object" && "result" in data) return data.result;
  if (data && typeof data === "object" && "richText" in data) return data.richText.map((item) => item.text).join("");
  if (data && typeof data === "object" && "text" in data) return data.text;
  return data;
}

function plain(data: ReturnType<typeof value>) {
  return typeof data === "string" || typeof data === "number" ? String(data).trim() : "";
}

function usageDate(data: ReturnType<typeof value>, date1904: boolean) {
  if (data instanceof Date) return Number.isFinite(data.getTime()) ? data.toISOString().slice(0, 10) : "";
  if (typeof data === "number" && data >= 1 && data <= 2_958_465) {
    return new Date((Math.floor(data) - (date1904 ? 24107 : 25569)) * 86_400_000).toISOString().slice(0, 10);
  }
  const match = /^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?(?:\s+00:00(?::00)?)?$/.exec(plain(data));
  if (!match) return "";
  const day = [match[1], match[2].padStart(2, "0"), match[3].padStart(2, "0")].join("-");
  const date = new Date(day + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : "";
}

function explicitUnit(text: string): Billing | "" {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s/g, "");
  if (/^(?:元\/)?(?:kg|公斤)$/.test(normalized)) return "kg";
  if (/^(?:元\/)?(?:件|个|块|只)$/.test(normalized)) return "piece";
  return "";
}

function taxOf(text: string): Tax {
  const excluded = /不含税|未含税|未税|无税|不带税/.test(text);
  const included = /含税|带税/.test(text.replace(/不含税|未含税|不带税/g, ""));
  if (excluded && !included) return "excluded";
  if (included && !excluded) return "included";
  return "";
}

export function parsePrice(raw: string, unit = "", tax = "", notes = "") {
  const text = raw.normalize("NFKC").trim();
  const declared = explicitUnit(unit);
  const combined = /^¥?\s*(\d+(?:\.\d+)?)\s*元?\s*\/\s*(kg|公斤|件|个|块|只)(?![a-z\d./])/i.exec(text);
  const numeric = /^\d+(?:\.\d+)?$/.test(text);
  if (!combined && !(declared && numeric)) return null;
  const billing = combined ? explicitUnit(combined[2]) : declared;
  if (!billing || (unit && declared !== billing)) return null;
  const price = Number(combined ? combined[1] : text);
  const tail = combined ? text.slice(combined[0].length).trim() : "";
  if (!Number.isFinite(price) || /(?:\d\s*元\b|\d\s*(?:元\s*)?\/\s*(?:kg|公斤|件|个|块|只|套|吨))/i.test(tail)) return null;
  return { billing, price, tax: taxOf([tax, tail, notes].join(" ")), notes: [tail, notes].filter(Boolean).join("；").slice(0, 200) };
}

function columnsOf(row: ExcelJS.Row) {
  const names = new Map<string, number>();
  row.eachCell((cell, column) => {
    const label = plain(value(cell)).replace(/\s/g, "");
    if (label) names.set(label, column);
  });
  return Object.fromEntries(Object.entries(labels).map(([key, choices]) => [
    key, choices.map((choice) => names.get(choice)).find(Boolean),
  ])) as Record<keyof typeof labels, number | undefined>;
}

export function extractCatalog(book: ExcelJS.Workbook, asOf = today()): Catalog {
  const customers = new Map<string, CustomerUse>();
  const prices = new Map<string, PriceUse[]>();
  const finishes = new Set<string>();
  let validSheets = 0;

  for (const sheet of book.worksheets) {
    let header: ReturnType<typeof columnsOf> | undefined;
    sheet.eachRow((row, index) => {
      if (!header) {
        if (index > 20) return;
        const columns = columnsOf(row);
        if (columns.customer && columns.spec) {
          header = columns;
          validSheets++;
        }
        return;
      }
      const read = (key: keyof typeof labels) => {
        const column = header?.[key];
        return column ? value(row.getCell(column)) : null;
      };
      const customer = plain(read("customer"));
      if (!customer || /^(?:客户名称|客户|同上|合计|小计|[-—〃]+)$/.test(customer) || !plain(read("spec"))) return;
      const date = usageDate(read("date"), !!book.properties.date1904);
      const future = date > asOf;
      addCustomer(customers, { name: customer, count: future ? 0 : 1, lastUsed: future ? "" : date });
      const finish = plain(read("finish"));
      if (finish && finish !== "镀锌" && finish !== "表面处理") finishes.add(finish);
      if (!finish || !date || future) return;
      const quote = parsePrice(plain(read("price")), plain(read("billing")), plain(read("tax")), plain(read("notes")));
      if (!quote) return;
      const key = priceKey(customer, finish, quote.billing);
      const entries = prices.get(key) ?? [];
      keepRecent(entries, { ...quote, customer, finish, date });
      prices.set(key, entries);
    });
  }
  if (!validSheets || !customers.size) throw new Error("未找到含「客户名称」和「规格型号」的生产订单记录。");
  return { customers: [...customers.values()], finishes: [...finishes], prices: [...prices.values()].flat() };
}

export async function importHistory(file: File) {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("无法读取此文件，请选择有效的 .xlsx 订单工作表。");
  }
  return extractCatalog(book);
}
