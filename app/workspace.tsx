"use client";

import { useEffect, useRef, useState } from "react";
import { DENSITY, HEADERS, projectTotals, rowsFor, type Part, type Project } from "../lib/calculate";
import { STORAGE_KEY, id, newPart, newProject, readDrafts, type Drafts } from "../lib/projects";
import { Card, Field, Icon, PlateDiagram } from "./ui";

const volumes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weights = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
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
  const projectsDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = readDrafts();
      if (saved) setDrafts(saved);
      else {
        const blank = newProject();
        setDrafts({ projects: [blank], active: blank.id });
      }
    } catch {
      const blank = newProject();
      setDrafts({ projects: [blank], active: blank.id });
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

  function save(next: Drafts) {
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
    save({ ...drafts, projects: drafts.projects.map((item) => item.id === project.id ? { ...item, ...changes } : item) });
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
    save({ projects: next ? drafts.projects : [...drafts.projects, item], active: item.id });
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
    if (drafts) save(drafts);
    setNotice("");
    go("results");
  }

  function confirmRemove(part: Part) {
    setRemoval(part);
    deleteDialog.current?.showModal();
  }

  function removePart() {
    if (project && removal) update({ parts: project.parts.filter((part) => part.id !== removal.id) });
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
    {showEdit && <button className="icon-button" aria-label={"编辑 " + part.number} title="编辑" onClick={() => showEditor(part.id)}><Icon name="edit" /></button>}
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
            <Card title="项目信息" subtitle="选填 · 随计算结果一起导出">
              <div className="field-grid project-fields">
                <Field label="项目 / 订单名称" value={project.name} placeholder="例如：机架底板订单" onChange={(name) => update({ name })} />
                <Field label="客户名称" value={project.customer} placeholder="填写客户名称" onChange={(customer) => update({ customer })} />
                <Field label="图纸编号" value={project.drawing} placeholder="填写项目图号" onChange={(drawing) => update({ drawing })} />
                <Field label="计算日期" type="date" value={project.date} onChange={(date) => update({ date })} />
                <Field label="项目备注" wide value={project.notes} placeholder="填写本批零件的说明" onChange={(notes) => update({ notes })} />
              </div>
            </Card>
            <div className="editor-anchor" ref={editor}>
              <Card title={activeRow ? "零件参数" : "添加首个零件"} subtitle={activeRow ? "板材尺寸与孔尺寸统一使用毫米（mm）" : "一个订单可录入多件钢板。"}>
                {notice && <p className="alert" role="alert">{notice}</p>}
                {activeRow ? <PartEditor part={activeRow.part} errors={validated ? activeRow.errors : undefined}
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
                    <span><strong>{part.number || "未编号"}</strong><small>{result ? weights.format(result.weight) + " kg" : validated && errors ? "待修正" : "待填写"}</small></span>
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
              <span>当前零件净重</span>
              <div><strong>{activeRow?.result ? weights.format(activeRow.result.weight) : "—"}</strong> kg</div>
              <small>净体积 {activeRow?.result ? volumes.format(activeRow.result.net) + " mm³" : "—"}</small>
            </section>
          </aside>
        </div>
        <div className="action-bar"><span><Icon name={storageError ? "folder" : "check"} /> {storageError ? "浏览器存储异常" : "修改自动保存在此浏览器"}</span><button className="button primary" onClick={openResults}>生成计算结果 <Icon name="right" /></button></div>
      </> : <>
        <div className="metrics">
          <Metric title="零件数量" value={String(rows.length)} unit="件" />
          <Metric title="原板总体积" value={totals ? volumes.format(totals.gross) : "—"} unit="mm³" />
          <Metric title="扣孔总体积" value={totals ? volumes.format(totals.removed) : "—"} unit="mm³" />
          <Metric title="净体积合计" value={totals ? volumes.format(totals.net) : "—"} unit="mm³" />
          <Metric title="总重量" value={totals ? weights.format(totals.weight) : "—"} unit="kg" emphasized />
        </div>
        <Card title="零件明细" subtitle="重量保留 3 位小数，体积保留 2 位小数。" action={<div className="buttons">
          <button className="button secondary" onClick={() => addPart()}><Icon name="plus" /> 添加零件</button>
          <button className="button primary" disabled={!totals || exporting} onClick={exportExcel}><Icon name="download" /> {exporting ? "正在生成…" : "导出 Excel"}</button>
        </div>}>
          {!totals && <p role="alert" className="alert">{rows.length ? "请返回录入页修正零件数据或项目合计后再导出。" : "请添加零件后再导出。"}</p>}
          {notice && <p role="status" className="status">{notice}</p>}
          <div className="table-wrap" tabIndex={0} aria-label="零件明细表，可横向滚动">
            <table>
              <thead><tr>{HEADERS.map((header) => <th scope="col" key={header}>{header}</th>)}<th scope="col">操作</th></tr></thead>
              <tbody>{rows.map(({ part, result }, index) => <tr key={part.id}>
                <td>{index + 1}</td><th scope="row">{part.number || "未编号"}</th><td>{part.drawing || project.drawing || "—"}</td>
                <td>{part.length || "—"}</td><td>{part.width || "—"}</td><td>{part.thickness || "—"}</td>
                <td>{result?.circleCount ?? "—"}</td><td>{result?.rectangleCount ?? "—"}</td>
                <td>{result ? volumes.format(result.gross) : "—"}</td><td>{result ? volumes.format(result.removed) : "—"}</td>
                <td>{result ? volumes.format(result.net) : "—"}</td><td className="weight-cell">{result ? weights.format(result.weight) : "待修正"}</td>
                <td className="table-notes">{part.notes || "—"}</td><td>{partActions(part, true)}</td>
              </tr>)}</tbody>
              {totals && <tfoot><tr><th scope="row" colSpan={8}>项目合计</th><td>{volumes.format(totals.gross)}</td>
                <td>{volumes.format(totals.removed)}</td><td>{volumes.format(totals.net)}</td><td>{weights.format(totals.weight)}</td><td colSpan={2} /></tr></tfoot>}
            </table>
          </div>
        </Card>
        <div className="action-bar"><button className="button secondary" onClick={() => { setNotice(""); go("entry"); }}><Icon name="left" /> 返回零件录入</button><span>Excel 包含项目汇总与零件明细</span></div>
      </>}
      <footer><span>SteelCalc · V1.0</span><span>长度 mm　/　体积 mm³　/　重量 kg</span></footer>
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

function PartEditor({ part, errors, update }: { part: Part; errors?: Record<string, string>; update: (changes: Partial<Part>) => void }) {
  return <>
    <div className="field-grid project-fields">
      <Field label="零件编号" value={part.number} error={errors?.number} onChange={(number) => update({ number })} />
      <Field label="零件图号" value={part.drawing} placeholder="留空时使用项目图纸编号" onChange={(drawing) => update({ drawing })} />
    </div>
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
    {errors?.volume && <p className="alert" role="alert">{errors.volume}</p>}
    <Field label="零件备注" value={part.notes} placeholder="填写该零件的加工说明" onChange={(notes) => update({ notes })} />
  </>;
}
