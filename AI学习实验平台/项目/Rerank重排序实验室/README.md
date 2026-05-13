# Rerank 重排序实验室

Rerank 是 RAG 里非常关键的提准步骤。向量库先召回一批“可能相关”的 chunk，Rerank 再重新判断这些 chunk 和用户问题的匹配程度，把真正能回答问题的证据排到前面。

核心流程：

```text
用户问题
  -> 向量库召回 Top K
  -> Rerank 对 query + chunk 成对评分
  -> 过滤低质量证据
  -> 保留 Top N 进入 prompt
  -> 大模型基于证据回答
```

## 学什么

- 为什么向量库 Top K 不等于最终证据。
- Rerank 和 Embedding 检索有什么区别。
- Rerank 为什么能提高 RAG 准确率。
- Top K、Top N、阈值如何影响成本和质量。
- 证据不足时为什么要拒答或继续检索。
- 企业 RAG 面试中怎么讲 Rerank。

## 打开方式

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台
python3 -m http.server 8099
```

浏览器打开：

```text
http://127.0.0.1:8099
```

左上角项目切换到 `Rerank 重排序实验室`。

## 当前实现

当前是纯前端教学版，不需要 API Key，也不需要真实模型。

页面用可解释规则模拟 reranker：

- 向量分：模拟向量库初筛。
- 词面匹配分：看 query 和 chunk 共同命中哪些关键词。
- 可回答性分：看 chunk 是否真的能回答问题。
- 来源质量分：模拟文档质量、可信度、时效性。
- 最终重排序分：综合以上因素得到。

真实生产里可以替换为：

- BGE Reranker。
- Cohere Rerank。
- Jina Reranker。
- 自部署 cross-encoder。
- 大模型打分 rerank。

## 文档

文档入口：

```text
文档/00_文档索引.md
```
