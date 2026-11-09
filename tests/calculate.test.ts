import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate, projectTotals, rowsFor, type Part } from "../lib/calculate";
import { newProject } from "../lib/projects";

const base: Part = {
  id: "a", number: "P-001", length: "100", width: "80", thickness: "10",
  drawing: "", notes: "", circles: [], rectangles: [],
};
const circle = { id: "c", diameter: "20", quantity: "1" };
const rectangle = { id: "r", length: "25", width: "10", quantity: "2" };

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, actual + " ≈ " + expected);
}

test("无孔钢板", () => {
  assert.deepEqual(calculate(base).result, {
    length: 100, width: 80, thickness: 10, circleCount: 0, rectangleCount: 0,
    gross: 80_000, removed: 0, net: 80_000, weight: 0.628,
  });
});

test("单个圆孔", () => {
  const { result } = calculate({ ...base, circles: [circle] });
  assert.ok(result);
  close(result.removed, 1000 * Math.PI);
  close(result.weight, (80_000 - 1000 * Math.PI) * 7.85 / 1_000_000);
});

test("多组圆孔分别计数", () => {
  const { result } = calculate({ ...base, circles: [
    { ...circle, quantity: "4" }, { id: "c2", diameter: "10", quantity: "2" },
  ] });
  assert.ok(result);
  assert.equal(result.circleCount, 6);
  close(result.removed, 4500 * Math.PI);
});

test("多组矩形孔", () => {
  const { result } = calculate({ ...base, rectangles: [
    rectangle, { id: "r2", length: "30", width: "20", quantity: "1" },
  ] });
  assert.ok(result);
  assert.equal(result.removed, 11_000);
  assert.equal(result.net, 69_000);
  assert.equal(result.rectangleCount, 3);
});

test("圆孔与方孔同时扣除", () => {
  const { result } = calculate({ ...base, circles: [circle], rectangles: [rectangle] });
  assert.ok(result);
  close(result.net, 75_000 - 1000 * Math.PI);
});

test("小数尺寸使用完整精度", () => {
  const { result } = calculate({ ...base, length: "100.25", width: "80.12", thickness: "2.5" });
  assert.ok(result);
  close(result.gross, 20_080.075);
  close(result.weight, 20_080.075 * 7.85 / 1_000_000);
});

test("校验板尺寸、孔尺寸和数量", () => {
  assert.ok(calculate({ ...base, length: "0", width: "-1", thickness: "" }).errors?.thickness);
  assert.ok(calculate({ ...base, circles: [{ ...circle, diameter: "81", quantity: "1.5" }] }).errors?.["c.diameter"]);
  assert.ok(calculate({ ...base, circles: [{ ...circle, quantity: "1.5" }] }).errors?.["c.quantity"]);
  assert.ok(calculate({ ...base, rectangles: [{ ...rectangle, length: "101" }] }).errors?.["r.length"]);
  assert.ok(calculate({ ...base, rectangles: [{ ...rectangle, width: "81" }] }).errors?.["r.width"]);
  assert.ok(calculate({ ...base, rectangles: [{ ...rectangle, width: "-1" }] }).errors?.["r.width"]);
});

test("扣孔体积等于原板体积时净重为零，超过时拒绝计算", () => {
  const hole = { ...rectangle, length: "100", width: "80", quantity: "1" };
  assert.equal(calculate({ ...base, rectangles: [hole] }).result?.weight, 0);
  assert.ok(calculate({ ...base, rectangles: [{ ...hole, quantity: "2" }] }).errors?.volume);
});

test("订单按原始精度汇总并拒绝重复编号", () => {
  const project = { ...newProject(), parts: [base, { ...base, id: "b", number: "P-002" }] };
  assert.equal(projectTotals(rowsFor(project))?.weight, 1.256);
  const invalid = { ...project, parts: [base, { ...base, id: "b" }] };
  assert.equal(projectTotals(rowsFor(invalid)), null);
  assert.ok(rowsFor(invalid)[0].errors?.number);
});
