# Embedding 与相似度实验室

这是 AI 学习实验平台里的第三个项目，用来单独学习 RAG 的底层能力：

```text
文本 -> token -> embedding 向量 -> 相似度计算 -> Top K 召回
```

它不依赖外部大模型 API，也不需要 GPU。当前版本使用本地可解释的语义维度 embedding，重点是让你看懂流程和数据结构。

## 为什么先做这个

RAG 不是只有“上传文档然后问答”。真正要学懂，需要拆开：

- Embedding：文本怎么变成向量。
- 相似度：向量之间怎么比较远近。
- 文本切分：长文档怎么拆成可检索片段。
- 向量库：向量怎么存、怎么查。
- Rerank：初步召回后怎么重新排序。

本项目先解决前两个底层问题：Embedding 和相似度。

## 当前能力

- 输入查询文本。
- 编辑候选文本集合。
- 本地计算语义维度 embedding。
- 展示 token、向量维度、向量条形图。
- 对比余弦相似度、点积、欧氏距离。
- 显示 Top K 相似文本。
- 用 Canvas 绘制 3D 相似度空间，可拖拽旋转和滚轮缩放。
- 后端 FastAPI 提供 `/api/compare` 和 `/api/examples`。
- 前端有离线兜底，后端未启动时也能学习流程。

## 启动后端

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台/项目/Embedding与相似度实验室/后端
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8030
```

接口文档：

```text
http://127.0.0.1:8030/docs
```

## 打开平台

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台
python3 -m http.server 8099
```

浏览器打开：

```text
http://127.0.0.1:8099/平台前端/
```

然后在左上角项目切换里选择：

```text
Embedding 与相似度实验室
```

## 学习顺序

1. 先看 `文档/01_Embedding零基础学习手册.md`
2. 再看 `文档/02_相似度计算详解.md`
3. 打开前端实验台，修改查询文本和候选文本。
4. 观察 token、向量条形图、相似度排序怎么变化。
5. 最后看 `文档/03_工程实现说明.md`，理解前后端怎么配合。

## 当前边界

- 当前 embedding 是教学用语义维度向量，不是 OpenAI/Qwen/BGE 等真实 embedding 模型。
- 它适合学习原理，不适合作为生产级语义检索。
- 后续会继续做独立小项目：文本切分实验室、向量库实验室、Rerank 实验室。
