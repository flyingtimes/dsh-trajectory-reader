# 📖 轨迹解读 · TRAJECTORY READER（DSH Web 客户端插件）

在 DSH Web GUI 的会话视图环（对话 / 轨迹旁）新增一个 **「轨迹解读」** 标签页：**按用户的原始轮次逐轮总结**，突出每一轮「用户的需求是什么」与「助手是如何完成需求的」，并支持 **✨ AI 过程解读** —— 由 LLM 生成该轮完整的思考与执行过程叙述。

## 每一轮的呈现结构

```
第 N 轮 · 工具 X 次 · 文件 Y 个 · 错误 Z 处        [✨ AI 解读本轮]
├── 🧠 AI 过程解读（可选，LLM 生成）
│      ### 用户需求 / ### 助手思路 / ### 执行过程 / ### 结果
├── 🎯 用户需求        规则引擎提炼的一两句摘要（可展开原文）
├── 🛠 助手如何完成     规划/调研/实现/验证/委派 分类的动作总结
├── ⚠ 错误 / 备注      失败的工具调用、历史压缩、输出截断、重试
├── 💬 助手回复（摘要）  回复开头摘要（可展开全文）
└── ▸ 操作明细         折叠的逐条工具调用清单
```

- **轮次划分**：每条用户消息开启一轮，其后的全部助手活动归入该轮；执行中途的补充消息（steering）单独成轮并标注；会话开头的孤儿活动归入「会话初始」。
- 规则总结即时生成、零依赖；AI 解读按需生成并缓存（材料不变不重复请求）。

## ✨ AI 过程解读（LLM 摘要）

### 架构

```
浏览器 client.js ──POST /plugin-api/trajectory-reader/summarize──▶ 服务端 index.js
      │                                                                    │
      │  { rounds: [{ key, material }] }                                    │ ctx.llm.stream()
      │                                                     system = SYSTEM_PROMPT
      ◀── { ok, route, results: [{ key, ok, text }] } ─────────────────────┘
```

- **服务端半边（`index.js`）**：由 web profile 的 Loader 行激活为 cordis 插件（`inject: ["llm", "webServer"]`），注册独占路由：
  - `GET` 同路径 → 可用性探针（客户端据此显示/隐藏 AI 按钮）；
  - `POST` → 逐轮调用宿主 `llm` 服务（模型路由默认取当前 Agent 默认模型 `agentDefaultModel.currentSelection()`，可被请求体 `provider`/`model` 覆盖），每轮 120s 超时、`maxTokens 1200`、单请求最多 12 轮。
  - 每轮材料以 **JSON 框架化**（沿用 session-title 的防注入手法：用户文本无法破坏结构定界符），所有字符串递归限长。
- **客户端半边（`client.js`）**：每轮按钮「✨ AI 解读本轮」+ 顶部「✨ AI 解读全部轮次」；结果按材料哈希缓存；AI 卡片渲染 `###` 小节标题；不可用时提示需重启 GUI。

### 摘要提示词（`index.js` 中的 `SYSTEM_PROMPT`）

> 你是 DeepSeek Harness（编程助手框架）的「会话轨迹解读员」。用户会给你一轮会话的原始材料，包括：该轮的用户消息原文、助手的回复与思考节选、按发生顺序排列的工具调用记录（工具名与参数摘要）、出现的错误与系统备注。
> 你的任务：用中文把这一轮「用户要什么，助手是怎么思考、怎么一步步执行的，最终结果如何」写成一段连贯的解读，让没有看过原始会话的人也能明白助手做了什么、为什么这么做。
>
> 必须遵守：
> 1. 只依据材料中给出的信息解读，禁止编造材料里没有的文件、命令、结论或原因；材料若有截断（出现「…」），不要猜测被截断的内容。
> 2. 输出使用以下 Markdown 结构（保留三个#的标题行，顺序不变）：`### 用户需求`（一两句话概括…）／`### 助手思路`（…为什么先做某事再做某事…）／`### 执行过程`（按实际顺序用编号列表叙述…）／`### 结果`（…完成什么、还有什么未完成或失败的）。
> 3. 重点讲清「过程」与动作之间的因果关系（例如：先读 `A` 是为了确认 `B`，随后修改 `C` 来完成 `D`），不要只罗列工具名。
> 4. 全文不超过 400 字；文件名、命令、错误信息一律用反引号包裹。
> 5. 直接输出解读内容，不要输出任何开场白、结束语，也不要整段复述材料原文。

设计要点：**四段固定结构**对应用户要求的「需求—思考—执行—结果」；**禁止编造 + 截断不猜**保证解读忠于轨迹；**强调因果承接**避免退化成工具清单；**长度上限与直出格式**保证卡片可读。

## 安装 / 启用（需重启一次 GUI）

```sh
cd "$DSH_HOME/profiles/web" && pnpm add /Users/clark/code/dsh-trajectory-reader
```

`cordis.patch.yml` 应包含（部署脚本已写入）：

```yaml
- insert:
    - id: trajectory-reader
      name: '@clarkchan/trajectory-reader'
```

重启 `dsh web` 后：「轨迹解读」标签页出现；`GET /plugin-api/trajectory-reader/summarize` 探针通过后 AI 按钮可用。客户端 bundle 的修改刷新页面即生效；**服务端 `index.js` 的修改需要重启 GUI**。

## 开发与测试

```sh
node --check client.js && node --check index.js
node test/smoke.mjs   # 61 项断言：轮次切分/规则分类/材料框架化/提示词要点/路由与流式组装
```

## 卸载

```sh
cd "$DSH_HOME/profiles/web" && pnpm remove @clarkchan/trajectory-reader
```

并从 `cordis.patch.yml` 删除 `trajectory-reader` 行。
