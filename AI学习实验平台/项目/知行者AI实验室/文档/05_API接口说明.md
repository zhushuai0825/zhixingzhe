# API 接口说明

后端服务地址：

```text
http://127.0.0.1:8010
```

接口文档：

```text
http://127.0.0.1:8010/docs
```

## 1. 健康检查

```http
GET /health
```

用途：检查 PostgreSQL 和 Chroma 是否连通。

返回示例：

```json
{
  "ok": true,
  "postgres": true,
  "chroma_collection_count": 109
}
```

## 2. 创建知识库

```http
POST /api/knowledge-bases
```

请求：

```json
{
  "name": "RAG 可视化学习库",
  "description": "学习 RAG 的知识库"
}
```

返回：

```json
{
  "id": "kb_xxx",
  "name": "RAG 可视化学习库",
  "description": "学习 RAG 的知识库",
  "created_at": "...",
  "updated_at": "..."
}
```

## 3. 查看知识库列表

```http
GET /api/knowledge-bases
```

用途：前端下拉框、数据中心、Agent 选择知识库都会用它。

## 4. 文本导入

```http
POST /api/knowledge-bases/{knowledge_base_id}/documents/text
```

请求：

```json
{
  "file_name": "demo.md",
  "content": "# RAG 入门\nRAG 是...",
  "chunk_size": 500,
  "overlap": 80
}
```

用途：

- 直接粘贴文本入库。
- 学习切片和向量写入流程。

## 5. 文件上传

```http
POST /api/knowledge-bases/{knowledge_base_id}/documents/upload
```

表单字段：

- `file`：上传文件。
- `chunk_size`：切片长度。
- `overlap`：重叠长度。

当前支持：

- `.txt`
- `.md`
- `.markdown`
- `.pdf`

## 6. 预览切片

```http
POST /api/documents/preview-chunks
```

请求：

```json
{
  "file_name": "preview.md",
  "content": "一段很长的文本...",
  "chunk_size": 500,
  "overlap": 80
}
```

用途：

- 不入库，只看切片效果。
- 调整 chunk_size 和 overlap。

## 7. 查看文档列表

```http
GET /api/knowledge-bases/{knowledge_base_id}/documents
```

用途：

- 数据中心展示文档。
- 检查上传是否成功。
- 删除文档前确认。

## 8. 查看切片列表

```http
GET /api/knowledge-bases/{knowledge_base_id}/chunks
```

返回内容包括：

- chunk_id。
- document_id。
- file_name。
- chunk_index。
- content。
- token_count。
- embedding_preview。

用途：

- 数据中心展示真实切片。
- 3D 向量空间展示。
- 检查切片是否合理。

## 9. 删除知识库

```http
DELETE /api/knowledge-bases/{knowledge_base_id}
```

用途：

- 清理测试知识库。
- 删除 PostgreSQL 业务数据。
- 删除 Chroma 中相关向量。

## 10. 删除文档

```http
DELETE /api/knowledge-bases/{knowledge_base_id}/documents/{document_id}
```

用途：

- 删除单个文档。
- 同步删除对应 chunk 和向量。

## 11. RAG 检索

```http
POST /api/knowledge-bases/{knowledge_base_id}/search
```

请求：

```json
{
  "question": "RAG 的核心流程是什么？",
  "top_k": 5,
  "min_score": 0.2,
  "mode": "hybrid"
}
```

参数说明：

| 参数 | 说明 |
| --- | --- |
| question | 用户问题 |
| top_k | 返回前几条命中 |
| min_score | 最低证据阈值 |
| mode | `vector`、`keyword`、`hybrid` |

返回核心字段：

- `answer`：最终回答。
- `hits`：命中 chunk。
- `retrieval_trace`：检索过程解释。
- `run_id`：RAG 运行 ID。

## 12. Agent 运行

```http
POST /api/agent-runs
```

请求：

```json
{
  "knowledge_base_id": "kb_xxx",
  "agent_type": "learning",
  "goal": "我想学习 Agent，下一步做什么？",
  "enable_reflect": true,
  "top_k": 5
}
```

参数说明：

| 参数 | 说明 |
| --- | --- |
| knowledge_base_id | 使用哪个知识库 |
| agent_type | `learning`、`rag`、`test` |
| goal | 用户目标 |
| enable_reflect | 是否开启反思 |
| top_k | 检索条数 |

返回核心字段：

- `final_answer`：大模型最终回答。
- `generation`：模型调用信息。
- `citations`：引用来源，可展开原文。
- `steps`：Agent 运行轨迹。
- `tasks`：生成任务。
- `rag_run_id`：底层 RAG 运行 ID。

## 13. 错误排查

常见错误：

- `知识库不存在`：knowledge_base_id 已删除或传错。
- `还没有知识库`：需要先创建知识库。
- `Chroma 请求失败`：Chroma 容器没启动。
- `大模型请求失败`：API Key、base_url 或模型名有问题。
- `文档内容为空`：上传文件无法解析出文字。

