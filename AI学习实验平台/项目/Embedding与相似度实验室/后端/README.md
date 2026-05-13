# Embedding 与相似度实验室后端

## 启动

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/Embedding与相似度实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8030
```

## 接口

```text
GET /health
GET /api/examples
POST /api/compare
```

当前后端使用教学用语义维度 embedding，不依赖外部 API。
