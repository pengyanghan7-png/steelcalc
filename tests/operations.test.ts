import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { acceptOrder, addDelivery, addReceipt, addReduction, addStatement, availableMonthly, bills, confirmReceipt,
  deliveredCounts, EMPTY_OPERATIONS, fixed, makeOrder, operationsSummary, reviewDelivery, setProduction,
  type Operations, type WorkOrder } from "../lib/operations";
import { operationsWorkbook } from "../lib/operations-report";
import { newProject } from "../lib/projects";

const day = "2026-10-18";
const timestamp = day + "T12:00:00Z";
const scope = { customer: "", orderId: "", from: "", to: "" };
const source: WorkOrder = {
  id: "order-a", code: "DD-001", customer: "验收客户", title: "订单 A", date: day, drawing: "图号 A", drawings: [],
  production: "待加工", terms: "月结", notes: "",
  lines: [
    { id: "p", number: "P-001", spec: "连接板", ordered: 100, weight: 1, pricing: "piece", rate: "2.5" },
    { id: "w", number: "P-002", spec: "底板", ordered: 25, weight: 50, pricing: "kg", rate: "5.26" },
  ],
};
const delivery = { orderId: source.id, date: day, vehicle: "", gross: null, tare: null, notes: "" };
const firstLines = [{ lineId: "p", planned: 6, actual: 6, grams: null }, { lineId: "w", planned: 1, actual: 1, grams: 12_345 }];

function withFirst() {
  return addDelivery(acceptOrder(EMPTY_OPERATIONS, source), { ...delivery, lines: firstLines }, timestamp);
}

test("旧项目可交接到新工作台并保留单件理论重量", () => {
  const project = newProject();
  project.name = "旧订单";
  project.customer = "验收客户";
  Object.assign(project.parts[0], { length: "100", width: "100", thickness: "10", quantity: "12", price: "2.50", billing: "piece" });
  const handoff = makeOrder(project)!;
  assert.equal(handoff.lines[0].ordered, 12);
  assert.ok(Math.abs(handoff.lines[0].weight - 0.785) < 1e-12);
  assert.equal(handoff.lines[0].rate, "2.50");
  assert.throws(() => acceptOrder(acceptOrder(EMPTY_OPERATIONS, handoff), handoff), /已交接/);
  assert.equal(project.parts[0].quantity, "12");
});

test("按件、按实称分别计算到分，正常分批不产生差异", () => {
  const state = withFirst();
  const batch = state.deliveries[0];
  assert.equal(batch.lines[0].cents, 1500);
  assert.equal(batch.lines[1].cents, 6493);
  assert.equal(batch.variance, false);
  assert.equal(deliveredCounts(state, source.id).get("p"), 6);
  assert.equal(availableMonthly(state).length, 1);
  assert.throws(() => addDelivery(state, { ...delivery, lines: [{ ...firstLines[1], grams: null }] }, timestamp), /实称重量/);
  assert.equal(fixed("10.005", 2), null);
});

test("多发和少发须记录差异，处理后进入财务结算", () => {
  const state = withFirst();
  const second = { ...delivery, lines: [{ lineId: "p", planned: 5, actual: 4, grams: null }] };
  assert.throws(() => addDelivery(state, second, timestamp), /差异/);
  const next = addDelivery(state, { ...second, notes: "有 1 件暂未发出" }, timestamp);
  assert.equal(deliveredCounts(next, source.id).get("p"), 10);
  assert.equal(availableMonthly(next).length, 1);
  assert.equal(operationsSummary(next, scope).owed, 7993);
  const reviewed = reviewDelivery(next, next.deliveries[1].id, "客户确认本批 4 件，另发 1 件", timestamp);
  assert.equal(availableMonthly(reviewed).length, 2);
  assert.equal(operationsSummary(reviewed, scope).owed, 8993);
  const oversent = addDelivery(reviewed, { ...delivery, notes: "实际多发，待核对",
    lines: [{ lineId: "p", planned: 92, actual: 92, grams: null }] }, timestamp);
  assert.equal(oversent.deliveries.at(-1)?.variance, true);
});

