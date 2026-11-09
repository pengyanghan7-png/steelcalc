import type { Usage } from "./history";

export const DENSITY = 7.85;
export const FINISHES = ["黑铁", "蓝锌", "白锌", "热镀", "其他"];
export const PART_TYPES = { plate: "标准矩形板", bend: "简单折弯板", special: "特殊件 / 焊接件" } as const;
export const BILLING = { kg: "元/kg", piece: "元/件" } as const;
export const TAX = { included: "含税", excluded: "不含税" } as const;
export type Billing = keyof typeof BILLING;
export type Tax = keyof typeof TAX | "";

export type Circle = { id: string; diameter: string; quantity: string };
export type Rectangle = { id: string; length: string; width: string; quantity: string };
export type PlateDimensions = {
  length: string;
  width: string;
  thickness: string;
  circles: Circle[];
  rectangles: Rectangle[];
};
export type Board = PlateDimensions & { id: string; copies: string };
export type Part = PlateDimensions & {
  id: string;
  number: string;
  drawing: string;
  notes: string;
  kind: keyof typeof PART_TYPES;
  weightMode: "boards" | "manual";
  boards: Board[];
  spec: string;
  manualHoles: string;
  manualWeight: string;
  quantity: string;
  finish: string;
  billing: Billing | "";
  price: string;
  tax: Tax;
  priceNotes: string;
};

export type Project = {
  id: string;
  name: string;
  customer: string;
  drawing: string;
  date: string;
  notes: string;
  parts: Part[];
  results?: { partId: string; calculation: Result }[];
  usage?: Usage;
};

type BoardResult = {
  length: number;
  width: number;
  thickness: number;
  circleCount: number;
  rectangleCount: number;
  gross: number;
  circleVolume: number;
  rectangleVolume: number;
  removed: number;
  net: number;
  grossWeight: number;
  weight: number;
};

export type Result = {
  method: "自动计算" | "组成板汇总" | "人工填写";
  quantity: number;
  length: number | null;
  width: number | null;
  thickness: number | null;
  circleCount: number;
  rectangleCount: number;
  gross: number | null;
  circleVolume: number | null;
  rectangleVolume: number | null;
  removed: number | null;
  net: number | null;
  grossWeight: number | null;
  weight: number;
  totalWeight: number;
  boards?: { copies: number; geometry: BoardResult }[];
};

type Check<T> = { result: T; errors?: never } | { errors: Record<string, string>; result?: never };

