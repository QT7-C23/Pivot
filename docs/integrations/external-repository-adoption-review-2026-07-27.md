# Pivot 外部仓库采用评估

> 审查日期：2026-07-27  
> 范围：CLI-Anything、Serena、img2threejs、Scrapling、blind_watermark、Strix、GSAP Skills、awesome-llm-apps、React Bits、RD-Agent、PentAGI  
> 目标：判断用途、许可证、Pivot 分层、直接复用边界和自主实现空间

## 1. 执行结论

这十个仓库都有可借鉴价值，但不应整体塞进 Pivot 核心。

| 层级 | 应放入的内容 |
|---|---|
| Pivot 内置基层 | 第一方插件合同、Runtime Adapter 合同、能力授权、进程隔离、Run/Artifact/Review/Checkpoint 映射、许可证清单 |
| 官方可选插件 | Serena、CLI-Anything 连接器、Scrapling、Strix、img2threejs、blind_watermark、RD-Agent 场景适配、PentAGI 外部服务连接器 |
| Skill / 模板目录 | GSAP Skills、awesome-llm-apps 中经过审查的单个 Skill 或工作流模板 |
| 第一方 UI | 自主实现的 Pivot 动效和组件；不再直接复制 React Bits 组件源码 |

最值得优先验证的是：

1. **Serena 只读 MCP 插件**：补足语义级代码理解，并复用 Pivot 已有 MCP 基础。
2. **CLI-Anything 连接器**：把专业桌面软件接入 Pivot，但只信任经过审核的单个 harness，不自动信任整个 Hub。

当前 v1.0 关键路径仍是 Worker、共享黑板、路由和质量门禁。这些第三方集成应等待 Plugin SDK 与 Runtime Adapter SDK 的合同稳定，不能反过来定义 Pivot 核心。

## 2. 总览矩阵

“允许直接使用”只表示仓库许可证原则上允许复制、修改和分发，不自动覆盖依赖、模型、数据集、字体、图片、目标网站、目标软件、商标和云服务。本文不是正式法律意见；发行前仍需以锁定 commit 生成 SBOM。

| # | 仓库 | 主要作用 | 上游许可证 | Pivot 定位 | 直接复用 | 自主实现 |
|---:|---|---|---|---|---|---|
| 1 | HKUDS/CLI-Anything | 为现有软件构建 Agent 可调用的 CLI harness 和技能目录 | Apache-2.0 | 基层采用合同；具体 harness 做插件 | 可以，有 NOTICE/修改标记要求 | 可以，推荐自建 Pivot Adapter 标准 |
| 2 | oraios/serena | 基于语言服务器的符号级检索、编辑和重构 MCP | MIT | 官方可选 Code Intelligence 插件 | 可以，先作为 MCP 外部进程 | 可以，但自建多语言语义引擎成本高 |
| 3 | img2threejs/img2threejs | 从参考图生成程序化、可动画的 Three.js 模型 | Apache-2.0 | 3D 创作插件或 Skill | 可以，不进入核心 | 可以，可做 Pivot 原生 3D 工作流 |
| 4 | D4Vinci/Scrapling | 自适应解析、动态抓取、Spider 和反自动化处理 | BSD-3-Clause | Web Research / Data Collection 插件 | 可以，但网络和站点条款风险高 | 可以；不建议自研绕过反爬 |
| 5 | guofei9987/blind_watermark | DWT-DCT-SVD 图片盲水印 | MIT | 图像/视频导出后处理插件 | 可以，适合 Python 外部插件 | 可以，可改写为 Rust/WASM/TS |
| 6 | usestrix/strix | AI 动态渗透测试、PoC 验证和修复报告 | Apache-2.0 | 高风险 Security Audit 插件 | 许可证允许，运行必须强隔离 | 可以，但必须先立授权目标合同 |
| 7 | greensock/gsap-skills | 教 Agent 正确使用 GSAP 的技能包 | MIT | 开发者 Skill / 内部制作工具 | Skills 可以；GSAP Runtime 另有条款 | 可以自建 Pivot Motion Skill |
| 8 | Shubhamsaboo/awesome-llm-apps | Agent、RAG、Skill 和工作流示例集合 | Apache-2.0 | 模式库、模板来源、评测语料 | 单个审查后可用，不整仓运行 | 可以，推荐按 Pivot 合同重写 |
| 9 | DavidHDev/react-bits | React 动效组件和视觉效果 | MIT + Commons Clause | 仅作设计参考；不作为依赖 | 对开源源码分发存在限制风险 | 可以，推荐 clean-room 第一方实现 |
| 10 | microsoft/RD-Agent | 自动化数据科学、量化、模型与研发迭代 | MIT | R&D Lab 外部运行时插件 | 可以，但依赖 Linux/Python/Docker | 可以，先自建通用实验循环合同 |
| 11 | vxcontrol/pentagi | 自托管多 Agent 渗透测试平台、工具容器、知识图谱、监控和报告 | 源码 MIT；另有 EULA、NOTICE、Cloud SDK 与商业激活条款 | 只连接用户自行部署的外部服务 | 暂不复制或随 Pivot 分发 | 可以自建安全编排合同和轻量执行器 |

