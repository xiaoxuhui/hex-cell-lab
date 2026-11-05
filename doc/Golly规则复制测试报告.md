# Golly 规则复制测试报告

- 日期：2026-11-05；版本：1.7.0。
- 转换实现提交：917c957。
- 入口：规则工作台“应用规则”下方的“复制到 Golly”。复制的是打开窗口时已应用的规则。

## 已验证

- `node --test tests/*.test.cjs`：162/162 通过，包括原有长周期实际存档回归。
- `node tests/golly-browser.cjs`：22/22 通过，Chromium 151.0.7922.34。
- 新增 18 项转换单元测试，通过独立 @TABLE/@TREE 读取器验证方向、独立星号、首匹配、未匹配行为、状态范围、随机拒绝及取消。电线世界对照全部 262144 种四状态邻域，三状态算术对照全部 19683 种邻域。
- `node tests/golly-native.cjs D:\soft\.backups\golly-validation-source-20261105\bgolly-validation.exe`：12/12 通过。每个样例均在 12×10 环绕棋盘上逐格核对连续 5 代，共 60 张棋盘。
- 原生引擎从 Golly 官方 `https://git.code.sf.net/p/golly/code` 编译，源码提交 `2cf06330cab58dccec085724067e17ddd7a56905`，版本标识 5.1b1。MinGW 编译加 `-Dffs=__builtin_ffs` 兼容参数，无应用依赖新增。命令行读取 QuickLife 的 B0/not-S8 奇数代内部互补状态时，按其官方实现还原后比较。
- 原生样例覆盖 B/S、用户 SBC、四状态 Generations、空 S/B、B0 两状态与多状态、自定义方向/文字状态/独立星号、归零后备、三状态表达式、表达式生命、玩家原始 Wireworld 公式、32 状态表。
- 浏览器覆盖复制入口及准确内容、Golly 菜单指引、下载文件名与内容、未应用草稿、状态范围切换清除旧结果、随机/越界拒绝、关闭取消、防止旧结果覆盖、保留模拟及播放、模态空格保护、手机 390×844、离线 file 页面与剪贴板拒绝回退。
- 剪贴板写入使用页面内替身验证成功/拒绝分支与载荷，未读取或覆盖系统剪贴板；未进行 Golly 图形界面粘贴操作。规则文件实际由原生 Golly RuleLoader 加载并演化验证。
- 截图已人工查看：`tests/artifacts/desktop-golly-copy.png`、`tests/artifacts/mobile-golly-copy.png`；桌面和手机窗口无横向溢出。
- 构建包含 10 个静态资源；源码与 dist 一致，静态版本检查通过。

## 范围

B/S 与 SBC 可直接在 Golly 设置规则；B0 的 SBC 转换成等价 B/S 或规则表。自定义表保留全部 2–32 个状态，文字按序号映射。表达式仅接受用户声明的完整 2–4 整数状态范围，拒绝不能等价转换的规则。只导出规则，Golly 的棋盘与边界由用户自行设置。

## 回归与交付

原有浏览器回归、GitHub main 和私有 Sites 部署正在完成；确认后记录最终结果。
