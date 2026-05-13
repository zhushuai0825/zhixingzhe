# ItemCF 学习版后端

这是 ItemCF 学习实验室的 FastAPI 后端。

后端默认从 PostgreSQL 读取真实学习数据，包括用户、物品和喜欢行为，再计算 ItemCF 推荐结果、矩阵数据和 3D 物品相似度点位。

默认种子数据包含 6 个用户、31 个物品、49 条喜欢行为。

这里不使用向量数据库。ItemCF 的相似度来自用户行为共现，不是文本 embedding 语义相似度。

## 数据库

先启动 PostgreSQL：

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/基于物品的协同过滤ItemCF
docker compose up -d
```

默认连接信息在项目根目录的 `.env.example`：

```text
DATABASE_URL=postgresql://itemcf:itemcf_dev_password@127.0.0.1:5433/itemcf_lab
```

初始化 SQL：

```text
基础设施/postgres/init/001_schema.sql
```

当前表：

- `users`：用户。
- `items`：物品。
- `interactions`：用户对物品的行为，当前只使用 `like`。

## 启动

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/基于物品的协同过滤ItemCF/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8020
```

接口文档：

```text
http://127.0.0.1:8020/docs
```

## 主要接口

| 接口 | 作用 |
| --- | --- |
| `GET /health` | 健康检查。 |
| `GET /api/state?user_id=u2` | 从 PostgreSQL 返回用户、物品、行为、矩阵、推荐结果和 3D 点位。 |
| `POST /api/items` | 创建自定义物品，可同时加入当前用户喜欢。 |
| `POST /api/interactions` | 给用户新增一条喜欢行为，并写入 PostgreSQL。 |
| `DELETE /api/interactions` | 删除用户的一条喜欢行为。 |
| `POST /api/reset?user_id=u2` | 恢复 PostgreSQL 中的原始学习数据。 |

## 当前边界

- 数据量是学习级小数据，目标是把算法链路看清楚。
- 不做登录、分页和权限。
- 行为类型先只做 `like`，暂不做评分、浏览、收藏和负反馈。
- 3D 点位是根据 ItemCF 相似度矩阵生成的教学可视化，不是机器学习 embedding。

## 快速检查

```bash
curl http://127.0.0.1:8020/health
```

期望看到：

```json
{
  "status": "ok",
  "postgres": true,
  "users": 6,
  "items": 31,
  "interactions": 49
}
```
