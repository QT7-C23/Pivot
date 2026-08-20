# awesome-llm-apps 集成策略

> 审查基线：2026-07-19。上游仓库采用 Apache-2.0；本文件只把它当作模式、测试场景和交互参考，不把其框架栈直接并入 Pivot。

## 1. 结论

[awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) 对 Pivot 有价值，但价值主要来自可复用的 Agent 模式，而不是 Python、Streamlit 或特定厂商 SDK。

Pivot 的集成原则：

1. **提取合同，不复制运行时。** 将示例中的路由、权限、证据、门控和审计行为转成 TypeScript 合同与行为测试。
2. **依赖最小化。** 不因单个示例引入 Python 服务、Streamlit、CrewAI、Agno、Google ADK、Pydantic AI、Qdrant、E2B 或另一套前端框架。
3. **Provider 中立。** 示例里的 OpenAI、Anthropic、Gemini 调用必须映射到 Pivot 现有 `AgentAdapter` / AI SDK Provider 边界。
4. **能力最小授权。** MCP、文件、终端和网络工具按 Worker 显式授权，不允许 Agent 自动继承全部工具。
5. **用户掌控变更。** 自改进、自修复和自动安装必须经过评测、Diff 与确认；不得静默修改 Skill 或项目。
6. **全免费。** 可以提供免费的内置模板、Skill 和社区导入，不设置 Premium、付费市场或商业插件层。

## 2. 与 Pivot 现状的对应关系

| 上游模式 | Pivot 已有基础 | 应落在的本地合同 | 处理方式 |
|---|---|---|---|
| 多 MCP Agent Router | MCP SDK、stdio / Streamable HTTP、配置加载器 | `AgentCapabilityProfile`、`McpToolGrant`、`AgentRouteDecision` | 重写为 Axis Engine 的最小权限路由 |
| Typed Agentic RAG | SQLite、Zod、Provider 中立流式协议 | `RetrievalEvidence`、`Citation`、`GroundedAnswer` | 先立证据与拒答合同，再做索引 |
| Scope Creep Detector | Plan、Diff、Checkpoint、权限管理 | `ChangeIntent`、`ScopeFinding`、`ScopeReport` | 迁移确定性规则，不引入 Python |
| Self-improving Skills | Skill 工作区、Agent 执行链 | `SkillScenario`、`SkillEvaluation`、`SkillMutationProposal` | 只做评测与候选变更，人工接受 |
| Trust-gated Team | Axis Engine 规划、操作日志 | `WorkerEligibility`、`AuditEvent` | 借鉴能力门控和哈希链，不照搬主观信任分 |
| Release Radar | package.json、项目上下文、Cookbook 规划 | `DependencySignal`、`DependencyAudit` | 先做手动、只读的免费 Skill |
| MCP App Builder | 隔离 Preview WebView | 官方 MCP Apps `ui://` 资源合同 | 远期按官方规范实现，不复制 E2B 技术栈 |

## 3. 首批值得吸收的模式

### 3.1 变更范围检测

来源：[Scope Creep Detector](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/agent_skills/scope-creep-detector)

它在工作区 Diff 和一句任务意图之间做确定性检查，能够发现无关目录、新依赖、公开 API 改名、配置/CI 变动、超大修改、纯格式化文件和跨子系统扩散。

Pivot 应将其实现为 TypeScript 纯函数，并接在 Plan 生成后与提交/完成前。结果是建议和门控输入，不替代用户确认。

### 3.2 MCP 最小权限路由

来源：[Multi-MCP Agent Router](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/mcp_ai_agents/multi_mcp_agent_router)

值得复用的是“每类 Worker 只拿到所需 MCP Server/Tool”的模型，以及自动路由失败时的手动选择。Pivot 不应移植其 Python/Streamlit/Anthropic 实现，而应在 Axis Engine 中建立可序列化授权合同。

路由必须同时支持：

