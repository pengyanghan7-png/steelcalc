import { useState } from "react";
import { addReceipt, addReduction, addStatement, availableMonthly, bills, CHANNELS, clientKey, confirmReceipt,
  deliveryAmount, money, type Bill, type Channel, type Operations } from "../lib/operations";
import { today } from "../lib/projects";
import { attachment, Dropdown, Form, GridTable, Input, numeric, Picker, Proof, value, type Mutate } from "./operations-ui";
import { Card, Icon } from "./ui";

export function Finance({ state, mutate, busy }: { state: Operations; mutate: Mutate; busy: boolean }) {
  const [selected, choose] = useState("");
  const list = bills(state).slice().reverse();
  const bill = list.find(({ id }) => id === selected);
  return <div className="stack">
    <Monthly state={state} mutate={mutate} busy={busy} />
    <Card title="财务到账" subtitle="选择已确认送货单或月结对账单，登记后核对实际到账流水。">
      <Picker label="结算单" selected={selected} choose={choose} items={list.map((item) => ({
        id: item.id, label: [item.code, item.customer, item.month ? item.month + " 月结" : item.date + " 送货单"].join(" · "),
      }))} />
      {!bill && <p className="empty-line">现款、货到付款按确认后的送货单选单。月结客户先生成对账单。</p>}
      {bill && <BillDetails key={bill.id} bill={bill} state={state} mutate={mutate} busy={busy} />}
    </Card>
  </div>;
}

function Monthly({ state, mutate, busy }: { state: Operations; mutate: Mutate; busy: boolean }) {
  const [customer, setCustomer] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selected, setSelected] = useState<string[]>([]);
  const orderMap = new Map(state.orders.map((order) => [order.id, order]));
  const customers = [...new Map(state.orders.filter(({ terms }) => terms === "月结")
    .map(({ customer }) => [clientKey(customer), customer])).values()];
  const eligible = availableMonthly(state).filter((item) => item.date.startsWith(month + "-") &&
    clientKey(orderMap.get(item.orderId)!.customer) === clientKey(customer));
  const selectedItems = eligible.filter(({ id }) => selected.includes(id));
  return <Card title="月结对账" subtitle="把同一客户、同一送货月份的已确认送货单汇成一张对账单。">
    <Form busy={busy} onSubmit={async (data) => {
      const ok = await mutate((current) => addStatement(current, {
        customer, month, due: value(data, "due"), deliveryIds: selectedItems.map(({ id }) => id),
      }), "月结对账单已生成，可在财务到账中选择。");
      if (ok) setSelected([]);
      return ok;
    }}>
      <div className="ops-fields">
        <label className="field"><span>月结客户</span>
          <select value={customer} onChange={(event) => { setCustomer(event.target.value); setSelected([]); }} required>
            <option value="">请选择客户</option>{customers.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="field ops-field"><span>送货月份</span>
          <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelected([]); }} required />
        </label>
        <Input label="付款截止日" name="due" type="date" required />
      </div>
      <GridTable headers={["纳入", "送货单号", "订单", "送货日期", "金额"]} empty="当前客户与月份下暂无可纳入的送货单。"
        rows={eligible.map((item) => [
          <input key="selected" type="checkbox" aria-label={"选择送货单 " + item.code}
            checked={selected.includes(item.id)} onChange={(event) => {
              setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id));
            }} />, item.code, orderMap.get(item.orderId)?.code, item.date, money(deliveryAmount(item)),
        ])} />
      <div className="ops-form-action"><span>已选 {selectedItems.length} 张 · {money(selectedItems.reduce((sum, item) => sum + deliveryAmount(item), 0))}</span>
        <button className="button primary" disabled={!selectedItems.length}>生成月结对账单</button></div>
    </Form>
  </Card>;
}

