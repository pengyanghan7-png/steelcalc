import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  basePath: process.env.PAGES_BASE_PATH || "",
  trailingSlash: true,
};

export default config;
