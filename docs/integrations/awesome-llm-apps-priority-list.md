# awesome-llm-apps 模式采用优先级

> 这是实现顺序，不是复制应用的排行榜。优先级以 Pivot 产品合同、用户价值、依赖成本和安全边界为准。

## P0：进入下一轮底层合同设计

| 顺序 | 模式 | Pivot 交付物 | 依赖策略 | 完成标准 |
|---|---|---|---|---|
| 1 | Scope Creep Detector | `ChangeIntent` / `ScopeReport` 纯函数与 Plan/Diff 门控 | TypeScript 原生实现，无新增运行时依赖 | 能对无关文件、新依赖、配置修改和超大变更给出真实定位 |
| 2 | Multi-MCP Agent Router | Worker 能力档案、MCP Tool Grant、自动/手动路由 | 复用现有 MCP SDK 与 Zod | 未授权工具不可调用；路由和授权可审计 |
| 3 | Typed Agentic RAG | Evidence、Citation、GroundedAnswer、检索前/输出后双门控 | SQLite/FTS 起步，Embedding 可插拔 | 弱检索和伪引用均返回结构化拒答 |

P0 的先后关系：先定义合同和结构测试，再接 UI；RAG 在证据合同稳定前不选向量数据库。

## P1：底层合同稳定后实现

| 顺序 | 模式 | Pivot 交付物 | 约束 |
|---|---|---|---|
| 4 | Self-improving Agent Skills | 场景集、评测器、单次 Mutation Proposal、前后分数对比 | 不自动写入，必须经过 Diff 和用户接受 |
| 5 | Release Radar Agent | 手动依赖审查 Skill、本地结构化报告 | 默认无计划任务、邮件或 Webhook；联网显式授权 |
| 6 | Trust-gated Team | Worker 资格条件与哈希链操作日志 | 使用客观 Gate，不采用未经校准的“信任分” |

## P2：有真实需求和基准后再做

| 模式 | 用途 | 启动条件 |
|---|---|---|
| RAG Failure Diagnostics | 故障分类、评测数据和回归测试 | P0 RAG 已有真实语料与失败样本 |
| MCP Apps / Generative UI | 工具返回交互式 UI | MCP 权限模型、Preview 隔离和官方协议适配完成 |
| Context Optimization | 上下文选择与缓存优化 | 有可重复的质量、成本、延迟基准证明收益 |
| Shared Memory | 跨 Provider 长期记忆 | 会话记忆边界、隐私清理和本地存储策略稳定 |

## 不进入路线图

| 候选 | 原因 |
|---|---|
| 批量迁移 Starter/Travel/Finance/Health 示例 | 偏演示和领域 Prompt，不能补足 Pivot 的底层能力 |
| Streamlit 内嵌应用商店 | 引入第二套 UI/运行时，权限与体验均无法统一 |
| CrewAI / Agno / Google ADK 运行时兼容层 | 与 Axis Engine 重叠，形成多套状态和工具合同 |
| Qdrant / Docker 默认记忆栈 | 对桌面本地优先产品过重，SQLite 基线尚未证明不足 |
| E2B / CopilotKit / Mastra MCP App Builder 技术栈 | 依赖面过大，且应优先遵循官方 MCP Apps 协议 |
| Headroom 透明代理 | 收益声明需要在 Pivot 工作负载上独立复现 |
| Premium Skills / 商业插件 | 与 Pivot 全免费制度冲突 |

## 建议实施切片

1. `axis-contracts`：建立能力档案、工具授权和路由决策，不执行 MCP 调用。
2. `scope-guard`：建立确定性 Diff 分析和结构测试，接入只读 Plan 流程。
3. `grounded-answer-contracts`：建立 RAG 证据、引用和拒答合同以及伪引用测试。
4. `axis-runtime`：在合同稳定后把 Router 接到现有 MCP Client。
5. `skill-eval`：以 Scope Guard 或一个内置免费 Skill 作为第一个真实评测对象。

每个切片独立通过类型检查、行为测试和越权/失败路径测试后再进入下一步。
