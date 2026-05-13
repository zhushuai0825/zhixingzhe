# Agent 实验室需求

## 1. 模块目标

Agent 实验室是知行者 AI 实验室的第二核心模块。

目标是让用户理解：

> Agent 不是更会聊天的大模型，而是能围绕目标进行计划、调用工具、保存状态、检查结果并继续行动的 AI 程序。

## 2. 学习目标

用户通过 Agent 实验室要学会：

- Agent 和普通 Chatbot 的区别
- Tool Calling 是什么
- 工具 schema 怎么设计
- Agent 状态怎么保存
- Memory 是什么
- Planner 和 Executor 是什么
- Reflection 为什么重要
- Stop Condition 为什么重要
- Agent 为什么更需要日志和评测
- LangGraph 解决什么问题
- 如何把 RAG 做成 Agent 的工具

## 3. 页面结构

Agent 实验室页面建议采用三栏：

```text
左侧：输入目标和 Agent 配置
中间：运行轨迹
右侧：工具、状态、记忆、评测解释
```

## 4. Agent 基础流程

一次 Agent 运行应该展示：

```text
用户目标
  -> 计划 Plan
  -> 选择工具
  -> 调用工具
  -> 获取工具结果
  -> 评估结果
  -> 继续调用或停止
  -> 输出回答 / 任务 / 报告
```

## 5. Agent 类型

第一阶段做三种 Agent：

### 5.1 RAG 助手

能力：

- 判断问题是否需要检索
- 调用知识库检索工具
- 检查引用是否足够
- 基于资料回答
- 无依据时拒答

### 5.2 学习规划助手

能力：

- 根据当前学习目标拆任务
- 调用知识库查学习资料
- 输出下一步学习计划
- 生成任务中心条目

### 5.3 测试分析助手

能力：

- 根据需求或文档生成测试点
- 找风险点
- 生成验证清单
- 生成回归测试建议

这和用户测试工程师背景最匹配。

## 6. 工具设计

第一阶段工具：

- knowledge_search：检索知识库
- rag_evaluator：评估证据是否足够
- task_generator：生成任务
- note_writer：生成学习笔记
- test_case_generator：生成测试点

后续工具：

- web_search：搜索网页
- github_search：搜索 GitHub
- paper_search：搜索论文
- file_reader：读取本地文件
- code_analyzer：分析代码结构
- api_caller：调用外部接口

## 7. 运行轨迹

每一步必须展示：

- step_index
- phase
- thought
- tool_name
- tool_input
- tool_output
- status
- error_message
- cost / tokens / latency，后期加入

## 8. 第一版功能

第一版前端原型：

- 输入目标
- 选择 Agent 类型
- 是否开启反思
- 模拟运行轨迹
- 展示工具调用
- 展示 Agent 知识点

## 9. 第二版功能

接入真实后端：

- FastAPI Agent run 接口
- SQLite 保存运行记录
- 调用 RAG 检索工具
- 调用任务生成工具
- 保存任务
- 查看历史运行

## 10. 第三版功能

接入真实大模型：

- DeepSeek / 通义千问 / OpenAI Tool Calling
- 工具 schema
- JSON 参数校验
- 工具调用失败重试
- 最大步数限制
- 运行成本统计

## 11. 第四版功能

接入 Agent 框架：

- LangGraph 状态图
- 节点可视化
- 条件边
- Memory
- 多工具编排
- Agent 评测集

## 12. 验收标准

Agent 实验室合格标准：

- 用户能看懂 Agent 每一步在做什么
- 系统能展示工具输入输出
- 系统能把 RAG 作为工具调用
- 系统能生成任务
- 系统能保存运行记录
- 系统能限制最大步数
- 系统能解释失败原因

