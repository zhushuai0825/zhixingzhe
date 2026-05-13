const storageKey = "agent-lab-data-v1";

const defaultData = {
  docs: [
    { id: "d1", title: "RAG 基础", tags: ["RAG", "检索", "知识库"], text: "RAG 的核心是先检索知识库证据，再让大模型基于证据回答。证据不足时应该拒答或继续检索。" },
    { id: "d2", title: "Graph RAG", tags: ["Graph RAG", "图谱", "多跳"], text: "Graph RAG 会把文档中的实体和关系构造成图谱，适合需要多跳关系推理的金融、法律和医疗知识场景。" },
    { id: "d3", title: "Agent 工程", tags: ["Agent", "工具", "状态"], text: "Agent 通常由目标、状态、工具、控制流和停止条件组成。它不是让模型无限自由发挥，而是让模型在边界内调用工具完成任务。" },
    { id: "d4", title: "Rerank", tags: ["Rerank", "排序", "证据"], text: "Rerank 会对向量召回的候选证据重新排序，把更能回答问题的片段放到前面，减少上下文噪声。" },
    { id: "d5", title: "Agent 反思", tags: ["Agent", "反思", "评估"], text: "反思检查用于判断结果是否遗漏、任务是否太大、证据是否不足，以及是否需要重新调用工具。" },
  ],
  tools: [
    { id: "t1", name: "rag_search", desc: "从知识库检索语义相关片段", enabled: true },
    { id: "t2", name: "graph_search", desc: "根据实体和关系寻找多跳证据", enabled: true },
    { id: "t3", name: "task_writer", desc: "把目标拆成可执行学习任务", enabled: true },
    { id: "t4", name: "reflection_check", desc: "检查证据、任务大小和下一步行动", enabled: true },
  ],
};

const roadmap = [
  ["01", "先理解工具调用", "工具调用不是让模型真的会操作一切，而是把可调用能力声明出来，例如搜索知识库、查询数据库、生成任务。"],
  ["02", "学习状态管理", "Agent 每一步都要读写状态：目标、计划、工具结果、证据、失败原因、最终答案。状态混乱，Agent 就会乱。"],
  ["03", "学习控制流", "控制流决定下一步调用什么工具、什么时候停止、失败时是否重试。LangGraph 的价值就在这里。"],
  ["04", "学习证据门", "Agent 不能把工具输出当真理。证据不足时要拒答、继续检索或缩小任务。"],
  ["05", "学习评测", "Agent 要评测任务完成率、工具调用正确率、循环率、成本、延迟和最终答案忠实度。"],
];

const interviews = [
  ["Agent 和普通 Chatbot 有什么区别？", "普通 Chatbot 多数是一次输入一次回答。Agent 会围绕目标维护状态，选择工具，观察工具结果，再决定下一步。工程上要关注工具边界、停止条件、失败重试和评测。"],
  ["Agent 的核心组成是什么？", "目标、状态、工具、计划器、执行器、观察器、评估器、停止条件。面试时不要只说 prompt，要把控制流讲出来。"],
  ["为什么 Agent 容易失控？", "因为模型可能选错工具、误读工具输出、循环调用、过度规划或在证据不足时硬答。所以要限制最大步数、设置证据门、加结构化输出和日志。"],
  ["Tool Calling 和 Agent 是一回事吗？", "不是。Tool Calling 是模型调用函数的能力，Agent 是围绕目标组织多次工具调用和状态流的系统。Tool Calling 是 Agent 的基础能力之一。"],
  ["LangGraph 解决什么问题？", "LangGraph 把 Agent 流程显式建成状态图，每个节点负责一步，边决定下一步去哪里，适合需要可控、多步、可恢复的 Agent 工程。"],
  ["Agent 怎么评测？", "看任务完成率、工具选择准确率、工具参数正确率、最终答案忠实度、失败恢复能力、平均步数、延迟和成本。复杂任务还要看是否会无限循环。"],
];

const state = {
  data: loadData(),
  trace: [],
  selectedStep: 0,
  final: null,
  canvasNodes: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (parsed?.docs && parsed?.tools) return parsed;
  } catch {
    localStorage.removeItem(storageKey);
  }
  return clone(defaultData);
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(state.data));
}

function resetData() {
  state.data = clone(defaultData);
  saveData();
  runAgent();
}

function tokenize(text) {
  return (text.match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]+/g) || []).map((item) => item.toLowerCase());
}

function scoreText(query, text) {
  const queryTokens = new Set(tokenize(query));
  const textTokens = new Set(tokenize(text));
  const hits = [...queryTokens].filter((token) => [...textTokens].some((word) => word.includes(token) || token.includes(word)));
  return {
    score: hits.length / Math.sqrt(Math.max(1, queryTokens.size) * Math.max(1, textTokens.size)),
    hits,
  };
}

