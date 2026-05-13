# 模型调用与 Prompt 零基础学习手册

## 1. 模型调用是什么

你写 AI 应用时，不是直接把问题丢给网页聊天框，而是在后端调用模型 API。

一次调用通常包含：

```text
model: 用哪个模型
messages: system/user/assistant/tool 消息
temperature: 输出稳定还是发散
max_tokens: 最多生成多少
response_format: 是否要求 JSON
```

## 2. System Prompt 是什么

System Prompt 是最高优先级的行为规则。

例子：

```text
你是企业知识库助手。
只能基于提供的上下文回答。
证据不足必须说明依据不足。
输出必须是 JSON。
```

它解决的是“模型应该怎么工作”。

## 3. User Prompt 是什么

User Prompt 是用户当前的问题或目标。

例子：

```text
Graph RAG 和普通 RAG 有什么区别？
```

它解决的是“这次要回答什么”。

## 4. 上下文是什么

上下文是 RAG、工具或业务系统提供给模型的资料。

模型不是数据库。你不给上下文，它就只能靠训练时的泛化知识回答，企业知识库场景就容易幻觉。

## 5. 为什么要结构化输出

如果模型只输出自然语言，后端很难稳定处理。

比如你希望拿到：

```json
{
  "answer": "...",
  "citations": ["doc1"],
  "next_steps": ["..."],
  "risk": "..."
}
```

那就应该明确要求 JSON，并对字段做校验。

## 6. 为什么要校验

模型输出可能出现：

- 不是合法 JSON。
- 少字段。
- 字段类型不对。
- 没有引用来源。
- 引用了不存在的资料。
- 证据不足还硬答。

所以真实系统必须校验。

## 7. 重试应该怎么做

重试不是简单重复请求。

正确做法是带上失败原因：

```text
你上一次输出缺少 citations 字段。
请严格按 JSON Schema 重新输出。
不要添加 Markdown。
```

常见重试策略：

- 降低 temperature。
- 缩短上下文。
- 强化输出格式。
- 明确失败原因。
- 多次失败后返回可解释错误。

## 8. 成本怎么估算

模型调用成本通常和 token 数有关。

```text
总成本 = 输入 tokens 成本 + 输出 tokens 成本
```

影响成本的因素：

- 上下文长度。
- 输出长度。
- 模型价格。
- 重试次数。
- 是否用了强推理模型。

RAG 系统里，很多成本浪费来自“塞了太多无关 chunk”。

## 9. 温度 temperature 是什么

temperature 越低，输出越稳定。

temperature 越高，输出越发散。

结构化输出、RAG 问答、生产接口，一般用低温度。

创意写作、头脑风暴，可以用高一点。

## 10. 线上要记录什么

建议记录：

- request_id。
- user_id。
- model。
- prompt 版本。
- input tokens。
- output tokens。
- latency。
- cost。
- retry_count。
- error_type。
- citations。
- 用户反馈。

注意：不要随便明文记录 API Key、身份证、手机号、合同敏感内容。

## 11. RAG Prompt 模板

一个基础模板：

```text
你是企业知识库助手。
请只基于上下文回答问题。
如果上下文没有依据，请回答“当前知识库依据不足”。
回答必须包含引用来源。
输出 JSON：
{
  "answer": string,
  "citations": string[],
  "risk": string
}
```

## 12. 面试怎么讲

可以这样回答：

```text
模型调用工程不只是发 HTTP 请求，还要设计消息结构、Prompt 版本、结构化输出、结果校验、失败重试、限流、成本统计和日志追踪。RAG 场景尤其要约束模型只能基于证据回答，并对引用字段做校验。生产环境还要保护 API Key 和敏感数据。
```
