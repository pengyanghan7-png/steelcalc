import ExcelJS from "exceljs";
import { DENSITY, HEADERS, projectTotals, rowsFor, type Project } from "./calculate";
import { today } from "./projects";

export function report(project: Project) {
  const rows = rowsFor(project);
  const total = projectTotals(rows);
  if (!total) throw new Error("请先修正零件数据，再导出 Excel。");
  const book = new ExcelJS.Workbook();
  const summary = book.addWorksheet("项目汇总", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 25 }, { width: 45 }];
  summary.addRows([
    ["SteelCalc 钢板计算汇总"],
    ["项目 / 订单", project.name],
    ["客户名称", project.customer],
    ["图纸编号", project.drawing],
    ["计算日期", project.date || today()],
    ["项目备注", project.notes],
    ["钢材密度 (g/cm³)", DENSITY],
    ["零件数量", rows.length],
    ["原板体积 (mm³)", total.gross],
    ["扣孔体积 (mm³)", total.removed],
    ["净体积 (mm³)", total.net],
    ["总重量 (kg)", total.weight],
  ]);
  summary.mergeCells("A1:B1");
  darkRow(summary.getRow(1));
  for (let index = 2; index <= 12; index++) {
    const cell = summary.getCell(index, 1);
    cell.font = { bold: true, color: { argb: "FF173A5B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1F7" } };
  }
  for (let index = 9; index <= 12; index++) {
    summary.getCell(index, 2).numFmt = index === 12 ? "#,##0.000" : "#,##0.00";
  }

  const detail = book.addWorksheet("零件明细", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [...HEADERS, "圆孔分组 (mm × 个)", "方孔分组 (mm × mm × 个)"].map((header, index) => ({
    header,
    width: [8, 16, 19, 13, 13, 13, 13, 13, 22, 22, 22, 18, 29, 32, 36][index],
  }));
  darkRow(detail.getRow(1));
  rows.forEach(({ part, result }, index) => {
    if (!result) return;
    const row = detail.addRow([index + 1, part.number, part.drawing || project.drawing,
      result.length, result.width, result.thickness, result.circleCount, result.rectangleCount,
      result.gross, result.removed, result.net, result.weight, part.notes,
      part.circles.map((hole) => "Ø" + hole.diameter + " × " + hole.quantity).join("；"),
      part.rectangles.map((hole) => hole.length + " × " + hole.width + " × " + hole.quantity).join("；")]);
    if (index % 2 === 0) row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5FA" } };
    });
  });
  detail.autoFilter = { from: "A1", to: "O" + (rows.length + 1) };
  const sum = detail.addRow(["合计", "", "", "", "", "",
    rows.reduce((count, row) => count + (row.result?.circleCount ?? 0), 0),
    rows.reduce((count, row) => count + (row.result?.rectangleCount ?? 0), 0),
    total.gross, total.removed, total.net, total.weight]);
  darkRow(sum);
  for (const index of [9, 10, 11, 12]) detail.getColumn(index).numFmt = index === 12 ? "#,##0.000" : "#,##0.00";
  return book;
}

function darkRow(row: ExcelJS.Row) {
  row.height = 24;
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A5B" } };
  row.alignment = { vertical: "middle" };
}

export async function downloadReport(project: Project) {
  const bytes = await report(project).xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const name = project.name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "未命名项目";
  link.download = "SteelCalc_" + name + "_" + (project.date || today()) + ".xlsx";
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