- 确定性或规则优先的自动建议；
- 用户手动指定 Worker；
- 未授权工具调用的明确拒绝；
- 对每次授权和调用记录审计事件。

### 3.3 有证据的 RAG

来源：[Typed Agentic RAG with Pydantic AI](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/rag_tutorials/agentic_typed_rag_pydanticai)

最重要的不是 Pydantic AI，而是以下协议：回答携带原文片段、chunk ID、置信度和 `answered` 状态；检索不足时在调用模型前拒答；模型输出后再次核对引文是否真实存在于对应来源。

Pivot 应以 Zod 定义等价合同，先使用 SQLite/FTS 作为本地检索基线，再把 Embedding 和向量存储放在可替换接口后。无有效证据时必须返回可解释拒答，不允许生成“看似有引用”的文本。

### 3.4 Skill 评测闭环

来源：[Self-Improving Agent Skills](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/agent_skills/self-improving-agent-skills)

可复用流程是“生成场景 → 执行 → 按标准评分 → 提出一次小修改 → 重新评分 → 只保留提升”。Pivot 必须增加两条约束：评测使用 Provider 中立合同；Skill 修改只生成 Proposal 和 Diff，用户确认后才能写入。

### 3.5 可审计的 Worker 门控

来源：[Trust-Gated Multi-Agent Research Team](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/advanced_ai_agents/multi_agent_apps/trust_gated_agent_team)

可复用的是“资格通过才参与”和 SHA-256 哈希串联事件；不采用没有可靠校准依据的通用信任分数。Pivot 的资格应来自明确条件，例如工具授权、前置检查、测试结果和证据完整性。

### 3.6 依赖发布雷达

来源：[Release Radar Agent](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/always_on_agents/release_radar_agent)

它适合作为免费的开发者 Skill：读取项目清单，聚合安全、破坏性变更、撤包、弃用和大版本信号，过滤低价值补丁噪声。首版只提供手动触发和本地报告；网络访问、计划任务和外部通知全部显式启用。

## 4. 仅作远期参考

- [RAG Failure Diagnostics Clinic](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/rag_tutorials/rag_failure_diagnostics_clinic)：适合作为 RAG 故障分类和验收语料，不是运行时依赖。
- [AI MCP App Builder](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/generative_ui_agents/ai-mcp-app-builder)：只参考交互方向。真正实现应遵循[官方 MCP Apps 扩展](https://github.com/modelcontextprotocol/ext-apps)，并保持 `ui://` 内容在隔离 iframe/WebView 中运行。
- [Headroom Context Optimization](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/advanced_llm_apps/llm_optimization_tools/headroom_context_optimization)：只借鉴稳定前缀、工具调用对完整性和查询相关选择；在独立基准证明收益前，不引入代理服务或 Python 包。
- Multi-LLM Shared Memory：只借鉴 Provider 中立记忆合同。Pivot 优先使用现有 SQLite/FTS，不为示例增加 Qdrant 和 Docker。

## 5. 明确不做

- 不把上游应用批量包装成 Pivot 内嵌 Streamlit 页面。
- 不让 Web Preview 或生成式 UI 获得 Pivot 主进程、文件系统或 Provider Key 权限。
- 不复制第三方系统 Prompt 后宣称为 Pivot 原生能力。
- 不引入按框架划分的 ADK/CrewAI/Agno/Pydantic AI 兼容层。
- 不默认安装 Python、Docker、向量数据库或云沙箱。
- 不建设付费 Skill 市场、Premium Skills 或商业插件。

## 6. 采用检查表

每个候选模式只有同时满足以下条件才进入实现：

- 有清晰的 Pivot owner 与输入/输出合同；
- 能通过当前 TypeScript/Electron 架构实现，或外部运行时确有不可替代价值；
- 外部工具权限可以最小化并被审计；
- 包含失败路径、拒答路径或越权路径测试；
- 第三方许可和 NOTICE 要求已核对；
- 不破坏全免费制度；
- 不绕过 Plan、Diff、Checkpoint 和用户确认。
