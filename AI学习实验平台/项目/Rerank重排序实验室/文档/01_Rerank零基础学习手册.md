# Rerank 零基础学习手册

## 1. Rerank 是什么

Rerank 中文可以叫“重排序”。

你可以先用一个很口语的方式理解：

```text
向量库：先帮你从一堆资料里捞出一批可能相关的。
Rerank：再认真读一遍这些候选，重新排出谁最能回答问题。
```

向量库像“粗筛”，Rerank 像“精筛”。

## 2. 为什么向量库 Top K 不一定准

Embedding 检索擅长找语义相近的文本，但它不一定知道“这个片段能不能直接回答问题”。

例子：

```text
问题：Rerank 在 RAG 里起什么作用？
```

向量库可能召回：

```text
片段 A：Rerank 会对候选 chunk 重新排序，让更能回答问题的证据排前面。
片段 B：RAG 使用向量数据库检索相关文档。
片段 C：推荐系统也会先召回再排序。
```

这三个都和“排序、检索、RAG”有关，但真正能回答问题的是 A。

所以 RAG 不能只说“向量库命中第一条就一定对”。向量分高只能说明语义相近，不代表证据充分。

## 3. Rerank 在流程里的位置

标准流程：

```text
文档切分
  -> chunk embedding
  -> 向量库入库
  -> 用户问题 embedding
  -> 向量库召回 Top K
  -> Rerank 重排序
  -> 取 Top N 证据
  -> 拼 prompt
  -> 大模型回答
```

Rerank 在“向量库召回之后，大模型回答之前”。

## 4. Rerank 到底在比较什么

Embedding 检索通常是：

```text
query_vector 和 chunk_vector 算相似度
```

Rerank 通常是：

```text
把 query 和 chunk 放在一起，让模型判断它们是否真正相关
```

也就是说，Rerank 更像“读题 + 读候选答案 + 打分”。

## 5. 为什么 Rerank 更准

因为它能看更细的关系：

- chunk 是否直接回答了问题。
- chunk 是否只是在同一主题下绕圈。
- chunk 是否包含关键条件。
- chunk 是否有明确依据。
- chunk 是否过长、噪声太多。

比如问题问“Rerank 起什么作用”，一个好的片段必须说清：

```text
重新排序候选证据，提升进入 prompt 的证据质量，减少幻觉。
```

只说“RAG 会检索文档”是不够的。

## 6. 为什么 Rerank 更慢

向量检索很快，因为每个 chunk 的 embedding 已经提前算好并入库了。

Rerank 慢一些，因为它通常要对每个候选做成对评分：

```text
query + chunk1 -> 分数
query + chunk2 -> 分数
query + chunk3 -> 分数
...
```

所以工程上不会全库 rerank，而是：

```text
先向量召回 Top 20 或 Top 50
再 rerank 这小批候选
最后取 Top 3 或 Top 5
```

## 7. Top K 和 Top N 怎么理解

Top K 是向量库召回数量。

Top N 是 Rerank 后最终保留数量。

例子：

```text
Top K = 20
Top N = 5
```

意思是：

```text
先从向量库找 20 条候选。
Rerank 重新排序这 20 条。
最后只把最好的 5 条放进 prompt。
```

K 太小，可能漏掉真正好证据。

K 太大，成本变高，噪声也变多。

N 太小，答案可能缺依据。

N 太大，prompt 变长，噪声增加，成本上升。

## 8. Rerank 后还要不要判断证据是否足够

要。

Rerank 只能从已有候选里挑相对更好的，但如果候选本身都很差，最高分也可能不够支撑回答。

这时应该：

- 扩大 Top K。
- 改写 query。
- 换 Hybrid 检索。
- 继续检索。
- 或者拒答。

不能因为有了 Rerank，就把低分证据硬塞给大模型。

## 9. 真实 Rerank 模型有哪些

常见选择：

- BGE Reranker。
- Cohere Rerank。
- Jina Reranker。
- bce-reranker。
- 自己微调 cross-encoder。
- 用大模型给候选打分。

入门阶段不需要马上训练模型。先要看懂：

```text
召回是粗筛，Rerank 是精筛，最终证据还要过证据门。
```

## 10. 面试回答模板

如果面试官问“RAG 里的 Rerank 是什么”，可以这样回答：

```text
Rerank 是向量检索之后的重排序步骤。
向量库先召回 Top K 候选，它速度快但可能只保证语义相似，不一定保证候选能回答问题。
Rerank 会对 query 和每个候选 chunk 成对打分，重新排序候选，把最能支撑答案的证据放到前面。
最后系统只取 Top N 进入 prompt。
它的优点是提升证据质量、减少噪声和幻觉，缺点是增加延迟和成本，所以通常只对小批候选重排。
```
