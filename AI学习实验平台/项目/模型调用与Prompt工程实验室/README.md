# 模型调用与 Prompt 工程实验室

这个项目用于学习真实大模型 API 接入前必须掌握的工程知识：Prompt、消息结构、结构化输出、校验、重试、成本和日志。

## 你会学到什么

- System Prompt、User Prompt、上下文分别负责什么。
- 为什么 RAG/Agent 最终都离不开模型调用工程。
- JSON Schema 和结构化输出为什么重要。
- 模型输出不稳定时如何校验和重试。
- Token、模型等级、重试次数如何影响成本。
- 线上系统要记录哪些日志。

## 怎么打开

```bash
cd /Users/zhushuai/Downloads/学习/AI学习实验平台
python3 -m http.server 8099
```

浏览器打开：

```text
http://127.0.0.1:8099/平台前端/
```

左上角项目名称切换到 `模型调用与 Prompt 工程`。

## 当前实现

当前是纯前端教学模拟器，不会调用真实 API，也不会保存 API Key。

你可以：

- 编辑 system prompt。
- 编辑用户问题。
- 编辑上下文。
- 配置 JSON Schema 字段。
- 切换模型策略、温度、最大输出。
- 开关 JSON 输出、引用校验、自动重试。
- 查看 Token 与成本估算。
- 查看 Prompt 诊断。
- 查看调用链路图。
