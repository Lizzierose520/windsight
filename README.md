# 观风 WindSight

面向中欧班列货代操作与客服团队的单页品牌落地页。以「风起之前，看清前路」为主线，展示单证一致性核验、在途信息归并与人工确认的产品方向。

## 本地开发

现有依赖安装完成后：

```sh
npm run dev
```

默认访问 `http://localhost:3000`。仓库使用 pnpm 锁文件；重新安装依赖时使用 `pnpm install`。运行 npm scripts 不会更换包管理器或改动锁文件。

```sh
npm run typecheck
npm run lint
npm run build
npm run start
```

生产构建使用 Next.js 官方支持的 Webpack 模式，避免当前运行环境下 Turbopack 构建工作端口的权限问题。开发服务仍使用默认 Turbopack。

## 页面与交互

- 原创 SVG 品牌标识、欧亚大陆点阵地球与航线动效。
- 可切换的在途 / 单证工作台；运单筛选、选择、来源展开、追问草稿与复制。
- 产品能力卡可直接打开相应演示模块。
- 适配桌面和手机的导航、FAQ、原生对话框、键盘焦点及减少动效偏好。
- 体验表单有原生必填与邮箱校验，生成并下载本地需求草稿。
- 页面主体为 Server Component；仅导航、工作台、对话框及相关触发器使用客户端状态。
- 无外部字体、图标库、地图 SDK、远程图片或新增运行依赖。

## 产品边界

这是落地页与交互原型，不是已接入数据的物流系统。

- 所有运单、状态、来源摘录与文件差异都是构造示例。
- 地球与线路为示意，不用于地理测绘、实时定位或路线规划。
- 草稿由本地模板生成，没有调用 AI 服务。
- 体验表单不会提交、不会发邮件，也不把填写内容持久化到服务器或本地存储。
- 未接入物流 API、文件解析、用户认证、通知、CRM 或后端申请渠道。
- 正式上线前，需要接入申请后端、明确数据权限与隐私政策，并验证产品能力。

## 文件结构

```text
app/page.tsx                         单页内容与服务端布局
app/globals.css                      视觉样式、响应式布局与减少动效适配
app/components/icons.tsx             统一线性图标与品牌
app/components/experience.tsx        头部导航、体验对话框、表单与下载
app/components/workspace-demo.tsx    交互工作台、示例数据与模块跳转
app/layout.tsx                       中文语言设置与 SEO 元数据
app/icon.svg                        品牌站点图标
public/eurasia-globe.svg             本地点阵地球矢量素材
```
