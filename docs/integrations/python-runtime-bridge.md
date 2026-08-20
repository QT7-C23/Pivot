# 可选 Python 外部运行时边界

> Python 不是 Pivot 的基础依赖。本文件定义用户主动运行 Python 项目时的外部进程边界，不为 awesome-llm-apps 建立内嵌应用运行时。

## 决策

Pivot 核心保持 Electron + TypeScript。来自 awesome-llm-apps 的模式应优先重写为 Pivot 本地合同；只有功能本身依赖成熟且不可替代的 Python 生态时，才允许作为用户项目中的外部进程运行。

Pivot 不负责：

- 自动克隆第三方仓库；
- 静默创建环境或执行 `pip install`；
- 读取并转发用户的 Provider Key；
- 信任本地 HTTP 服务或给予其文件/主进程权限；
- 把 Streamlit、FastAPI 或 Gradio 当作 Pivot 插件 API。

## 允许的交互

1. 用户在 Terminal 中明确启动自己的 Python 项目。
2. Pivot 可以识别进程输出中由用户确认的本地 URL。
3. Preview 只按现有 URL 策略加载该地址，继续使用隔离 guest session、导航限制和 CSP。
4. 停止、重启、端口和环境变量均由终端进程边界管理。
5. 未来如需自动化，必须先定义 `ExternalRuntimeManifest`，并逐项展示命令、工作目录、端口、环境变量名称和网络需求供用户确认。

## 安全合同

“运行在 localhost”不等于可信。外部 Python 服务必须被视为不受信任内容：

- Preview 不启用 Node integration，不暴露 preload API；
- 禁止 guest 导航到未批准协议和地址；
- Provider Key 只保留在 Electron Main 的现有安全边界中；
- 外部服务不能直接调用 Pivot 文件、终端或 MCP 工具；
- 安装依赖和启动命令属于有副作用操作，必须经过用户确认；
- 项目关闭时清理由 Pivot 启动且已登记的子进程，不扫描或终止无关 Python 进程。

## 何时值得建立 Python Adapter

只有同时满足以下条件才考虑正式 Adapter：

- TypeScript 生态没有可接受的替代实现；
- 功能对 Pivot 核心用户有重复、稳定的需求；
- 进程协议有类型化输入、输出、错误和取消语义；
- 环境安装可复现并能检查依赖许可；
- 有崩溃、超时、端口占用、半启动和清理测试；
- Adapter 不读取其他模块内部状态。

awesome-llm-apps 当前候选不满足引入正式 Python Adapter 的必要性，因此近期路线图不包含 Python/Streamlit 桥接。