function positive(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function integer(raw: string) {
  const value = positive(raw);
  return value !== null && Number.isSafeInteger(value) ? value : null;
}

export function nonnegative(raw: string) {
  const value = Number(raw);
  return raw.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}

export function calculate(part: Part): Check<Result> {
  const errors: Record<string, string> = {};
  const quantity = integer(part.quantity);
  if (quantity === null) errors.quantity = "订单数量须为正整数";
  if (part.price.trim()) {
    if (nonnegative(part.price) === null) errors.price = "单价须为大于或等于 0 的数字";
    if (!part.billing) errors.billing = "请先选择计价方式";
  }
  if (part.kind !== "plate" && part.weightMode === "manual") {
    const weight = nonnegative(part.manualWeight);
    if (!part.spec.trim()) errors.spec = "请填写规格说明";
    if (weight === null) errors.manualWeight = "请填写大于或等于 0 的单件净重";
    if (weight === null || quantity === null || Object.keys(errors).length) return { errors };
    const totalWeight = weight * quantity;
    if (!Number.isFinite(totalWeight)) return { errors: { volume: "总净重超出可计算范围。" } };
    return { result: {
      method: "人工填写", quantity, length: null, width: null, thickness: null, circleCount: 0, rectangleCount: 0,
      gross: null, circleVolume: null, rectangleVolume: null, removed: null, net: null, grossWeight: null, weight, totalWeight,
    } };
  }
  const computed = part.kind === "plate" ? calculateBoard(part) : calculateBoards(part.boards);
  if (quantity === null || !computed.result || Object.keys(errors).length) return { errors: { ...errors, ...computed.errors } };
  const totalWeight = computed.result.weight * quantity;
  if (!Number.isFinite(totalWeight)) return { errors: { volume: "总净重超出可计算范围。" } };
  return { result: {
    ...computed.result, method: part.kind === "plate" ? "自动计算" : "组成板汇总", quantity, totalWeight,
  } };
}

function calculateBoard(board: PlateDimensions): Check<BoardResult> {
  const errors: Record<string, string> = {};
  const length = positive(board.length);
  const width = positive(board.width);
  const thickness = positive(board.thickness);
  if (length === null) errors.length = "长度须大于 0";
  if (width === null) errors.width = "宽度须大于 0";
  if (thickness === null) errors.thickness = "厚度须大于 0";
  let circleArea = 0;
  let rectangleArea = 0;
  let circleCount = 0;
  let rectangleCount = 0;

  for (const hole of board.circles) {
    const diameter = positive(hole.diameter);
    const count = integer(hole.quantity);
    if (diameter === null) errors[hole.id + ".diameter"] = "孔径须大于 0";
    else if ((length !== null && diameter > length) || (width !== null && diameter > width)) {
      errors[hole.id + ".diameter"] = "孔径不能超过板长或板宽";
    }
    if (count === null) errors[hole.id + ".quantity"] = "请输入正整数";
    if (diameter !== null && count !== null) {
      circleCount += count;
      circleArea += Math.PI * (diameter / 2) ** 2 * count;
    }
  }

  for (const hole of board.rectangles) {
    const a = positive(hole.length);
    const b = positive(hole.width);
    const count = integer(hole.quantity);
    if (a === null) errors[hole.id + ".length"] = "孔长须大于 0";
    else if (length !== null && a > length) errors[hole.id + ".length"] = "孔长不能超过板长";
    if (b === null) errors[hole.id + ".width"] = "孔宽须大于 0";
    else if (width !== null && b > width) errors[hole.id + ".width"] = "孔宽不能超过板宽";
    if (count === null) errors[hole.id + ".quantity"] = "请输入正整数";
    if (a !== null && b !== null && count !== null) {
      rectangleCount += count;
      rectangleArea += a * b * count;
    }
  }

  if (length === null || width === null || thickness === null || Object.keys(errors).length) return { errors };

  const gross = length * width * thickness;
  const circleVolume = circleArea * thickness;
  const rectangleVolume = rectangleArea * thickness;
  const removed = circleVolume + rectangleVolume;
  const net = gross - removed;
  const weight = net * (DENSITY / 1_000_000);
  const grossWeight = gross * (DENSITY / 1_000_000);
  if (![gross, removed, weight].every(Number.isFinite) || gross <= 0 ||
      !Number.isSafeInteger(circleCount) || !Number.isSafeInteger(rectangleCount)) {
    return { errors: { volume: "尺寸或数量超出可计算范围，请检查输入。" } };
  }
  if (net < 0) return { errors: { volume: "扣孔体积超过原板体积，请检查孔尺寸和数量。" } };
  return { result: {
    length, width, thickness, circleCount, rectangleCount, gross, circleVolume, rectangleVolume, removed, net, grossWeight, weight,
  } };
}

function calculateBoards(boards: Board[]): Check<Omit<Result, "quantity" | "method" | "totalWeight">> {
  if (!boards.length) return { errors: { boards: "请至少添加一块组成板。" } };
  const errors: Record<string, string> = {};
  const validated: NonNullable<Result["boards"]> = [];
  const totals = {
    circleCount: 0, rectangleCount: 0, gross: 0, circleVolume: 0,
    rectangleVolume: 0, removed: 0, net: 0, grossWeight: 0, weight: 0,
  };
  for (const board of boards) {
    const copies = integer(board.copies);
    const computed = calculateBoard(board);
    if (copies === null) errors[board.id + ".copies"] = "每件用量须为正整数";
    for (const [key, message] of Object.entries(computed.errors ?? {})) {
      errors[board.id + "." + key] = message;
    }
    if (copies === null || !computed.result) continue;
    const geometry = computed.result;
    validated.push({ copies, geometry });
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] += geometry[key] * copies;
    }
  }
  if (Object.keys(errors).length) return { errors };
  if (!Object.values(totals).every(Number.isFinite) ||
      !Number.isSafeInteger(totals.circleCount) || !Number.isSafeInteger(totals.rectangleCount)) {
    return { errors: { volume: "组成板合计超出可计算范围。" } };
  }
  return { result: { length: null, width: null, thickness: null, ...totals, boards: validated } };
}

export function summarize(rows: Result[]) {
  return rows.reduce((total, row) => ({
    quantity: total.quantity + row.quantity,
    gross: total.gross + (row.gross ?? 0) * row.quantity,
    removed: total.removed + (row.removed ?? 0) * row.quantity,
    net: total.net + (row.net ?? 0) * row.quantity,
    weight: total.weight + row.totalWeight,
  }), { quantity: 0, gross: 0, removed: 0, net: 0, weight: 0 });
}

export function rowsFor(project: Project) {
  const counts = new Map<string, number>();
  for (const part of project.parts) {
    const number = part.number.trim();
    counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  return project.parts.map((part) => {
    const computed = calculate(part);
    const number = part.number.trim();
    if (!number || (counts.get(number) ?? 0) > 1) {
      return { part, result: undefined, errors: { ...computed.errors, number: number ? "零件编号已重复" : "请填写零件编号" } };
    }
    return { part, ...computed };
  });
}

export function projectTotals(rows: ReturnType<typeof rowsFor>) {
  const results = rows.flatMap((row) => row.result ? [row.result] : []);
  if (!results.length || results.length !== rows.length) return null;
  const totals = summarize(results);
  return Object.values(totals).every(Number.isFinite) && Number.isSafeInteger(totals.quantity) ? totals : null;
}
