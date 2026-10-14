import Image from "next/image";
import { Brand, Icon } from "./components/icons";
import {
  ExperienceProvider,
  Header,
  JoinButton,
} from "./components/experience";
import {
  DemoLink,
  DemoProvider,
  WorkspaceDemo,
} from "./components/workspace-demo";

const faqs = [
  [
    "观风是货代，还是物流追踪平台？",
    "观风是面向货代操作与客服团队的协作助手，不承接运输，也不替代货代或承运商。我们从单证核对、在途信息归并和异常追问切入，在已有系统与人工工作之间减少重复核对，让下一步更清楚。",
  ],
  [
    "没有实时定位数据，也能使用吗？",
    "可以从已有的邮件、单证、状态表和人工反馈开始。观风会区分最近确认状态、预计状态与未知状态，保留来源及更新时间。没有新反馈不会被自动标记为正常，页面中的路径也不代表实时 GPS 定位。",
  ],
  [
    "AI 会自动替我承诺交期、改道或发送消息吗？",
    "不会。规则负责确定性校验，AI 辅助整理非结构化信息、解释差异和生成草稿。对外发送、真实值确认、交期承诺、费用审批及运输调整，都需要由有权限的人审核并执行。",
  ],
  [
    "目前可以体验哪些能力？",
    "当前网站展示两条首发任务链的交互原型：发货前单证一致性核对，以及在途状态归并、信息缺口追问与客户说明。演示使用构造数据，尚未连接实际运输数据源或 AI 服务。早期体验入口可生成本地需求草稿，正式服务范围将在试点时确认。",
  ],
];

