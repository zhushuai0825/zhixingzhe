# Agent 实验室学习手册

这份文档解释当前系统里的 Agent。

## 1. Agent 是什么

Agent 可以理解为“会自己规划和调用工具的 AI 工作流”。

普通聊天是：

```text
用户问 -> 大模型答
```

Agent 是：

```text
用户给目标
  -> 分析目标
  -> 决定要不要查知识库
  -> 调用 RAG 工具
  -> 读取证据
  -> 判断证据够不够
  -> 生成回答
  -> 生成任务
  -> 反思下一步
```

## 2. 当前 Agent 实验室做什么

当前 Agent 实验室用于学习：

- 目标如何被拆成步骤。
- Agent 如何调用 RAG。
- 检索结果如何变成证据。
- 证据是否足够如何判断。
- 大模型最终回答如何生成。
- 任务如何生成。
- 每一步输入输出如何记录。

## 3. 页面怎么看

运行 Agent 后，先看 `Agent 最终结果`。

这里是真正给用户看的结果：

- 大模型最终回答。
- 使用的模型。
- 引用来源。
- 下一步建议。
- 生成任务。

再看 `工具调用轨迹`。

这里是 Agent 内部流程：

- Plan。
- Retrieve。
- Observe。
- Evaluate。
- Act。
- Reflect。

最后看 `步骤调试详情`。

这里不是最终答案，只是调试日志。

## 4. Plan 节点

Plan 是计划节点。

它会分析：

- 用户目标是什么。
- 当前 Agent 类型是什么。
- 是否需要先检索知识库。

当前系统策略固定为：

```text
plan -> retrieve -> observe -> evaluate -> act -> reflect
```

后续可以升级成由大模型动态决定流程。

## 5. Retrieve 节点

Retrieve 是检索节点。

它会调用 RAG 工具：

```text
POST /api/knowledge-bases/{knowledge_base_id}/search
```

检索模式当前固定使用 Hybrid：

```text
向量检索 + BM25 关键词检索
```

输出内容包括：

- rag_run_id。
- 命中数量。
- 最高分。
- 命中的 chunk 列表。

## 6. Observe 节点

Observe 是读证据节点。

它会读取命中的 chunk，并生成证据预览。

你可以把它理解成：

```text
Agent 先把检索结果读一遍，看看里面有什么依据。
```

## 7. Evaluate 节点

Evaluate 是证据评估节点。

它会判断：

- 最高分是否达到阈值。
- 是否可以基于证据行动。

如果证据不足，Agent 应该拒绝假装知道。

## 8. Act 节点

Act 是行动节点。

当前系统在这里做两件事：

- 使用 RAG 检索结果生成大模型最终回答。
- 生成下一步任务。

返回内容包括：

- final_answer。
- tasks。
- model。
- used_model。

## 9. Reflect 节点

Reflect 是反思节点。

它会检查生成任务是否太大，并给出下一步最小行动。

例如：

```text
围绕「Agent」整理学习问题
```

这一步不是最终答案，而是“下一步做什么”的建议。

## 10. 为什么以前看起来像固定结果

最早的 Agent 实验室只展示流程和任务，没有把 RAG 的大模型回答作为最终结果展示。

所以你会感觉：

```text
为什么问什么都是 task_count 和 next_best_task？
```

现在已经改成：

```text
最终结果区展示 final_answer
调试详情区展示每一步输入输出
```

## 11. 引用来源怎么看

Agent 最终结果里的引用来源可以展开。

展开后可以看到：

- 文件名。
- chunk_index。
- 相关度。
- 原文片段。
- 来源方式。
- chunk_id。

引用来源的作用是检查：

```text
大模型回答有没有依据。
```

## 12. 当前 Agent 的边界

当前 Agent 是学习版，不是完整自主 Agent。

当前它的流程是手写的：

```text
plan -> retrieve -> observe -> evaluate -> act -> reflect
```

它还没有做到：

- 大模型动态决定是否检索。
- 多轮工具调用。
- 动态选择多个工具。
- 失败后自动重试。
- LangGraph 状态图。
- 长期记忆。

这些是后续学习方向。

## 13. 后续应该怎么升级

建议按这个顺序：

1. 增加工具定义：search_knowledge_base、list_documents、create_task。
2. 让大模型选择工具。
3. 给工具输入加 JSON schema 校验。
4. 增加最大步数，避免无限循环。
5. 增加失败重试和停止条件。
6. 使用 LangGraph 实现状态流。
7. 做 Agent 自动评测。

