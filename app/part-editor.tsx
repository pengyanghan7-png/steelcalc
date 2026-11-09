import { BILLING, PART_TYPES, TAX, type Part, type Result } from "../lib/calculate";
import type { PriceUse } from "../lib/history";
import { holeGroups } from "../lib/order";
import { id } from "../lib/projects";
import { Field, Icon, SearchField, SelectField } from "./ui";

type EditorProps = {
  part: Part;
  errors?: Record<string, string>;
  update: (changes: Partial<Part>) => void;
  finishes: string[];
  customer: string;
  suggestions: PriceUse[];
};

const types = Object.entries(PART_TYPES) as [Part["kind"], string][];
const billingOptions = [["", "请选择计价方式"], ["kg", BILLING.kg], ["piece", BILLING.piece]] as const;
const taxOptions = [["", "未填写"], ["included", TAX.included], ["excluded", TAX.excluded]] as const;

export function PartEditor({ part, errors, update, finishes, customer, suggestions }: EditorProps) {
  return <>
    <div className="field-grid project-fields">
      <Field label="零件编号" value={part.number} error={errors?.number} onChange={(number) => update({ number })} />
      <Field label="零件图号" value={part.drawing} placeholder="留空时使用项目图纸编号" onChange={(drawing) => update({ drawing })} />
      <SelectField label="零件类型" value={part.kind} options={types} onChange={(kind) => update({ kind })} />
      <Field label="订单数量" value={part.quantity} type="number" integer unit="件" error={errors?.quantity} onChange={(quantity) => update({ quantity })} />
      <Field label="规格型号" value={part.spec} placeholder={part.kind === "plate" ? "留空时使用长 × 宽 × 厚" : "按图纸填写规格说明"}
        error={errors?.spec} onChange={(spec) => update({ spec })} />
      <SearchField label="表面处理" value={part.finish} options={finishes.map((name) => ({ name }))}
        placeholder="选择预设或直接输入" onChange={(finish) => update({ finish })} />
    </div>
    {part.kind === "plate" ? <PlateFields part={part} errors={errors} update={update} /> : <div className="manual-block">
      <p><strong>人工填写</strong> · 请按图纸或实测数据填写单件净重。</p>
      <div className="field-grid project-fields">
        <Field label="单件净重" unit="kg" type="number" value={part.manualWeight} error={errors?.manualWeight} onChange={(manualWeight) => update({ manualWeight })} />
        <Field label="开孔说明" value={part.manualHoles} placeholder="选填，例如：两侧各 1 个圆孔" onChange={(manualHoles) => update({ manualHoles })} />
      </div>
    </div>}
    {errors?.volume && <p className="alert" role="alert">{errors.volume}</p>}
    <div className="pricing">
      <div className="hole-head"><h3>计价信息</h3><small>选填</small></div>
      <div className="field-grid project-fields">
        <SelectField label="计价方式" value={part.billing} options={billingOptions} error={errors?.billing} onChange={(billing) => update({ billing })} />
        <Field label="单价" unit="元" type="number" value={part.price} error={errors?.price} onChange={(price) => update({ price })} />
        <SelectField label="是否含税" value={part.tax} options={taxOptions} onChange={(tax) => update({ tax })} />
        <Field label="价格备注" value={part.priceNotes} placeholder="例如：含运费" onChange={(priceNotes) => update({ priceNotes })} />
      </div>
      {customer.trim() && part.finish.trim() && part.billing ? <section className="price-history" aria-label="历史单价">
        <h4>该组合最近使用的单价</h4>
        {suggestions.length ? <ul>{suggestions.map((item) => <li key={[item.date, item.price, item.tax].join("|")}>
          <div><strong>{item.price} {BILLING[item.billing]}</strong>
            <small>{item.date}{item.tax ? " · " + TAX[item.tax] : ""}{item.notes ? " · " + item.notes : ""}</small></div>
          <button className="button secondary compact" onClick={() => update({ price: String(item.price) })}>使用该单价</button>
        </li>)}</ul> : <p>这个组合暂无可用历史单价，可以直接输入。</p>}
      </section> : <p className="empty-line">填写客户、表面处理和计价方式后，会显示该组合最近 3 条单价。</p>}
    </div>
    <Field label="零件备注" value={part.notes} placeholder="填写该零件的加工说明" onChange={(notes) => update({ notes })} />
  </>;
}

