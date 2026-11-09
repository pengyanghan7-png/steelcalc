import { BILLING, TAX, nonnegative, type Part, type PlateDimensions, type Project, type Result } from "./calculate";
import { today } from "./projects";

export const ORDER_HEADERS = ["日期", "客户名称", "规格型号", "开孔摘要", "订单数量", "表面处理",
  "单件净体积 (mm³)", "单件净重 (kg)", "理论总净重 (kg)", "计价方式", "单价", "备注", "是否含税", "价格备注", "重量来源"];

export const CIRCLE_LABEL = "圆孔分组 (直径 mm × 数量)";
export const RECTANGLE_LABEL = "方孔分组 (长 mm × 宽 mm × 数量)";

export function holeGroups(part: PlateDimensions) {
  return {
    circles: part.circles.map((hole) => "Ø" + hole.diameter + " × " + hole.quantity).join("；"),
    rectangles: part.rectangles.map((hole) => hole.length + " × " + hole.width + " × " + hole.quantity).join("；"),
  };
}

function dimensions(plate: PlateDimensions) {
  return plate.length && plate.width && plate.thickness ? [plate.length, plate.width, plate.thickness].join(" × ") : "";
}

function holeSummary(plate: PlateDimensions) {
  const { circles, rectangles } = holeGroups(plate);
  return [circles ? "圆孔 " + circles : "", rectangles ? "方孔 " + rectangles : ""].filter(Boolean).join("；");
}

export function orderCells(project: Project, part: Part, result?: Result) {
  const standard = part.kind === "plate";
  const manual = !standard && part.weightMode === "manual";
  const assemblySpec = !standard && !manual ? part.boards.map((board) => {
    const size = dimensions(board);
    return size ? size + "（" + board.copies + " 块）" : "";
  }).filter(Boolean).join(" + ") : "";
  const spec = part.spec.trim() || (standard ? dimensions(part) : assemblySpec);
  const assemblyHoles = !standard && !manual ? part.boards.map((board, index) => {
    const holes = holeSummary(board);
    return holes ? "板 " + (index + 1) + "：" + holes : "";
  }).filter(Boolean).join("；") : "";
  const summary = manual ? part.manualHoles.trim() : (standard ? holeSummary(part) : assemblyHoles) || "无孔";
  return [project.date || today(), project.customer, spec, summary, result?.quantity ?? null, part.finish.trim(),
    result?.net ?? null, result?.weight ?? null, result?.totalWeight ?? null, part.billing ? BILLING[part.billing] : "",
    nonnegative(part.price), part.notes, part.tax ? TAX[part.tax] : "未填写", part.priceNotes,
    result?.method ?? "待修正"];
}
