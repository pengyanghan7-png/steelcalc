export const DENSITY = 7.85;
export const HEADERS = ["序号", "零件编号", "图纸编号", "长 (mm)", "宽 (mm)", "厚 (mm)",
  "圆孔 (个)", "方孔 (个)", "原板体积 (mm³)", "扣孔体积 (mm³)", "净体积 (mm³)", "重量 (kg)", "备注"];

export type Circle = { id: string; diameter: string; quantity: string };
export type Rectangle = { id: string; length: string; width: string; quantity: string };
export type Part = {
  id: string;
  number: string;
  drawing: string;
  length: string;
  width: string;
  thickness: string;
  notes: string;
  circles: Circle[];
  rectangles: Rectangle[];
};

export type Project = {
  id: string;
  name: string;
  customer: string;
  drawing: string;
  date: string;
  notes: string;
  parts: Part[];
};

export type Result = {
  length: number;
  width: number;
  thickness: number;
  circleCount: number;
  rectangleCount: number;
  gross: number;
  removed: number;
  net: number;
  weight: number;
};

function positive(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function quantity(raw: string) {
  const value = positive(raw);
  return value !== null && Number.isSafeInteger(value) ? value : null;
}

export function calculate(part: Part): { result: Result; errors?: never } | { errors: Record<string, string>; result?: never } {
  const errors: Record<string, string> = {};
  const length = positive(part.length);
  const width = positive(part.width);
  const thickness = positive(part.thickness);
  if (length === null) errors.length = "长度须大于 0";
  if (width === null) errors.width = "宽度须大于 0";
  if (thickness === null) errors.thickness = "厚度须大于 0";
  let removedArea = 0;
  let circleCount = 0;
  let rectangleCount = 0;

  for (const hole of part.circles) {
    const diameter = positive(hole.diameter);
    const count = quantity(hole.quantity);
    if (diameter === null) errors[hole.id + ".diameter"] = "孔径须大于 0";
    else if ((length !== null && diameter > length) || (width !== null && diameter > width)) {
      errors[hole.id + ".diameter"] = "孔径不能超过板长或板宽";
    }
    if (count === null) errors[hole.id + ".quantity"] = "请输入正整数";
    if (diameter !== null && count !== null) {
      circleCount += count;
      removedArea += Math.PI * (diameter / 2) ** 2 * count;
    }
  }

  for (const hole of part.rectangles) {
    const a = positive(hole.length);
    const b = positive(hole.width);
    const count = quantity(hole.quantity);
    if (a === null) errors[hole.id + ".length"] = "孔长须大于 0";
    else if (length !== null && a > length) errors[hole.id + ".length"] = "孔长不能超过板长";
    if (b === null) errors[hole.id + ".width"] = "孔宽须大于 0";
    else if (width !== null && b > width) errors[hole.id + ".width"] = "孔宽不能超过板宽";
    if (count === null) errors[hole.id + ".quantity"] = "请输入正整数";
    if (a !== null && b !== null && count !== null) {
      rectangleCount += count;
      removedArea += a * b * count;
    }
  }

  if (length === null || width === null || thickness === null || Object.keys(errors).length) return { errors };

  const gross = length * width * thickness;
  const removed = removedArea * thickness;
  const net = gross - removed;
  const weight = net * (DENSITY / 1_000_000);
  if (![gross, removed, weight].every(Number.isFinite) || gross <= 0 ||
      !Number.isSafeInteger(circleCount) || !Number.isSafeInteger(rectangleCount)) {
    return { errors: { volume: "尺寸或数量超出可计算范围，请检查输入。" } };
  }
  if (net < 0) return { errors: { volume: "扣孔体积超过原板体积，请检查孔尺寸和数量。" } };
  return { result: { length, width, thickness, circleCount, rectangleCount, gross, removed, net, weight } };
}

export function summarize(rows: Result[]) {
  return rows.reduce((total, row) => ({
    gross: total.gross + row.gross,
    removed: total.removed + row.removed,
    net: total.net + row.net,
    weight: total.weight + row.weight,
  }), { gross: 0, removed: 0, net: 0, weight: 0 });
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
  return Object.values(totals).every(Number.isFinite) ? totals : null;
}
