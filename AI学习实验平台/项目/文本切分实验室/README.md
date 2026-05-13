# 文本切分实验室

这是 AI 学习实验平台里的第四个项目，用来单独学习 RAG 文档预处理中的文本切分。

核心流程：

```text
长文档
  -> 选择切分策略
  -> 设置 chunk size
  -> 设置 overlap
  -> 得到多个 chunk
  -> 每个 chunk 后续单独 embedding
  -> 写入向量数据库
```

## 当前能力

- 输入长文本。
- 选择三种切分策略：字符切分、段落切分、递归切分。
- 调整 `chunk size` 和 `overlap`。
- 展示切片数量、平均长度、边界风险。
- 展示每个 chunk 的内容、长度、原文位置和 overlap。
- Canvas 可视化原文位置、切片边界和重叠区域。
- FastAPI 后端提供 `/api/split`。
- 前端支持离线兜底算法，后端未启动也能学习。

## 启动后端

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/文本切分实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8040
```

## 打开平台

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台
python3 -m http.server 8099
```

打开：

```text
http://127.0.0.1:8099/平台前端/
```

然后切换到：

```text
文本切分实验室
```

## 和前后项目的关系

- 上一个项目 `Embedding 与相似度实验室`：学习每段文本如何变成向量。
- 当前项目 `文本切分实验室`：学习长文档如何拆成文本片段。
- 下一个建议项目 `向量库实验室`：学习这些 chunk embedding 后如何存储和检索。
