# 实施计划：Golly 规则复制

- **Status**: COMPLETE
- **Approved**: 2026-11-05 用户要求把规则直接复制到 Golly
- **Type**: feature

## G1 转换与原生验证 [VERIFIED]
- **Objective**：导出 Golly 规则字符串、精确 @TABLE 与有限状态 @TREE，拒绝不能等价转换的表达式。
- **Definition of Done**：node --test tests/golly.test.cjs 通过，独立解析后对照方向和所有邻域；Golly 官方原生引擎加载并演化对照通过。
- **Files**：src/golly.js, tests/golly.test.cjs, tests/golly-native.cjs。
- **Evidence**：917c957 已提交；18 项新增转换测试与 12 个官方 Golly 引擎样例通过，全量单元测试 162/162 通过。

## G2 复制界面与交付 [COMPLETE]
- **Objective**：能预览、复制、下载和取消，权限失败有手动复制路径，保留当前模拟。
- **Definition of Done**：构建、全量自动化与浏览器回归通过，桌面/手机/离线检查完成，GitHub main 核对与 Sites 私有部署 succeeded。
- **Files**：src/app.js, index.html, styles/main.css, scripts/build.cjs, tests/static.test.cjs, tests/golly-browser.cjs, package.json, README.md, CHANGELOG.md, dist/, doc/Golly规则复制测试报告.md。
- **Evidence**：界面、构建和文档实现完成，22 项新浏览器检查通过；全量浏览器回归、GitHub 与私有部署核对后标记 VERIFIED。
