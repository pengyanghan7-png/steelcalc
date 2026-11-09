"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../lib/calculate";
import { clientKey, deliveryAmount, makeOrder, money, operationsSummary, type Operations, type Scope } from "../lib/operations";
import { readOperations, updateOperations } from "../lib/operations-store";
import { today } from "../lib/projects";
import { Finance } from "./operations-finance";
import { orderLabel, Shipping } from "./operations-shipping";
import { GridTable, Picker, type Mutate } from "./operations-ui";
import { Card, Field, Icon } from "./ui";

export type Section = "shipments" | "finance" | "reports";
export const SECTIONS: Record<Section, string> = {
  shipments: "发货记录", finance: "财务到账", reports: "统计与导出",
};
const descriptions: Record<Section, string> = {
  shipments: "接收订单，登记加工进度与每批送货，按型号核对件数和重量。",
  finance: "按送货单结算，核实回款并记录尾差减免。",
  reports: "按客户、订单或期间查看经营数据，并导出 Excel。",
};

export default function OperationsDesk({ section, projects, preferred, back }: {
  section: Section; projects: Project[]; preferred: string; back: () => void;
}) {
  const [state, setState] = useState<Operations>();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const candidates = useMemo(() => projects.flatMap((project) => {
    const order = makeOrder(project);
    return order ? [order] : [];
  }), [projects]);

  useEffect(() => {
    let mounted = true;
    const reload = () => {
      if (inFlight.current) return;
      readOperations().then((data) => { if (mounted) setState(data); }).catch(() => {
        if (mounted) setMessage({ text: "无法读取本地工作台，请检查浏览器存储设置后刷新。", error: true });
      });
    };
    reload();
    addEventListener("focus", reload);
    return () => { mounted = false; removeEventListener("focus", reload); };
  }, []);

  useEffect(() => setMessage(undefined), [section]);

  const mutate: Mutate = async (update, text) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      setState(await updateOperations(update));
      setMessage({ text });
      return true;
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "保存失败，请重试。", error: true });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <>
    <div className="heading ops-heading">
      <div><p className="eyebrow"><span /> 员工工作台</p><h1>{SECTIONS[section]}</h1><p>{descriptions[section]}</p></div>
      <span className="count">本机工作台</span>
    </div>
    {message && <div className={message.error ? "alert ops-message" : "status ops-message"}
      role={message.error ? "alert" : "status"}><span>{message.text}</span>
      <button className="icon-button" aria-label="关闭提示" onClick={() => setMessage(undefined)}><Icon name="close" size={15} /></button>
    </div>}
    {state ? section === "shipments" ? <Shipping key={preferred} state={state} candidates={candidates} preferred={preferred}
      mutate={mutate} busy={busy} back={back} /> : section === "finance" ? <Finance state={state} mutate={mutate} busy={busy} /> :
      <Reports state={state} /> : !message && <p role="status">正在读取本地工作台…</p>}
  </>;
}

function Reports({ state }: { state: Operations }) {
  const [scope, setScope] = useState<Scope>({ customer: "", orderId: "", from: "", to: "" });
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const customers = [...new Map(state.orders.map(({ customer }) => [clientKey(customer), customer])).values()];
  const orders = state.orders.filter(({ customer }) => !scope.customer || clientKey(customer) === clientKey(scope.customer));
  const invalid = !!(scope.from && scope.to && scope.from > scope.to);
  const summary = useMemo(() => operationsSummary(state, scope), [state, scope]);

  function preset(quarter: boolean) {
    const date = today();
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const first = quarter ? Math.floor((month - 1) / 3) * 3 + 1 : month;
    const last = quarter ? first + 2 : month;
    const end = new Date(Date.UTC(year, last, 0)).toISOString().slice(0, 10);
    setScope({ ...scope, from: year + "-" + String(first).padStart(2, "0") + "-01", to: end });
  }

  async function download() {
    setExporting(true);
    setNotice("");
    try {
      const { exportOperations } = await import("../lib/operations-report");
      await exportOperations(state, scope);
      setNotice("Excel 已生成，请查看浏览器下载记录。");
    } catch {
      setNotice("Excel 导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  return <div className="stack">
    <Card title="统计范围" subtitle="期间数字按送货、到账和减免各自的登记日期计算。待收显示当前余额。"
      action={<button className="button primary" disabled={invalid || exporting || !summary.orders.length} onClick={download}>
        <Icon name="download" /> {exporting ? "正在导出…" : "导出经营 Excel"}</button>}>
      <div className="ops-fields">
        <label className="field"><span>客户</span>
          <select value={scope.customer} onChange={(event) => setScope({ ...scope, customer: event.target.value, orderId: "" })}>
            <option value="">全部客户</option>{customers.map((customer) => <option key={customer}>{customer}</option>)}
          </select>
        </label>
        <Field label="开始日期" type="date" value={scope.from} onChange={(from) => setScope({ ...scope, from })} />
        <Field label="结束日期" type="date" value={scope.to} onChange={(to) => setScope({ ...scope, to })} />
      </div>
      <Picker label="订单" selected={scope.orderId} choose={(orderId) => setScope({ ...scope, orderId })} empty="全部订单"
        items={orders.map((order) => ({ id: order.id, label: orderLabel(order) }))} />
      <div className="buttons">
        <button className="button secondary compact" onClick={() => preset(false)}>本月</button>
        <button className="button secondary compact" onClick={() => preset(true)}>本季度</button>
        <button className="button secondary compact" onClick={() => setScope({ ...scope, from: "", to: "" })}>全部日期</button>
      </div>
      {invalid && <p className="alert ops-inline-alert" role="alert">开始日期须在结束日期当天或之前。</p>}
      {notice && <p className="status ops-inline-alert" role="status">{notice}</p>}
    </Card>
    {!invalid && <Card title="经营汇总" subtitle="送货应收采用已确认送货单。待核实款单列，当前待收含尚未出月结单的已确认送货。">
      <div className="ops-metrics">
        {[
          ["期间实发", summary.units + " 件"], ["期间送货应收", money(summary.owed)],
          ["期间已确认到账", money(summary.actual)], ["期间待核实款", money(summary.pending)],
          ["期间尾差减免", money(summary.reduced)], ["当前待收", money(summary.outstanding)],
        ].map(([title, amount]) => <div className="metric" key={title}><span>{title}</span><strong>{amount}</strong></div>)}
      </div>
      {!!summary.sharedBills && <p className="alert">有 {summary.sharedBills} 张月结单覆盖多笔订单。切换到客户范围可查看这些单据的完整回款与余额。</p>}
      <p className="empty-line">范围内有 {summary.orders.length} 笔订单、{summary.deliveries.length} 张送货单，
        {summary.discrepancies} 张送货差异待处理。</p>
      <h3 className="ops-subtitle">送货单</h3>
      <GridTable headers={["送货单号", "订单", "日期", "实发件数", "送货金额", "核对状态"]}
        rows={summary.deliveries.map((item) => [
          item.code, summary.orders.find(({ id }) => id === item.orderId)?.code, item.date,
          item.lines.reduce((total, line) => total + line.actual, 0), money(deliveryAmount(item)), item.confirmedAt ? "已确认" : "差异待处理",
        ])} />
      <h3 className="ops-subtitle">当前结算单</h3>
      <GridTable headers={["结算单号", "客户", "付款截止日", "原应收", "已确认到账", "尾差减免", "当前余额"]}
        rows={summary.selectedBills.map((bill) => [bill.code, bill.customer, bill.due || "—", money(bill.cents),
          money(bill.received), money(bill.reduced), money(bill.balance)])} />
    </Card>}
  </div>;
}
