const API_BASE = "http://127.0.0.1:8050";

const dimensionLabels = [
  "RAG 检索",
  "Embedding 向量化",
  "向量数据库",
  "相似度计算",
  "文档切分",
  "Rerank 重排",
  "Agent 工具",
  "推荐算法",
  "生成回答",
  "部署工程",
  "评测质量",
  "学习概念",
];

const dimensionKeywords = [
  ["rag", "检", "索", "召", "回", "查", "询", "知", "识", "库"],
  ["embedding", "向", "量", "向量化", "嵌", "入"],
  ["数", "据", "库", "存", "储", "collection", "index", "top", "k"],
  ["相", "似", "度", "匹", "配", "余", "弦", "点", "积", "距", "离"],
  ["文", "档", "切", "分", "chunk", "片", "段"],
  ["rerank", "重", "排", "序", "初", "步"],
  ["agent", "工", "具", "调", "用", "目", "标"],
  ["itemcf", "推", "荐", "协", "同", "过", "滤", "用户", "行为"],
  ["生", "成", "回", "答", "大", "模", "型", "llm"],
  ["docker", "fastapi", "api", "服", "务", "部", "署"],
  ["评", "测", "准", "确", "质", "量", "幻", "觉"],
  ["学", "习", "概", "念", "入", "门", "理", "解"],
];

const seedDocuments = [
  {
    id: "chunk-1",
    text: "RAG 使用 embedding 把用户问题和文档 chunk 变成向量，再用相似度检索相关证据。",
    metadata: { source: "rag_intro.md", section: "RAG 检索", page: "1" },
  },
  {
    id: "chunk-2",
    text: "向量数据库负责存储 chunk embedding，并支持 Top K 相似向量查询和 metadata 过滤。",
    metadata: { source: "vector_db.md", section: "向量库", page: "2" },
  },
  {
    id: "chunk-3",
    text: "文本切分会把长文档拆成多个 chunk，chunk size 和 overlap 会影响召回质量。",
    metadata: { source: "chunking.md", section: "文本切分", page: "1" },
  },
  {
    id: "chunk-4",
    text: "Rerank 会对向量库初步召回的结果重新排序，让最相关的证据片段排在前面。",
    metadata: { source: "rerank.md", section: "重排序", page: "3" },
  },
  {
    id: "chunk-5",
    text: "Agent 可以根据任务目标决定是否调用检索工具、计算器、搜索工具或生成任务计划。",
    metadata: { source: "agent.md", section: "工具调用", page: "5" },
  },
];

const roadmap = [
  ["01", "先看懂 Collection", "collection 是一组向量记录，里面保存 id、原文、embedding 和 metadata。"],
  ["02", "练习 Upsert", "upsert 表示写入或覆盖。同一个 id 再写一次，会替换原记录。"],
  ["03", "练习 Query", "查询文本会先变成 query vector，再和 collection 中的向量计算相似度。"],
  ["04", "练习 Metadata 过滤", "source、page、section 这些 metadata 可以限制检索范围，也能帮助做引用来源。"],
  ["05", "理解 Delete", "删除不只是删原文，也要删对应 embedding，否则检索还会命中旧数据。"],
  ["06", "升级真实向量库", "看懂教学版后，再迁移到 Chroma、FAISS、Milvus 或 PostgreSQL + pgvector。"],
];

const state = {
  backend: false,
  view: "overview",
  collection: "rag_learning_chunks",
  documents: [],
  selectedId: "",
  lastQuery: null,
  canvasNodes: [],
  space: {
    rotationX: -0.4,
    rotationY: 0.62,
    zoom: 170,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tokenize(text) {
  return (text.match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]/g) || []).map((token) => token.toLowerCase());
}

function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!length) return vector;
  return vector.map((value) => Number((value / length).toFixed(4)));
}

function embed(text) {
  const tokens = tokenize(text);
  const vector = new Array(dimensionLabels.length).fill(0);
  const counts = tokens.reduce((memo, token) => {
    memo[token] = (memo[token] || 0) + 1;
    return memo;
  }, {});
  Object.entries(counts).forEach(([token, count]) => {
    dimensionKeywords.forEach((keywords, index) => {
      if (keywords.includes(token)) vector[index] += 1 + Math.log(count);
    });
  });
  return {
    tokens,
    vector: normalize(vector),
    dimensionLabels: dimensionLabels.map((label, id) => ({ id, label, keywords: dimensionKeywords[id] })),
  };
}

function makeRecord(document) {
  return {
    ...document,
    embedding: embed(document.text),
  };
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * (right[index] || 0), 0);
}

function sharedDimensions(left, right) {
  return left
    .map((value, index) => ({
      dimension: index,
      label: dimensionLabels[index],
      strength: Number((value * (right[index] || 0)).toFixed(4)),
    }))
    .filter((item) => item.strength > 0)
    .sort((a, b) => b.strength - a.strength);
}

