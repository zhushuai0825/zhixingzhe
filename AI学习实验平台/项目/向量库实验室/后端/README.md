# 向量库实验室后端

## 启动

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/向量库实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8050
```

## 接口

```text
GET /health
GET /api/state
POST /api/reset
POST /api/upsert
POST /api/query
DELETE /api/documents/{id}
```

当前是教学用内存向量库，用来学习 collection、upsert、query、metadata、delete。
