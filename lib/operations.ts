import { projectTotals, rowsFor, type Project } from "./calculate";
import { orderCells } from "./order";

export const TERMS = ["现款", "货到付款", "月结"] as const;
export const CHANNELS = ["公司账户", "微信", "现金", "其他"] as const;
export const PRODUCTION = ["待加工", "加工中", "已完工"] as const;
export type Terms = typeof TERMS[number];
export type Channel = typeof CHANNELS[number];
export type Production = typeof PRODUCTION[number];
export type Pricing = "piece" | "kg";
export type Line = { id: string; number: string; spec: string; ordered: number; weight: number; pricing: Pricing; rate: string };
export type WorkOrder = {
  id: string; code: string; title: string; customer: string; date: string; drawing: string; notes: string;
  drawings: { file: File; addedAt: string }[]; terms: Terms; production: Production; lines: Line[];
};
export type DeliveryLine = { lineId: string; planned: number; actual: number; grams: number | null; cents: number };
export type Delivery = {
  id: string; code: string; orderId: string; date: string; vehicle: string; gross: number | null; tare: number | null;
  lines: DeliveryLine[]; file?: File; notes: string; variance: boolean; confirmedAt?: string; resolution?: string;
};
export type Statement = { id: string; code: string; customer: string; month: string; due: string; deliveryIds: string[] };
export type Receipt = {
  id: string; billId: string; date: string; channel: Channel; reference: string; cents: number; file?: File; confirmedAt?: string;
};
export type Reduction = { id: string; billId: string; date: string; cents: number; reason: string };
export type Operations = { orders: WorkOrder[]; deliveries: Delivery[]; statements: Statement[]; receipts: Receipt[]; reductions: Reduction[] };
export const EMPTY_OPERATIONS: Operations = { orders: [], deliveries: [], statements: [], receipts: [], reductions: [] };

const currencyFormat = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
const weightFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });
export const money = (cents: number) => currencyFormat.format(cents / 100);
export const kg = (grams: number) => weightFormat.format(grams / 1000);
export const clientKey = (name: string) => name.normalize("NFKC").trim().toLowerCase();