function BillDetails({ bill, state, mutate, busy }: { bill: Bill; state: Operations; mutate: Mutate; busy: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const receipt = bill.receipts.find(({ id, confirmedAt }) => id === confirmation && !confirmedAt);
  const balanceLabel = bill.balance < 0 ? "超收待核对" : bill.balance === 0 ? "已结清" :
    bill.due && bill.due < today() ? "已逾期" : "待收款";
  const deliveries = bill.deliveryIds.map((id) => state.deliveries.find((item) => item.id === id)).filter(Boolean);
  return <>
    <div className="ops-context">
      <div><strong>{bill.code} · {bill.customer}</strong>
        <p>关联送货单 {deliveries.map((item) => item?.code).join("、")}</p>
        {bill.due && <p>付款截止日 {bill.due}</p>}
      </div>
      <span className={bill.balance === 0 ? "count" : "count caution"}>{balanceLabel}</span>
    </div>
    <div className="ops-metrics">
      {[
        ["原应收", bill.cents], ["已确认到账", bill.received], ["待核实款", bill.pending],
        ["尾差减免", bill.reduced], [bill.balance < 0 ? "超收金额" : "待收余额", Math.abs(bill.balance)],
      ].map(([label, amount]) => <div className="metric" key={label}><span>{label}</span><strong>{money(Number(amount))}</strong></div>)}
    </div>
    <div className="ops-pair">
      <section className="ops-review">
        <h3>登记收款凭证</h3>
        <Form busy={busy} onSubmit={(data) => mutate((current) => addReceipt(current, {
          billId: bill.id, date: value(data, "date"), channel: value(data, "channel") as Channel, reference: value(data, "reference"),
          cents: numeric(data, "amount", 2, "收款金额")!, file: attachment(data, "proof"),
        }), "收款已登记为待核实。")}>
          <div className="ops-fields">
            <Input label="实际到账日期" name="date" type="date" initial={today()} required />
            <Dropdown label="收款渠道" name="channel" options={CHANNELS.map((channel) => [channel, channel])} />
            <Input label="流水号或凭证号" name="reference" required />
            <Input label="收款金额 (元)" name="amount" type="number" step="0.01" min="0.01" required />
            <Input label="付款凭证（选填）" name="proof" type="file" accept="image/*,.pdf" />
          </div>
          <button className="button primary"><Icon name="plus" /> 登记待核实收款</button>
        </Form>
      </section>
      <section className="ops-review">
        <h3>登记尾差减免</h3>
        <p className="muted">单独保留减免金额和原因，原应收与实收继续可查。</p>
        <Form busy={busy || bill.balance <= 0} onSubmit={(data) => mutate((current) => addReduction(current, {
          billId: bill.id, date: value(data, "date"), cents: numeric(data, "amount", 2, "减免金额")!, reason: value(data, "reason"),
        }), "尾差减免已登记。")}>
          <div className="ops-fields">
            <Input label="减免日期" name="date" type="date" initial={today()} required />
            <Input label="减免金额 (元)" name="amount" type="number" step="0.01" min="0.01" required />
            <Input label="减免原因" name="reason" required />
          </div>
          <button className="button secondary">保存尾差减免</button>
        </Form>
      </section>
    </div>
    <h3 className="ops-subtitle">收款记录</h3>
    <GridTable headers={["实际到账日期", "收款渠道", "流水号或凭证号", "金额", "状态", "凭证", "操作"]}
      rows={bill.receipts.slice().reverse().map((item) => [
        item.date, item.channel, item.reference, money(item.cents),
        <span key="state" className={item.confirmedAt ? "count" : "count caution"}>{item.confirmedAt ? "已确认到账" : "待核实"}</span>,
        <Proof key="proof" file={item.file} />,
        !item.confirmedAt && <button key="action" className="button secondary compact" onClick={() => setConfirmation(item.id)}>核实到账</button>,
      ])} />
    {receipt && <section className="ops-review" aria-label="确认到账">
      <h3>核实实际到账</h3><p>{receipt.channel} · {receipt.reference} · {money(receipt.cents)}</p>
      <p className="muted">请与实际流水核对渠道、编号和金额。</p>
      <div className="buttons">
        <button className="button primary" disabled={busy} onClick={async () => {
          if (await mutate((current) => confirmReceipt(current, receipt.id, new Date().toISOString()), "到账已确认，待收余额已更新。")) setConfirmation("");
        }}>流水一致，确认到账</button>
        <button className="button secondary" onClick={() => setConfirmation("")}>取消</button>
      </div>
    </section>}
    {!!bill.reductions.length && <>
      <h3 className="ops-subtitle">尾差减免记录</h3>
      <GridTable headers={["日期", "原因", "金额"]} rows={bill.reductions.map((item) => [item.date, item.reason, money(item.cents)])} />
    </>}
  </>;
}
