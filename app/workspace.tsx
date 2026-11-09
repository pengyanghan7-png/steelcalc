"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DENSITY, projectTotals, rowsFor, type Part, type Project } from "../lib/calculate";
import { EMPTY_CATALOG, nameKey, optionsFor, priceKey, recordUsage } from "../lib/history";
import { ORDER_HEADERS, orderCells } from "../lib/order";
import { STORAGE_KEY, newDrafts, newPart, newProject, readDrafts, today, type Drafts } from "../lib/projects";
import { Card, Field, Icon, PlateDiagram, SearchField } from "./ui";
import { CalculationDetails, PartEditor } from "./part-editor";

const volumes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weights = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const prices = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const numbers = new Intl.NumberFormat("zh-CN");
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_CUSTOMERS: string[] = [];
type View = "entry" | "results";

export default function Workspace() {
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [selected, select] = useState("");
  const [view, setView] = useState<View>("entry");
  const [validated, setValidated] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [removal, setRemoval] = useState<Part | null>(null);
  const [detailId, setDetailId] = useState("");
  const [importing, setImporting] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const latestDrafts = useRef<Drafts | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectsDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      latestDrafts.current = readDrafts() ?? newDrafts();
      setDrafts(latestDrafts.current);
    } catch {
      latestDrafts.current = newDrafts();
      setDrafts(latestDrafts.current);
      setStorageError("本地项目无法读取。请检查浏览器存储设置。");
    }
    const syncView = () => setView(location.hash === "#results" ? "results" : "entry");
    syncView();
    addEventListener("hashchange", syncView);
    return () => removeEventListener("hashchange", syncView);
  }, []);

  const project = drafts?.projects.find((item) => item.id === drafts.active);
  const rows = project ? rowsFor(project) : [];
  const totals = projectTotals(rows);
  const activeRow = rows.find((row) => row.part.id === selected) ?? rows[0];
  const detailRow = rows.find((row) => row.part.id === detailId);
  const catalog = drafts?.catalog ?? EMPTY_CATALOG;
  const projects = drafts?.projects ?? EMPTY_PROJECTS;
  const addedCustomers = drafts?.addedCustomers ?? EMPTY_CUSTOMERS;
  const history = useMemo(() => optionsFor(catalog, projects, addedCustomers), [catalog, projects, addedCustomers]);

  function save(next: Drafts) {
    latestDrafts.current = next;
    setDrafts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError("本次修改暂未保存。请检查浏览器存储空间与权限。");
    }
  }

  function update(changes: Partial<Project>) {
    if (!drafts || !project) return;
    save({ ...drafts, projects: drafts.projects.map((item) => item.id === project.id ?
      { ...item, results: changes.parts ? undefined : item.results, ...changes } : item) });
  }

  function addCustomer(customer: string) {
    if (!drafts || !project) return;
    const registered = drafts.addedCustomers.some((name) => nameKey(name) === nameKey(customer));
    save({
      ...drafts, addedCustomers: registered ? drafts.addedCustomers : [...drafts.addedCustomers, customer],
      projects: drafts.projects.map((item) => item.id === project.id ? { ...item, customer } : item),
    });
  }

  async function loadHistory(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    setHistoryMessage("正在读取订单表…");
    try {
      const { importHistory } = await import("../lib/import-history");
      const imported = await importHistory(file);
      const current = latestDrafts.current;
      if (current) save({ ...current, catalog: imported });
      setHistoryMessage("已读取 " + numbers.format(imported.customers.length) + " 个客户及 " +
        numbers.format(imported.prices.length) + " 条价格记录。");
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : "历史订单读取失败，请重试。");
    } finally {
      setImporting(false);
    }
  }

  function go(next: View) {
    setView(next);
    if (location.hash !== "#" + next) location.hash = next;
    window.scrollTo(0, 0);
  }

  function showEditor(partId: string) {
    select(partId);
    setNotice("");
    go("entry");
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: "start" }));
  }

  function changePart(partId: string, changes: Partial<Part>) {
    if (project) update({ parts: project.parts.map((part) => part.id === partId ? { ...part, ...changes } : part) });
  }

  function addPart(copy?: Part) {
    if (!project) return;
    const blank = newPart(project.parts);
    const part = copy ? { ...copy, id: blank.id, number: blank.number } : blank;
    update({ parts: [...project.parts, part] });
    showEditor(part.id);
  }

  function switchProject(next?: Project) {
    if (!drafts) return;
    const item = next ?? newProject();
    save({ ...drafts, projects: next ? drafts.projects : [...drafts.projects, item], active: item.id });
    projectsDialog.current?.close();
    select("");
    setValidated(false);
    setNotice("");
    go("entry");
  }

  function openResults() {
    setValidated(true);
    if (!totals) {
      const invalid = rows.find((row) => !row.result);
      if (invalid) showEditor(invalid.part.id);
      setNotice(invalid ? "请修正标红的字段后再查看结果。" :
        rows.length ? "项目合计超出可计算范围，请检查尺寸。" : "请先添加一个零件。");
      return;
    }
    if (project && view === "entry") update({
      usage: recordUsage(project, today()),
      results: rows.flatMap(({ part, result }) => result ? [{ partId: part.id, calculation: result }] : []),
    });
    setNotice("");
    go("results");
  }

  function confirmRemove(part: Part) {
    setRemoval(part);
    deleteDialog.current?.showModal();
  }

  function removePart() {
    if (project && removal) {
      const next = { ...project, parts: project.parts.filter((part) => part.id !== removal.id) };
      if (view === "results") {
        const results = rowsFor(next).flatMap(({ part, result }) => result ? [{ partId: part.id, calculation: result }] : []);
        update({ parts: next.parts, results, usage: recordUsage(next, today()) });
      } else update({ parts: next.parts });
    }
    setRemoval(null);
    deleteDialog.current?.close();
  }

  async function exportExcel() {
    if (!project || !totals || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      const { downloadReport } = await import("../lib/report");
      await downloadReport(project);
      setNotice("Excel 已生成，请查看浏览器下载记录。");
    } catch {
      setNotice("Excel 导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  const partActions = (part: Part, showEdit = false) => <div className="part-actions">
    {showEdit && <>
      <button className="button secondary compact" onClick={() => { setDetailId(part.id); detailDialog.current?.showModal(); }}>查看计算明细</button>
      <button className="button secondary compact" aria-label={"编辑 " + part.number} onClick={() => showEditor(part.id)}>编辑</button>
    </>}
    <button className="icon-button" aria-label={"复制 " + part.number} title="复制零件" onClick={() => addPart(part)}><Icon name="copy" /></button>
    <button className="icon-button danger" aria-label={"删除 " + part.number} title="删除零件" onClick={() => confirmRemove(part)}><Icon name="trash" /></button>
  </div>;

  return <>
    <header className="top">
      <div className="top-inner">
        <div className="brand"><span className="brand-mark"><Icon name="plate" size={23} /></span><span><strong>SteelCalc</strong><small>钢板重量计算</small></span></div>
        <button className="button top-button" disabled={!project} onClick={() => projectsDialog.current?.showModal()}><Icon name="folder" /> 本地项目</button>
      </div>
    </header>
    <main>
      <nav aria-label="计算流程" className="steps">
        <button aria-current={view === "entry" ? "step" : undefined} onClick={() => { setNotice(""); go("entry"); }}><span>01</span> 零件录入</button>
        <Icon name="right" size={14} />
        <button aria-current={view === "results" ? "step" : undefined} disabled={!project} onClick={openResults}><span>02</span> 结果复核</button>
      </nav>
      <div className="heading">
        <div>
          <p className="eyebrow"><span /> 订单计算工作台</p>
          <h1>{view === "entry" ? "钢板与贯穿孔" : "计算结果"}</h1>
          <p>{view === "entry" ? "按图纸填写钢板和孔的尺寸，计算每件钢板的净体积与重量。" :
            (project?.name.trim() || "未命名项目") + (project?.customer ? "  /  " + project.customer : "")}</p>
        </div>
        <div className="density"><span>固定钢材密度</span><strong>{DENSITY} <small>g/cm³</small></strong></div>
      </div>
      {storageError && <p className="alert" role="alert">{storageError}</p>}
      {!project ? <p role="status">正在读取本地项目…</p> : view === "entry" ? <>
        <div className="entry-grid">
          <div className="stack">
            <Card title="项目信息" subtitle="选填 · 历史表在当前浏览器中读取"
              action={<button className="button secondary compact" disabled={importing} onClick={() => fileInput.current?.click()}>
                <Icon name="upload" size={15} /> {importing ? "正在导入…" : "导入历史订单 Excel"}</button>}>
              <input ref={fileInput} hidden type="file" accept=".xlsx" onChange={(event) => {
                void loadHistory(event.target.files?.[0]);
                event.target.value = "";
              }} />
              {historyMessage && <p className="status" role="status">{historyMessage}</p>}
              <div className="field-grid project-fields">
                <Field label="项目 / 订单名称" value={project.name} placeholder="例如：机架底板订单" onChange={(name) => update({ name })} />
                <SearchField label="客户名称" value={project.customer} placeholder="搜索历史客户或输入新客户"
                  options={history.customers.map((item) => ({
                    name: item.name, detail: [item.lastUsed, item.count ? numbers.format(item.count) + " 次" : ""].filter(Boolean).join(" · "),
                  }))} onChange={(customer) => update({ customer })} onAdd={addCustomer} />
                <Field label="图纸编号" value={project.drawing} placeholder="填写项目图号" onChange={(drawing) => update({ drawing })} />
                <Field label="计算日期" type="date" value={project.date} onChange={(date) => update({ date })} />
                <Field label="项目备注" wide value={project.notes} placeholder="填写本批零件的说明" onChange={(notes) => update({ notes })} />
              </div>
            </Card>
            <div className="editor-anchor" ref={editor}>
              <Card title={activeRow ? "零件参数" : "添加首个零件"} subtitle={activeRow ? "填写零件类型、订单数量和计价信息" : "一个订单可录入多件钢板。"}>
                {notice && <p className="alert" role="alert">{notice}</p>}
                {activeRow ? <PartEditor part={activeRow.part} errors={validated ? activeRow.errors : undefined}
                  finishes={history.finishes} customer={project.customer}
                  suggestions={history.prices.get(priceKey(project.customer, activeRow.part.finish, activeRow.part.billing)) ?? []}
                  update={(changes) => changePart(activeRow.part.id, changes)} /> :
                  <button className="button primary" onClick={() => addPart()}><Icon name="plus" /> 添加零件</button>}
              </Card>
            </div>
          </div>
          <aside className="stack">
            <Card title="订单零件" action={<span className="count">{rows.length} 件</span>}>
              <div className="part-list">
                {rows.map(({ part, result, errors }) => <div className="part-item" key={part.id} data-active={part.id === activeRow?.part.id}>
                  <button className="part-select" aria-pressed={part.id === activeRow?.part.id} onClick={() => { select(part.id); setNotice(""); }}>
                    <span className="part-glyph"><Icon name="plate" size={18} /></span>
                    <span><strong>{part.number || "未编号"}</strong><small>{result ? weights.format(result.totalWeight) + " kg · " + result.quantity + " 件" : validated && errors ? "待修正" : "待填写"}</small></span>
                  </button>
                  {partActions(part)}
                </div>)}
                {!rows.length && <p className="muted">订单还没有零件。</p>}
              </div>
              <button className="button secondary full" onClick={() => addPart()}><Icon name="plus" /> 添加零件</button>
            </Card>
            <section className="reference">
              <div className="reference-label"><span>尺寸示意</span><small>图 01</small></div>
              <PlateDiagram />
              <p>适用矩形钢板。圆孔与方孔均按贯穿板厚计算，孔位及孔重叠需对照图纸复核。</p>
            </section>
            <section className="estimate">
              <span>当前零件理论总净重</span>
              <div><strong>{activeRow?.result ? weights.format(activeRow.result.totalWeight) : "—"}</strong> kg</div>
              <small>{activeRow?.result ? "单件 " + weights.format(activeRow.result.weight) + " kg × " + activeRow.result.quantity + " 件 · " + activeRow.result.method : "填写参数后显示"}</small>
            </section>
          </aside>
        </div>
        <div className="action-bar"><span><Icon name={storageError ? "folder" : "check"} /> {storageError ? "浏览器存储异常" : "修改自动保存在此浏览器"}</span><button className="button primary" onClick={openResults}>生成计算结果 <Icon name="right" /></button></div>
      </> : <>
        <div className="metrics">
          <Metric title="零件记录" value={String(rows.length)} unit="行" />
          <Metric title="订单数量合计" value={totals ? numbers.format(totals.quantity) : "—"} unit="件" />
          <Metric title="标准板净体积合计" value={totals ? volumes.format(totals.net) : "—"} unit="mm³" />
          <Metric title="人工填写记录" value={String(rows.filter(({ part }) => part.kind !== "plate").length)} unit="行" />
          <Metric title="理论总净重合计" value={totals ? weights.format(totals.weight) : "—"} unit="kg" emphasized />
        </div>
        <Card title="生产订单表" subtitle="按订单数量汇总重量。手工录入的重量会标记为「人工填写」。" action={<div className="buttons">
          <button className="button secondary" onClick={() => addPart()}><Icon name="plus" /> 添加零件</button>
          <button className="button primary" disabled={!totals || exporting} onClick={exportExcel}><Icon name="download" /> {exporting ? "正在生成…" : "导出 Excel"}</button>
        </div>}>
          {!totals && <p role="alert" className="alert">{rows.length ? "请返回录入页修正零件数据或项目合计后再导出。" : "请添加零件后再导出。"}</p>}
          {notice && <p role="status" className="status">{notice}</p>}
          <div className="table-wrap" tabIndex={0} aria-label="生产订单表，可横向滚动">
            <table>
              <thead><tr>{ORDER_HEADERS.map((header) => <th scope="col" key={header}>{header}</th>)}<th scope="col" className="table-actions">操作</th></tr></thead>
              <tbody>{rows.map(({ part, result }) => <tr key={part.id}>
                {orderCells(project, part, result).map((cell, index) => index === 2 ?
                  <th className="table-notes table-spec" scope="row" key={index}>{cell || "—"}
                    <small className="part-ref">{part.number || "未编号"}
                      {result?.method === "人工填写" && <span className="manual-tag">人工填写</span>}</small></th> :
                  <td key={index} className={index === 8 ? "weight-cell" :
                    index === 3 ? "table-notes table-holes" : [11, 13].includes(index) ? "table-notes" : index === 14 ? "weight-source" : undefined}>
                    {displayOrderCell(cell, index)}</td>)}
                <td className="table-actions">{partActions(part, true)}</td>
              </tr>)}</tbody>
              {totals && <tfoot><tr><th scope="row" colSpan={4}>订单合计</th><td>{numbers.format(totals.quantity)}</td>
                <td colSpan={3} /><td>{weights.format(totals.weight)}</td><td colSpan={7} /></tr></tfoot>}
            </table>
          </div>
        </Card>
        <div className="action-bar"><button className="button secondary" onClick={() => { setNotice(""); go("entry"); }}><Icon name="left" /> 返回零件录入</button><span>Excel 包含生产订单表与计算明细</span></div>
      </>}
      <footer><span>SteelCalc · V1.1</span><span>长度 mm　/　体积 mm³　/　重量 kg</span></footer>
    </main>
    <dialog ref={projectsDialog} aria-labelledby="projects-title">
      <div className="dialog-head"><h2 id="projects-title">本地项目</h2><button className="icon-button" aria-label="关闭本地项目" onClick={() => projectsDialog.current?.close()}><Icon name="close" /></button></div>
      <p className="muted">选择继续编辑的项目，或新建订单。</p>
      <div className="saved-list">{drafts?.projects.map((item) => <button key={item.id} onClick={() => switchProject(item)}>
        <span><strong>{item.name.trim() || "未命名项目"}</strong><small>{item.date || "未填写日期"} · {item.parts.length} 件</small></span>
        {item.id === drafts.active && <span className="count">当前项目</span>}
      </button>)}</div>
      <button className="button primary full" onClick={() => switchProject()}><Icon name="plus" /> 新建项目</button>
    </dialog>
    <dialog ref={detailDialog} className="detail-dialog" aria-labelledby="detail-title">
      <div className="dialog-head"><h2 id="detail-title">计算明细 {detailRow?.part.number}</h2>
        <button className="icon-button" aria-label="关闭计算明细" onClick={() => detailDialog.current?.close()}><Icon name="close" /></button></div>
      {project && detailRow && <CalculationDetails part={detailRow.part} result={detailRow.result} drawing={project.drawing} />}
    </dialog>
    <dialog ref={deleteDialog} aria-labelledby="delete-title">
      <div className="dialog-head"><h2 id="delete-title">删除零件</h2><button className="icon-button" aria-label="关闭删除确认" onClick={() => deleteDialog.current?.close()}><Icon name="close" /></button></div>
      <p>确认从当前订单删除 {removal?.number || "此零件"}？</p>
      <div className="buttons"><button className="button secondary" onClick={() => deleteDialog.current?.close()}>取消</button>
        <button className="button destructive" onClick={removePart}>确认删除</button></div>
    </dialog>
  </>;
}

function Metric({ title, value, unit, emphasized }: { title: string; value: string; unit: string; emphasized?: boolean }) {
  return <div className={"metric" + (emphasized ? " emphasized" : "")}><span>{title}</span><strong>{value} <small>{unit}</small></strong></div>;
}

function displayOrderCell(cell: string | number | null, index: number) {
  if (typeof cell !== "number") return cell || "—";
  if (index === 6) return volumes.format(cell);
  if (index === 7 || index === 8) return weights.format(cell);
  if (index === 10) return prices.format(cell);
  return numbers.format(cell);
}