function toolEnabled(name) {
  const switches = {
    rag_search: $("#useRag").checked,
    graph_search: $("#useGraph").checked,
    reflection_check: $("#useReflect").checked,
  };
  if (name in switches) return switches[name];
  return true;
}

function addStep(type, name, title, input, output, explain, score = 1) {
  state.trace.push({
    id: `s${state.trace.length + 1}`,
    type,
    name,
    title,
    input,
    output,
    explain,
    score,
  });
}

function planFor(goal, agentType) {
  const steps = ["理解目标"];
  if (agentType === "qa") {
    steps.push("检索证据", "判断证据是否足够", "基于证据回答");
  } else if (agentType === "task") {
    steps.push("查找相关资料", "拆成任务", "检查任务大小");
  } else {
    steps.push("检索学习资料", "必要时查实体关系", "生成学习任务", "反思下一步");
  }
  if (/Graph|图谱|多跳|关系/.test(goal)) steps.splice(2, 0, "调用 Graph RAG");
  return [...new Set(steps)];
}

function ragSearch(goal) {
  return state.data.docs.map((doc) => {
    const scored = scoreText(goal, `${doc.title} ${doc.tags.join(" ")} ${doc.text}`);
    return { ...doc, score: scored.score, hits: scored.hits };
  }).filter((doc) => doc.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
}

function graphSearch(goal) {
  const graphTerms = ["Graph RAG", "图谱", "关系", "多跳", "金融", "法律", "医疗", "Agent"];
  const seeds = graphTerms.filter((term) => goal.toLowerCase().includes(term.toLowerCase()) || goal.includes(term));
  const docs = state.data.docs.filter((doc) => doc.tags.some((tag) => seeds.some((seed) => tag.includes(seed) || seed.includes(tag))));
  const paths = docs.map((doc) => ({
    path: `${seeds[0] || "目标"} -> 关联 -> ${doc.tags[0]} -> 证据 -> ${doc.title}`,
    doc,
    score: 0.68 + Math.min(0.25, doc.tags.length * 0.04),
  }));
  return paths.slice(0, 3);
}

function taskWriter(goal, evidence) {
  const theme = evidence[0]?.title || "当前目标";
  return [
    `先用 30 分钟复述「${theme}」的核心概念`,
    "在实验台里改一次输入数据，观察轨迹和结果变化",
    "把证据、工具调用和最终结果写成一页学习笔记",
  ];
}

function runAgent() {
  state.trace = [];
  const goal = $("#goalInput").value.trim();
  const agentType = $("#agentType").value;
  const limit = Number($("#stepLimit").value);
  const threshold = Number($("#evidenceThreshold").value);
  const plan = planFor(goal, agentType).slice(0, limit);

  addStep("Plan", "agent_planner", "制定计划", { goal, agentType, limit }, { plan }, "Agent 先把目标拆成步骤，而不是直接回答。");

  let ragResults = [];
  if (toolEnabled("rag_search") && plan.some((item) => item.includes("检索") || item.includes("资料"))) {
    ragResults = ragSearch(goal);
    addStep("Tool", "rag_search", "调用 RAG 检索", { query: goal, topK: 4 }, { results: ragResults.map(toDocOutput) }, "RAG 工具负责找语义相关的知识片段。", ragResults[0]?.score || 0);
  }

  let graphResults = [];
  if (toolEnabled("graph_search") && plan.some((item) => item.includes("Graph"))) {
    graphResults = graphSearch(goal);
    addStep("Tool", "graph_search", "调用 Graph RAG", { query: goal, maxHops: 2 }, { paths: graphResults.map((item) => ({ path: item.path, score: item.score })) }, "Graph RAG 工具负责找实体关系和多跳路径。", graphResults[0]?.score || 0);
  }

  const evidence = mergeEvidence(ragResults, graphResults);
  const evidenceScore = evidence[0]?.score || 0;
  addStep("Observe", "evidence_reader", "观察证据", { evidenceCount: evidence.length }, { evidence: evidence.map(toDocOutput) }, "观察步骤会把工具输出转成可用证据，而不是盲信工具。", evidenceScore);

  const enough = evidenceScore >= threshold;
  addStep("Evaluate", "evidence_gate", "证据门评估", { threshold, bestScore: evidenceScore }, { enough, decision: enough ? "可以继续生成" : "证据不足，应该拒答或继续检索" }, "证据门决定能不能进入最终回答。", enough ? 1 : 0.35);

  const tasks = enough ? taskWriter(goal, evidence) : ["补充知识库资料", "降低问题范围", "重新检索更明确的关键词"];
  addStep("Act", "task_writer", "生成任务", { goal, evidenceTitles: evidence.map((doc) => doc.title) }, { tasks }, "任务生成要基于证据，不能凭空安排。", enough ? 0.9 : 0.45);

  if (toolEnabled("reflection_check")) {
    const nextBestTask = tasks[0];
    addStep("Reflect", "reflection_check", "反思检查", { taskCount: tasks.length, enoughEvidence: enough }, { nextBestTask, risk: enough ? "任务可执行" : "证据不足，结果不应当装作确定" }, "反思不是玄学，它是在交付前检查结果是否可执行、是否有证据。", enough ? 0.88 : 0.42);
  }

  state.selectedStep = state.trace.length - 1;
  state.final = buildFinal(goal, evidence, tasks, enough);
  renderAll();
}

function mergeEvidence(ragResults, graphResults) {
  const map = new Map();
  ragResults.forEach((doc) => map.set(doc.id, { ...doc, from: ["RAG"] }));
  graphResults.forEach((item) => {
    const previous = map.get(item.doc.id);
    if (previous) {
      previous.score = Math.max(previous.score, item.score);
      previous.from.push("Graph RAG");
    } else {
      map.set(item.doc.id, { ...item.doc, score: item.score, hits: item.doc.tags, from: ["Graph RAG"] });
    }
  });
  return [...map.values()].sort((a, b) => b.score - a.score);
}

function toDocOutput(doc) {
  return {
    title: doc.title,
    score: Number((doc.score || 0).toFixed(3)),
    tags: doc.tags,
    text: doc.text,
    from: doc.from || ["RAG"],
  };
}

function buildFinal(goal, evidence, tasks, enough) {
  if (!enough) {
    return {
      status: "证据不足",
      answer: "当前工具没有找到足够可靠的证据。Agent 的正确行为是拒绝给确定结论，并建议补充资料或缩小问题。",
      tasks,
      evidence,
    };
  }
  return {
    status: "已生成",
    answer: `围绕「${goal}」，Agent 找到了 ${evidence.length} 条证据。建议先学习「${evidence[0].title}」，再在实验台里动手验证工具调用轨迹。`,
    tasks,
    evidence,
  };
}

function renderTrace() {
  $("#traceStatus").textContent = `${state.trace.length} 步`;
  $("#traceList").innerHTML = state.trace.map((step, index) => `
    <article class="result-card ${index === state.selectedStep ? "is-selected" : ""}" data-step-index="${index}">
      <div class="result-top">
        <strong>${step.type} · ${step.name}</strong>
        <b>${step.score.toFixed(2)}</b>
      </div>
      <p>${step.title}</p>
      <div class="tag-row">
        <span>${step.type}</span>
        <span>${step.explain}</span>
      </div>
    </article>
  `).join("");
}

function renderFinal() {
  $("#finalStatus").textContent = state.final?.status || "等待运行";
  $("#finalPanel").innerHTML = `
    <div class="plain-card">
      <strong>${state.final.status}</strong>
      <p>${state.final.answer}</p>
    </div>
    <div class="plain-card">
      <strong>下一步任务</strong>
      <p>${state.final.tasks.map((task, index) => `${index + 1}. ${task}`).join("<br>")}</p>
    </div>
    <div class="result-list">
      ${state.final.evidence.map((doc) => `
        <article class="result-card">
          <div class="result-top"><strong>${doc.title}</strong><b>${(doc.score || 0).toFixed(3)}</b></div>
          <p>${doc.text}</p>
          <div class="tag-row"><span>${doc.tags.join("、")}</span><span>${doc.from.join(" + ")}</span></div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDetail() {
  const step = state.trace[state.selectedStep] || state.trace[0];
  if (!step) return;
  $("#detailPanel").innerHTML = `
    <div class="plain-card">
      <strong>${step.type} · ${step.name}</strong>
      <p>${step.explain}</p>
    </div>
    <div class="plain-card">
      <strong>工具输入</strong>
      <pre>${escapeHtml(JSON.stringify(step.input, null, 2))}</pre>
    </div>
    <div class="plain-card">
      <strong>工具输出</strong>
      <pre>${escapeHtml(JSON.stringify(step.output, null, 2))}</pre>
    </div>
  `;
}

function renderToolPanel() {
  $("#toolPanel").innerHTML = `
    <div class="stat-grid">
      <div><strong>${state.data.tools.length}</strong><span>工具</span></div>
      <div><strong>${state.data.docs.length}</strong><span>知识片段</span></div>
      <div><strong>${state.trace.length}</strong><span>运行步骤</span></div>
    </div>
    <div class="result-list compact-list">
      ${state.data.tools.map((tool) => `
        <article class="result-card">
          <div class="result-top"><strong>${tool.name}</strong><b>${tool.enabled ? "启用" : "关闭"}</b></div>
          <p>${tool.desc}</p>
        </article>
      `).join("")}
      ${state.data.docs.map((doc) => `
        <article class="result-card">
          <div class="result-top"><strong>${doc.title}</strong><b>${doc.tags[0]}</b></div>
          <p>${doc.text}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap.map(([step, title, text]) => `
    <article class="doc-card"><span>${step}</span><strong>${title}</strong><p>${text}</p></article>
  `).join("");
}

function renderInterview() {
  $("#interviewList").innerHTML = interviews.map(([question, answer]) => `
    <article class="doc-card"><strong>${question}</strong><p>${answer}</p></article>
  `).join("");
}

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function drawTrace() {
  const canvas = $("#traceCanvas");
  if (!canvas || !state.trace.length) return;
  const { ctx, width, height } = canvasContext(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbfb";
  ctx.fillRect(0, 0, width, height);
  state.canvasNodes = [];
  const gap = Math.max(118, (width - 100) / Math.max(1, state.trace.length - 1));
  const y = height / 2;
  state.trace.forEach((step, index) => {
    const x = 50 + index * gap;
    if (index > 0) {
      ctx.strokeStyle = "#9db8b3";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - gap + 42, y);
      ctx.lineTo(x - 42, y);
      ctx.stroke();
    }
    const color = step.type === "Tool" ? "#16707a" : step.type === "Evaluate" ? "#b35c2e" : step.type === "Reflect" ? "#173539" : "#227650";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 42, y - 34, 84, 68, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(step.type, x, y - 6);
    ctx.font = "800 11px sans-serif";
    ctx.fillText(step.name.slice(0, 12), x, y + 14);
    state.canvasNodes.push({ x: x - 46, y: y - 38, width: 92, height: 76, index });
  });
}

function bindCanvasTooltip() {
  const canvas = $("#traceCanvas");
  const tip = $("#canvasTooltip");
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.canvasNodes.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    if (!node) {
      tip.classList.remove("is-visible");
      return;
    }
    const step = state.trace[node.index];
    tip.innerHTML = `<strong>${step.type} · ${step.name}</strong><span>${step.explain}</span>`;
    tip.style.left = `${Math.min(rect.width - 320, Math.max(10, x + 14))}px`;
    tip.style.top = `${Math.min(rect.height - 120, Math.max(10, y + 14))}px`;
    tip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.canvasNodes.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    if (!node) return;
    state.selectedStep = node.index;
    renderTrace();
    renderDetail();
    drawTrace();
  });
}