### 维护信号

- 2026 年 7 月仍有提交：Serena、img2threejs、Scrapling、Strix、awesome-llm-apps、React Bits。
- 2026 年 4–7 月有提交：CLI-Anything、GSAP Skills、RD-Agent、PentAGI。
- blind_watermark 最近可见提交为 2025 年 9 月，接入前应额外检查依赖兼容性和未解决问题。

“近期有提交”只能说明维护活动，不能代替安全审计、发布稳定性和 API 兼容性测试。

## 3. 逐项评估

### 3.1 HKUDS/CLI-Anything

资料：[README](https://github.com/HKUDS/CLI-Anything/blob/main/README.md) · [License](https://github.com/HKUDS/CLI-Anything/blob/main/LICENSE) · [近期提交](https://github.com/HKUDS/CLI-Anything/commit/bc536c9bebb7c3d9f7bb2736a732609139c1acdb)

它是一套把 GUI 软件、桌面软件或服务包装成结构化 CLI 的方法、生成流程和社区 Hub。Agent 通过稳定命令、JSON 输出、预览和测试来操作 Blender、LibreOffice、Obsidian、Kdenlive 等外部软件。

对 Pivot 最有价值的是：

- harness manifest；
- JSON 与人类可读双输出；
- preview / live preview；
- 软件存在性和版本探测；
- 可重复的 CLI 测试；
- Skill 与 CLI 配套分发；
- Hub 的发现、安装和更新模型。

采用“核心合同 + 插件实例”：

- Pivot 核心自建 `RuntimeAdapterManifest`、`CapabilityGrant`、`RunEvent`、`Artifact` 和安装确认合同；
- `CLI-Anything Hub Connector` 是可选插件；
- 每个具体 harness 是单独插件或外部运行时，不进入主安装包；
- 安装命令必须先展示、签名校验并由用户确认，禁止 Agent 静默安装。

许可证是 Apache-2.0，允许商用、修改、分发和再许可派生整体，并提供专利授权。分发时要保留许可证和归属通知、标记修改；如果上游包含 `NOTICE`，也要处理。仓库许可证不等于目标软件许可证，每个 harness 仍需单独审计。

可以自主实现，而且 Pivot 应自建自己的 Adapter 标准，不让 CLI-Anything 的内部目录结构成为永久协议。

**决策：采用模式，暂不整仓内置。P0 建合同，P1 做连接器。**

### 3.2 oraios/serena

资料：[README](https://github.com/oraios/serena/blob/main/README.md) · [License](https://github.com/oraios/serena/blob/main/LICENSE) · [近期提交](https://github.com/oraios/serena/commit/026b007bb889366283c925527e9a3bab317f66c1)

Serena 借助语言服务器和符号关系，为 Agent 提供类似 IDE 的语义检索、引用查找、编辑、重构和调试工具，并通过 MCP 暴露能力。它解决纯文本搜索和按行修改不可靠的问题，尤其适合大型、多语言、跨文件项目。

推荐作为官方可选 MCP 插件：

1. 第一阶段只开放符号检索、引用查询和只读分析；
2. 编辑类动作继续经过 Pivot Main 的权限、Checkpoint 和 Diff Review；
3. 禁止外部进程直接持有 Provider Key；
4. 每个项目隔离进程或工作区状态；
5. 语言服务器安装过程必须可见、可取消、可清理；
6. 语义证据映射到 Plan、Run 和 Review。

MIT 允许复制、修改、分发和再许可，要求保留版权和许可证。各语言服务器可能有独立许可证与下载要求，需按语言审计。

可以基于 LSP 自建 `CodeIntelligencePort`，但完整覆盖多语言和可靠重构成本很高。近期接入 Serena、长期保持可替换接口更合理。

**决策：首选试点插件。P1。**

### 3.3 img2threejs

用户提供的 `hoainho/img2threejs` 当前解析到 `img2threejs/img2threejs`。

资料：[README](https://github.com/img2threejs/img2threejs/blob/main/README.md) · [License](https://github.com/img2threejs/img2threejs/blob/main/LICENSE) · [近期提交](https://github.com/img2threejs/img2threejs/commit/f1ade81d45252ede20323d74a5b269c819f75245)

它不是传统的“图片直接生成网格”模型，而是一套 Agent 工作流：分析参考图、建立对象规格、分阶段用 Three.js primitive 和程序化材质重建，再通过截图和视觉评审循环改进。输出是可读、可修改、可动画的 TypeScript/Three.js 场景代码。

适合未来的 Image → 3D Scene、Three.js 场景工坊、网页 3D 资产和小游戏资产插件。结果可先映射为 `webpage` Artifact，未来再增加 `3d-scene` 类型。

它应作为可选 3D Creator Skill/Studio 插件，依赖 Preview 和用户选择的视觉模型，不应常驻核心。

Apache-2.0 允许直接使用和修改，需要履行许可证、NOTICE、修改标记和归属义务。参考图中的人物、角色、品牌产品和生成结果的版权、商标、肖像权不由该许可证解决。

可以自建 `SceneSpec`、阶段门禁、视觉评分和 Three.js 工厂合同。

**决策：v2 创作插件候选。P2。**

### 3.4 D4Vinci/Scrapling

资料：[README](https://github.com/D4Vinci/Scrapling/blob/main/README.md) · [License](https://github.com/D4Vinci/Scrapling/blob/main/LICENSE) · [近期提交](https://github.com/D4Vinci/Scrapling/commit/fc96fcc3868f3088e1253dc11975ad921077028e)

Scrapling 是 Python Web Scraping 框架，覆盖解析、动态页面、Spider、并发抓取、会话、代理、暂停恢复和 MCP。它还提供页面变化后的自适应定位，并强调绕过部分反自动化系统。

它适合研究资料收集、网页结构化提取、版本/价格监测和数据集 Artifact，但只能作为网络权限受控的外部插件：

- 每次运行声明域名 allowlist；
- 区分普通 HTTP、动态浏览器、登录态和代理；
- 默认遵守 robots、速率限制和网站条款；
- Cookie 与凭据不得进入普通 Run 日志；
- 结果保留来源 URL、时间和提取规则；
- Stealth/anti-bot 默认关闭，不得用于绕过访问控制。

BSD-3-Clause 允许源码和二进制商用、修改和分发，需要保留版权、条件和免责声明，并禁止未经许可使用作者名称为 Pivot 背书。网站内容、数据库权利、个人信息和服务条款是独立合规问题。

可以自建普通抓取、解析和证据合同；不建议自研绕过反爬能力。

**决策：受控 Web Research 插件，不把绕过能力当卖点。P2。**

### 3.5 guofei9987/blind_watermark

用户写的 `blind-watermark` 实际仓库名是 `blind_watermark`。

资料：[README](https://github.com/guofei9987/blind_watermark/blob/master/README.md) · [License](https://github.com/guofei9987/blind_watermark/blob/master/LICENSE) · [最近可见提交](https://github.com/guofei9987/blind_watermark/commit/322c90dc02d45644692095b34d3a6b735b6edbd8)

它使用 DWT-DCT-SVD 在图片中嵌入和提取不可见水印，支持文本或图片水印及一定程度的攻击测试。

适合 Media Provenance/Watermark 插件：

- 为导出图像嵌入项目 ID、Artifact ID 或作者声明；
- 批量嵌入与验证；
- 在 Artifact 元数据记录算法和参数；
- 作为图片/视频插件导出后处理。

它不能单独证明内容真实性，也不应宣传为可靠的 AI 内容溯源标准。有损压缩、裁切、缩放和编辑都可能破坏水印。

MIT 允许直接使用和修改，保留版权和许可证即可。MIT 没有 Apache-2.0 那样明确的专利授权；正式取证用途仍需检查算法专利、可靠性和适用性。

可以基于公开数学方法自建，也可改写为 Rust/WASM，配套跨编码器、缩放、裁切、噪声和重压缩测试。

**决策：轻量媒体插件，不进入核心。P2。**

### 3.6 usestrix/strix

资料：[README](https://github.com/usestrix/strix/blob/main/README.md) · [License](https://github.com/usestrix/strix/blob/main/LICENSE) · [近期提交](https://github.com/usestrix/strix/commit/c55a8fa4baec6f2f0e3288ea66e13f2ac71aef0c)

Strix 是 AI 驱动的动态渗透测试工具，可执行侦察、利用尝试、PoC 验证、修复建议和报告，并支持多 Agent、CLI 和 CI/CD。

它可成为 Gate 3 Security Review 的外部执行器，但只能作为高风险、显式授权、隔离运行的插件：

- 默认只允许本机、容器网络或用户证明所有权的目标；
- 运行前展示目标、端口、方法类别和预算；
- 不继承普通项目的全部网络凭据；
- PoC 和攻击载荷视为敏感 Artifact；
- 禁止自动扫描公网目标；
- 支持立即停止、超时、资源预算和完整审计；
- 修复仍经过 Diff、Checkpoint 和用户 Review。

Apache-2.0 允许直接使用和修改，但 Docker 镜像、系统工具、模型、云服务和漏洞数据可能有独立条款。许可证允许不代表任何目标都可以合法测试。

可以自建安全编排和报告合同；核心只需拥有 `SecurityAssessmentScope`、`FindingEvidence`、`ExploitValidation` 和 `RemediationReview`。

**决策：等待插件沙箱成熟后接入。P2，最高安全等级。**

### 3.7 greensock/gsap-skills

资料：[Skills README](https://github.com/greensock/gsap-skills/blob/main/README.md) · [Skills License](https://github.com/greensock/gsap-skills/blob/main/LICENSE) · [近期提交](https://github.com/greensock/gsap-skills/commit/aed9cfd3277740755f6bfc1155c7aa645403b760) · [GSAP Runtime 许可证字段](https://github.com/greensock/GSAP/blob/master/package.json)

这是 GreenSock 官方 Agent Skills，教 Agent 使用 GSAP Core、Timeline、ScrollTrigger、插件、React、性能与清理模式。它本身不是动画运行时。

适合：

1. 作为 Pivot Skill Engine 的兼容性样本；
2. 作为网页、宣传页或视频动效项目的可选开发 Skill。

不建议用于 Pivot 工作台日常 UI。Pivot UI V2 需要克制、短时、可解释的状态动效，CSS/Web Animations 已能覆盖大部分需求。

`gsap-skills` 仓库是 MIT，可以复制、修改、分发并保留许可证。GSAP Runtime 不是同一份 MIT：其 `package.json` 标注 GreenSock Standard “no charge” license；官方说明当前所有插件免费并可商用，但仍不能把 Runtime 宣称为 MIT 开源依赖。

可以自建 `Pivot Motion Skill`，基于 Web Animations、CSS、生命周期清理、`prefers-reduced-motion` 和 Pivot 性能合同。

**决策：Skills 可作兼容样本；Runtime 不进入核心。P1/P3。**

### 3.8 Shubhamsaboo/awesome-llm-apps

资料：[README](https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/README.md) · [License](https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/LICENSE) · [近期提交](https://github.com/Shubhamsaboo/awesome-llm-apps/commit/e46d6feaeacf5f0bec31a92c6ec68f2a701ce714)

这是 Agent、Skill、RAG、语音、多 Agent、常驻任务和生成式 UI 示例集合。价值在场景和工作流模式，而不是统一的生产框架。

值得吸收的模式：

- Scope Creep Detector；
- MCP 最小权限路由；
- 带证据的 Typed RAG；
- Skill 评测与改进提案；
- Worker 资格门禁和审计；
- Release Radar；
- 失败诊断和可解释拒答。

确定性规则和通用合同可以重写进 Axis Engine；单个 Skill 可进入免费目录；完整应用可作为 Cookbook 模板。不要引入整套 Python、Streamlit、CrewAI、Agno、ADK、Qdrant 或第二套前端。

仓库整体 Apache-2.0，允许复用并要求保留许可证、归属、NOTICE 和修改说明。每个示例的 pip/npm 依赖、模型 SDK、外部 API、媒体和数据仍需逐项审计。

多数场景应重写为 Pivot 的 TypeScript 合同和真实行为测试。

**决策：模式库和模板来源，不是运行时依赖。持续 P1。**

### 3.9 DavidHDev/react-bits

资料：[README](https://github.com/DavidHDev/react-bits/blob/main/README.md) · [License](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) · [近期提交](https://github.com/DavidHDev/react-bits/commit/5d26a6709ad7724ea7878e8816dc99facfba9d1a)

React Bits 提供大量可复制的 React 动效组件、背景、文字和 UI 效果。它适合动效参考和原型，但不适合决定 Pivot 的工作台设计系统。

当前许可证不是普通 MIT，而是 **MIT + Commons Clause License Condition v1.0**：

- 允许作为应用、网站或产品的一部分使用，包括商业用途；
- 要求保留版权和许可证；
- 禁止销售、再许可或重新分发组件本身，包括单独、打包或移植版本。

Pivot 是开放源码并计划提供插件/组件生态。把 React Bits 源码复制进公开仓库，可能被解释为重新分发组件，因此不应继续直接复制。当前 Spotlight 派生实现已保留通知，但公开源码发行前仍应做来源/相似度审查；相似度过高时应 clean-room 重写或取得书面许可。

功能思想可以自主实现，但不能复制具体源码、命名、文档、资源或独特表达。建议以第一方规格、独立实现记录、设计 token、无障碍和行为测试完成 Pivot 动效。

**决策：暂停新代码复制，只作参考。P0 审查现有实现。**

### 3.10 microsoft/RD-Agent

资料：[README](https://github.com/microsoft/RD-Agent/blob/main/README.md) · [License](https://github.com/microsoft/RD-Agent/blob/main/LICENSE) · [近期提交](https://github.com/microsoft/RD-Agent/commit/4f9ecb005881cddc08df0124a2e894c018007679)

RD-Agent 将研发拆成提出假设的 Research 与实现/实验的 Development 循环，重点覆盖数据科学、Kaggle、量化研究、论文实现和模型微调。当前主要依赖 Linux、Python 和 Docker，并有自己的 Web UI。

最值得吸收的是通用研发循环：

- Research Proposal；
- Experiment Plan；
- Dataset/Code/Model Artifact；
- Metric 与基准；
- 失败分析；
- 下一轮假设；
- 预算与停止条件；
- 可回放实验谱系。

Pivot 应先定义 Provider 中立的 `ExperimentLoop` 合同。完整运行时以后作为 R&D Lab 外部插件：

- 环境和镜像显式安装；
- 数据目录最小挂载；
- Provider Key 使用 Main 代理或插件专用凭据；
- 训练成本、磁盘、GPU 和时间硬预算；
- 量化金融与普通数据科学分开；
- 不把其 Web UI 作为 Pivot 原生界面。

主仓库 MIT，允许使用和修改并保留通知。数据集、Kaggle 竞赛、论文代码、模型、量化数据、镜像和 Python 依赖均有独立许可证。量化输出不能宣传为投资建议。

可以自建实验循环和 Artifact 谱系，再把 RD-Agent 作为某个执行 Adapter。

**决策：吸收实验合同，完整运行时放到远期插件。P1/P3。**

### 3.11 vxcontrol/pentagi

资料：[README](https://github.com/vxcontrol/pentagi/blob/main/README.md) · [MIT License](https://github.com/vxcontrol/pentagi/blob/main/LICENSE) · [EULA](https://github.com/vxcontrol/pentagi/blob/main/EULA.md) · [NOTICE](https://github.com/vxcontrol/pentagi/blob/main/NOTICE) · [Docker Compose](https://github.com/vxcontrol/pentagi/blob/main/docker-compose.yml) · [近期提交](https://github.com/vxcontrol/pentagi/commit/879e87c2c2688c4a95eac9c1aaf3cd6f6123ebe3)

PentAGI 是完整的自托管 AI 渗透测试平台，不只是一个 CLI。它包含多 Agent 规划与监督、20 多种安全工具、Docker 沙箱、长期记忆、PostgreSQL/pgvector、Graphiti/Neo4j 知识图谱、Web 抓取、REST/GraphQL API、Web UI、报告以及可选的 Langfuse、Grafana、VictoriaMetrics、Jaeger、Loki、ClickHouse、Redis 和 MinIO 观测栈。

与 Strix 的区别：

| 维度 | Strix | PentAGI |
|---|---|---|
| 产品形态 | CLI/CI 优先的安全执行器 | 完整的自托管安全 Agent 平台 |
| Pivot 接入方式 | 受控任务执行插件 | 外部服务 REST/GraphQL 连接器 |
| 状态与记忆 | 任务级编排和报告 | 数据库、向量记忆、知识图谱和完整流程历史 |
| 部署成本 | 相对集中 | 多容器、数据库、工具镜像和观测服务 |
| 主要风险 | Agent 主动攻击能力 | 攻击能力、宿主 Docker 权限、持久敏感数据和复杂供应链 |

对 Pivot 有价值的模式包括：

- 专业安全角色分工；
- 执行监控器和工具调用上限；
- 规划步骤与用户询问；
- 每个安全 Flow 的持久证据和报告；
- 工具容器按任务选择；
- 长期记忆和知识图谱；
- REST/GraphQL 自动化接口。

但它绝不能作为 Pivot 内置基层，也不应由 Electron 在用户主工作站上自动部署。官方 Compose 默认把 `/var/run/docker.sock` 挂载到 PentAGI 容器，并以 `root:root` 运行。这让该容器能够控制宿主 Docker daemon，安全边界明显强于普通“沙箱容器”。推荐只部署在专用虚拟机、隔离服务器或独立 Docker Host 上。

Pivot 最安全的接入方式是：

1. 用户自行部署并管理 PentAGI；
2. Pivot 安装免费的 `PentAGI Connector`；
3. Connector 只保存专用 API 地址和 Bearer Token，不转发 Pivot 的 Provider Key；
4. 每次安全任务仍需 `SecurityAssessmentScope`，明确目标、端口、时间、工具类别和所有权证明；
5. Pivot 将 Flow 映射为只读 Run/Artifact/Attention，不能直接加载 PentAGI Web UI 获得 Main 权限；
6. PoC、命令输出和目标信息视为敏感数据；
7. 停止操作必须同时终止 Pivot Run 和 PentAGI 远程 Flow；
8. 不支持公网任意目标和静默后台扫描。

许可证需要比其他仓库更谨慎：

- 顶层源代码使用 MIT；
- EULA 说明源码 MIT 在冲突时优先，但同时对整体软件、官方 Docker 镜像、合法用途和再分发作了附加描述；
- `NOTICE` 声称集成的 VXControl Cloud SDK 使用 AGPL-3.0，并仅向官方 PentAGI 提供特殊例外；
- 当前 [`backend/go.mod`](https://github.com/vxcontrol/pentagi/blob/main/backend/go.mod) 引用 `github.com/vxcontrol/cloud v0.9.0`，但该 tag 的[仓库许可证](https://github.com/vxcontrol/cloud/blob/v0.9.0/LICENSE)显示为 MIT，与 `NOTICE` 描述不一致；
- [配置文档](https://github.com/vxcontrol/pentagi/blob/main/backend/docs/config.md)中的 `LICENSE_KEY` 用于 PentAGI Cloud API、premium feature activation 和 enterprise features。

因此，虽然 MIT 源码本身看起来允许修改和分发，现有许可证元数据存在矛盾。Pivot 在获得上游书面澄清、锁定依赖许可证并完成 Docker 镜像 SBOM 前，不应 fork、打包或重新分发 PentAGI，也不能采用其 License Key、Premium、Enterprise 或 Cloud 付费功能进入 Pivot 的全免费目录。

可以自主实现安全编排、Flow、监控、知识图谱和报告合同；也可以调用独立许可的安全工具。但自主实现仍必须具备目标授权、隔离执行、硬预算、审计、停止和敏感数据清理。

**决策：只做用户自托管实例的外部连接器；不内置、不代装、不转售、不接商业激活。P3。若需要较早的 Gate 3 试点，优先选择许可证和运行边界更简单的 Strix。**

## 4. Pivot 应先建立的基层合同

```text
PluginManifest
├─ identity / version / publisher / compatibility
├─ capabilities / settings schema / runtime requirements
├─ artifact types
└─ license entries

RuntimeAdapterManifest
├─ command / args / working directory
├─ environment variable names
├─ health check / cancellation
├─ timeout / memory / CPU / disk budgets
├─ network scope
└─ stdout event protocol

CapabilityGrant
├─ tool / file scope / network scope / process scope
├─ expiry
└─ audit owner

ExternalRunEvent
├─ started / progress / evidence / artifact
├─ attention request
├─ failed / cancelled / completed
└─ usage

LicenseEntry
├─ package / version / source commit
├─ SPDX or custom identifier
├─ license / notice text
├─ modification record
└─ transitive audit state
```

这些合同应由代码和结构测试强制执行。插件不能裸读其他模块状态，也不能直接获得 Provider Key、文件写入、终端执行或所有 MCP 工具。

## 5. 建议实施顺序

### P0：现在处理

1. 建立许可证与 SBOM 基线，支持 MIT、BSD-3-Clause、Apache-2.0 和自定义许可证。
2. 完成 Plugin/Runtime Adapter/Capability Grant 合同。
3. 审查现有 React Bits 派生实现，禁止新增直接复制。
4. 修复已有集成策略文档的编码问题，避免规则被 Agent 错读。

### P1：v1 稳定后

1. Serena 只读 MCP 插件；
2. CLI-Anything 单 harness 导入验证；
3. GSAP Skills 作为 Skill Engine 兼容样本；
4. awesome-llm-apps 的 Scope Creep Detector 和 Release Radar；
5. RD-Agent 实验循环合同，不接完整运行时。

### P2：v2 插件生态

1. Scrapling Web Research；
2. img2threejs 3D Creator；
3. blind_watermark Media Provenance；
4. Strix Security Audit。

### P3：生态成熟后

1. RD-Agent Linux/Docker 外部运行时；
2. 大规模 CLI Hub 导入；
3. 复杂 GSAP Runtime 驱动的创作型插件。
4. PentAGI 用户自托管实例连接器。

## 6. 发布合规清单

每个插件进入官方目录前必须回答：

- 锁定哪个 commit/tag？
- 主许可证和直接/传递依赖许可证是什么？
- 是否有 `NOTICE`、字体、图片、模型、数据或商标？
- 是否允许源码分发、二进制分发和修改？
- 是否属于非开源但“免费使用”的条款？
- 是否需要外部付费 API、账号、数据或算力？
- 安装会执行什么命令、下载什么内容？
- 需要哪些文件、终端、网络、Cookie 和凭据权限？
- 能否取消、超时、回滚和清理？
- 输出 Artifact 的权利和来源由谁负责？
- 禁止路径和越权路径是否有真实测试？

只有这些内容进入机器可验证的 manifest，才算真正完成集成。
