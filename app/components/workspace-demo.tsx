"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Brand, Icon } from "./icons";

type DemoMode = "transit" | "documents";
const DemoContext = createContext<{
  mode: DemoMode;
  setMode: (mode: DemoMode) => void;
}>({ mode: "transit", setMode: () => {} });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DemoMode>("transit");
  return (
    <DemoContext.Provider value={{ mode, setMode }}>
      {children}
    </DemoContext.Provider>
  );
}

export function DemoLink({ mode, label }: { mode: DemoMode; label: string }) {
  const { setMode } = useContext(DemoContext);
  return (
    <a href="#demo" aria-label={label} onClick={() => setMode(mode)}>
      <Icon name="arrow-up" size={18} />
    </a>
  );
}
const shipments = [
  {
    id: "WS-260918",
    origin: "西安",
    destination: "杜伊斯堡",
    cargo: "机械配件",
    point: "阿拉山口",
    status: "交接待确认",
    type: "pending",
    update: "09-20 14:30",
    source: "承运商邮件",
    sourceText: "列车已抵达阿拉山口，后续换装交接信息待境外代理确认。",
    next: "向境外代理核实换装与接车状态",
  },
  {
    id: "WS-260916",
    origin: "成都",
    destination: "罗兹",
    cargo: "电子元件",
    point: "多斯特克",
    status: "运输中",
    type: "normal",
    update: "09-20 11:15",
    source: "代理日报",
    sourceText: "已收到多斯特克节点发运反馈；下一节点实际抵达时间尚未确认。",
    next: "跟进下一节点到达反馈",
  },
  {
    id: "WS-260915",
    origin: "义乌",
    destination: "阿拉木图",
    cargo: "日用百货",
    point: "霍尔果斯",
    status: "信息待更新",
    type: "unknown",
    update: "09-19 09:00",
    source: "客户状态表",
    sourceText:
      "最近记录为霍尔果斯待发。该条记录未更新，无法据此确认当前运输状态。",
    next: "向国内操作核实最新发运记录",
  },
];
const documents = [
  {
    field: "货物件数",
    left: "120 箱",
    right: "128 箱",
    status: "字段不一致",
    type: "pending",
    source: "装箱单第 2 页 ↔ 托书第 1 页",
  },
  {
    field: "毛重",
    left: "2,460 kg",
    right: "2.46 t",
    status: "单位换算一致",
    type: "normal",
    source: "装箱单第 2 页 ↔ 托书第 1 页",
  },
  {
    field: "收货人名称",
    left: "Silk Road Trading GmbH",
    right: "Silkroad Trading GmbH",
    status: "名称待复核",
    type: "unknown",
    source: "发票第 1 页 ↔ 托书第 1 页",
  },
];

export function WorkspaceDemo() {
  const { mode, setMode } = useContext(DemoContext);
  return <WorkspaceDemoContent key={mode} mode={mode} setMode={setMode} />;
}

