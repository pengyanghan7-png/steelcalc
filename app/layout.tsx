import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "SteelCalc · 钢板重量计算",
  description: "按图纸尺寸计算钢板与贯穿孔体积，汇总重量并导出 Excel。",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
