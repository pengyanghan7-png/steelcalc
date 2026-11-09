import { BILLING, TAX, nonnegative, type Part, type Project, type Result } from "./calculate";
import { today } from "./projects";

export const ORDER_HEADERS = ["日期", "客户名称", "规格型号", "开孔摘要", "订单数量", "表面处理",
  "单件净体积 (mm³)", "单件净重 (kg)", "理论总净重 (kg)", "计价方式", "单价", "备注", "是否含税", "价格备注", "重量来源"];

export const CIRCLE_LABEL = "圆孔分组 (直径 mm × 数量)";
export const RECTANGLE_LABEL = "方孔分组 (长 mm × 宽 mm × 数量)";

export function holeGroups(part: Part) {
  return {
    circles: part.circles.map((hole) => "Ø" + hole.diameter + " × " + hole.quantity).join("；"),
    rectangles: part.rectangles.map((hole) => hole.length + " × " + hole.width + " × " + hole.quantity).join("；"),
  };
}

export function orderCells(project: Project, part: Part, result?: Result) {
  const manual = part.kind !== "plate";
  const holes = holeGroups(part);
  const spec = part.spec.trim() || (part.length && part.width && part.thickness && !manual ?
    [part.length, part.width, part.thickness].join(" × ") : "");
  const summary = manual ? part.manualHoles.trim() :
    [holes.circles ? "圆孔 " + holes.circles : "", holes.rectangles ? "方孔 " + holes.rectangles : ""].filter(Boolean).join("；") || "无孔";
  return [project.date || today(), project.customer, spec, summary, result?.quantity ?? null, part.finish.trim(),
    result?.net ?? null, result?.weight ?? null, result?.totalWeight ?? null, part.billing ? BILLING[part.billing] : "",
    nonnegative(part.price), part.notes, part.tax ? TAX[part.tax] : "未填写", part.priceNotes,
    result?.method ?? "待修正"];
}