function WorkspaceDemoContent({
  mode,
  setMode,
}: {
  mode: DemoMode;
  setMode: (mode: DemoMode) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const shipment = shipments[selected];
  const draftText =
    mode === "transit"
      ? `您好，烦请协助核实 ${shipment.id}（${shipment.origin} → ${shipment.destination}）在${shipment.point}的最新状态。现有反馈为“${shipment.sourceText}”请提供最近确认时间、交接记录及下一节点安排。未确认前，我们暂不向客户承诺新交期。谢谢。`
      : "您好，核对本票装箱单与托书时发现：货物件数分别为 120 箱、128 箱；收货人名称存在拼写差异。烦请确认正确件数及收货人法定名称，并提供更新版本。核实前暂不自动修改申报资料，谢谢。";
  function changeMode(value: DemoMode) {
    setMode(value);
    setDraft(false);
    setSourceOpen(false);
    setCopied(false);
    setCopyError(false);
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="workspace-shell">
      <div className="workspace-top">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>
          <Icon name="shield" size={12} /> workspace.windsight · 产品交互预览
        </span>
        <span className="demo-label">演示数据</span>
      </div>
      <div className="workspace-body">
        <aside className="workspace-sidebar">
          <Brand compact />
          <span className="sidebar-title">我的工作空间</span>
          <button
            onClick={() => changeMode("transit")}
            className={
              mode === "transit" ? "sidebar-item active" : "sidebar-item"
            }
          >
            <Icon name="layers" size={17} />
            在途工作台
          </button>
          <button
            onClick={() => changeMode("documents")}
            className={
              mode === "documents" ? "sidebar-item active" : "sidebar-item"
            }
          >
            <Icon name="file" size={17} />
            单证核对
          </button>
          <div className="sidebar-bottom">
            <span className="avatar">W</span>
            <span>
              观风演示团队<small>探索版工作空间</small>
            </span>
          </div>
        </aside>
        <div className="workspace-main">
          <div className="workspace-heading">
            <div>
              <div className="workspace-breadcrumb">
                工作空间 <Icon name="chevron" size={11} />{" "}
                {mode === "transit" ? "在途工作台" : "单证核对"}
              </div>
              <h3>
                {mode === "transit"
                  ? "每一票货，都心中有数。"
                  : "让每一处差异，都有迹可循。"}
              </h3>
            </div>
            <span className="workspace-date">
              <Icon name="clock" size={13} /> 示例快照 · 09 月 20 日
            </span>
          </div>
          <div
            className="demo-mobile-tabs"
            role="tablist"
            aria-label="演示模块"
          >
            <button
              role="tab"
              aria-selected={mode === "transit"}
              onClick={() => changeMode("transit")}
            >
              在途工作台
            </button>
            <button
              role="tab"
              aria-selected={mode === "documents"}
              onClick={() => changeMode("documents")}
            >
              单证核对
            </button>
          </div>
          <div className="workspace-columns">
            <div className="workspace-data">
              {mode === "transit" ? (
                <>
                  <div className="route-preview">
                    <div className="route-preview-top">
                      <span>
                        <Icon name="train" size={15} /> 中欧班列 · 西向通道
                      </span>
                      <span className="route-id">{shipment.id}</span>
                    </div>
                    <div className="rail-route">
                      <div className="rail-stop completed">
                        <i />
                        <b>{shipment.origin}</b>
                        <small>起运站</small>
                      </div>
                      <div className="rail-track completed" />
                      <div className="rail-stop current">
                        <i />
                        <b>{shipment.point}</b>
                        <small>{shipment.status}</small>
                      </div>
                      <div className="rail-track" />
                      <div className="rail-stop">
                        <i />
                        <b>{shipment.destination}</b>
                        <small>目的站</small>
                      </div>
                    </div>
                    <span className="route-footnote">示意路径，非实时定位</span>
                  </div>
                  <div className="table-heading">
                    <div role="tablist" aria-label="筛选运单">
                      <button
                        role="tab"
                        aria-selected={filter === "all"}
                        className={filter === "all" ? "active" : ""}
                        onClick={() => setFilter("all")}
                      >
                        全部运单 <span>3</span>
                      </button>
                      <button
                        role="tab"
                        aria-selected={filter === "attention"}
                        className={filter === "attention" ? "active" : ""}
                        onClick={() => {
                          setFilter("attention");
                          if (shipments[selected].type === "normal") {
                            setSelected(0);
                            setDraft(false);
                            setSourceOpen(false);
                          }
                        }}
                      >
                        需要关注 <span>2</span>
                      </button>
                    </div>
                    <Icon name="search" size={15} />
                  </div>
                  <div className="shipment-list">
                    {shipments.map((item, index) =>
                      filter === "attention" &&
                      item.type === "normal" ? null : (
                        <button
                          key={item.id}
                          className={`shipment-row ${selected === index ? "selected" : ""}`}
                          onClick={() => {
                            setSelected(index);
                            setDraft(false);
                            setSourceOpen(false);
                            setCopied(false);
                          }}
                          aria-pressed={selected === index}
                        >
                          <span className="shipment-icon">
                            <Icon name="train" size={16} />
                          </span>
                          <span className="shipment-details">
                            <strong>
                              {item.origin}
                              <span className="inline-arrow">→</span>
                              {item.destination}
                            </strong>
                            <small>
                              {item.id} · {item.cargo}
                            </small>
                          </span>
                          <span className={`status-badge ${item.type}`}>
                            <i />
                            {item.status}
                          </span>
                          <Icon name="chevron" size={13} />
                        </button>
                      ),
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="document-upload">
                    <span className="file-tile">
                      <Icon name="file" size={25} />
                    </span>
                    <div>
                      <strong>示例单证核对结果</strong>
                      <span>装箱单.pdf · 托书.xlsx · 商业发票.pdf</span>
                    </div>
                    <span className="checked-label">
                      <Icon name="check" size={13} /> 已解析示例
                    </span>
                  </div>
                  <div className="document-table">
                    <div className="document-table-header">
                      <span>核对字段</span>
                      <span>装箱单 / 发票</span>
                      <span>托书</span>
                    </div>
                    {documents.map((item) => (
                      <div key={item.field} className="document-row">
                        <div>
                          <strong>{item.field}</strong>
                          <span className={`mini-status ${item.type}`}>
                            {item.status}
                          </span>
                        </div>
                        <span>{item.left}</span>
                        <span>{item.right}</span>
                      </div>
                    ))}
                  </div>
                  <p className="document-note">
                    <Icon name="link" size={13} />{" "}
                    每个差异保留原文位置，不自动改写真实值。
                  </p>
                </>
              )}
            </div>
            <aside className="insight-panel" aria-live="polite">
              <div className="insight-heading">
                <span>
                  <Icon name="spark" size={17} /> 观风助手
                </span>
                <span className="small-beta">预览</span>
              </div>
              <div className="insight-content">
                <span className="insight-kicker">
                  {mode === "transit"
                    ? "值得跟进的下一步"
                    : "发现 2 项待人工确认"}
                </span>
                <h4>
                  {mode === "transit"
                    ? shipment.next
                    : "件数不一致，名称待复核"}
                </h4>
                <p>
                  {mode === "transit"
                    ? shipment.sourceText
                    : "字段差异已标记。规则核验单位与数量，AI 辅助识别名称差异，最终值由你确认。"}
                </p>
                <button
                  className="source-toggle"
                  aria-expanded={sourceOpen}
                  onClick={() => setSourceOpen(!sourceOpen)}
                >
                  <Icon name="link" size={12} />
                  {mode === "transit"
                    ? `依据：${shipment.source}`
                    : "查看原文位置"}
                  <Icon
                    name="chevron"
                    size={11}
                    className={sourceOpen ? "rotate-90" : ""}
                  />
                </button>
                {sourceOpen && (
                  <div className="source-detail">
                    {mode === "transit" ? (
                      <>
                        <strong>
                          {shipment.source} · {shipment.update}
                        </strong>
                        <p>「{shipment.sourceText}」</p>
                      </>
                    ) : (
                      <>
                        <strong>原文位置 · 演示文件</strong>
                        <p>
                          装箱单第 2 页：120 箱<br />
                          托书第 1 页：128 箱<br />
                          发票第 1 页：收货人名称
                        </p>
                      </>
                    )}
                    <small>以上为构造示例，不代表真实业务状态。</small>
                  </div>
                )}
                <div className="insight-divider" />
                {!draft ? (
                  <>
                    <span className="human-note">
                      <Icon name="shield" size={12} /> 对外发送前需人工确认
                    </span>
                    <button
                      className="draft-button"
                      onClick={() => {
                        setDraft(true);
                        setCopied(false);
                        setCopyError(false);
                      }}
                    >
                      <Icon name="spark" size={14} /> 生成追问草稿{" "}
                      <Icon name="arrow" size={13} />
                    </button>
                  </>
                ) : (
                  <div className="generated-draft">
                    <span className="draft-heading">
                      <Icon name="check" size={12} /> 示例草稿已生成
                    </span>
                    <p>{draftText}</p>
                    <button onClick={copyDraft}>
                      {copied ? "已复制，请复核后发送" : "复制草稿"}
                      <Icon name={copied ? "check" : "file"} size={12} />
                    </button>
                    {copyError && (
                      <small>浏览器未允许复制，请选中草稿手动复制。</small>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
          <div className="workspace-bottom">
            <span>
              <i /> 事实有来源 · 未知有标记 · 行动有人确认
            </span>
            <span>不替代承运商实际执行</span>
          </div>
        </div>
      </div>
    </div>
  );
}
