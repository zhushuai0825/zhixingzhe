# 知行者 Backend MVP

这是知行者的 FastAPI 后端 MVP，用来先跑通核心闭环：

创建知识库 -> 上传文档 -> 文档解析切片 -> 知识库问答 -> 从回答生成任务

## 1. 功能

- 知识库 CRUD
- 文档上传，支持 `.txt`、`.md`、`.markdown`、`.pdf`、`.docx`
- 简单文本切片
- Embedding + FAISS 向量检索
- BM25 + 向量混合检索，支持在 RAG Lab 中开关对比
- RAG Lab 轻量 Rerank 重排序，可对比向量检索和重排后的结果
- AI 问答接口，支持无 API Key 的本地模拟回答
- RAG 质量检查，返回引用数量、最高相关度、问题覆盖率、依据强弱判断
- 更强的无依据拒答：相似度高但问题关键概念未覆盖时，会提示依据不足
- RAG 自动评测集：保存测试问题、预期判断、预期关键词，并一键输出通过率
- 任务 CRUD
- 模型配置保存、更新、删除和真实连接测试

当前数据库使用 SQLite：`data/zhixingzhe.db`。
当前向量库使用 FAISS，向量和元数据缓存在 SQLite 的 `chunk_vectors` 表。
推荐学习模式是本地 Embedding：`BAAI/bge-small-zh-v1.5 + FAISS + SQLite`。如果本地模型或 API 都没有配置，系统会使用本地 hash embedding 兜底，保证流程仍然能跑通。
RAG Lab 的 rerank 默认开启，会先召回更多候选片段，再按向量分、问题词覆盖和片段完整度重新排序。

## 2. Embedding 配置

本地 Embedding 模式：

```bash
export ZHIXINGZHE_EMBEDDING_PROVIDER="local-model"
export ZHIXINGZHE_LOCAL_EMBEDDING_MODEL="BAAI/bge-small-zh-v1.5"
```

第一次运行会从 Hugging Face 下载模型，之后会走本地缓存。切换模型后需要重建已有文档向量。

外部 Embedding API 模式：

```bash
export ZHIXINGZHE_EMBEDDING_BASE_URL="https://api.openai.com"
export ZHIXINGZHE_EMBEDDING_API_KEY="你的 API Key"
export ZHIXINGZHE_EMBEDDING_MODEL="text-embedding-3-small"
```

聊天模型配置和 Embedding 配置是两条链路：聊天模型负责生成回答，Embedding 模型负责把文档和问题转成向量。只有明确配置了本地模型或外部 Embedding 环境变量时，系统才会调用真实 embedding；否则会自动回退到本地 hash embedding。

如果服务商不支持 `/v1/embeddings`，请换成支持 OpenAI 兼容 Embedding 的服务商或模型。

聊天模型默认请求超时是 15 秒。需要调整时可以设置：

```bash
export ZHIXINGZHE_CHAT_TIMEOUT_SECONDS="20"
```

## 3. 启动

建议使用虚拟环境：

```bash
cd /Users/zhushuai/Downloads/知行者/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

启动后打开：

```text
http://127.0.0.1:8000/docs
```

## 4. DeepSeek / 千问配置

MVP 支持 OpenAI 兼容 Chat Completions 接口。

你可以通过接口保存配置：

```http
POST /api/model-configs
```

示例：

```json
{
  "provider": "DeepSeek",
  "base_url": "https://api.deepseek.com",
  "api_key": "你的 API Key",
  "default_model": "deepseek-chat",
  "enabled": true
}
```

如果不配置 API Key，问答接口会返回本地模拟答案，方便先调通前后端。
API Key 会加密保存到 SQLite，接口只返回脱敏后的 `api_key_masked`。

MiniMax 示例：

```json
{
  "provider": "MiniMax",
  "base_url": "https://api.minimax.io",
  "api_key": "你的 API Key",
  "default_model": "MiniMax-M2.7",
  "enabled": true
}
```

## 5. 推荐验证顺序

1. `POST /api/knowledge-bases` 创建知识库。
2. `POST /api/knowledge-bases/{id}/documents` 上传 txt、Markdown、PDF 或 Word。
3. `POST /api/chat` 基于知识库提问。
4. 查看 `rag_evaluation`，判断检索是否有依据、引用是否足够。
5. `POST /api/rag/evaluate` 单独验证一个问题的检索质量。
6. `POST /api/rag/lab` 对比 chunk_size、overlap、top_k 和 rerank 开关。
7. `POST /api/rag/eval-cases` 添加 RAG 回归评测用例。
8. `POST /api/rag/eval-batches/run` 用当前参数运行评测集。
9. `POST /api/tasks/generate` 从回答生成任务。
10. `GET /api/tasks` 查看任务。
