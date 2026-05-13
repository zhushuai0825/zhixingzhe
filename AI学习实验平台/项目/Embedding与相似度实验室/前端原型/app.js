const defaultQuery = "RAG 里的 embedding 和向量数据库是什么关系？";

const defaultCandidates = [
  "RAG 使用 embedding 把问题和文档片段变成向量，再计算相似度完成检索。",
  "向量数据库负责存储 chunk embedding，并支持 Top K 相似向量查询。",
  "文本切分会把长文档拆成多个 chunk，方便后续向量化和召回。",
  "Rerank 会对初步召回的结果重新排序，让最相关的片段排在前面。",
  "Agent 会根据目标决定是否调用检索、搜索、计算器等工具。",
  "ItemCF 推荐算法根据用户行为共现计算物品相似度，不依赖文本 embedding。",
];

const dimensions = [
  { id: 0, label: "RAG 检索", keywords: ["rag", "检", "索", "召", "回", "查", "询", "知", "识", "库"] },
  { id: 1, label: "Embedding 向量化", keywords: ["embedding", "向", "量", "向量化", "嵌", "入"] },
  { id: 2, label: "向量数据库", keywords: ["数", "据", "库", "存", "储", "collection", "index", "top", "k"] },
  { id: 3, label: "相似度计算", keywords: ["相", "似", "度", "匹", "配", "余", "弦", "点", "积", "距", "离"] },
  { id: 4, label: "文档切分", keywords: ["文", "档", "切", "分", "chunk", "片", "段"] },
  { id: 5, label: "Rerank 重排", keywords: ["rerank", "重", "排", "序", "初", "步"] },
  { id: 6, label: "Agent 工具", keywords: ["agent", "工", "具", "调", "用", "目", "标"] },
  { id: 7, label: "推荐算法", keywords: ["itemcf", "推", "荐", "协", "同", "过", "滤", "用户", "行为"] },
  { id: 8, label: "生成回答", keywords: ["生", "成", "回", "答", "大", "模", "型", "llm"] },
  { id: 9, label: "部署工程", keywords: ["docker", "fastapi", "api", "服", "务", "部", "署"] },
  { id: 10, label: "评测质量", keywords: ["评", "测", "准", "确", "质", "量", "幻", "觉"] },
  { id: 11, label: "学习概念", keywords: ["学", "习", "概", "念", "入", "门", "理", "解"] },
];

const roadmap = [
  ["01", "理解 token", "文本会先被拆成 token。真实模型有自己的 tokenizer，本项目用可解释的简化 tokenizer。"],
  ["02", "理解向量", "Embedding 把文本映射成一组数字，数字维度越多，能表达的信息空间越大。"],
  ["03", "理解归一化", "L2 归一化把向量长度变成 1，这样余弦相似度可以直接用点积计算。"],
  ["04", "理解相似度", "余弦看方向，点积看方向和长度，欧氏距离看空间距离。"],
  ["05", "连接 RAG", "RAG 检索时，会把问题向量和切片向量做 Top K 相似度排序。"],
];

const state = {
  view: "overview",
  source: "loading",
  result: null,
  canvasNodes: [],
  space: {
    rotationX: -0.45,
    rotationY: 0.65,
    zoom: 150,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiBase() {
  return "http://127.0.0.1:8030";
}

function candidatePayload() {
  return $("#candidateInput").value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `d${index + 1}`, text }));
}

function metric() {
  return $("#metricSelect").value;
}

function topK() {
  return Number($("#topKSelect").value || 5);
}

