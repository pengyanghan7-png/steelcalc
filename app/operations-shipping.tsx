import { useState, type ReactNode } from "react";
import { acceptOrder, addDelivery, deliveredCounts, deliveryAmount, kg, money, PRODUCTION, reviewDelivery, setProduction,
  TERMS, type Delivery, type Operations, type Pricing, type Production, type Terms, type WorkOrder } from "../lib/operations";
import { today } from "../lib/projects";
import { attachment, Dropdown, Form, GridTable, Input, numeric, Picker, Proof, value, type Mutate } from "./operations-ui";
import { Card, Icon } from "./ui";

const pricingOptions = [["piece", "按件 · 元/件"], ["kg", "按实称重量 · 元/kg"]] as const;
export const orderLabel = (order: WorkOrder) => [order.code, order.customer || "未填写客户", order.title, order.date].join(" · ");

export function Shipping({ state, candidates, preferred, mutate, busy, back }: {
  state: Operations; candidates: WorkOrder[]; preferred: string; mutate: Mutate; busy: boolean; back: () => void;
}) {
  const [selected, setSelected] = useState(() => state.orders.some(({ id }) => id === preferred) ? preferred : "");
  const [source, setSource] = useState(preferred);
  const choices = candidates.filter((candidate) => !state.orders.some((order) => order.id === candidate.id));
  const candidate = choices.find((item) => item.id === source);
  const order = state.orders.find((item) => item.id === selected);

  return <div className="stack">
    <Card title="接收生产订单" subtitle="从本浏览器已录入且可计算的项目中选单，确认交接时的结算规则。"
      action={<button className="button secondary" onClick={back}>返回订单管理</button>}>
      <Picker label="待交接订单" items={choices.map((item) => ({ id: item.id, label: orderLabel(item) }))}
        selected={source} choose={setSource} />
      {!choices.length && <p className="empty-line">暂无待交接项目。请先在订单管理录入零件并生成计算结果。</p>}
      {candidate && <Form key={candidate.id} busy={busy} onSubmit={async (data) => {
        const file = attachment(data, "drawing");
        const ok = await mutate((current) => acceptOrder(current, {
          ...candidate, customer: value(data, "customer"), date: value(data, "date"), terms: value(data, "terms") as Terms,
          drawings: file ? [{ file, addedAt: new Date().toISOString() }] : [],
          lines: candidate.lines.map((line) => ({ ...line, pricing: value(data, "mode-" + line.id) as Pricing, rate: value(data, "rate-" + line.id) })),
        }), "订单已交接，可登记加工进度与送货批次。");
        if (ok) { setSelected(candidate.id); setSource(""); }
        return ok;
      }}>
        <div className="ops-fields">
          <Input label="客户名称" name="customer" initial={candidate.customer} required />
          <Input label="订单日期" name="date" type="date" initial={candidate.date || today()} required />
          <Dropdown label="付款约定" name="terms" options={TERMS.map((term) => [term, term])} />
          <Input label="加工图纸（选填）" name="drawing" type="file" accept="image/*,.pdf,.dwg,.dxf" />
        </div>
        <GridTable headers={["型号", "订购件数", "理论单重 (kg)", "结算方式", "结算单价"]} rows={candidate.lines.map((line) => [
          <span className="ops-spec">{line.number} · {line.spec}</span>, line.ordered, line.weight.toFixed(3),
          <select aria-label={line.number + " 结算方式"} name={"mode-" + line.id} defaultValue={line.pricing}>
            {pricingOptions.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
          </select>,
          <input aria-label={line.number + " 结算单价"} name={"rate-" + line.id} type="number" min="0" step="any" defaultValue={line.rate} required />,
        ])} />
        <button className="button primary ops-submit"><Icon name="check" /> 确认交接</button>
      </Form>}
    </Card>
    <Card title="送货记录" subtitle="按订单、型号登记本批实际件数与实称重量。">
      <Picker label="发货订单" items={state.orders.map((item) => ({ id: item.id, label: orderLabel(item) }))}
        selected={selected} choose={setSelected} />
      {!order && <p className="empty-line">选择一笔已交接订单，查看剩余件数和送货记录。</p>}
      {order && <OrderShipping key={order.id} order={order} state={state} mutate={mutate} busy={busy} />}
    </Card>
  </div>;
}

function OrderShipping({ order, state, mutate, busy }: {
  order: WorkOrder; state: Operations; mutate: Mutate; busy: boolean;
}) {
  const sent = deliveredCounts(state, order.id);
  const records = state.deliveries.filter(({ orderId }) => orderId === order.id).slice().reverse();
  const pending = records.some((record) => !record.confirmedAt);
  const shippingStatus = pending ? "差异待处理" : !records.length ? "待发货" :
    order.lines.every((line) => (sent.get(line.id) ?? 0) >= line.ordered) ? "已发完" : "部分发货";
  const [review, setReview] = useState("");
  const reviewRecord = records.find(({ id }) => id === review);
  return <>
    <div className="ops-context">
      <div><strong>{order.code} · {order.title}</strong><p>{order.customer} · {order.terms} · 图纸 {order.drawing || "—"}</p>
        {order.notes && <p>{order.notes}</p>}</div>
      <div className="buttons"><span className="count">{order.production}</span>
        <span className={pending ? "count caution" : "count"}>{shippingStatus}</span>
        {order.drawings.length > 0 && <Proof file={order.drawings.at(-1)?.file} />}</div>
    </div>
    <details className="ops-details">
      <summary>更新加工进度或补传图纸</summary>
      <Form key={order.production + order.drawings.length} busy={busy} onSubmit={(data) => mutate((current) =>
        setProduction(current, order.id, value(data, "production") as Production, new Date().toISOString(), attachment(data, "drawing")),
      "加工交接记录已更新。")}>
        <div className="ops-fields">
          <Dropdown label="加工进度" name="production" options={PRODUCTION.map((status) => [status, status])} initial={order.production} />
          <Input label="图纸附件（选填）" name="drawing" type="file" accept="image/*,.pdf,.dwg,.dxf" />
        </div>
        <button className="button secondary">保存加工进度</button>
      </Form>
      {!!order.drawings.length && <div className="ops-drawings">
        <h3 className="ops-subtitle">图纸历史</h3>
        <GridTable headers={["版本", "上传时间", "附件"]} rows={order.drawings.map((item, index) => [
          "V" + (index + 1) + (index === order.drawings.length - 1 ? " · 最新" : ""),
          new Date(item.addedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
          <Proof key="file" file={item.file} />,
        ]).reverse()} />
      </div>}
    </details>
    <h3 className="ops-subtitle">新建送货单</h3>
    <p className="muted">计划留空时按本次实发填写。多发或少发时登记说明，处理确认后进入财务结算。</p>
    <Form busy={busy} onSubmit={(data) => mutate((current) => {
      const lines = order.lines.flatMap((line) => {
        const actual = numeric(data, "actual-" + line.id, 0, line.number + " 实发数量", true) ?? 0;
        const planned = numeric(data, "plan-" + line.id, 0, line.number + " 计划数量", true) ?? actual;
        const grams = numeric(data, "kg-" + line.id, 3, line.number + " 实称重量", true);
        return actual || planned || grams !== null ? [{ lineId: line.id, actual, planned, grams }] : [];
      });
      return addDelivery(current, { orderId: order.id, date: value(data, "day"), vehicle: value(data, "vehicle"),
        gross: numeric(data, "gross", 3, "毛重", true), tare: numeric(data, "tare", 3, "皮重", true),
        file: attachment(data, "proof"), notes: value(data, "notes"), lines }, new Date().toISOString());
    }, "送货单已保存。可在下方查看核对状态。")}>
      <div className="ops-fields">
        <Input label="送货日期" name="day" type="date" initial={today()} required />
        <Input label="车牌或运输单号（选填）" name="vehicle" />
        <Input label="车辆毛重 (kg，选填)" name="gross" type="number" min="0" step="any" />
        <Input label="车辆皮重 (kg，选填)" name="tare" type="number" min="0" step="any" />
      </div>
      <GridTable headers={["型号", "订购", "已发", "剩余", "本批计划", "本批实发", "实称 (kg)", "结算方式"]} rows={order.lines.map((line) => {
        const already = sent.get(line.id) ?? 0;
        return [
          <span className="ops-spec">{line.number} · {line.spec}</span>, line.ordered, already, Math.max(0, line.ordered - already),
          <input aria-label={line.number + " 本批计划"} type="number" min="0" step="1" name={"plan-" + line.id} />,
          <input aria-label={line.number + " 本批实发"} type="number" min="0" step="1" name={"actual-" + line.id} />,
          <input aria-label={line.number + " 实称重量"} type="number" min="0" step="any" name={"kg-" + line.id} />,
          line.pricing === "piece" ? "按件" : "按实重",
        ];
      })} />
      <div className="ops-fields">
        <Input label="发货说明" name="notes" placeholder="差异说明或其他备注" />
        <Input label="磅单 / 送货凭证（选填）" name="proof" type="file" accept="image/*,.pdf" />
      </div>
      <button className="button primary ops-submit"><Icon name="plus" /> 保存送货单</button>
    </Form>
    <h3 className="ops-subtitle">本单送货批次</h3>
    <GridTable headers={["送货单号", "日期", "型号明细", "车载净重", "送货金额", "核对状态", "凭证", "操作"]}
      rows={records.map((record): ReactNode[] => [
        record.code, record.date, <DeliveryDetails key={record.id} record={record} order={order} />,
        record.gross !== null && record.tare !== null ? kg(record.gross - record.tare) + " kg" : "—",
        money(deliveryAmount(record)),
        <span key="state" className={record.confirmedAt ? "count" : "count caution"}>{record.confirmedAt ? "已确认" : "差异待处理"}</span>,
        <Proof key="proof" file={record.file} />,
        !record.confirmedAt && <button key="review" className="button secondary compact" onClick={() => setReview(record.id)}>处理差异</button>,
      ])} />
    {reviewRecord && !reviewRecord.confirmedAt && <section className="ops-review">
      <h3>处理送货差异 · {reviewRecord.code}</h3><p>{reviewRecord.notes}</p>
      <Form key={review} busy={busy} onSubmit={async (data) => {
        const ok = await mutate((current) => reviewDelivery(current, review, value(data, "resolution"), new Date().toISOString()),
          "差异处理已记录，送货单可用于结算。");
        if (ok) setReview("");
        return ok;
      }}>
        <div className="ops-fields"><Input label="处理结果" name="resolution" placeholder="例如：客户确认本批按实发结算，剩余下批补发" required /></div>
        <div className="buttons"><button className="button primary">确认按本单结算</button>
          <button type="button" className="button secondary" onClick={() => setReview("")}>取消</button></div>
      </Form>
    </section>}
  </>;
}

function DeliveryDetails({ record, order }: { record: Delivery; order: WorkOrder }) {
  return <details className="ops-delivery-detail">
    <summary>{record.lines.reduce((total, { actual }) => total + actual, 0)} 件 · 查看明细</summary>
    <ul>{record.lines.map((line) => <li key={line.lineId}>
      {order.lines.find(({ id }) => id === line.lineId)?.number} · 计划 {line.planned} · 实发 {line.actual}
      {line.grams === null ? "" : " · " + kg(line.grams) + " kg"} · {money(line.cents)}
    </li>)}</ul>
    {record.notes && <p>{record.notes}</p>}
    {record.resolution && <p>处理结果 · {record.resolution}</p>}
  </details>;
}
