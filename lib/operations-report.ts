import ExcelJS from "exceljs";
import { operationsSummary, type Operations, type Scope } from "./operations";
import { today } from "./projects";

export function operationsWorkbook(state: Operations, scope: Scope) {
  const stats = operationsSummary(state, scope);
  const book = new ExcelJS.Workbook();
  const table = (name: string, headers: string[], widths: number[], rows: ExcelJS.CellValue[][]) => {
    const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = widths.map((width) => ({ width }));
    const heading = sheet.addRow(headers);
    heading.height = 26;
    heading.font = { color: { argb: "FFFFFFFF" }, bold: true };
    heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A5B" } };
    sheet.addRows(rows);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: headers.length } };
    return sheet;
  };
  const currency = (sheet: ExcelJS.Worksheet, columns: number[]) => {
    for (const column of columns) sheet.getColumn(column).numFmt = "#,##0.00";
  };
  const orders = new Map(stats.orders.map((order) => [order.id, order]));
  const billCodes = new Map(stats.selectedBills.map((bill) => [bill.id, bill.code]));
  const summary = table("统计汇总", ["指标", "数值"], [32, 34], [
    ["客户", scope.customer || "全部客户"],
    ["订单", scope.orderId ? orders.get(scope.orderId)?.code ?? "" : "全部订单"],
    ["记录日期", (scope.from || "不限") + " 至 " + (scope.to || "不限")],
    ["期间实发件数", stats.units], ["期间送货应收 (元)", stats.owed / 100],
    ["期间已确认到账 (元)", stats.actual / 100], ["期间待核实款 (元)", stats.pending / 100],
    ["期间尾差减免 (元)", stats.reduced / 100], ["当前待收 (元)", stats.outstanding / 100],
    ["期间待处理发货差异", stats.discrepancies], ["另有跨订单对账单（按客户查看）", stats.sharedBills],
  ]);
  for (let row = 6; row <= 10; row++) summary.getCell(row, 2).numFmt = "#,##0.00";
  table("订单", ["订单编号", "客户", "项目", "订单日期", "付款约定", "加工进度", "图纸编号", "图纸附件"],
    [19, 20, 27, 16, 15, 15, 21, 28], stats.orders.map((order) => [
      order.code, order.customer, order.title, order.date, order.terms, order.production, order.drawing,
      order.drawings.map(({ file }) => file.name).join("；"),
    ]));
  const delivery = table("送货明细", ["送货单号", "订单编号", "客户", "送货日期", "型号", "计划件数", "实发件数", "实称 (kg)", "计价", "单价",
    "金额 (元)", "核对状态", "情况说明", "处理结果", "车牌", "毛重 (kg)", "皮重 (kg)", "磅单"],
  [19, 19, 18, 15, 26, 13, 13, 15, 18, 15, 18, 17, 26, 26, 15, 15, 15, 25],
  stats.deliveries.flatMap((record) => {
    const order = orders.get(record.orderId)!;
    return record.lines.map((line, index) => {
      const part = order.lines.find(({ id }) => id === line.lineId)!;
      return [record.code, order.code, order.customer, record.date, part.number + " · " + part.spec, line.planned, line.actual,
        line.grams === null ? null : line.grams / 1000, part.pricing === "piece" ? "按件" : "按实重", Number(part.rate),
        line.cents / 100, record.confirmedAt ? "已确认" : "差异待处理", record.notes, record.resolution ?? "",
        index === 0 ? record.vehicle : "", index === 0 && record.gross !== null ? record.gross / 1000 : null,
        index === 0 && record.tare !== null ? record.tare / 1000 : null, index === 0 ? record.file?.name ?? "" : ""];
    });
  }));
  currency(delivery, [11]);
  const settlement = table("结算单", ["结算单号", "客户", "送货月份或日期", "付款截止日", "关联送货单", "原应收 (元)", "累计实收 (元)",
    "待核实 (元)", "尾差减免 (元)", "当前余额 (元)"], [20, 20, 22, 17, 46, 18, 18, 18, 18, 18],
  stats.selectedBills.map((bill) => [bill.code, bill.customer, bill.month || bill.date, bill.due,
    bill.deliveryIds.map((id) => state.deliveries.find((item) => item.id === id)?.code).join("；"),
    bill.cents / 100, bill.received / 100, bill.pending / 100, bill.reduced / 100, bill.balance / 100]));
  currency(settlement, [6, 7, 8, 9, 10]);
  const finance = table("到账及减免", ["结算单号", "登记类型", "日期", "渠道", "流水或原因", "金额 (元)", "状态", "凭证", "确认时间"],
    [21, 16, 16, 17, 34, 18, 17, 27, 31], [
      ...stats.receipts.map((receipt) => [billCodes.get(receipt.billId), "收款", receipt.date, receipt.channel, receipt.reference,
        receipt.cents / 100, receipt.confirmedAt ? "已确认" : "待核实", receipt.file?.name ?? "", receipt.confirmedAt ?? ""]),
      ...stats.reductions.map((item) => [billCodes.get(item.billId), "尾差减免", item.date, "", item.reason, item.cents / 100, "已登记"]),
    ]);
  currency(finance, [6]);
  return book;
}

export async function exportOperations(state: Operations, scope: Scope) {
  const bytes = await operationsWorkbook(state, scope).xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "SteelCalc_经营明细_" + today() + ".xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
