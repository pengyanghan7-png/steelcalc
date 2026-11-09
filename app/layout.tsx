import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "SteelCalc V2.0 · 钢板加工订单工作台",
  description: "钢板算重、订单交接、按型号发货、财务到账及经营 Excel 报表。",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
