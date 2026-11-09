import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate, projectTotals, rowsFor, type Part } from "../lib/calculate";
import { newProject, partDefaults } from "../lib/projects";

const base: Part = {
  ...partDefaults,
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
    method: "自动计算", quantity: 1, gross: 80_000, circleVolume: 0, rectangleVolume: 0,
    removed: 0, net: 80_000, grossWeight: 0.628, weight: 0.628, totalWeight: 0.628,
  });
});

test("单个圆孔", () => {
  const { result } = calculate({ ...base, circles: [circle] });
  assert.ok(result);
  close(result.removed!, 1000 * Math.PI);
  close(result.weight, (80_000 - 1000 * Math.PI) * 7.85 / 1_000_000);
});

test("多组圆孔分别计数", () => {
  const { result } = calculate({ ...base, circles: [
    { ...circle, quantity: "4" }, { id: "c2", diameter: "10", quantity: "2" },
  ] });
  assert.ok(result);
  assert.equal(result.circleCount, 6);
  close(result.removed!, 4500 * Math.PI);
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
  const { result } = calculate({ ...base, quantity: "3", circles: [circle], rectangles: [rectangle] });
  assert.ok(result);
  close(result.circleVolume!, 1000 * Math.PI);
  close(result.rectangleVolume!, 5000);
  close(result.net!, 75_000 - 1000 * Math.PI);
  close(result.totalWeight, (75_000 - 1000 * Math.PI) * 7.85 / 1_000_000 * 3);
});

test("小数尺寸使用完整精度", () => {
  const { result } = calculate({ ...base, length: "100.25", width: "80.12", thickness: "2.5" });
  assert.ok(result);
  close(result.gross!, 20_080.075);
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

test("折弯和焊接件使用人工单件净重，体积留空", () => {
  for (const kind of ["bend", "special"] as const) {
    const { result } = calculate({ ...base, kind, weightMode: "manual", spec: "异形件", manualWeight: "1.23456", quantity: "7" });
    assert.ok(result);
    assert.equal(result.method, "人工填写");
    assert.equal(result.net, null);
    assert.equal(result.grossWeight, null);
    close(result.totalWeight, 8.64192);
  }
  assert.ok(calculate({ ...base, kind: "bend", weightMode: "manual" }).errors?.manualWeight);
  assert.ok(calculate({ ...base, kind: "special", weightMode: "manual", spec: "", manualWeight: "2" }).errors?.spec);
});

test("折弯板和焊接件分别扣除各组成板的孔并按每件用量与订单数量汇总", () => {
  const boards = [
    { ...base, id: "side", copies: "2", circles: [circle] },
    { ...base, id: "bottom", copies: "1", length: "200", rectangles: [rectangle] },
    { ...base, id: "top", copies: "1" },
  ];
  for (const [kind, count, gross] of [["bend", 2, 320_000], ["special", 3, 400_000]] as const) {
    const { result } = calculate({ ...base, kind, boards: boards.slice(0, count), quantity: "7" });
    assert.ok(result);
    assert.equal(result.method, "组成板汇总");
    assert.equal(result.boards?.length, count);
    assert.equal(result.boards?.[0].copies, 2);
    assert.equal(result.quantity, 7);
    assert.equal(result.gross, gross);
    close(result.circleVolume!, 2000 * Math.PI);
    close(result.rectangleVolume!, 5000);
    close(result.totalWeight, (gross - 5000 - 2000 * Math.PI) * 7.85 / 1_000_000 * 7);
  }
});

test("组成板的无效尺寸、用量和孔径只标记在该组板上", () => {
  const invalid = { ...base, id: "bad", copies: "1.2", length: "", circles: [{ ...circle, diameter: "81" }] };
  const { errors } = calculate({ ...base, kind: "bend", boards: [{ ...base, id: "ok", copies: "1" }, invalid] });
  assert.ok(errors?.["bad.length"]);
  assert.ok(errors?.["bad.copies"]);
  assert.ok(errors?.["bad.c.diameter"]);
  assert.equal(errors?.["ok.length"], undefined);
  assert.ok(calculate({ ...base, kind: "bend" }).errors?.boards);
});

test("数量和单价校验，价格与含税状态可选填", () => {
  assert.ok(calculate({ ...base, quantity: "1.5" }).errors?.quantity);
  assert.ok(calculate({ ...base, price: "6" }).errors?.billing);
  assert.ok(calculate({ ...base, billing: "kg", price: "-0.01" }).errors?.price);
  assert.ok(calculate({ ...base, billing: "piece", price: "0" }).result);
  assert.ok(calculate({ ...base, billing: "kg" }).result);
});
