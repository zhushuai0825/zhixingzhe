# 向量库实验室

向量库实验室是 AI 学习实验平台的基础模块之一，用来把 RAG 中“chunk embedding 存到哪里、查询时怎么命中”的过程拆开学习。

## 学什么

- Collection 是什么。
- 一条向量记录包含哪些字段。
- Upsert 为什么既能新增也能覆盖。
- Query 为什么要先把问题变成向量。
- Top K 命中结果怎么产生。
- Metadata 过滤、引用来源和删除怎么做。
- 教学内存向量库如何升级到 Chroma、FAISS、Milvus 或 PostgreSQL + pgvector。

## 怎么运行

只看静态页面：

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台
python3 -m http.server 8099
```

打开：

```text
http://127.0.0.1:8099/平台前端/
```

启动后端：

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/向量库实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8050
```

健康检查：

```bash
curl http://127.0.0.1:8050/health
```

## 当前实现

当前版本是教学内存向量库。它不依赖真实 Chroma/Milvus/pgvector，目的是让你先把核心概念看懂：

- `id`：每条记录的唯一标识。
- `text`：chunk 原文。
- `embedding`：文本向量。
- `metadata`：来源、章节、页码等辅助信息。
- `query`：把问题向量化后做相似度匹配。

## 下一步

学完这个模块后，继续做 Rerank 实验室。Rerank 会解释：为什么向量库召回 Top K 后，还要再排序一次。