export function fixed(raw: string, digits: number): number | null {
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [integer, decimal = ""] = text.split(".");
  if (decimal.length > digits) return null;
  const value = Number(integer + decimal.padEnd(digits, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

function recordId(prefix: string) {
  const id = crypto.randomUUID();
  return { id, code: prefix + "-" + id.slice(0, 10).replace("-", "").toUpperCase() };
}

function requireDate(date: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("请填写" + label + "。");
  const parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(label + "无效。");
}

function sum(values: number[]) {
  const total = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("合计超出可记录范围。");
  return total;
}

export function makeOrder(project: Project): WorkOrder | null {
  const rows = rowsFor(project);
  if (!projectTotals(rows)) return null;
  return {
    id: project.id, code: "DD-" + project.id.slice(0, 8).toUpperCase(), title: project.name.trim() || "未命名订单",
    customer: project.customer.trim(), date: project.date, drawing: project.drawing, notes: project.notes,
    terms: "现款", production: "待加工", drawings: [],
    lines: rows.flatMap(({ part, result }) => result ? [{
      id: part.id, number: part.number, spec: String(orderCells(project, part, result)[2]), ordered: result.quantity,
      weight: result.weight, pricing: part.billing === "kg" ? "kg" : "piece", rate: part.price,
    }] : []),
  };
}

export function acceptOrder(state: Operations, order: WorkOrder): Operations {
  if (state.orders.some(({ id, code }) => id === order.id || code === order.code)) throw new Error("这笔订单已交接，请直接选择该订单。");
  requireDate(order.date, "订单日期");
  if (!order.customer.trim()) throw new Error("请填写客户名称。");
  if (order.lines.some((line) => fixed(line.rate, 6) === null)) throw new Error("请为每个型号填写已确认的结算单价，最多 6 位小数。");
  return { ...state, orders: [...state.orders, order] };
}

function findOrder(state: Operations, id: string) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) throw new Error("请选择一笔已交接订单。");
  return order;
}

export function setProduction(state: Operations, orderId: string, production: Production, now: string, file?: File) {
  const order = findOrder(state, orderId);
  const drawings = file ? [...order.drawings, { file, addedAt: now }] : order.drawings;
  return { ...state, orders: state.orders.map((item) => item.id === orderId ? { ...item, production, drawings } : item) };
}

export function deliveredCounts(state: Operations, orderId: string) {
  const totals = new Map<string, number>();
  for (const delivery of state.deliveries) if (delivery.orderId === orderId) {
    for (const line of delivery.lines) totals.set(line.lineId, (totals.get(line.lineId) ?? 0) + line.actual);
  }
  return totals;
}

export function lineAmount(line: Line, pieces: number, grams: number | null) {
  const rate = fixed(line.rate, 6);
  if (rate === null) throw new Error("型号 " + line.number + " 缺少有效单价。");
  if (line.pricing === "kg" && pieces > 0 && (!grams || grams <= 0)) throw new Error("请填写 " + line.number + " 的实称重量。");
  const scaled = line.pricing === "piece" ? BigInt(pieces) * 1000n : BigInt(grams ?? 0);
  const cents = Number((BigInt(rate) * scaled + 5_000_000n) / 10_000_000n);
  if (!Number.isSafeInteger(cents)) throw new Error("送货金额超出可记录范围。");
  return cents;
}

type DeliveryInput = Pick<Delivery, "orderId" | "date" | "vehicle" | "gross" | "tare" | "file" | "notes"> & {
  lines: Omit<DeliveryLine, "cents">[];
};

export function addDelivery(state: Operations, input: DeliveryInput, now: string) {
  const order = findOrder(state, input.orderId);
  requireDate(input.date, "送货日期");
  if (input.date < order.date) throw new Error("送货日期须在订单日期当天或之后。");
  if (input.gross !== null || input.tare !== null) {
    if (input.gross === null || input.tare === null || !Number.isSafeInteger(input.gross) ||
      !Number.isSafeInteger(input.tare) || input.gross <= input.tare || input.tare < 0) throw new Error("请同时填写有效的车辆毛重和皮重。");
  }
  if (!input.lines.some(({ actual }) => actual > 0)) throw new Error("请填写至少一个型号的实发件数。");
  const sent = deliveredCounts(state, order.id);
  const used = new Set<string>();
  let variance = false;
  const lines = input.lines.map((line) => {
    const item = order.lines.find(({ id }) => id === line.lineId);
    if (!item || used.has(line.lineId)) throw new Error("送货型号与订单不一致。");
    used.add(line.lineId);
    if (![line.planned, line.actual].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      (line.grams !== null && (!Number.isSafeInteger(line.grams) || line.grams < 0 || (line.actual === 0 && line.grams > 0)))) {
      throw new Error("请核对计划数量、实发数量及实称重量。");
    }
    const shipped = sum([sent.get(item.id) ?? 0, line.actual]);
    if (line.planned !== line.actual || shipped > item.ordered) variance = true;
    return { ...line, cents: lineAmount(item, line.actual, line.grams) };
  });
  sum(lines.map(({ cents }) => cents));
  if (variance && !input.notes.trim()) throw new Error("发现发货差异，请填写情况说明。");
  const record: Delivery = { ...input, ...recordId("SH"), lines, variance, confirmedAt: variance ? undefined : now };
  return { ...state, deliveries: [...state.deliveries, record] };
}

export function reviewDelivery(state: Operations, id: string, resolution: string, now: string) {
  const delivery = state.deliveries.find((item) => item.id === id);
  if (!delivery || delivery.confirmedAt) throw new Error("这张送货单已确认或不存在。");
  if (!resolution.trim()) throw new Error("请填写差异处理结果。");
  return { ...state, deliveries: state.deliveries.map((item) =>
    item.id === id ? { ...item, confirmedAt: now, resolution: resolution.trim() } : item) };
}

export function availableMonthly(state: Operations) {
  const closed = new Set(state.statements.flatMap(({ deliveryIds }) => deliveryIds));
  return state.deliveries.filter((delivery) => delivery.confirmedAt && !closed.has(delivery.id) &&
    state.orders.some((order) => order.id === delivery.orderId && order.terms === "月结"));
}

export function addStatement(state: Operations, statement: Omit<Statement, "id" | "code">) {
  requireDate(statement.month + "-01", "送货月份");
  requireDate(statement.due, "付款截止日");
  if (statement.due < statement.month + "-01") throw new Error("付款截止日须在送货月份当天或之后。");
  const valid = new Map(availableMonthly(state).map((delivery) => [delivery.id, delivery]));
  const ids = new Set(statement.deliveryIds);
  if (!ids.size || ids.size !== statement.deliveryIds.length) throw new Error("请选择要纳入对账单的送货单。");
  for (const id of ids) {
    const delivery = valid.get(id);
    if (!delivery || delivery.date.slice(0, 7) !== statement.month ||
      clientKey(findOrder(state, delivery.orderId).customer) !== clientKey(statement.customer)) {
      throw new Error("请选择该客户、该月份的可用送货单。");
    }
    if (delivery.date > statement.due) throw new Error("付款截止日须在所有送货日期当天或之后。");
  }
  return { ...state, statements: [...state.statements, { ...statement, ...recordId("DZ") }] };
}

export const deliveryAmount = (delivery: Delivery) => sum(delivery.lines.map(({ cents }) => cents));

export function bills(state: Operations) {
  const orders = new Map(state.orders.map((order) => [order.id, order]));
  const deliveries = new Map(state.deliveries.map((delivery) => [delivery.id, delivery]));
  const direct = state.deliveries.flatMap((delivery) => {
    const order = orders.get(delivery.orderId);
    return delivery.confirmedAt && order && order.terms !== "月结" ? [{
      id: delivery.id, code: delivery.code, customer: order.customer, date: delivery.date, due: "", month: "",
      orderIds: [order.id], deliveryIds: [delivery.id], cents: deliveryAmount(delivery),
    }] : [];
  });
  const monthly = state.statements.map((statement) => ({
    ...statement, date: statement.month + "-01",
    orderIds: [...new Set(statement.deliveryIds.map((id) => deliveries.get(id)!.orderId))],
    cents: sum(statement.deliveryIds.map((id) => deliveryAmount(deliveries.get(id)!))),
  }));
  return [...direct, ...monthly].map((bill) => {
    const receipts = state.receipts.filter(({ billId }) => billId === bill.id);
    const reductions = state.reductions.filter(({ billId }) => billId === bill.id);
    const received = sum(receipts.filter(({ confirmedAt }) => confirmedAt).map(({ cents }) => cents));
    const pending = sum(receipts.filter(({ confirmedAt }) => !confirmedAt).map(({ cents }) => cents));
    const reduced = sum(reductions.map(({ cents }) => cents));
    return { ...bill, receipts, reductions, received, pending, reduced, balance: bill.cents - received - reduced };
  });
}

export type Bill = ReturnType<typeof bills>[number];

function findBill(state: Operations, id: string) {
  const bill = bills(state).find((entry) => entry.id === id);
  if (!bill) throw new Error("请选择要结算的送货单或月结对账单。");
  return bill;
}

export function addReceipt(state: Operations, input: Omit<Receipt, "id" | "confirmedAt">) {
  const bill = findBill(state, input.billId);
  requireDate(input.date, "实际到账日期");
  if (!Number.isSafeInteger(input.cents) || input.cents <= 0) throw new Error("请填写大于 0 的实收金额，最多两位小数。");
  const reference = input.reference.trim();
  if (!reference) throw new Error("请填写流水号或凭证号。");
  if (state.receipts.some((item) => item.channel === input.channel && clientKey(item.reference) === clientKey(reference))) {
    throw new Error("该渠道的流水号或凭证号已登记。");
  }
  sum([bill.received, bill.pending, input.cents]);
  return { ...state, receipts: [...state.receipts, { ...input, reference, id: crypto.randomUUID() }] };
}

export function confirmReceipt(state: Operations, id: string, now: string) {
  if (!state.receipts.some((item) => item.id === id && !item.confirmedAt)) throw new Error("这笔收款已确认或不存在。");
  return { ...state, receipts: state.receipts.map((item) => item.id === id ? { ...item, confirmedAt: now } : item) };
}

export function addReduction(state: Operations, input: Omit<Reduction, "id">) {
  const bill = findBill(state, input.billId);
  requireDate(input.date, "尾差登记日期");
  if (!input.reason.trim()) throw new Error("请填写财务确认的减免原因。");
  if (!Number.isSafeInteger(input.cents) || input.cents <= 0 || input.cents > bill.balance) {
    throw new Error("尾差减免须大于 0 且不超过当前待收余额。");
  }
  return { ...state, reductions: [...state.reductions, { ...input, reason: input.reason.trim(), id: crypto.randomUUID() }] };
}

export type Scope = { customer: string; orderId: string; from: string; to: string };
export function operationsSummary(state: Operations, scope: Scope) {
  const includesDate = (date: string) => (!scope.from || date >= scope.from) && (!scope.to || date <= scope.to);
  const orders = state.orders.filter((order) => (!scope.orderId || scope.orderId === order.id) &&
    (!scope.customer || clientKey(scope.customer) === clientKey(order.customer)));
  const ids = new Set(orders.map(({ id }) => id));
  const deliveries = state.deliveries.filter((delivery) => ids.has(delivery.orderId) && includesDate(delivery.date));
  const relatedBills = bills(state).filter(({ orderIds }) => orderIds.some((id) => ids.has(id)));
  const selectedBills = relatedBills.filter(({ orderIds }) => orderIds.every((id) => ids.has(id)));
  const receipts = selectedBills.flatMap((bill) => bill.receipts.filter(({ date }) => includesDate(date)));
  const reductions = selectedBills.flatMap((bill) => bill.reductions.filter(({ date }) => includesDate(date)));
  const unclosed = availableMonthly(state).filter(({ orderId }) => ids.has(orderId));
  return {
    orders, deliveries, selectedBills, receipts, reductions,
    sharedBills: relatedBills.length - selectedBills.length,
    units: sum(deliveries.flatMap((delivery) => delivery.lines.map(({ actual }) => actual))),
    owed: sum(deliveries.filter(({ confirmedAt }) => confirmedAt).map(deliveryAmount)),
    actual: sum(receipts.filter(({ confirmedAt }) => confirmedAt).map(({ cents }) => cents)),
    pending: sum(receipts.filter(({ confirmedAt }) => !confirmedAt).map(({ cents }) => cents)),
    reduced: sum(reductions.map(({ cents }) => cents)),
    outstanding: sum([...selectedBills.map(({ balance }) => Math.max(0, balance)), ...unclosed.map(deliveryAmount)]),
    discrepancies: deliveries.filter(({ confirmedAt }) => !confirmedAt).length,
  };
}
