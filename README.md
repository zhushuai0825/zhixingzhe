# 知行者本地使用说明

知行者是一个个人 AI 知识与行动助手。当前版本先跑通这条主流程：

创建知识库 -> 上传文本/Markdown 文档 -> 基于知识库问答 -> 从回答生成任务 -> 保存和推进任务

## 当前用的数据库

当前使用 SQLite，本地数据库文件在：

```text
backend/data/zhixingzhe.db
```

这意味着不用单独安装 MySQL 或 PostgreSQL。知识库、文档、文档切片、聊天记录、任务、模型配置都会写进这个文件。

## 当前还没有做的部分

以下能力暂时没有接入：

- 向量数据库
- Embedding 向量生成
- Chroma / pgvector / Qdrant

现在的问答检索是关键词重叠检索：系统会把文档切成片段，找出和问题关键词重合较多的片段，再交给模型回答。如果没有可用模型配置，会回退成本地模拟回答。

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
2. 点“上传文档”，选择 txt、md 或 markdown 文件。
3. 进入“AI 问答”，选择刚才的知识库，然后提问。
4. AI 回答下面可以点“生成任务”。
5. 弹窗里确认候选任务，点保存后任务会进入“任务中心”。
6. 在任务中心点“开始”或“完成”，状态会写回数据库。
7. 在“设置”里填 MiniMax、DeepSeek、千问等 OpenAI 兼容模型配置，保存并测试后，后续问答会优先使用启用的模型。

## 支持的上传格式

当前支持：

- `.txt`
- `.md`
- `.markdown`

PDF、Word 还没有接入解析能力。

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
GET  /api/chat/sessions
POST /api/tasks/generate
POST /api/tasks
GET  /api/tasks
POST /api/model-configs
POST /api/model-configs/test
```