function renderAll() {
  renderTrace();
  renderFinal();
  renderDetail();
  renderToolPanel();
  drawTrace();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}

function switchView(view) {
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active?.textContent || "Agent 工程实验室";
  if (view === "visual") drawTrace();
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
  const close = () => {
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  };
  trigger.addEventListener("click", () => {
    const open = !menu.classList.contains("is-open");
    trigger.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
  });
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    close();
    if (button.dataset.project === "agent") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) close();
  });
}

function addDoc() {
  const title = $("#newDocTitle").value.trim();
  const text = $("#newDocText").value.trim();
  const tags = $("#newDocTags").value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
  if (!title || !text) return;
  state.data.docs.push({ id: `d${Date.now()}`, title, text, tags: tags.length ? tags : ["自定义"] });
  $("#newDocTitle").value = "";
  $("#newDocText").value = "";
  $("#newDocTags").value = "";
  saveData();
  runAgent();
}

function addTool() {
  const name = $("#newToolName").value.trim();
  const desc = $("#newToolDesc").value.trim();
  if (!name || !desc) return;
  state.data.tools.push({ id: `t${Date.now()}`, name, desc, enabled: true });
  $("#newToolName").value = "";
  $("#newToolDesc").value = "";
  saveData();
  runAgent();
}

function init() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", runAgent);
  $("#resetBtn").addEventListener("click", resetData);
  $("#addDocBtn").addEventListener("click", addDoc);
  $("#addToolBtn").addEventListener("click", addTool);
  ["agentType", "stepLimit", "evidenceThreshold", "useRag", "useGraph", "useReflect"].forEach((id) => {
    $(`#${id}`).addEventListener("change", runAgent);
  });
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-step-index]");
    if (!card) return;
    state.selectedStep = Number(card.dataset.stepIndex);
    renderTrace();
    renderDetail();
    drawTrace();
  });
  window.addEventListener("resize", drawTrace);
  renderRoadmap();
  renderInterview();
  runAgent();
}

init();
