import ExcelJS from "exceljs";
import { PART_TYPES, projectTotals, rowsFor, type Project } from "./calculate";
import { CIRCLE_LABEL, ORDER_HEADERS, RECTANGLE_LABEL, holeGroups, orderCells } from "./order";
import { today } from "./projects";

const DETAIL_HEADERS = ["零件编号", "图纸编号", "零件类型", "规格型号", "重量来源", "订单数量",
  "长 (mm)", "宽 (mm)", "厚 (mm)", CIRCLE_LABEL, RECTANGLE_LABEL, "人工开孔说明",
  "单件毛体积 (mm³)", "圆孔扣除 (mm³)", "方孔扣除 (mm³)", "合计扣除 (mm³)", "单件净体积 (mm³)",
  "单件毛重 (kg)", "单件净重 (kg)", "理论总净重 (kg)"];

function sheetFor(book: ExcelJS.Workbook, title: string, headers: string[], widths: number[]) {
  const sheet = book.addWorksheet(title, { views: [{ state: "frozen", ySplit: 2 }] });
  sheet.columns = widths.map((width) => ({ width }));
  sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, headers.length);
  darkRow(sheet.getRow(1));
  darkRow(sheet.addRow(headers));
  return sheet;
}

function darkRow(row: ExcelJS.Row) {
  row.height = 25;
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A5B" } };
  row.alignment = { vertical: "middle" };
}

function tableRow(sheet: ExcelJS.Worksheet, values: ExcelJS.CellValue[]) {
  const row = sheet.addRow(values);
  row.alignment = { vertical: "top", wrapText: true };
  if (row.number % 2 === 1) {
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5FA" } };
  }
}

function format(sheet: ExcelJS.Worksheet, columns: number[], numberFormat: string) {
  for (const column of columns) sheet.getColumn(column).numFmt = numberFormat;
}

export function report(project: Project) {
  const rows = rowsFor(project);
  const total = projectTotals(rows);
  if (!total) throw new Error("请先修正零件数据，再导出 Excel。");
  const book = new ExcelJS.Workbook();
  const orders = sheetFor(book, "生产订单表", ORDER_HEADERS, [14, 19, 25, 39, 13, 15, 24, 19, 22, 14, 15, 26, 13, 28, 14]);
  const detail = sheetFor(book, "计算明细", DETAIL_HEADERS, [14, 18, 20, 26, 14, 13, 13, 13, 13, 34, 36, 26, 24, 24, 24, 24, 24, 20, 20, 22]);

  for (const { part, result } of rows) {
    if (!result) continue;
    const [date, ...cells] = orderCells(project, part, result);
    tableRow(orders, [new Date(String(date) + "T00:00:00Z"), ...cells]);
    const groups = holeGroups(part);
    const standard = result.method === "自动计算";
    tableRow(detail, [part.number, part.drawing || project.drawing, PART_TYPES[part.kind], cells[1], result.method,
      result.quantity, result.length, result.width, result.thickness, standard ? groups.circles : "",
      standard ? groups.rectangles : "", result.method === "人工填写" ? part.manualHoles : "",
      result.gross, result.circleVolume, result.rectangleVolume, result.removed, result.net,
      result.grossWeight, result.weight, result.totalWeight]);
  }
  orders.autoFilter = { from: "A2", to: "O" + (rows.length + 2) };
  detail.autoFilter = { from: "A2", to: "T" + (rows.length + 2) };
  const orderTotal = orders.addRow(["合计", "", "", "", total.quantity, "", "", "", total.weight]);
  const detailTotal = detail.addRow(["合计"]);
  detailTotal.getCell(6).value = total.quantity;
  detailTotal.getCell(20).value = total.weight;
  darkRow(orderTotal);
  darkRow(detailTotal);
  if (project.name) detail.addRow(["项目 / 订单", project.name]);
  if (project.notes) detail.addRow(["项目备注", project.notes]);
  const assemblies = rows.filter(({ result }) => result?.boards?.length);
  if (assemblies.length) {
    detail.addRow([]);
    const title = detail.addRow(["组成板明细 · 每行按所属零件编号关联"]);
    detail.mergeCells(title.number, 1, title.number, DETAIL_HEADERS.length);
    darkRow(title);
    darkRow(detail.addRow([
      "所属零件编号", "图纸编号", "组成板", "", "", "每件用量 (块)", "长 (mm)", "宽 (mm)", "厚 (mm)",
      CIRCLE_LABEL, RECTANGLE_LABEL, "", "每块毛体积 (mm³)", "圆孔扣除 (mm³)", "方孔扣除 (mm³)",
      "每块扣除 (mm³)", "每块净体积 (mm³)", "每块毛重 (kg)", "每块净重 (kg)", "每件贡献净重 (kg)",
    ]));
    for (const { part, result } of assemblies) {
      result?.boards?.forEach(({ copies, geometry }, index) => {
        const groups = holeGroups(part.boards[index]);
        tableRow(detail, [part.number, part.drawing || project.drawing, "板 " + (index + 1), "", "", copies,
          geometry.length, geometry.width, geometry.thickness, groups.circles, groups.rectangles, "",
          geometry.gross, geometry.circleVolume, geometry.rectangleVolume, geometry.removed, geometry.net,
          geometry.grossWeight, geometry.weight, geometry.weight * copies]);
      });
    }
  }
  format(orders, [1], "yyyy-mm-dd");
  format(orders, [7], "#,##0.00");
  format(orders, [8, 9], "#,##0.000");
  format(orders, [11], "#,##0.00####");
  format(detail, [13, 14, 15, 16, 17], "#,##0.00");
  format(detail, [18, 19, 20], "#,##0.000");
  return book;
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