function PlateFields({ part, errors, update }: Pick<EditorProps, "part" | "errors" | "update">) {
  return <>
    <div className="field-grid dimension-fields">
      <Field label="板长" unit="mm" type="number" placeholder="输入长度" value={part.length} error={errors?.length} onChange={(length) => update({ length })} />
      <Field label="板宽" unit="mm" type="number" placeholder="输入宽度" value={part.width} error={errors?.width} onChange={(width) => update({ width })} />
      <Field label="板厚" unit="mm" type="number" placeholder="输入厚度" value={part.thickness} error={errors?.thickness} onChange={(thickness) => update({ thickness })} />
    </div>
    <div className="holes">
      <div className="hole-head"><h3><Icon name="circle" /> 圆形贯穿孔</h3><button className="button secondary compact" onClick={() => update({ circles: [...part.circles, { id: id(), diameter: "", quantity: "1" }] })}><Icon name="plus" size={15} /> 添加圆孔</button></div>
      {part.circles.length ? part.circles.map((hole, index) => <div className="hole-row circle-row" key={hole.id}>
        <span className="hole-index">{index + 1}</span>
        <Field label="孔径" unit="mm" type="number" value={hole.diameter} error={errors?.[hole.id + ".diameter"]} onChange={(diameter) => update({ circles: part.circles.map((item) => item.id === hole.id ? { ...item, diameter } : item) })} />
        <Field label="数量" unit="个" type="number" integer value={hole.quantity} error={errors?.[hole.id + ".quantity"]} onChange={(quantity) => update({ circles: part.circles.map((item) => item.id === hole.id ? { ...item, quantity } : item) })} />
        <button className="icon-button danger" aria-label={"删除第 " + (index + 1) + " 组圆孔"} onClick={() => update({ circles: part.circles.filter((item) => item.id !== hole.id) })}><Icon name="trash" /></button>
      </div>) : <p className="empty-line">未添加圆孔。相同孔径可以合为一组填写数量。</p>}
    </div>
    <div className="holes">
      <div className="hole-head"><h3><Icon name="square" /> 方形 / 矩形贯穿孔</h3><button className="button secondary compact" onClick={() => update({ rectangles: [...part.rectangles, { id: id(), length: "", width: "", quantity: "1" }] })}><Icon name="plus" size={15} /> 添加方孔</button></div>
      {part.rectangles.length ? part.rectangles.map((hole, index) => <div className="hole-row rectangle-row" key={hole.id}>
        <span className="hole-index">{index + 1}</span>
        <Field label="孔长" unit="mm" type="number" value={hole.length} error={errors?.[hole.id + ".length"]} onChange={(length) => update({ rectangles: part.rectangles.map((item) => item.id === hole.id ? { ...item, length } : item) })} />
        <Field label="孔宽" unit="mm" type="number" value={hole.width} error={errors?.[hole.id + ".width"]} onChange={(width) => update({ rectangles: part.rectangles.map((item) => item.id === hole.id ? { ...item, width } : item) })} />
        <Field label="数量" unit="个" type="number" integer value={hole.quantity} error={errors?.[hole.id + ".quantity"]} onChange={(quantity) => update({ rectangles: part.rectangles.map((item) => item.id === hole.id ? { ...item, quantity } : item) })} />
        <button className="icon-button danger" aria-label={"删除第 " + (index + 1) + " 组方孔"} onClick={() => update({ rectangles: part.rectangles.filter((item) => item.id !== hole.id) })}><Icon name="trash" /></button>
      </div>) : <p className="empty-line">未添加方孔。正方形孔可填写相同的孔长与孔宽。</p>}
    </div>
  </>;
}

const volume = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weight = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function CalculationDetails({ part, result, drawing }: { part: Part; result?: Result; drawing: string }) {
  if (!result) return <p className="alert">请先修正该零件的数据。</p>;
  const holes = holeGroups(part);
  const auto = result.method === "自动计算";
  const vol = (value: number | null) => value === null ? "—" : volume.format(value) + " mm³";
  const mass = (value: number | null) => value === null ? "—" : weight.format(value) + " kg";
  const rows = [
    ["零件类型", PART_TYPES[part.kind]], ["重量来源", result.method],
    ["图纸编号", part.drawing || drawing || "—"], ["订单数量", result.quantity + " 件"],
    ["长 × 宽 × 厚", auto ? [result.length, result.width, result.thickness].join(" × ") + " mm" : "—"],
    ["规格说明", part.spec || "—"],
    ...(auto ? [["圆孔分组", holes.circles || "无"], ["方孔分组", holes.rectangles || "无"]] :
      [["开孔说明", part.manualHoles || "—"]]),
    ["单件毛体积", vol(result.gross)], ["圆孔扣除体积", vol(result.circleVolume)],
    ["方孔扣除体积", vol(result.rectangleVolume)], ["合计扣除体积", vol(result.removed)], ["单件净体积", vol(result.net)],
    ["单件毛重", mass(result.grossWeight)], ["单件净重", mass(result.weight)],
    ["理论总净重", mass(result.totalWeight)],
  ];
  return <dl className="detail-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
