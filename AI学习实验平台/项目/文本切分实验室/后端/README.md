# 文本切分实验室后端

## 启动

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/文本切分实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8040
```

## 接口

```text
GET /health
GET /api/example
POST /api/split
```

当前后端只做教学切分，不依赖外部模型和数据库。