export default function Home() {
  return (
    <ExperienceProvider>
      <DemoProvider>
        <a href="#main-content" className="skip-link">
          跳转至主要内容
        </a>
        <Header />
        <main id="main-content">
          <section
            className="hero section-container"
            aria-labelledby="hero-title"
          >
            <div className="hero-copy">
              <h1 id="hero-title">
                风起之前，
                <br />
                看清前路。
              </h1>
              <p className="hero-description">
                连接中国、中亚与欧洲。
                <br />
                让分散的单证、在途信息与风险信号，
                <br className="desktop-break" />
                成为有据可循的下一步。
              </p>
              <div className="hero-actions">
                <a href="#demo" className="button button-dark hero-primary">
                  探索产品演示{" "}
                  <span className="button-arrow">
                    <Icon name="arrow-up" size={15} />
                  </span>
                </a>
                <a href="#capabilities" className="text-link">
                  了解观风 <Icon name="arrow" size={16} />
                </a>
              </div>
              <div className="hero-note">
                <span className="live-dot" /> 为中欧班列而设计{" "}
                <span className="note-divider" /> 早期产品预览
              </div>
            </div>
            <div
              className="hero-visual"
              aria-label="连接中国、中亚和欧洲的运输通道示意图，非实时运输数据"
            >
              <div className="globe-orbit orbit-one" />
              <div className="globe-orbit orbit-two" />
              <Image
                src="/eurasia-globe.svg"
                alt="以欧亚大陆为中心的点阵地球"
                width={660}
                height={660}
                className="globe-image"
                priority
              />
              <svg
                className="globe-routes"
                viewBox="0 0 660 660"
                fill="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="route-color">
                    <stop stopColor="#287359" />
                    <stop offset="1" stopColor="#5fba91" />
                  </linearGradient>
                </defs>
                <path
                  d="M477 276Q372 71 190 191"
                  stroke="#4a9474"
                  strokeOpacity=".14"
                  strokeWidth="12"
                />
                <path
                  d="M477 276Q372 71 190 191"
                  stroke="url(#route-color)"
                  strokeWidth="1.6"
                />
                <path
                  d="M477 276Q433 216 384 250Q352 211 366 261Q267 169 190 191"
                  stroke="#5c9a7b"
                  strokeWidth="1.3"
                  strokeDasharray="4 5"
                />
                <circle
                  cx="190"
                  cy="191"
                  r="5"
                  fill="#fff"
                  stroke="#377e61"
                  strokeWidth="2"
                />
                <circle
                  cx="477"
                  cy="276"
                  r="6"
                  fill="#fff"
                  stroke="#377e61"
                  strokeWidth="2"
                />
                <circle cx="384" cy="250" r="4" fill="#367f5f" />
                <circle
                  cx="366"
                  cy="261"
                  r="13"
                  stroke="#67a689"
                  strokeOpacity=".3"
                />
                <circle cx="366" cy="261" r="4" fill="#367f5f" />
                <circle className="route-traveler" r="3.3" fill="#285d48">
                  <animateMotion
                    dur="8s"
                    repeatCount="indefinite"
                    path="M477 276Q372 71 190 191"
                  />
                </circle>
              </svg>
              <div className="map-label map-europe">
                <span>欧洲</span>
                <small>Europe</small>
              </div>
              <div className="map-label map-asia">
                <span>中亚</span>
                <small>Central Asia</small>
              </div>
              <div className="map-label map-china">
                <span>中国</span>
                <small>China</small>
              </div>
              <div className="floating-event">
                <span className="event-icon">
                  <Icon name="layers" size={18} />
                </span>
                <div>
                  <strong>让跨境信息，在此交汇</strong>
                  <span>单证 · 运输节点 · 协作反馈</span>
                </div>
                <span className="event-dot" />
              </div>
              <div className="globe-caption">
                <span /> 跨越边界，不错过关键一环 <span />
              </div>
            </div>
          </section>
          <div className="scope-strip section-container">
            <p>
              一条丝路，多个环节。<span>同一个清晰视野。</span>
            </p>
            <div className="transport-modes">
              <span>
                <Icon name="train" />
                中欧班列
              </span>
              <span>
                <Icon name="ship" />
                铁海联运
              </span>
              <span>
                <Icon name="truck" />
                前后程衔接
              </span>
            </div>
          </div>

          <section
            id="demo"
            className="demo-section section-container"
            aria-labelledby="demo-title"
          >
            <div className="section-heading">
              <div>
                <span className="section-label">
                  少一些反复追问，多一分心中有数
                </span>
                <h2 id="demo-title">复杂的运输，一目了然。</h2>
              </div>
              <p>
                不止知道货在哪里，
                <br />
                更知道什么已确认、什么待核实、下一步找谁。
              </p>
            </div>
            <WorkspaceDemo />
            <div className="demo-caption">
              <span>
                <Icon name="plus" size={13} />{" "}
                试着切换模块、选择运单，或生成一份追问草稿
              </span>
              <span>交互原型 · 非真实业务数据</span>
            </div>
          </section>

          <section
            id="capabilities"
            className="capabilities-section section-container"
            aria-labelledby="capabilities-title"
          >
            <div className="centered-heading">
              <span className="section-label">
                从日常工作里，省下真正的力气
              </span>
              <h2 id="capabilities-title">出发前核清楚，在途中看明白。</h2>
              <p>先做好两件具体的事，让协作不再困在文件、表格和聊天记录里。</p>
            </div>
            <div className="capability-grid">
              <article className="capability-card">
                <div className="feature-icon">
                  <Icon name="file" size={23} />
                </div>
                <h3>多份单证，一次看清差异。</h3>
                <p>
                  对照托书、装箱单与发票，标记字段差异、缺失信息与疑似同义项。每一处发现，都能回到原文。
                </p>
                <div className="mini-document">
                  <div className="mini-doc-title">
                    <span>
                      <Icon name="file" size={14} /> 装箱单.pdf
                    </span>
                    <span>
                      <Icon name="file" size={14} /> 托书.xlsx
                    </span>
                  </div>
                  <div className="mini-doc-line">
                    <span>
                      货物件数 <b>120 箱</b>
                    </span>
                    <span>
                      货物件数 <b>128 箱</b>
                    </span>
                  </div>
                  <div className="mini-doc-result">
                    <Icon name="alert" size={14} />
                    <span>发现差异，等待人工核实</span>
                    <span className="mini-example">示例</span>
                  </div>
                </div>
                <div className="feature-bottom">
                  <span>单证一致性核验</span>
                  <DemoLink mode="documents" label="在产品演示中查看单证核对" />
                </div>
              </article>
              <article className="capability-card">
                <div className="feature-icon">
                  <Icon name="layers" size={23} />
                </div>
                <h3>分散的消息，清晰的下一步。</h3>
                <p>
                  归并邮件、日报与人工反馈，梳理最近确认状态。信息缺口有标记，追问有对象，对客说明有依据。
                </p>
                <div className="mini-timeline">
                  <div>
                    <span className="timeline-point done">
                      <Icon name="check" size={10} />
                    </span>
                    <time>09:20</time>
                    <p>
                      国内发运已确认<small>来源：发运回执</small>
                    </p>
                    <span className="mini-example">示例</span>
                  </div>
                  <div>
                    <span className="timeline-point pending">
                      <Icon name="clock" size={10} />
                    </span>
                    <time>14:30</time>
                    <p>
                      境外交接待核实<small>下一步：向境外代理追问</small>
                    </p>
                    <span className="tiny-status">待确认</span>
                  </div>
                </div>
                <div className="feature-bottom">
                  <span>在途信息归并与跟进</span>
                  <DemoLink mode="transit" label="在产品演示中查看在途信息" />
                </div>
              </article>
            </div>
          </section>

          <section id="workflow" className="workflow-section">
            <div className="section-container">
              <div className="section-heading">
                <div>
                  <span className="section-label">
                    融入工作，而不是再造一套负担
                  </span>
                  <h2>从已有信息，到可靠行动。</h2>
                </div>
                <a className="text-link" href="#demo">
                  看看如何运作 <Icon name="arrow-up" size={16} />
                </a>
              </div>
              <div className="workflow-grid">
                <article>
                  <span className="step-number">
                    01 <span />
                  </span>
                  <h3>从你手头的资料开始</h3>
                  <p>
                    使用已有单证、状态表与沟通反馈。
                    <br />
                    不要求第一天，就接通所有系统。
                  </p>
                  <div className="workflow-tags">
                    <span>文件</span>
                    <span>邮件</span>
                    <span>人工反馈</span>
                  </div>
                </article>
                <article>
                  <span className="step-number">
                    02 <span />
                  </span>
                  <h3>规则与 AI，各司其职</h3>
                  <p>
                    规则核对字段、单位与版本。
                    <br />
                    AI 辅助提取、归并与草稿生成。
                  </p>
                  <div className="workflow-tags">
                    <span>确定性校验</span>
                    <span>语义整理</span>
                  </div>
                </article>
                <article>
                  <span className="step-number">
                    03 <Icon name="check" size={15} />
                  </span>
                  <h3>你来确认，再向前一步</h3>
                  <p>
                    带着依据复核，与正确的人协作。
                    <br />
                    真实值、对外承诺与执行始终由人确认。
                  </p>
                  <div className="workflow-tags">
                    <span>人工复核</span>
                    <span>协作跟进</span>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section
            className="trust-section section-container"
            aria-labelledby="trust-title"
          >
            <div className="trust-panel">
              <div className="trust-intro">
                <span className="trust-mark">
                  <Icon name="shield" size={27} />
                </span>
                <h2 id="trust-title">
                  值得信任，
                  <br />
                  比看起来全知更重要。
                </h2>
                <p>
                  不把猜测写成事实，
                  <br />
                  不让未知变成“正常”。
                </p>
              </div>
              <div className="trust-principles">
                <article>
                  <Icon name="link" size={21} />
                  <div>
                    <h3>每个判断，都有来处</h3>
                    <p>原始来源、更新时间与原文位置，随时可查。</p>
                  </div>
                </article>
                <article>
                  <Icon name="search" size={21} />
                  <div>
                    <h3>明确区分事实、推断与未知</h3>
                    <p>信息过期或缺失时，如实标记，而非自动补全。</p>
                  </div>
                </article>
                <article>
                  <Icon name="shield" size={21} />
                  <div>
                    <h3>助手向前一步，决策仍在你手里</h3>
                    <p>不擅自发送、不自动改道、不无依据承诺交期。</p>
                  </div>
                </article>
              </div>
              <div className="trust-watermark" aria-hidden="true">
                <Brand compact />
              </div>
            </div>
          </section>

          <section
            id="use-cases"
            className="audience-section section-container"
            aria-labelledby="audience-title"
          >
            <div className="section-heading">
              <div>
                <span className="section-label">为真实业务中的你而设计</span>
                <h2 id="audience-title">各有分工，同样从容。</h2>
              </div>
              <p>
                先聚焦中欧班列货代团队，
                <br />
                也为货主与跨境协作伙伴预留位置。
              </p>
            </div>
            <div className="audience-grid">
              <article>
                <span className="audience-icon">
                  <Icon name="layers" size={24} />
                </span>
                <h3>货代操作与客服</h3>
                <p>
                  少做重复核对，少在多个群里翻找。让每一票货的状态与待办接得上。
                </p>
                <span className="audience-tag">首发聚焦</span>
              </article>
              <article>
                <span className="audience-icon">
                  <Icon name="globe" size={24} />
                </span>
                <h3>专线与团队负责人</h3>
                <p>
                  看清待核实事项与协作责任。把经验留在流程里，而不只在某个人脑海里。
                </p>
                <span className="audience-tag neutral">团队协作</span>
              </article>
              <article>
                <span className="audience-icon">
                  <Icon name="ship" size={24} />
                </span>
                <h3>货主与供应链团队</h3>
                <p>
                  在授权范围内获得清晰的运输说明，让采购、库存与交付沟通有据可依。
                </p>
                <span className="audience-tag neutral">协作场景探索</span>
              </article>
            </div>
          </section>

          <section
            id="faq"
            className="faq-section section-container"
            aria-labelledby="faq-title"
          >
            <div>
              <span className="section-label">你可能还想知道</span>
              <h2 id="faq-title">把问题，说清楚。</h2>
              <p>关于观风的能力，也关于它的边界。</p>
            </div>
            <div className="faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <Icon name="plus" size={18} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="closing-section">
            <div className="closing-orbit" aria-hidden="true" />
            <div className="closing-content">
              <Brand compact />
              <h2>路很远，不必摸索着向前。</h2>
              <p>和观风一起，从一票货、一次核对、一个更清晰的决定开始。</p>
              <JoinButton className="button button-dark closing-button">
                加入早期体验
              </JoinButton>
              <span className="closing-note">
                正在寻找愿意一起打磨产品的货代与跨境物流团队
              </span>
            </div>
          </section>
        </main>
        <footer className="site-footer section-container">
          <div className="footer-top">
            <a href="#" className="brand-link" aria-label="返回观风首页">
              <Brand />
            </a>
            <p>观变化，知进退。</p>
            <a href="#main-content" className="back-top">
              回到顶部 <Icon name="arrow-up" size={14} />
            </a>
          </div>
          <div className="footer-bottom">
            <span>© 2026 观风 WindSight. All rights reserved.</span>
            <span>产品概念与交互演示 · 不构成实时运输或专业合规建议</span>
          </div>
        </footer>
      </DemoProvider>
    </ExperienceProvider>
  );
}
