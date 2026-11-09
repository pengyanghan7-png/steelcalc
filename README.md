# SteelCalc 钢板重量计算

面向工厂订单的简体中文钢板体积与重量计算工具。

[打开 GitHub Pages 网页](https://pengyanghan7-png.github.io/steelcalc/)

## 使用方式

1. 填写钢板长、宽、厚，单位统一为毫米。
2. 按图纸添加圆形或矩形贯穿孔。相同尺寸可合成一组，填写孔的数量。
3. 同一订单可录入多个零件。生成计算结果后，核对重量及体积，并导出 Excel。
4. 在「本地项目」里新建订单或切换到已保存的订单。项目数据保存在当前浏览器，清除站点数据会删除本地项目。

钢材密度固定为 7.85 g/cm³。净体积为原板体积减去所有贯穿孔体积，净重（kg）为净体积（mm³）乘以 7.85 再除以 1,000,000。结果及 Excel 分别显示两位体积小数和三位重量小数，合计按未舍入数值计算。录入人员需对照图纸核查孔位、重叠和实际加工条件。

## 本地开发

需要 Node.js 24 和 npm。

```sh
npm ci
npm run dev
npm test
npm run check
```

## GitHub Pages 发布

`main` 保存源码，`gh-pages` 根目录保存构建产物及空的 `.nojekyll` 文件。发布更新时，将 `PAGES_BASE_PATH` 设为 `/steelcalc` 后执行 `npm run build`，将 `out/` 内的文件同步到 `gh-pages` 根目录，保留 `.nojekyll`，提交并推送。
