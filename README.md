# 知行者本地使用说明

知行者是一个个人 AI 知识与行动助手。当前版本先跑通这条主流程：

创建知识库 -> 上传 PDF/Word/文本/Markdown 文档 -> 基于知识库问答 -> 检查引用和 RAG 质量 -> 从回答生成任务 -> 保存和推进任务

## AI 学习实验平台

仓库里已经整合了一个独立的学习平台：

```text
AI学习实验平台/
```

它用于系统学习大模型应用和算法，当前包含：

- 文本切分实验室。
- Embedding 与相似度实验室。
- 向量库实验室。
- Rerank 重排序实验室。
- RAG 评测实验室。
- Graph RAG 图谱实验室。
- Agent 工程实验室。
- 模型调用与 Prompt 工程实验室。
- ItemCF、标签推荐、UserCF、SVD 和推荐系统总览。

打开方式：

```bash
cd /Users/zhushuai/Downloads/知行者/AI学习实验平台
python3 -m http.server 8099
```

浏览器访问：

```text
http://127.0.0.1:8099
```

系统化学习资料：

```text
AI学习实验平台/学习资料/RAG核心技术学习站_上篇.html
```

这份 HTML 已补齐文本切分、Embedding、向量库、Rerank、RAG 评测、Graph RAG、Agent、Prompt 工程和综合面试题。

## 当前用的数据库

当前使用 SQLite，本地数据库文件在：

```text
backend/data/zhixingzhe.db
```

这意味着不用单独安装 MySQL 或 PostgreSQL。知识库、文档、文档切片、聊天记录、任务、模型配置都会写进这个文件。

## 当前还没有做的部分

以下能力暂时没有接入：

- Chroma / pgvector / Qdrant

现在的问答检索是 Embedding + FAISS：系统会把文档切成片段，生成 embedding 向量，用 FAISS 找出和问题最相关的片段，再交给模型回答。推荐学习模式是本地 `BAAI/bge-small-zh-v1.5` embedding；如果没有配置本地模型或外部 embedding API，会自动使用本地 hash embedding 兜底。如果没有可用聊天模型配置，会回退成本地模拟回答。每次回答会返回 `rag_evaluation`，用于练习检索命中、引用来源和拒答判断。

## Embedding 配置

本地 Embedding 模式：

```bash
export ZHIXINGZHE_EMBEDDING_PROVIDER="local-model"
export ZHIXINGZHE_LOCAL_EMBEDDING_MODEL="BAAI/bge-small-zh-v1.5"
```

外部 Embedding API 模式：

```bash
export ZHIXINGZHE_EMBEDDING_BASE_URL="https://api.openai.com"
export ZHIXINGZHE_EMBEDDING_API_KEY="你的 API Key"
export ZHIXINGZHE_EMBEDDING_MODEL="text-embedding-3-small"
```

如果不配置，系统仍然可以用本地 hash embedding 跑通流程，但语义检索效果不如真实 embedding。

## 启动后端

```bash
cd /Users/zhushuai/Downloads/知行者/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

启动后可以打开接口文档：

```text
http://127.0.0.1:8000/docs
```

健康检查：

```text
http://127.0.0.1:8000/api/health
```

## 打开前端

直接打开：

```text
vb界面/index.html
```

前端会请求：

```text
http://127.0.0.1:8000
```

所以要先启动后端，再打开页面。

## 大白话使用流程

1. 先点“新建知识库”，比如叫“AI 学习资料”。
2. 点“上传文档”，选择 pdf、docx、txt、md 或 markdown 文件。
3. 进入“AI 问答”，选择刚才的知识库，然后提问。
4. 看右侧“引用来源”和“RAG 质量检查”，判断回答是否有依据。
5. AI 回答下面可以点“生成任务”。
6. 弹窗里确认候选任务，点保存后任务会进入“任务中心”。
7. 在任务中心点“开始”或“完成”，状态会写回数据库。
8. 在“设置”里填 MiniMax、DeepSeek、千问等 OpenAI 兼容模型配置，保存并测试后，后续问答会优先使用启用的模型。

## 支持的上传格式

当前支持：

- `.txt`
- `.md`
- `.markdown`
- `.pdf`，文本型 PDF，扫描件需要先 OCR
- `.docx`

当前 Word 解析提取正文段落；复杂表格、图片、批注不作为 MVP 保证范围。

## 模型配置说明

模型配置保存在 SQLite 的 `model_configs` 表里。API Key 会加密保存，前端只显示脱敏结果。

MiniMax 示例：

```text
服务商：MiniMax
API Base URL：https://api.minimax.io
默认模型：MiniMax-M2.7
```

## 常用接口

```text
GET  /api/knowledge-bases
POST /api/knowledge-bases
POST /api/knowledge-bases/{id}/documents
POST /api/chat
POST /api/rag/evaluate
GET  /api/chat/sessions
POST /api/tasks/generate
POST /api/tasks
GET  /api/tasks
POST /api/model-configs
POST /api/model-configs/test
```
