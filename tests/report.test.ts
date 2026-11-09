import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { projectTotals, rowsFor } from "../lib/calculate";
import { newProject } from "../lib/projects";
import { report } from "../lib/report";

test("生产订单与计算明细按列保存同一套完整精度结果", async () => {
  const project = newProject();
  project.name = "机架订单";
  project.drawing = "DWG-001";
  project.customer = "测试客户";
  project.date = "2026-10-22";
  project.parts[0] = {
    ...project.parts[0], length: "250.5", width: "180", thickness: "5", quantity: "10",
    finish: "热镀70", billing: "kg", price: "6.71825", tax: "included",
    circles: [{ id: "c", diameter: "25", quantity: "4" }],
    rectangles: [{ id: "r", length: "15", width: "12", quantity: "2" }],
  };
  project.parts.push({ ...project.parts[0], id: "b", number: "P-002", kind: "special", weightMode: "manual", spec: "样品焊接件",
    quantity: "4", manualWeight: "0.1234", manualHoles: "侧面开孔" });
  const rows = rowsFor(project);
  const totals = projectTotals(rows);
  assert.ok(totals);
  const bytes = await report(project).xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.deepEqual(restored.worksheets.map(({ name }) => name), ["生产订单表", "计算明细"]);
  const orders = restored.getWorksheet("生产订单表")!;
  const detail = restored.getWorksheet("计算明细")!;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((index) => orders.getRow(2).getCell(index).value),
    ["日期", "客户名称", "规格型号", "开孔摘要", "订单数量", "表面处理"]);
  assert.equal((orders.getCell("A3").value as Date).toISOString(), "2026-10-22T00:00:00.000Z");
  assert.equal(orders.getCell("B3").value, "测试客户");
  assert.equal(orders.getCell("F3").value, "热镀70");
  assert.equal(orders.getCell("K3").value, 6.71825);
  assert.equal(orders.getCell("I3").value, rows[0].result?.totalWeight);
  assert.equal(orders.getCell("I5").value, totals.weight);
  assert.equal(orders.getCell("O4").value, "人工填写");
  assert.equal(orders.getCell("G4").value, null);
  assert.equal(detail.getCell("B3").value, "DWG-001");
  assert.equal(detail.getCell("J3").value, "Ø25 × 4");
  assert.equal(detail.getCell("K3").value, "15 × 12 × 2");
  assert.equal(detail.getCell("N3").value, rows[0].result?.circleVolume);
  assert.equal(detail.getCell("O3").value, rows[0].result?.rectangleVolume);
  assert.equal(detail.getCell("Q3").numFmt, "#,##0.00");
  assert.equal(detail.getCell("S3").numFmt, "#,##0.000");
  assert.equal(detail.getCell("S4").value, 0.1234);
  assert.equal(detail.getCell("T5").value, totals.weight);
});

test("未填尺寸的项目无法导出", () => {
  assert.throws(() => report(newProject()), /修正零件数据/);
});

test("组成板只在计算明细分列，生产订单仍是一行成品", async () => {
  const project = newProject();
  project.parts[0] = { ...project.parts[0], kind: "special", quantity: "10", boards: [
    { id: "side", length: "100", width: "100", thickness: "10", copies: "2", circles: [], rectangles: [] },
    { id: "bottom", length: "200", width: "100", thickness: "10", copies: "1",
      circles: [{ id: "c", diameter: "20", quantity: "1" }], rectangles: [] },
  ] };
  const bytes = await report(project).xlsx.writeBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const [orders, detail] = workbook.worksheets;
  assert.equal(orders.getCell("E3").value, 10);
  assert.equal(orders.getCell("O3").value, "组成板汇总");
  assert.equal(orders.getCell("A4").value, "合计");
  assert.equal(orders.getCell("I3").value, detail.getCell("T3").value);
  assert.equal(detail.getCell("A8").value, "P-001");
  assert.equal(detail.getCell("F8").value, 2);
  assert.equal(detail.getCell("G8").value, 100);
  assert.ok(Math.abs(Number(detail.getCell("T8").value) - 1.57) < 1e-12);
  assert.equal(detail.getCell("J9").value, "Ø20 × 1");
});
