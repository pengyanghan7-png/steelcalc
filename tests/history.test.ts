import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { calculate } from "../lib/calculate";
import { optionsFor, priceKey, recordUsage } from "../lib/history";
import { extractCatalog, parsePrice } from "../lib/import-history";
import { newProject, partDefaults, readDrafts, STORAGE_KEY } from "../lib/projects";

test("历史价格只读明确计价单位，不猜测含税状态", () => {
  assert.deepEqual(parsePrice("６.３元／ＫＧ（不含税）"), { price: 6.3, billing: "kg", tax: "excluded", notes: "（不含税）".normalize("NFKC") });
  assert.deepEqual(parsePrice("7元/个"), { price: 7, billing: "piece", tax: "", notes: "" });
  assert.equal(parsePrice("8"), null);
  assert.equal(parsePrice("8元/套"), null);
  assert.equal(parsePrice("8元/个 或 7元/kg"), null);
  assert.equal(parsePrice("8元/个", "元/kg"), null);
  assert.equal(parsePrice("8", "元/kg", "含税")?.tax, "included");
});

test("多工作表提取客户及相同组合最近三价，保留细分表面处理", () => {
  const book = new ExcelJS.Workbook();
  const rows = [
    ["2025/01/01", "示例甲", "钢板", "热镀70", "6元/KG"],
    ["2025/01/03", "示例甲", "钢板", "热镀70", "7元/KG"],
    ["2025/01/02", "示例甲", "钢板", "热镀70", "8元/KG"],
    ["2025/01/04", "示例甲", "钢板", "热镀70", "9元/KG"],
    ["2025/01/05", "示例甲", "钢板", "热镀85", "10元/KG"],
    ["2025/01/06", "示例甲", "钢板", "热镀70", "11元/个"],
    ["2025/01/07", "示例甲", "钢板", "热镀70", "12"],
    ["2099/01/08", "示例甲", "钢板", "热镀70", "13元/KG"],
    ["2025/02/30", "示例甲", "钢板", "热镀70", "14元/KG"],
  ];
  for (const [index, entries] of [rows.slice(0, 5), rows.slice(5)].entries()) {
    const sheet = book.addWorksheet("Sheet" + (index + 1));
    sheet.addRows([["生产订单表"], ["日期", "客户名称", "规格型号", "镀锌", "单价"], ...entries]);
  }
  const catalog = extractCatalog(book, "2026-11-09");
  assert.deepEqual(catalog.finishes, ["热镀70", "热镀85"]);
  const project = newProject();
  project.customer = "示例甲";
  project.date = "2026-10-01";
  Object.assign(project.parts[0], { finish: "热镀70", billing: "kg", price: "15" });
  project.usage = recordUsage(project, "2026-11-09");
  const history = optionsFor(catalog, [project], ["手动新增"]);
  assert.deepEqual(history.prices.get(priceKey("示例甲", "热镀70", "kg"))?.map(({ price }) => price), [15, 9, 7]);
  assert.equal(history.prices.get(priceKey("示例甲", "热镀85", "kg"))?.[0].price, 10);
  assert.equal(history.prices.get(priceKey("示例甲", "热镀70", "piece"))?.[0].price, 11);
  assert.equal(history.prices.get(priceKey("示例甲", "热镀", "kg")), undefined);
  assert.equal(history.customers[0].count, 9);
  assert.equal(history.customers[1].name, "手动新增");
});

test("保留 V1.0 本地项目并默认一件标准板", () => {
  const project = newProject();
  project.customer = "旧版客户";
  const part = { ...project.parts[0], length: "1000", width: "500", thickness: "10" };
  const original = { ...project, parts: [Object.fromEntries(Object.entries(part).filter(([key]) => !(key in partDefaults)))] };
  const previous = globalThis.localStorage;
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify({ projects: [original], active: project.id }) : null };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    const migrated = readDrafts();
    assert.equal(migrated?.addedCustomers[0], "旧版客户");
    const result = migrated && calculate(migrated.projects[0].parts[0]).result;
    assert.equal(result?.quantity, 1);
    assert.equal(result?.totalWeight, 39.25);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  }
});
