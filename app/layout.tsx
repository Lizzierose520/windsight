import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "观风 WindSight — 风起之前，看清前路",
  description:
    "为中欧班列货代团队设计的协作助手。单证一致性核验、在途状态归并与异常追问，让每一程都有据可循。",
  applicationName: "观风 WindSight",
  openGraph: {
    title: "观风 WindSight — 风起之前，看清前路",
    description:
      "连接中国、中亚与欧洲。让分散的单证、在途信息与风险信号，成为有据可循的下一步。",
    locale: "zh_CN",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
