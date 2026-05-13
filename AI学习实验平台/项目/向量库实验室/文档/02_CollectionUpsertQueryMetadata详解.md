# Collection、Upsert、Query、Metadata 详解

## 1. Collection

Collection 是向量库中的逻辑集合。

你可以把它理解成一张表，但它和普通表不完全一样，因为它的核心字段是向量。

普通数据库表可能长这样：

| id | title | created_at |
| --- | --- | --- |
| 1 | RAG 入门 | 2026-05-11 |

向量库 collection 更像这样：

| id | text | embedding | metadata |
| --- | --- | --- | --- |
| chunk-1 | RAG 使用 embedding... | `[0.1, 0.3, ...]` | `{source: "rag.md"}` |

## 2. Upsert

Upsert 是向量库最常见的写入方式。

### 2.1 新增

如果 collection 中没有 `chunk-new`：

```json
{
  "id": "chunk-new",
  "text": "向量数据库负责存储 embedding。",
  "metadata": {
    "source": "custom.md",
    "section": "自定义"
  }
}
```

执行 upsert 后，collection 多一条记录。

### 2.2 覆盖

如果 collection 中已经有 `chunk-new`，再次 upsert 同一个 id，会覆盖：

- 原来的 text。
- 原来的 embedding。
- 原来的 metadata。

这在文档更新时非常重要。

## 3. Query

Query 是向量检索。

完整过程：

```text
查询文本
  ↓
生成 query embedding
  ↓
读取 collection 中所有候选向量
  ↓
计算 query vector 和 chunk vector 的相似度
  ↓
按分数排序
  ↓
返回 Top K
```

当前教学版使用点积形式的余弦相似度。因为向量已经做了归一化，所以点积越大，方向越接近。

## 4. Metadata

Metadata 是工程里非常容易被忽视、但非常重要的部分。

### 4.1 引用来源

如果命中结果没有 metadata，你就不知道答案来自哪里。

好的 RAG 回答应该能展示：

- 文件名。
- 页码。
- 章节。
- 片段 ID。

### 4.2 过滤范围

用户可能只想查某个文档、某个产品、某个部门的数据。

例如：

```text
source = vector_db.md
```

这表示只在 `vector_db.md` 的记录里做向量检索。

### 4.3 权限控制

企业系统里，metadata 还可以保存权限。

例如：

```json
{
  "department": "qa",
  "permission": "internal"
}
```

检索前先过滤权限，再做相似度匹配，避免用户看到不该看的内容。

## 5. Delete

删除向量记录时，不只是删除原文，还要删除 embedding。

如果只删除业务表中的文档，但没有删除向量库中的 chunk，用户仍然可能检索到旧内容，这叫脏数据。

所以文档删除时通常要做：

```text
删除业务文档
  ↓
删除对应 chunk
  ↓
删除对应 embedding
  ↓
刷新索引或等待向量库自动更新
```

## 6. 本实验室里的可视化怎么理解

3D 画布里：

- `Q` 表示查询向量。
- 圆点表示 collection 中的 chunk 向量。
- 线条表示 query 和 chunk 的匹配关系。
- 命中的 Top K 会更突出。
- 鼠标悬停可以看到原文、来源和分数。

注意：真实高维向量无法直接画在屏幕上。本实验室把 12 个教学维度压到 3D 空间，只是为了帮助你直观理解“相似的向量更近”。
