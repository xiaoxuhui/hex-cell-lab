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

- 原有 111 项浏览器回归全部通过：基础 20、表达式 17、电线世界 10、随机列表 12、尺寸 14、循环 20、鼠标 18。加上新增 22 项，共 133 项通过，无未捕获浏览器异常。当前终端未提供 npm 命令，实际逐个使用 Node 运行相同脚本并检查退出码。
- GitHub main 已推送并用 `git ls-remote origin refs/heads/main` 确认源代码提交 `485307be22a5a980d68644a94ca6c18be8699667`。
- Sites 使用同一源码提交打包并发布，保持原有仅所有者访问。部署 `appgdep_6aec6906faac8191bddefa1775c05768` 返回 `succeeded`，版本 `appgprj_6ad7422b561481918dbeea35c02faf47~appgver_04ce97b1b0d88191829e0298116d8aac`。
- 游戏地址：https://hex-cell-lab-aiden.xiaoxuhui84.chatgpt.site 。没有自动刷新用户当前页面，避免影响未应用的草稿；用户刷新后可见新按钮。
- 发布归档：`D:\soft\.backups\hex-cell-lab-deploy-1.7.0-20261105.tar.gz`，SHA256 `AAEBCBEC2015CCF2569DC9373BBAAC5FC5AC6EC7F7BEB199C5BD71B52785D692`。归档已保留，发布后文档记录独立提交，不改变已验证的运行资源。
