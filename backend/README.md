# 知行者 Backend MVP

这是知行者的 FastAPI 后端 MVP，用来先跑通核心闭环：

创建知识库 -> 上传文档 -> 文档解析切片 -> 知识库问答 -> 从回答生成任务

## 1. 功能

- 知识库 CRUD
- 文档上传，支持 `.txt`、`.md`、`.markdown`
- 简单文本切片
- 基于关键词重叠的本地检索
- AI 问答接口，支持无 API Key 的本地模拟回答
- 任务 CRUD
- 模型配置保存、更新、删除和真实连接测试

PDF、Word、向量数据库、真实 Embedding 会在后续版本加入。
当前数据库使用 SQLite：`data/zhixingzhe.db`。
当前检索是关键词重叠检索，还没有接入 Chroma、pgvector 或 Qdrant。

## 2. 启动

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

## 3. DeepSeek / 千问配置

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

## 4. 推荐验证顺序

1. `POST /api/knowledge-bases` 创建知识库。
2. `POST /api/knowledge-bases/{id}/documents` 上传 txt 或 Markdown。
3. `POST /api/chat` 基于知识库提问。
4. `POST /api/tasks/generate` 从回答生成任务。
5. `GET /api/tasks` 查看任务。