function localStatePayload() {
  if (!state.documents.length) state.documents = seedDocuments.map(makeRecord);
  return {
    collection: state.collection,
    count: state.documents.length,
    dimensionLabels: dimensionLabels.map((label, id) => ({ id, label, keywords: dimensionKeywords[id] })),
    documents: state.documents,
  };
}

function localQuery(payload) {
  const queryEmbedding = embed(payload.query);
  const rows = state.documents
    .filter((record) => !payload.source || record.metadata?.source === payload.source)
    .map((record) => ({
      ...record,
      score: Number(dot(queryEmbedding.vector, record.embedding.vector).toFixed(4)),
      sharedDimensions: sharedDimensions(queryEmbedding.vector, record.embedding.vector),
    }))
    .sort((a, b) => b.score - a.score);
  return {
    query: payload.query,
    queryEmbedding,
    topK: payload.topK,
    filter: { source: payload.source },
    results: rows.slice(0, payload.topK),
    allResults: rows,
    collection: state.collection,
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
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

async function loadState() {
  try {
    const payload = await requestJson("/api/state");
    state.backend = true;
    state.collection = payload.collection;
    state.documents = payload.documents;
    setBackendStatus("FastAPI · 8050 在线", "ok");
  } catch {
    state.backend = false;
    const payload = localStatePayload();
    state.collection = payload.collection;
    state.documents = payload.documents;
    setBackendStatus("离线教学向量库", "error");
  }
  if (!state.selectedId && state.documents.length) state.selectedId = state.documents[0].id;
  renderAll();
}

async function upsertDocument() {
  const id = $("#docIdInput").value.trim();
  const text = $("#docTextInput").value.trim();
  if (!id || !text) {
    showToast("文档 ID 和 Chunk 文本都要填写");
    return;
  }
  const payload = {
    id,
    text,
    metadata: {
      source: $("#sourceInput").value.trim() || "manual.md",
      section: $("#sectionInput").value.trim() || "未分类",
    },
  };
  try {
    const result = await requestJson("/api/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.backend = true;
    state.documents = result.documents;
    setBackendStatus("FastAPI · 8050 在线", "ok");
  } catch {
    const next = makeRecord(payload);
    state.documents = state.documents.filter((record) => record.id !== next.id).concat(next);
    setBackendStatus("离线教学向量库", "error");
  }
  state.selectedId = id;
  showToast("已写入 collection");
  renderAll();
}

async function resetDocuments() {
  try {
    const result = await requestJson("/api/reset", { method: "POST" });
    state.backend = true;
    state.documents = result.documents;
    setBackendStatus("FastAPI · 8050 在线", "ok");
  } catch {
    state.backend = false;
    state.documents = seedDocuments.map(makeRecord);
    setBackendStatus("离线教学向量库", "error");
  }
  state.selectedId = state.documents[0]?.id || "";
  state.lastQuery = null;
  showToast("已重置示例数据");
  renderAll();
}

async function deleteDocument(id) {
  try {
    const result = await requestJson(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.backend = true;
    state.documents = result.documents;
    setBackendStatus("FastAPI · 8050 在线", "ok");
  } catch {
    state.documents = state.documents.filter((record) => record.id !== id);
    setBackendStatus("离线教学向量库", "error");
  }
  if (state.selectedId === id) state.selectedId = state.documents[0]?.id || "";
  showToast("已删除向量记录");
  renderAll();
}

async function runQuery() {
  const query = $("#queryInput").value.trim();
  if (!query) {
    showToast("请先输入查询文本");
    return;
  }
  const payload = {
    query,
    topK: Number($("#topKSelect").value || 3),
    source: $("#filterSourceInput").value.trim(),
  };
  try {
    state.lastQuery = await requestJson("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.backend = true;
    setBackendStatus("FastAPI · 8050 在线", "ok");
  } catch {
    state.lastQuery = localQuery(payload);
    state.backend = false;
    setBackendStatus("离线教学向量库", "error");
  }
  if (state.lastQuery.results[0]) state.selectedId = state.lastQuery.results[0].id;
  renderAll();
}

function renderAll() {
  renderQueryExplain();
  renderResults();
  renderDocuments();
  renderVectorBars();
  renderRoadmap();
  renderSpace();
}

function renderQueryExplain() {
  const source = $("#filterSourceInput")?.value.trim();
  $("#queryExplain").innerHTML = `
    <strong>它查询的是哪里？</strong>
    <p>查询范围是当前 collection：<b>${escapeHtml(state.collection)}</b>。这里面存的是你已入库的 chunk 原文、embedding 向量和 metadata，不是互联网，也不是本地文件夹全文扫描。</p>
    <p>查询文本会先变成 query vector，再和每条记录的 embedding 做相似度计算。${source ? `当前还加了 source 过滤：<b>${escapeHtml(source)}</b>。` : "当前没有 metadata 过滤。"}</p>
  `;
}

function renderResults() {
  const results = state.lastQuery?.results || [];
  const list = $("#resultList");
  if (!results.length) {
    list.innerHTML = `
      <div class="empty-card">
        <strong>还没有查询结果</strong>
        <p>点击“查询 Top K”后，这里会展示向量库返回的命中记录和为什么命中。</p>
      </div>
    `;
    return;
  }
  list.innerHTML = results.map((record, index) => `
    <article class="result-card ${record.id === state.selectedId ? "is-selected" : ""}" data-select="${escapeHtml(record.id)}">
      <div class="result-top">
        <span>Top ${index + 1}</span>
        <strong>${escapeHtml(record.id)}</strong>
        <b>${record.score.toFixed(4)}</b>
      </div>
      <p>${escapeHtml(record.text)}</p>
      <div class="tag-row">
        <span>${escapeHtml(record.metadata?.source || "unknown")}</span>
        <span>${escapeHtml(record.metadata?.section || "未分类")}</span>
      </div>
      <div class="why-box">
        <b>为什么命中：</b>
        ${record.sharedDimensions.length
          ? record.sharedDimensions.slice(0, 3).map((item) => `<span>${escapeHtml(item.label)} ${item.strength}</span>`).join("")
          : "<span>没有明显共享维度，说明这个结果很弱。</span>"}
      </div>
    </article>
  `).join("");
}

function renderDocuments() {
  $("#collectionStatus").textContent = `${state.documents.length} 条`;
  const list = $("#docList");
  if (!state.documents.length) {
    list.innerHTML = `<div class="empty-card"><strong>Collection 为空</strong><p>先写入一条 chunk，再执行查询。</p></div>`;
    return;
  }
  list.innerHTML = state.documents.map((record) => `
    <article class="doc-card ${record.id === state.selectedId ? "is-selected" : ""}" data-select="${escapeHtml(record.id)}">
      <div>
        <strong>${escapeHtml(record.id)}</strong>
        <span>${escapeHtml(record.metadata?.source || "unknown")} · ${escapeHtml(record.metadata?.section || "未分类")}</span>
      </div>
      <p>${escapeHtml(record.text)}</p>
      <button class="icon-btn" data-delete="${escapeHtml(record.id)}" title="删除这条向量记录">删</button>
    </article>
  `).join("");
}

function renderVectorBars() {
  const selected = state.documents.find((record) => record.id === state.selectedId) || state.documents[0];
  if (!selected) {
    $("#vectorBars").innerHTML = `<div class="empty-card"><strong>没有可预览的向量</strong><p>collection 为空。</p></div>`;
    return;
  }
  $("#vectorBars").innerHTML = `
    <div class="vector-title">
      <strong>${escapeHtml(selected.id)}</strong>
      <span>${escapeHtml(selected.metadata?.source || "unknown")}</span>
    </div>
    ${selected.embedding.vector.map((value, index) => `
      <div class="bar-row">
        <span>${escapeHtml(dimensionLabels[index])}</span>
        <div><i style="width: ${Math.round(value * 100)}%"></i></div>
        <b>${value.toFixed(4)}</b>
      </div>
    `).join("")}
  `;
}

function renderRoadmap() {
  const target = $("#roadmapList");
  if (!target) return;
  target.innerHTML = roadmap.map(([step, title, desc]) => `
    <article class="plain-card">
      <strong>${step} · ${escapeHtml(title)}</strong>
      <p>${escapeHtml(desc)}</p>
    </article>
  `).join("");
}

function vectorPoint(vector, index, count, score = 0) {
  const radius = 1.2 - Math.min(score, 1) * 0.55;
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const x = (vector[0] || 0) * 1.2 + Math.cos(angle) * radius;
  const y = (vector[2] || 0) * 0.9 + Math.sin(angle) * radius * 0.72;
  const z = ((vector[4] || 0) - (vector[6] || 0)) * 1.2 + Math.sin(angle * 1.7) * 0.55;
  return { x, y, z };
}

function project3d(point, width, height) {
  const { rotationX, rotationY, zoom } = state.space;
  const cy = Math.cos(rotationY);
  const sy = Math.sin(rotationY);
  const cx = Math.cos(rotationX);
  const sx = Math.sin(rotationX);
  const x1 = point.x * cy - point.z * sy;
  const z1 = point.x * sy + point.z * cy;
  const y1 = point.y * cx - z1 * sx;
  const z2 = point.y * sx + z1 * cx;
  const scale = zoom / (zoom + z2 * 52 + 120);
  return {
    x: width / 2 + x1 * zoom * scale,
    y: height / 2 + y1 * zoom * scale,
    depth: z2,
    scale,
  };
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(360, Math.floor(rect.width * ratio));
  canvas.height = Math.max(260, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height, ctx };
}

function renderSpace() {
  const canvas = $("#spaceCanvas");
  if (!canvas) return;
  const { width, height, ctx } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbfb";
  ctx.fillRect(0, 0, width, height);

  const query = state.lastQuery;
  const queryVector = query?.queryEmbedding?.vector || embed($("#queryInput")?.value || "").vector;
  const queryPoint = { x: 0, y: 0, z: 0 };
  const records = query?.allResults?.length
    ? query.allResults
    : state.documents.map((record, index) => ({ ...record, score: index === 0 ? 0.1 : 0 }));

  ctx.strokeStyle = "#d9e5e6";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i += 1) {
    const a = project3d({ x: -2.4, y: i * 0.55, z: 0 }, width, height);
    const b = project3d({ x: 2.4, y: i * 0.55, z: 0 }, width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const queryScreen = project3d(queryPoint, width, height);
  const nodes = [];
  const points = records.map((record, index) => {
    const point = vectorPoint(record.embedding.vector, index, records.length, record.score || 0);
    return { record, point, screen: project3d(point, width, height) };
  }).sort((a, b) => a.screen.depth - b.screen.depth);

  points.forEach(({ record, screen }) => {
    const strong = query?.results?.some((item) => item.id === record.id);
    const score = record.score || 0;
    ctx.strokeStyle = strong ? "rgba(22, 112, 122, 0.55)" : "rgba(126, 144, 148, 0.18)";
    ctx.lineWidth = strong ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(queryScreen.x, queryScreen.y);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();

    const radius = strong ? 15 + score * 12 : 10;
    ctx.fillStyle = strong ? "#16707a" : "#7d9397";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(record.id.replace("chunk-", ""), screen.x, screen.y + 4);
    nodes.push({
      x: screen.x - radius,
      y: screen.y - radius,
      width: radius * 2,
      height: radius * 2,
      title: record.id,
      text: record.text,
      meta: `${record.metadata?.source || "unknown"} · 分数 ${score.toFixed(4)}`,
    });
  });

  ctx.fillStyle = "#b35c2e";
  ctx.beginPath();
  ctx.arc(queryScreen.x, queryScreen.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 12px system-ui";
  ctx.fillText("Q", queryScreen.x, queryScreen.y + 4);
  nodes.push({
    x: queryScreen.x - 18,
    y: queryScreen.y - 18,
    width: 36,
    height: 36,
    title: "查询向量",
    text: query?.query || $("#queryInput")?.value || "",
    meta: `维度：${queryVector.map((value, index) => value > 0 ? dimensionLabels[index] : "").filter(Boolean).join("、") || "暂无明显维度"}`,
  });

  ctx.fillStyle = "#405055";
  ctx.font = "600 13px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("拖拽旋转 · 滚轮缩放 · 悬停查看记录", 18, height - 18);
  state.canvasNodes = nodes;
}

function switchView(view) {
  state.view = view;
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active ? active.textContent : "项目总览";
  if (view === "visual") renderSpace();
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
    if (button.dataset.project === "vectordb") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });
}

function bindCanvas() {
  const canvas = $("#spaceCanvas");
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
      renderSpace();
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
    tooltip.innerHTML = `<strong>${escapeHtml(node.title)}</strong><span>${escapeHtml(node.meta)}</span><p>${escapeHtml(node.text)}</p>`;
    tooltip.style.left = `${Math.min(rect.width - 310, Math.max(10, x + 14))}px`;
    tooltip.style.top = `${Math.min(rect.height - 140, Math.max(10, y + 14))}px`;
    tooltip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.space.zoom = Math.max(90, Math.min(260, state.space.zoom - event.deltaY * 0.12));
    renderSpace();
  }, { passive: false });
}

function bindEvents() {
  bindProjectSwitcher();
  bindCanvas();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#upsertBtn").addEventListener("click", upsertDocument);
  $("#resetBtn").addEventListener("click", resetDocuments);
  $("#queryBtn").addEventListener("click", runQuery);
  $("#docList").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      event.stopPropagation();
      deleteDocument(deleteButton.dataset.delete);
      return;
    }
    const row = event.target.closest("[data-select]");
    if (!row) return;
    state.selectedId = row.dataset.select;
    renderAll();
  });
  $("#resultList").addEventListener("click", (event) => {
    const row = event.target.closest("[data-select]");
    if (!row) return;
    state.selectedId = row.dataset.select;
    renderAll();
  });
  window.addEventListener("resize", renderSpace);
}

async function init() {
  bindEvents();
  renderRoadmap();
  await loadState();
  await runQuery();
}

init();