async function apiCompare() {
  const response = await fetch(`${apiBase()}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: $("#queryInput").value.trim(),
      candidates: candidatePayload(),
      metric: metric(),
      topK: topK(),
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function tokenize(text) {
  return Array.from(text.matchAll(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]/g)).map((match) => match[0].toLowerCase());
}

function tokenDimensions(token) {
  return dimensions
    .filter((dimension) => dimension.keywords.includes(token))
    .map((dimension) => dimension.id);
}

function embedLocal(text) {
  const tokens = tokenize(text);
  const vector = Array.from({ length: dimensions.length }, () => 0);
  const counts = new Map();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  counts.forEach((count, token) => {
    tokenDimensions(token).forEach((dimension) => {
      vector[dimension] += 1 + Math.log(count);
    });
  });
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  const normalized = vector.map((value) => Number((value / length).toFixed(4)));
  return {
    text,
    tokens,
    tokenMap: tokens.map((token) => ({ token, dimensions: tokenDimensions(token) })),
    vector: normalized,
    nonZero: normalized
      .map((value, dimension) => ({ dimension, value }))
      .filter((entry) => Math.abs(entry.value) > 0.0001),
    dim: dimensions.length,
    dimensionLabels: dimensions,
  };
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function euclidean(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
}

function scoreVectors(left, right, metricName) {
  return metricName === "euclidean" ? euclidean(left, right) : dot(left, right);
}

function localCompare() {
  const query = embedLocal($("#queryInput").value.trim());
  const rows = candidatePayload().map((candidate) => {
    const embedding = embedLocal(candidate.text);
    const sharedTokens = [...new Set(query.tokens)].filter((token) => embedding.tokens.includes(token));
    return {
      id: candidate.id,
      text: candidate.text,
      embedding,
      sharedTokens,
      sharedDimensions: sharedDimensionLabels(query.vector, embedding.vector),
      score: Number(scoreVectors(query.vector, embedding.vector, metric()).toFixed(4)),
    };
  });
  rows.sort((left, right) => (metric() === "euclidean" ? left.score - right.score : right.score - left.score));
  return {
    metric: metric(),
    topK: topK(),
    query,
    results: rows.slice(0, topK()),
    allResults: rows,
    explanation: metricExplanation(metric()),
  };
}

function metricExplanation(metricName) {
  if (metricName === "cosine") {
    return "余弦相似度比较两个向量的方向。当前向量已做 L2 归一化，所以分数越接近 1，表示方向越接近。";
  }
  if (metricName === "dot") {
    return "点积会把相同维度上的数值相乘再累加。向量已归一化时，它和余弦相似度结果接近。";
  }
  return "欧氏距离表示两个向量之间的直线距离。和前两种不同，欧氏距离越小，表示越相似。";
}

function setBackendStatus(message, type = "") {
  const node = $("#backendStatus");
  node.textContent = message;
  node.classList.toggle("is-ok", type === "ok");
  node.classList.toggle("is-error", type === "error");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

async function runExperiment() {
  if (!$("#queryInput").value.trim() || candidatePayload().length === 0) {
    showToast("请先填写查询文本和候选文本");
    return;
  }

  try {
    state.result = await apiCompare();
    state.source = "backend";
    setBackendStatus("FastAPI · 在线计算", "ok");
  } catch {
    state.result = localCompare();
    state.source = "local";
    setBackendStatus("离线教学算法", "error");
  }
  renderResult();
}

function renderResult() {
  if (!state.result) return;
  renderQueryVector();
  renderResultList();
  renderMetricExplanation();
  renderMatchCanvas();
}

function renderQueryVector() {
  const query = state.result.query;
  $("#dimStatus").textContent = `${query.dim} 维`;
  $("#queryTokens").innerHTML = query.tokenMap.length
    ? query.tokenMap.map((item) => `<span>${item.token} -> ${item.dimensions.length ? item.dimensions.map(dimensionLabel).join(" / ") : "忽略"}</span>`).join("")
    : "<span>没有 token</span>";
  renderVectorBars($("#queryVector"), query.vector);
}

function renderVectorBars(container, vector) {
  const maxValue = Math.max(0.001, ...vector.map((value) => Math.abs(value)));
  container.innerHTML = vector.map((value, index) => `
    <div class="vector-row">
      <b>${dimensionLabel(index)}</b>
      <div class="vector-track"><span style="width:${Math.max(2, Math.abs(value) / maxValue * 100)}%"></span></div>
      <span>${value.toFixed(4)}</span>
    </div>
  `).join("");
}

function renderResultList() {
  const higherBetter = state.result.metric !== "euclidean";
  $("#resultList").innerHTML = state.result.results.map((entry, index) => `
    <article class="result-card ${index === 0 ? "is-top" : ""}">
      <span>${index + 1} · ${higherBetter ? "相似度" : "距离"} ${entry.score.toFixed(4)}</span>
      <strong>${entry.text}</strong>
      <p>${entry.sharedDimensions.length ? `共同语义维度：${entry.sharedDimensions.map((item) => item.label).join("、")}` : "共同语义维度较少，通常不会排在前面。"}</p>
      <p>${entry.sharedTokens.length ? `共享 token：${entry.sharedTokens.join("、")}` : "没有完全相同的 token。"}</p>
      <div class="score-line">
        <b>${entry.id}</b>
        <small>${higherBetter ? "分数越大越靠前" : "距离越小越靠前"}</small>
      </div>
    </article>
  `).join("");
}

function dimensionLabel(index) {
  return (state.result?.query?.dimensionLabels || dimensions)[index]?.label || `d${index}`;
}

function sharedDimensionLabels(left, right) {
  return left
    .map((leftValue, index) => ({
      dimension: index,
      label: dimensionLabel(index),
      strength: Number((leftValue * right[index]).toFixed(4)),
    }))
    .filter((item) => item.strength > 0)
    .sort((a, b) => b.strength - a.strength);
}

function renderMetricExplanation() {
  $("#metricExplanation").innerHTML = `
    <strong>${metricLabel(state.result.metric)}</strong>
    <p>${state.result.explanation}</p>
  `;
  const top = state.result.results[0];
  $("#topReason").innerHTML = top
    ? `<strong>为什么 ${top.id} 排第一？</strong><p>它和查询文本共同命中了 ${top.sharedDimensions.length || 0} 个语义维度：${top.sharedDimensions.map((item) => item.label).join("、") || "较少"}。当前分数 ${top.score.toFixed(4)}，所以在候选文本集合里最靠前。</p>`
    : "<strong>暂无结果</strong><p>请先运行向量匹配。</p>";
}

function metricLabel(metricName) {
  if (metricName === "cosine") return "余弦相似度";
  if (metricName === "dot") return "点积";
  return "欧氏距离";
}

function renderMatchCanvas() {
  const canvas = $("#matchCanvas");
  if (!canvas || !state.result) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  drawSpaceFrame(ctx, rect.width, rect.height);
  const center = { x: 0, y: 0, z: 0 };
  const queryScreen = projectPoint(center, rect.width, rect.height);
  const nodes = state.result.results.map((entry, index) => {
    const closeness = normalizedScore(entry.score);
    const angle = index * 1.35 + 0.35;
    const radius = 1.75 - closeness * 1.25;
    const point = {
      x: Math.cos(angle) * radius,
      y: (index % 2 ? 0.5 : -0.35) * (1 - closeness * 0.45),
      z: Math.sin(angle) * radius,
    };
    return {
      ...entry,
      point,
      screen: projectPoint(point, rect.width, rect.height),
      closeness,
      label: `${entry.id} · ${entry.score.toFixed(4)}`,
      meta: entry.text,
      type: "candidate",
    };
  });

  nodes
    .sort((left, right) => left.screen.depth - right.screen.depth)
    .forEach((node, index) => {
      drawSpaceLink(ctx, queryScreen, node.screen, index === 0 || node.id === state.result.results[0]?.id, node.closeness);
    });
  drawSpaceNode(ctx, {
    label: "查询向量",
    meta: state.result.query.text,
    screen: queryScreen,
    radius: 18,
    type: "query",
  }, true);
  nodes.forEach((node) => {
    const isTop = node.id === state.result.results[0]?.id;
    drawSpaceNode(ctx, {
      ...node,
      radius: isTop ? 16 : 12,
    }, isTop);
  });
  state.canvasNodes = [
    {
      label: "查询向量",
      meta: state.result.query.text,
      x: queryScreen.x - 24,
      y: queryScreen.y - 24,
      width: 48,
      height: 48,
    },
    ...nodes.map((node) => ({
      label: node.label,
      meta: `${node.text}\n共同语义维度：${node.sharedDimensions.map((item) => item.label).join("、") || "较少"}`,
      x: node.screen.x - 24,
      y: node.screen.y - 24,
      width: 48,
      height: 48,
    })),
  ];
}

function normalizedScore(score) {
  const scores = state.result.results.map((entry) => entry.score);
  if (state.result.metric === "euclidean") {
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    return max === min ? 1 : (max - score) / (max - min);
  }
  const max = Math.max(0.001, ...scores);
  return Math.max(0, score / max);
}

function projectPoint(point, width, height) {
  const { rotationX, rotationY, zoom } = state.space;
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const depth = 1 / (1 + (z2 + 3.4) * 0.13);
  return {
    x: width / 2 + x1 * zoom * depth,
    y: height / 2 + y1 * zoom * depth,
    depth,
  };
}

function drawSpaceFrame(ctx, width, height) {
  ctx.strokeStyle = "rgba(29, 107, 122, 0.18)";
  ctx.lineWidth = 1;
  const centerX = width / 2;
  const centerY = height / 2;
  [70, 140, 210].forEach((radius) => {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 1.35, radius * 0.55, -0.18, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = "#124b56";
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("3D 教学空间：越靠近中心查询点，越相似", 24, 30);
}

function drawSpaceLink(ctx, from, to, highlight, closeness) {
  ctx.strokeStyle = highlight ? colorWithAlpha("#b35c2e", 0.62) : colorWithAlpha("#1d6b7a", 0.16 + closeness * 0.28);
  ctx.lineWidth = highlight ? 3.5 : 1.4 + closeness * 2.2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawSpaceNode(ctx, node, highlight = false) {
  const isQuery = node.type === "query";
  const radius = node.radius || 12;
  ctx.fillStyle = isQuery ? "#124b56" : highlight ? "#b35c2e" : "#1d6b7a";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(node.screen.x, node.screen.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = highlight ? "#b35c2e" : "#1e2729";
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(node.label, node.screen.x, node.screen.y + radius + 8);
  if (highlight && !isQuery) {
    ctx.font = "800 12px sans-serif";
    ctx.fillText("最相似", node.screen.x, node.screen.y + radius + 26);
  }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap.map(([step, title, desc]) => `
    <article class="plain-card">
      <strong>${step} · ${title}</strong>
      <p>${desc}</p>
    </article>
  `).join("");
}

function switchView(view) {
  state.view = view;
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active ? active.textContent : "项目总览";
  if (view === "similarity") renderMatchCanvas();
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
  if (!trigger || !menu) return;

  function closeMenu() {
    menu.classList.remove("is-open");
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("is-open");
    trigger.classList.toggle("is-open", isOpen);
    trigger.setAttribute("aria-expanded", String(isOpen));
  });

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    closeMenu();
    if (button.dataset.project === "embedding") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });
}

function bindCanvasTooltip() {
  const canvas = $("#matchCanvas");
  const tooltip = $("#canvasTooltip");
  if (!canvas || !tooltip) return;
  canvas.addEventListener("pointerdown", (event) => {
    state.space.dragging = true;
    state.space.lastX = event.clientX;
    state.space.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", () => {
    state.space.dragging = false;
  });
  canvas.addEventListener("mousemove", (event) => {
    if (state.space.dragging) {
      state.space.rotationY += (event.clientX - state.space.lastX) * 0.008;
      state.space.rotationX += (event.clientY - state.space.lastY) * 0.008;
      state.space.lastX = event.clientX;
      state.space.lastY = event.clientY;
      renderMatchCanvas();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.canvasNodes.find((item) => (
      x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height
    ));
    if (!node) {
      tooltip.classList.remove("is-visible");
      return;
    }
    tooltip.innerHTML = `<strong>${node.label}</strong><span>${node.meta}</span>`;
    tooltip.style.left = `${Math.min(rect.width - 270, Math.max(10, x + 14))}px`;
    tooltip.style.top = `${Math.min(rect.height - 90, Math.max(10, y + 14))}px`;
    tooltip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.space.zoom = Math.max(90, Math.min(240, state.space.zoom - event.deltaY * 0.12));
    renderMatchCanvas();
  }, { passive: false });
}

function bindEvents() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", runExperiment);
  $("#resetBtn").addEventListener("click", () => {
    $("#queryInput").value = defaultQuery;
    $("#candidateInput").value = defaultCandidates.join("\n");
    runExperiment();
  });
  $("#metricSelect").addEventListener("change", runExperiment);
  $("#topKSelect").addEventListener("change", runExperiment);
  window.addEventListener("resize", renderMatchCanvas);
}

async function init() {
  $("#queryInput").value = defaultQuery;
  $("#candidateInput").value = defaultCandidates.join("\n");
  bindEvents();
  renderRoadmap();
  await runExperiment();
}

init();
