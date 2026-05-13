# 后端服务

这一版后端先跑通最小 RAG 闭环：

```text
文本导入 -> 文本切片 -> PostgreSQL 保存文档和切片 -> 本地 Embedding -> Chroma 保存向量 -> 向量检索 / BM25 检索 / Hybrid 检索 -> 大模型基于证据生成回答
```

## 1. 准备数据库和向量库

先确认 Docker Desktop 已启动，然后在项目根目录执行：

```bash
cd /Users/zhushuai/Downloads/知行者AI实验室
docker compose up -d
```

## 2. 安装后端依赖

```bash
cd /Users/zhushuai/Downloads/知行者AI实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3. 启动 API

```bash
uvicorn app.main:app --reload --port 8010
```

打开接口文档：

```text
http://localhost:8010/docs
```

## 4. 当前接口

- `GET /health`：检查 PostgreSQL 和 Chroma 是否连通。
- `POST /api/knowledge-bases`：创建知识库。
- `GET /api/knowledge-bases`：查看知识库列表。
- `POST /api/knowledge-bases/{knowledge_base_id}/documents/text`：导入文本并切片入库。
- `POST /api/knowledge-bases/{knowledge_base_id}/documents/upload`：上传 `.txt/.md/.pdf` 文件，解析后切片入库。
- `POST /api/documents/preview-chunks`：预览切片，不写入数据库。
- `GET /api/knowledge-bases/{knowledge_base_id}/documents`：查看文档列表、类型、大小、状态和切片数量。
- `GET /api/knowledge-bases/{knowledge_base_id}/chunks`：查看切片。
- `DELETE /api/knowledge-bases/{knowledge_base_id}`：删除知识库，并同步删除向量。
- `DELETE /api/knowledge-bases/{knowledge_base_id}/documents/{document_id}`：删除文档，并同步删除向量。
- `POST /api/knowledge-bases/{knowledge_base_id}/search`：查询并返回 Top K 切片、最低相关度判断、生成回答，以及检索解释信息。`mode` 支持 `hybrid`、`vector`、`keyword`。
- `POST /api/agent-runs`：运行 Agent，返回最终回答、引用来源、任务和步骤轨迹。

## 5. 当前文档解析能力

当前支持：

- `.txt`：按 UTF-8 文本读取。
- `.md/.markdown`：按 Markdown 文本读取。
- `.pdf`：使用 `pypdf` 提取页面文字。

注意：扫描版 PDF 本质上是图片，`pypdf` 读不到文字。后续需要接 OCR 才能处理扫描件、截图、票据、合同扫描件。

## 6. Chroma 是怎么接入的

后端直接通过 Chroma HTTP API 写入和查询向量：

```text
POST /api/v2/tenants/default_tenant/databases/default_database/collections
POST /api/v2/tenants/default_tenant/databases/default_database/collections/{collection_id}/upsert
POST /api/v2/tenants/default_tenant/databases/default_database/collections/{collection_id}/query
```

这样比直接使用 Python SDK 更适合学习底层流程：你能清楚看到系统什么时候创建 collection、什么时候写入向量、什么时候查询 Top K。

## 7. 这一版 Embedding 是什么

当前使用 `local_hash_demo`，它是本地哈希向量：

- 优点：不用 API、不花钱、能离线演示向量入库和向量检索。
- 缺点：不是真正语义模型，效果不如 `bge-small-zh`、通义 Embedding、OpenAI Embedding。

后续会把这个模块替换成真实 Embedding，并在前端可视化展示“同一份文档用不同 Embedding 的检索差异”。

## 8. Hybrid RAG 是怎么做的

当前实现的是学习版 Hybrid RAG：

- `vector`：把问题向量发给 Chroma，按向量相似度召回。
- `keyword`：从 PostgreSQL 的 `document_chunks` 读取切片，用本地 BM25 算关键词相关度。
- `hybrid`：把向量分和 BM25 分融合，当前权重是 `向量 0.7 + BM25 0.3`。

这不是最终工业级检索服务，但足够学习 Advanced RAG 的关键思想：不要只依赖一种召回方式，语义相似和关键词精确匹配要互相补充。

## 9. 大模型回答

当前默认使用 SenseAudio 兼容接口的 `deepseek-v4-pro` 生成最终回答：

- 检索分数达到 `min_score`：把 Top K 片段拼成上下文，调用大模型回答。
- 检索分数低于 `min_score`：不调用大模型，直接拒答，避免无依据幻觉。
- 如果没有配置 API Key：退回本地学习版回答。

## 10. Agent 运行

Agent 接口会复用 RAG 检索能力：

```text
目标 -> RAG 检索 -> 证据评估 -> 大模型最终回答 -> 生成任务 -> 反思下一步
```

返回重点字段：

- `final_answer`：给用户看的最终回答。
- `generation`：模型调用信息。
- `citations`：引用来源，包含 chunk 原文。
- `steps`：Agent 每一步的输入输出。
- `tasks`：下一步任务。

## 11. 更完整文档

请查看：

```text
../文档/05_API接口说明.md
../文档/06_运行部署与排错.md
../文档/07_测试验收清单.md
```
