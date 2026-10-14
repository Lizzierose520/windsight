"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Brand, Icon } from "./icons";

const ExperienceContext = createContext<() => void>(() => {});

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    role: string;
    email: string;
    need: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open) dialog?.showModal();
    else dialog?.close();
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [open]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setDraft({
      name: String(data.get("name")).trim(),
      role: String(data.get("role")),
      email: String(data.get("email")).trim(),
      need: String(data.get("need")).trim(),
    });
  }
  function download() {
    if (!draft) return;
    const content = `观风 WindSight · 早期体验需求草稿\n\n团队：${draft.name}\n角色：${draft.role}\n联系邮箱：${draft.email}\n希望解决的问题：${draft.need || "待沟通"}\n\n这是一份本地生成的需求草稿，未提交或发送至观风。`;
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "WindSight-体验需求.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <ExperienceContext.Provider
      value={() => {
        setDraft(null);
        setOpen(true);
      }}
    >
      {children}
      <dialog
        ref={dialogRef}
        className="experience-dialog"
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-labelledby="experience-title"
      >
        <div className="dialog-content">
          <button
            className="icon-button dialog-close"
            onClick={() => setOpen(false)}
            aria-label="关闭体验申请"
          >
            <Icon name="close" />
          </button>
          <Brand />
          {draft ? (
            <div className="draft-success" role="status">
              <span className="success-icon">
                <Icon name="check" size={30} />
              </span>
              <h2 id="experience-title">把你的需求，变成起点。</h2>
              <p>已为「{draft.name}」生成体验需求草稿。</p>
              <div className="draft-summary">
                <span>{draft.role}</span>
                <strong>{draft.email}</strong>
                <p>{draft.need || "期待一起探讨单证核对与在途协作。"}</p>
              </div>
              <p className="form-notice">
                当前为前端演示，信息未提交、未发送，也不会被服务器保存。你可以下载草稿，留待后续沟通。
              </p>
              <button
                className="button button-dark full-width"
                onClick={download}
              >
                下载需求草稿 <Icon name="download" size={17} />
              </button>
              <button className="text-button" onClick={() => setDraft(null)}>
                重新填写
              </button>
            </div>
          ) : (
            <>
              <h2 id="experience-title">一起，让每一程更清晰。</h2>
              <p className="dialog-description">
                从你的真实业务开始，探索观风可以如何帮忙。
              </p>
              <form onSubmit={submit}>
                <label>
                  公司 / 团队名称
                  <input
                    name="name"
                    placeholder="我们该如何称呼你的团队？"
                    required
                    maxLength={80}
                    autoComplete="organization"
                    pattern=".*\S.*"
                  />
                </label>
                <div className="form-row">
                  <label>
                    你的角色
                    <select name="role" defaultValue="货代操作 / 客服">
                      <option>货代操作 / 客服</option>
                      <option>货代负责人</option>
                      <option>货主 / 供应链团队</option>
                      <option>其他</option>
                    </select>
                  </label>
                  <label>
                    工作邮箱
                    <input
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      required
                      autoComplete="email"
                      maxLength={120}
                    />
                  </label>
                </div>
                <label>
                  最希望解决的问题 <span className="optional">选填</span>
                  <textarea
                    name="need"
                    placeholder="例如：中亚段反馈分散，每天需要反复追问交接状态……"
                    rows={3}
                    maxLength={1200}
                  />
                </label>
                <p className="form-notice">
                  <Icon name="shield" size={15} />{" "}
                  当前为产品演示。填写内容仅用于生成本地草稿，不会对外发送。
                </p>
                <button type="submit" className="button button-dark full-width">
                  生成体验需求草稿 <Icon name="arrow" size={17} />
                </button>
              </form>
            </>
          )}
        </div>
      </dialog>
    </ExperienceContext.Provider>
  );
}

export function JoinButton({
  className = "button button-dark",
  children = "加入早期体验",
}: {
  className?: string;
  children?: ReactNode;
}) {
  const show = useContext(ExperienceContext);
  return (
    <button className={className} onClick={show}>
      {children}
      <Icon name="arrow-up" size={16} />
    </button>
  );
}

export function Header() {
  const [expanded, setExpanded] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="#" className="brand-link" aria-label="观风 WindSight 首页">
          <Brand />
        </a>
        <nav
          id="mobile-navigation"
          className={expanded ? "navigation is-open" : "navigation"}
          aria-label="主导航"
        >
          <a href="#capabilities" onClick={() => setExpanded(false)}>
            产品能力
          </a>
          <a href="#workflow" onClick={() => setExpanded(false)}>
            工作方式
          </a>
          <a href="#use-cases" onClick={() => setExpanded(false)}>
            适用场景
          </a>
          <a href="#faq" onClick={() => setExpanded(false)}>
            常见问题
          </a>
          <span className="mobile-join">
            <JoinButton />
          </span>
        </nav>
        <div className="header-actions">
          <a className="header-demo" href="#demo">
            产品演示 <Icon name="arrow-up" size={14} />
          </a>
          <JoinButton />
          <button
            className="icon-button menu-toggle"
            aria-expanded={expanded}
            aria-controls="mobile-navigation"
            aria-label={expanded ? "收起导航" : "展开导航"}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name={expanded ? "close" : "menu"} />
          </button>
        </div>
      </div>
    </header>
  );
}
