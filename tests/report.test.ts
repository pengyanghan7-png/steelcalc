import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { projectTotals, rowsFor } from "../lib/calculate";
import { newProject } from "../lib/projects";
import { report } from "../lib/report";

test("导出真实的 XLSX 文件并读回两个中文工作表", async () => {
  const project = newProject();
  project.name = "机架订单";
  project.drawing = "DWG-001";
  project.parts[0] = {
    ...project.parts[0], length: "250.5", width: "180", thickness: "5",
    circles: [{ id: "c", diameter: "25", quantity: "4" }],
    rectangles: [{ id: "r", length: "15", width: "12", quantity: "2" }],
  };
  project.parts.push({ ...project.parts[0], id: "b", number: "P-002", length: "180" });
  const rows = rowsFor(project);
  const totals = projectTotals(rows);
  assert.ok(totals);
  const bytes = await report(project).xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.deepEqual(restored.worksheets.map(({ name }) => name), ["项目汇总", "零件明细"]);
  const summary = restored.getWorksheet("项目汇总");
  const detail = restored.getWorksheet("零件明细");
  assert.equal(summary?.getCell("B2").value, "机架订单");
  assert.equal(summary?.getCell("B12").value, totals.weight);
  assert.equal(detail?.getCell("C2").value, "DWG-001");
  assert.equal(detail?.getCell("L2").value, rows[0].result?.weight);
  assert.equal(detail?.getCell("L2").numFmt, "#,##0.000");
  assert.equal(detail?.getCell("K2").numFmt, "#,##0.00");
  assert.equal(detail?.getCell("L4").value, totals.weight);
});

test("未填尺寸的项目无法导出", () => {
  assert.throws(() => report(newProject()), /修正零件数据/);
});