test("月结按客户及送货月选单，并阻止送货单重复结算", () => {
  const state = withFirst();
  const request = { customer: source.customer, month: "2026-10", due: "2026-11-30", deliveryIds: [state.deliveries[0].id] };
  assert.throws(() => addStatement(state, { ...request, customer: "其他客户" }), /该客户/);
  assert.throws(() => addStatement(state, { ...request, month: "2026-11" }), /该客户/);
  const next = addStatement(state, request);
  assert.equal(bills(next)[0].cents, 7993);
  assert.throws(() => addStatement(next, request), /可用送货单/);
});

test("待核实回款不冲抵应收，确认和减免独立计入并防止重复凭证", () => {
  const state = withFirst();
  let next = addStatement(state, { customer: source.customer, month: "2026-10", due: "2026-11-30", deliveryIds: [state.deliveries[0].id] });
  const billId = bills(next)[0].id;
  const receipt = { billId, date: "2026-11-01", channel: "微信" as const, reference: "NO-001", cents: 7900 };
  next = addReceipt(next, receipt);
  assert.throws(() => addReceipt(next, { ...receipt, reference: "no-001 " }), /已登记/);
  assert.equal(bills(next)[0].balance, 7993);
  next = confirmReceipt(next, next.receipts[0].id, timestamp);
  assert.equal(bills(next)[0].balance, 93);
  assert.throws(() => addReduction(next, { billId, date: "2026-11-01", reason: "减免", cents: 94 }), /不超过/);
  next = addReduction(next, { billId, date: "2026-11-01", reason: "客户核对尾差", cents: 93 });
  assert.deepEqual(bills(next).map(({ cents, received, reduced, balance }) => [cents, received, reduced, balance]), [[7993, 7900, 93, 0]]);
  assert.equal(operationsSummary(next, { ...scope, from: day, to: "2026-10-31" }).actual, 0);
});

test("跨订单月结回款归属客户范围，单订单报表不重复计算整笔回款", () => {
  let state = withFirst();
  state = acceptOrder(state, { ...source, id: "order-b", code: "DD-002" });
  state = addDelivery(state, { ...delivery, orderId: "order-b", lines: firstLines }, timestamp);
  state = addStatement(state, { customer: source.customer, month: "2026-10", due: "2026-11-30", deliveryIds: state.deliveries.map(({ id }) => id) });
  state = addReceipt(state, { billId: state.statements[0].id, date: day, channel: "公司账户", reference: "X", cents: 12_000 });
  state = confirmReceipt(state, state.receipts[0].id, timestamp);
  assert.equal(operationsSummary(state, { ...scope, customer: source.customer }).actual, 12_000);
  const partial = operationsSummary(state, { ...scope, orderId: source.id });
  assert.equal(partial.actual, 0);
  assert.equal(partial.sharedBills, 1);
  assert.equal(partial.owed, 7993);
});

test("货到付款的送货单可直接结算，补传图纸保留版本", () => {
  let state = acceptOrder(EMPTY_OPERATIONS, { ...source, terms: "货到付款" });
  state = setProduction(state, source.id, "加工中", timestamp, new File(["图纸"], "V1.pdf"));
  state = setProduction(state, source.id, "已完工", timestamp, new File(["修订"], "V2.pdf"));
  assert.deepEqual(state.orders[0].drawings.map(({ file }) => file.name), ["V1.pdf", "V2.pdf"]);
  state = addDelivery(state, { ...delivery, lines: firstLines }, timestamp);
  assert.equal(bills(state)[0].id, state.deliveries[0].id);
});

test("经营 XLSX 保留计算口径、按型号金额及已确认状态", async () => {
  let state: Operations = withFirst();
  state = addStatement(state, { customer: source.customer, month: "2026-10", due: "2026-11-30", deliveryIds: [state.deliveries[0].id] });
  state = addReceipt(state, { billId: state.statements[0].id, date: day, channel: "微信", reference: "XLSX", cents: 5000 });
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(await operationsWorkbook(state, scope).xlsx.writeBuffer());
  assert.deepEqual(result.worksheets.map(({ name }) => name), ["统计汇总", "订单", "送货明细", "结算单", "到账及减免"]);
  assert.equal(result.getWorksheet("送货明细")?.getCell("H3").value, 12.345);
  assert.equal(result.getWorksheet("送货明细")?.getCell("K3").value, 64.93);
  assert.equal(result.getWorksheet("结算单")?.getCell("J2").value, 79.93);
  assert.equal(result.getWorksheet("到账及减免")?.getCell("G2").value, "待核实");
});
