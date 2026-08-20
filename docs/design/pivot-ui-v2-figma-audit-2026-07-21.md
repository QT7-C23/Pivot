# Pivot UI V2 Figma 设计源与实施前审查

审查日期：2026-07-21

## 唯一设计源

- 文件：[Pivot UI V2](https://www.figma.com/design/vsi6Wm7yOPOSBGytQxHOqv/Pivot-UI-V2?node-id=0-1&p=f&t=BumfJFflMagKEO1f-0)
- File key：`vsi6Wm7yOPOSBGytQxHOqv`
- 旧 Pivot Figma 文件只作为历史资料，不得用于新界面实现或验收。

## 审查范围

1. 页面结构、P0 核心界面与 Adaptive Studio 覆盖。
2. Runtime、Agent、Model、Provider、Skill、MCP、Plugin 的概念边界。
3. CLI 缺失、持久通知、Provider 删除、Command Dock 和选择器稳定性状态。
4. 1024、1440、1728 三档桌面响应式设计。
5. 组件、Variables、Prototype 与开发 Handoff 完整性。

## 已确认内容

- 12 个 Figma 页面、17 张 Core Screens、10 张 States/Responsive 画板。
- P0 的 15 张核心页面全部存在；另有 Settings/Appearance 与 Settings/Privacy。
- Document、Slide、Code、Image、Video Studio 均有独立结构。
- `Pivot Engine`、`Claude Code`、`Codex` 位于 Engines；`Local Agent`、`Remote Agent` 位于 Agents，未再把 Pivot Engine 归为远程 Agent。
- Claude/Codex executable missing 状态提供选择可执行文件、重新扫描 PATH、切换 Runtime，不直接暴露 Electron RPC 错误作为唯一反馈。
- Provider / Custom Endpoint 删除采用统一 Danger Button、确认弹窗和 10 秒 Undo。
- Command Dock 覆盖空、输入、多行中文、Context Chips、上传失败、无 Provider、运行、禁用和 1024px 状态。
- Prototype 存在两条可点击主流程，使用 Dissolve / Smart Animate，并包含 Permission 的 Allow / Reject 分支。
- 变量集合共 46 个，组件/组件集共 44 个。

## 实施前必须修正

### P0：阻断开发验收

1. **核心原型 B 的真实连线顺序错误。** 当前连线是 `Running → Artifact Review → Permission → Delivered`；产品合同要求 `Running → Permission → Artifact Review → Delivered`。画板旁的流程文字正确，但点击原型不正确。
2. **Runtime 文案语义冲突。** Runtime Hub 将 Claude Code 标为 `Cloud Runtime`，而当前产品定义是外部本地 CLI Runtime；远程/托管执行必须作为独立 Runtime 类别表达。
3. **交付页面为空。** `00 Cover & Readme`、`01 Product Map`、`02 AI Explorations`、`03 Foundations`、`05 UX Flows`、`06 Wireframes`、`10 Handoff`、`99 Archive` 均没有内容。至少 Foundations 与 Handoff 必须补齐后才能称为开发可交付设计。
4. **Typography 合同缺失。** `Typography` 与 `Content Demo` Variables 集合均为 0 个变量。字体、字号、行高、字重和多语言内容样例尚未成为可执行设计合同。

### P1：进入界面实现前修正

5. **图标仍为占位方框。** 全局 Rail、页面操作和 Command Dock 中大量图标显示为空心方框，不可作为最终资产或实现参照。
6. **Compact 导航不可读。** 1024px 画板把导航压成 `No / St / Ta / Au` 与 `F / G / R / E`，缺少可理解的图标、Tooltip 或展开策略。
7. **文字裁切与溢出。** Conversation 中 AI 消息正文被容器截断；部分 1440 画板左侧 `Automation` 文字越过 Rail 边界。实现前需明确滚动、换行和最小宽度合同。
8. **Shell 命名不完全一致。** 不同 Core Screen 在 `Work`/`Sessions`、`Automation`/`Automations` 等导航词上存在差异，应统一到同一 AppShell 组件。

## 开发准入条件

- 上述 P0 全部关闭。
- 补齐图标资产或明确使用的图标库及映射。
- Handoff 页面至少包含：颜色/字体/间距/圆角/动效 Token、组件变体、响应式折叠顺序、状态优先级、资源导出规则、核心 Frame 到代码路由映射。
- 使用 Figma node ID 锁定每个实现任务，不以截图或旧设计链接作为唯一依据。
- 首批实现顺序：AppShell → CommandDock → Runtime/Agent/Model 选择合同 → Now → Conversation → Runtime Hub → Task Plan/Running → Artifact Review → Studios。

## 当前结论

信息架构与产品方向已经对齐，核心页面覆盖完整，视觉语言也已形成统一基础；但文件当前是“可进入最后一轮设计交付修正”，还不是“无需澄清即可直接全量实现”的状态。
