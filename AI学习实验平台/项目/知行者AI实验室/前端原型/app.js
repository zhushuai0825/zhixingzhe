const state = {
  view: "overview",
  activeFlowNode: "documents",
  activeAgentStep: "plan",
  agentSteps: [],
  latestAgentRun: null,
  activeKnowledgeBaseId: "",
  dataCenterKnowledgeBaseId: "",
  activeDataChunkId: "",
  activeDocument: null,
  activeChunks: [],
  previewChunks: [],
  timers: [],
};

const schemas = {
  upload: {
    title: "上传文件",
    desc: "用户选择 PDF、Markdown 或 TXT，系统读取文件并准备解析。",
    fields: [
      ["file_name", "rag_intro.pdf"],
      ["file_type", "pdf"],
      ["file_size", "2.4 MB"],
      ["parser", "pypdf / text reader"],
    ],
  },
  documents: {
    title: "documents 表",
    desc: "保存原始文档的元数据，不直接负责检索。",
    fields: [
      ["id", "doc_8f2a91"],
      ["file_name", "rag_intro.pdf"],
      ["file_type", "pdf"],
      ["status", "ready"],
      ["created_at", "2026-05-08 21:58"],
    ],
  },
  chunks: {
    title: "document_chunks 表",
    desc: "保存切片文本。RAG 检索时真正被命中的通常是 chunk，不是整份文档。",
    fields: [
      ["id", "chunk_001"],
      ["document_id", "doc_8f2a91"],
      ["chunk_index", "0"],
      ["content", "RAG 是检索增强生成..."],
      ["token_count", "286"],
    ],
  },
  vectors: {
    title: "chunk_vectors 表",
    desc: "保存每个 chunk 对应的向量。向量是数字数组，用来计算语义相似度。",
    fields: [
      ["chunk_id", "chunk_001"],
      ["model_name", "bge-small-zh"],
      ["dimensions", "384"],
      ["provider", "local"],
      ["vector_json", "[0.024, -0.018, ...]"],
    ],
  },
  index: {
    title: "向量索引",
    desc: "FAISS / Chroma 用向量索引快速找到和问题最接近的 chunk。",
    fields: [
      ["index_type", "FAISS IndexFlatIP"],
      ["distance_metric", "cosine / inner_product"],
      ["dimensions", "384"],
      ["vector_count", "128"],
      ["top_k", "5"],
    ],
  },
};

const chunks = [
  {
    id: "chunk_001",
    title: "RAG 基础定义",
    text: "RAG 是 Retrieval-Augmented Generation，中文常称为检索增强生成。它先检索资料，再让模型基于资料回答。",
  },
  {
    id: "chunk_002",
    title: "Embedding 作用",
    text: "Embedding 模型把文本片段转换成向量。向量数据库根据用户问题找到语义最相关的文档片段。",
  },
  {
    id: "chunk_003",
    title: "Advanced RAG",
    text: "企业 RAG 通常会加入 BM25、Hybrid 检索、Rerank、无依据拒答和自动评测，保证结果稳定可靠。",
  },
  {
    id: "chunk_004",
    title: "Agentic RAG",
    text: "Agentic RAG 由智能体动态决定是否检索、调用什么工具、是否反思修正，适合复杂多步骤任务。",
  },
];

const hits = [
  {
    id: "chunk_002",
    doc: "rag_intro.pdf",
    title: "Embedding 作用",
    text: "Embedding 模型把文本片段转换成向量。向量数据库根据用户问题找到语义最相关的文档片段。",
    vector: 0.88,
    bm25: 0.74,
    hybrid: 0.83,
    rerank: 0.91,
  },
  {
    id: "chunk_001",
    doc: "rag_intro.pdf",
    title: "RAG 基础定义",
    text: "RAG 先检索资料，再让模型基于资料回答，从而减少模型幻觉。",
    vector: 0.76,
    bm25: 0.62,
    hybrid: 0.71,
    rerank: 0.77,
  },
  {
    id: "chunk_003",
    doc: "advanced_rag.md",
    title: "Advanced RAG",
    text: "Hybrid 检索结合向量语义和 BM25 关键词，Rerank 会让更相关的片段排在前面。",
    vector: 0.58,
    bm25: 0.69,
    hybrid: 0.62,
    rerank: 0.68,
  },
  {
    id: "chunk_004",
    doc: "agentic_rag.md",
    title: "Agentic RAG",
    text: "Agent 可以把 RAG 检索作为工具，在证据不足时继续检索或追问用户。",
    vector: 0.46,
    bm25: 0.31,
    hybrid: 0.41,
    rerank: 0.39,
  },
];

const agentSteps = [
  {
    id: "plan",
    phase: "Plan",
    tool: "agent_planner",
    text: "理解用户目标，判断需要学习规划、RAG 检索和任务生成。",
    input: { goal: "学习 Agent 开发", mode: "learning" },
    output: { strategy: "retrieve_evaluate_act", tools: ["knowledge_search", "task_generator"] },
  },
  {
    id: "retrieve",
    phase: "Retrieve",
    tool: "knowledge_search",
    text: "调用 RAG 检索工具，从知识库查找 Agent、Tool Calling、LangGraph 相关资料。",
    input: { query: "Agent 开发学习路线", top_k: 5, hybrid: true },
    output: { hits: ["chunk_004", "chunk_003", "chunk_002"], top_score: 0.91 },
  },
  {
    id: "observe",
    phase: "Observation",
    tool: "search_result_reader",
    text: "读取检索片段，确认资料提到工具调用、状态、反思、评测。",
    input: { chunks: 3 },
    output: { evidence: "sufficient", missing: ["真实 Tool Calling 接口"] },
  },
  {
    id: "evaluate",
    phase: "Evaluate",
    tool: "rag_evaluator",
    text: "评估证据是否足够。当前资料能支撑学习规划，但不能冒充真实项目经验。",
    input: { retrieved_count: 3 },
    output: { verdict: "grounded", suggestion: "可以生成下一步任务" },
  },
  {
    id: "act",
    phase: "Act",
    tool: "task_generator",
    text: "把学习目标拆成任务：先做工具调用 Demo，再做 Agent 运行日志，再接 LangGraph。",
    input: { create_tasks: true },
    output: { tasks: ["做 Tool Calling Demo", "保存 Agent 运行轨迹", "学习 LangGraph 状态图"] },
  },
  {
    id: "reflect",
    phase: "Reflect",
    tool: "reflection_check",
    text: "检查任务是否过大，建议今天只完成一个最小工具调用 Demo。",
    input: { tasks: 3 },
    output: { next_best_task: "做一个 knowledge_search 工具调用 Demo" },
  },
];

const roadmap = [
  ["V0", "可视化前端原型", "先让 RAG 数据流、检索命中、Agent 轨迹都看得见。"],
  ["V1", "Naive RAG 后端", "FastAPI + PostgreSQL + 文档解析 + 切片 + Embedding + Chroma。"],
  ["V2", "Advanced RAG", "加入 BM25、Hybrid、Rerank、无依据拒答和自动评测。"],
  ["V3", "Agent 基础", "手写 plan -> retrieve -> evaluate -> act -> reflect 流程。"],
  ["V4", "真实 Tool Calling", "接 DeepSeek、通义千问、OpenAI 等模型 API 的工具调用。"],
  ["V5", "LangGraph", "把 Agent 迁移成状态图，展示节点、边、条件和运行日志。"],
  ["V6", "部署上线", "Docker、云服务器、日志、监控、备份，做成作品。"],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clearTimers() {
  state.timers.forEach((timer) => clearTimeout(timer));
  state.timers = [];
}

function delay(fn, ms) {
  const timer = setTimeout(fn, ms);
  state.timers.push(timer);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function apiBase() {
  return ($("#apiBaseInput")?.value || "http://127.0.0.1:8010").replace(/\/$/, "");
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function setBackendStatus(message, type = "") {
  const node = $("#backendStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-ok", type === "ok");
  node.classList.toggle("is-error", type === "error");
}

function setPipeline(containerId, activeStep = "", doneSteps = []) {
  const container = $(`#${containerId}`);
  if (!container) return;
  $$("#" + containerId + " span").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.step === activeStep);
    item.classList.toggle("is-done", doneSteps.includes(item.dataset.step));
  });
}

function switchView(viewId) {
  state.view = viewId;
  const titleMap = {
    overview: "项目总览",
    ragLab: "RAG 实验室",
    visualLab: "可视化实验台",
    dataCenter: "数据中心",
    agentLab: "Agent 实验室",
    roadmap: "学习路线",
  };
  $(".topbar h1").textContent = titleMap[viewId] || "知行者 AI 实验室";
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === viewId));
  if (viewId === "visualLab") {
    window.vectorSpace?.resize?.();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderOverview() {
  const rows = [
    ["1", "RAG 实验室", "看见文件如何解析、切片、向量化、入库并建立索引。"],
    ["2", "可视化实验台", "看见用户问题如何命中 Top K 片段和各种分数。"],
    ["3", "Agent 实验室", "看见 Agent 如何计划、调用工具、评估证据、生成任务。"],
    ["4", "后端接入", "再接 FastAPI、PostgreSQL、Chroma 和模型 API。"],
  ];
  $("#overviewTimeline").innerHTML = rows
    .map(([num, title, desc]) => `<article><b>${num}</b><div><strong>${title}</strong><span>${desc}</span></div></article>`)
    .join("");
}

function renderSchema(nodeId = state.activeFlowNode) {
  const schema = buildLiveSchema(nodeId);
  $("#schemaDetail").innerHTML = `
    <h3>${escapeHtml(schema.title)}</h3>
    <p>${escapeHtml(schema.desc)}</p>
    <div class="field-list">
      ${schema.fields.map(([key, value]) => `<div><code>${escapeHtml(key)}</code><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
  `;
  $$(".flow-node").forEach((node) => node.classList.toggle("is-active", node.dataset.flowNode === nodeId));
}

function renderChunks(activeId = "") {
  const items = state.activeChunks.length ? state.activeChunks : state.previewChunks.length ? state.previewChunks : chunks;
  const sourceLabel = state.activeChunks.length ? "已入库" : state.previewChunks.length ? "预览" : "演示";
  $("#chunkPreview").innerHTML = items
    ? `
        <div class="chunk-preview-summary">
          <strong>${escapeHtml(sourceLabel)}切片 ${items.length} 个</strong>
          <span>${state.activeChunks.length ? "已生成真实向量" : "导入后才生成向量"}</span>
        </div>
      `
    : "";
  $("#chunkPreview").innerHTML += items
    .map(
      (chunk) => `
        <article class="chunk-card ${chunk.id === activeId ? "is-active" : ""}">
          <header><strong>${escapeHtml(chunk.title || `片段 ${Number(chunk.chunk_index ?? 0) + 1}`)}</strong><span>${escapeHtml(chunk.id)}</span></header>
          <p>${escapeHtml(chunk.text || chunk.content || "")}</p>
          <div class="chunk-vector">
            <span>${chunk.embedding_preview ? "向量前 16 维" : "尚未生成向量"}</span>
            <div>${vectorBarsForChunk(chunk)}</div>
            ${chunk.embedding_preview ? `<small>${escapeHtml(chunk.embedding_preview.slice(0, 8).join(", "))}</small>` : `<small>点击“导入并切片”后，后端才会计算 embedding 并写入 Chroma。</small>`}
          </div>
        </article>
      `,
    )
    .join("");
}

function buildLiveSchema(nodeId) {
  const doc = state.activeDocument;
  const chunks = state.activeChunks.length ? state.activeChunks : state.previewChunks;
  if (!doc && !chunks.length) return schemas[nodeId] || schemas.documents;
  const firstChunk = chunks[0] || {};
  const base = {
    upload: {
      title: "上传/读取文件",
      desc: "第一步只是把你选的文件读成文本。预览阶段不会写数据库，也不会影响检索结果。",
      fields: [
        ["file_name", doc?.file_name || $("#docNameInput")?.value || "未选择"],
        ["file_type", doc?.file_type || inferFileType($("#docNameInput")?.value || "")],
        ["file_size", doc?.file_size ? formatBytes(Number(doc.file_size)) : `${($("#docContentInput")?.value || "").length} 字符`],
        ["parser", "文本读取 / pypdf"],
      ],
    },
    documents: {
      title: "documents 表",
      desc: "这里保存文档档案，例如文件名、类型、大小。只有点击导入后才会真正写入 PostgreSQL。",
      fields: [
        ["id", doc?.id || doc?.document_id || "预览阶段未入库"],
        ["file_name", doc?.file_name || $("#docNameInput")?.value || "未选择"],
        ["file_type", doc?.file_type || inferFileType($("#docNameInput")?.value || "")],
        ["status", doc ? "ready" : "preview"],
        ["chunk_count", doc?.chunk_count ?? chunks.length],
      ],
    },
    chunks: {
      title: "document_chunks 表",
      desc: "chunk 是 RAG 真正检索的最小文本片段。预览阶段可以先检查切片是否自然，再决定是否导入。",
      fields: [
        ["id", firstChunk.id || "暂无切片"],
        ["document_id", firstChunk.document_id || doc?.id || doc?.document_id || "预览阶段未入库"],
        ["chunk_index", firstChunk.chunk_index ?? "暂无"],
        ["token_count", firstChunk.token_count || (firstChunk.content || "").length || 0],
        ["chunk_count", chunks.length],
      ],
    },
    vectors: {
      title: "document_vectors / Chroma",
      desc: "向量是 chunk 的数字表达。只有点击导入后才会生成并写入 Chroma；预览阶段看到“还没点击导入”是正常的。",
      fields: [
        ["provider", "local_hash_demo"],
        ["dimensions", "384"],
        ["vector_count", state.activeChunks.length ? chunks.length : "预览阶段未写入"],
        ["source_chunks", chunks.length],
      ],
    },
    index: {
      title: "向量索引",
      desc: "索引可以理解成向量数据库的目录。写入 Chroma 后才算建立索引，提问时才能命中这些 chunk。",
      fields: [
        ["index_store", "Chroma"],
        ["distance_metric", "cosine"],
        ["indexed_vectors", state.activeChunks.length ? chunks.length : 0],
        ["top_k", $("#topKInput")?.value || "3"],
      ],
    },
  };
  return base[nodeId] || base.documents;
}

async function refreshKnowledgeBases() {
  try {
    const health = await apiRequest("/health");
    const bases = await apiRequest("/api/knowledge-bases");
    window.vectorSpace?.setKnowledgeBases?.(bases);
    const select = $("#kbSelect");
    select.innerHTML = bases
      .map((kb) => `<option value="${escapeHtml(kb.id)}">${escapeHtml(kb.name)} · ${escapeHtml(kb.id)}</option>`)
      .join("");
    if (bases.length && !state.activeKnowledgeBaseId) {
      state.activeKnowledgeBaseId = bases[0].id;
    }
  if (state.activeKnowledgeBaseId) {
      select.value = state.activeKnowledgeBaseId;
    } else if (bases.length) {
      state.activeKnowledgeBaseId = bases[0].id;
      select.value = state.activeKnowledgeBaseId;
    }
    setBackendStatus(`后端已连接 · Chroma 当前 ${health.chroma_collection_count} 条向量`, "ok");
    if (state.activeKnowledgeBaseId) await refreshLiveKnowledgeBaseData();
    renderDataCenterBases(bases);
    renderAgentPreviewKb(bases);
  } catch (error) {
    setBackendStatus(`后端连接失败：${error.message}`, "error");
  }
}

function renderAgentPreviewKb(bases = []) {
  const node = $("#agentPreviewKb");
  if (!node) return;
  const activeId = $("#kbSelect")?.value || state.activeKnowledgeBaseId || state.dataCenterKnowledgeBaseId;
  const kb = bases.find((item) => item.id === activeId) || bases[0];
  node.textContent = kb ? kb.name : "还没有知识库";
}

function renderDataCenterBases(bases) {
  if (!state.dataCenterKnowledgeBaseId && state.activeKnowledgeBaseId) {
    state.dataCenterKnowledgeBaseId = state.activeKnowledgeBaseId;
  }
  renderDataCenterBasesOnly(bases);
}

async function refreshDataCenter() {
  const bases = await apiRequest("/api/knowledge-bases");
  if (!state.dataCenterKnowledgeBaseId && bases.length) state.dataCenterKnowledgeBaseId = bases[0].id;
  renderDataCenterBasesOnly(bases);
  if (!state.dataCenterKnowledgeBaseId) return;
  const [documents, chunks, health] = await Promise.all([
    apiRequest(`/api/knowledge-bases/${state.dataCenterKnowledgeBaseId}/documents`),
    apiRequest(`/api/knowledge-bases/${state.dataCenterKnowledgeBaseId}/chunks`),
    apiRequest("/health"),
  ]);
  $("#dataDocumentList").innerHTML = documents.length
    ? documents
        .map(
          (doc) => `
            <article class="document-row">
              <div>
                <strong>${escapeHtml(doc.file_name)}</strong>
                <span>${escapeHtml(doc.id)} · ${formatBytes(Number(doc.file_size || 0))} · ${escapeHtml(doc.chunk_count)} 个切片</span>
              </div>
              <div class="row-actions">
                <b>${escapeHtml(doc.file_type)}</b>
                <button class="danger-icon-btn" data-delete-doc="${escapeHtml(doc.id)}" title="删除文档" type="button">删</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article class="document-row"><span>这个知识库还没有文档。</span></article>`;
  $("#dataSummary").innerHTML = `
    <article><strong>${documents.length}</strong><span>文档</span></article>
    <article><strong>${chunks.length}</strong><span>切片</span></article>
    <article><strong>${escapeHtml(health.chroma_collection_count)}</strong><span>Chroma 向量</span></article>
  `;
  if (!state.activeDataChunkId && chunks.length) state.activeDataChunkId = chunks[0].id;
  $("#dataChunkList").innerHTML = chunks.length
    ? chunks
        .map(
          (chunk) => `
            <button class="data-chunk-row ${chunk.id === state.activeDataChunkId ? "is-active" : ""}" data-data-chunk="${escapeHtml(chunk.id)}">
              <span>${escapeHtml(chunk.chunk_index)}</span>
              <strong>${escapeHtml(chunk.file_name)}</strong>
              <p>${escapeHtml(chunk.content.slice(0, 120))}${chunk.content.length > 120 ? "..." : ""}</p>
              <small>${escapeHtml(chunk.id)}</small>
            </button>
          `,
        )
        .join("")
    : `<article class="plain-card">暂无切片。</article>`;
  $$("[data-data-chunk]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeDataChunkId = button.dataset.dataChunk;
      renderDataChunkDetail(chunks);
      $$(".data-chunk-row").forEach((row) => row.classList.toggle("is-active", row.dataset.dataChunk === state.activeDataChunkId));
    });
  });
  $$("[data-delete-doc]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteDataCenterDocument(button.dataset.deleteDoc).catch((error) => showToast(`删除文档失败：${error.message}`));
    });
  });
  renderDataChunkDetail(chunks);
}

function renderDataChunkDetail(chunks) {
  const chunk = chunks.find((item) => item.id === state.activeDataChunkId) || chunks[0];
  const container = $("#dataChunkDetail");
  if (!container) return;
  if (!chunk) {
    container.innerHTML = `<article class="plain-card">选择一个知识库后，这里会显示切片详情。</article>`;
    return;
  }
  container.innerHTML = `
    <article class="data-detail-head">
      <div>
        <strong>${escapeHtml(chunk.file_name)}</strong>
        <span>片段 ${escapeHtml(chunk.chunk_index)} · ${escapeHtml(chunk.id)}</span>
      </div>
      <b>${escapeHtml(chunk.token_count)} 字符</b>
    </article>
    <article class="data-detail-text">${escapeHtml(chunk.content)}</article>
    <article class="data-detail-vector">
      <header>
        <strong>真实向量前 16 维</strong>
        <span>local_hash_demo · 384 维</span>
      </header>
      <div class="chunk-vector">
        <div>${vectorBarsForChunk(chunk)}</div>
        <small>${escapeHtml((chunk.embedding_preview || []).join(", "))}</small>
      </div>
    </article>
  `;
}

function renderDataCenterBasesOnly(bases) {
  const container = $("#dataKbList");
  if (!container) return;
  container.innerHTML = bases.length
    ? bases
        .map(
          (kb) => `
            <article class="data-kb-item ${kb.id === state.dataCenterKnowledgeBaseId ? "is-active" : ""}" data-data-kb="${escapeHtml(kb.id)}">
              <button type="button" class="data-kb-main" data-data-kb-main="${escapeHtml(kb.id)}">
                <strong>${escapeHtml(kb.name)}</strong>
                <span>${escapeHtml(kb.id)}</span>
              </button>
              <button class="danger-icon-btn" data-delete-kb="${escapeHtml(kb.id)}" title="删除知识库" type="button">删</button>
            </article>
          `,
        )
        .join("")
    : `<article class="plain-card">还没有知识库。先去 RAG 实验室创建并导入文档。</article>`;
  $$("[data-data-kb-main]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dataCenterKnowledgeBaseId = button.dataset.dataKbMain;
      refreshDataCenter().catch((error) => showToast(`数据中心刷新失败：${error.message}`));
    });
  });
  $$("[data-delete-kb]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteDataCenterKnowledgeBase(button.dataset.deleteKb).catch((error) => showToast(`删除知识库失败：${error.message}`));
    });
  });
}

async function deleteDataCenterKnowledgeBase(knowledgeBaseId) {
  if (!knowledgeBaseId) return;
  const ok = window.confirm("确认删除这个知识库吗？会同时删除其中的文档、切片和 Chroma 向量。");
  if (!ok) return;
  await apiRequest(`/api/knowledge-bases/${knowledgeBaseId}`, { method: "DELETE" });
  if (state.dataCenterKnowledgeBaseId === knowledgeBaseId) state.dataCenterKnowledgeBaseId = "";
  if (state.activeKnowledgeBaseId === knowledgeBaseId) {
    state.activeKnowledgeBaseId = "";
    state.activeChunks = [];
    state.activeDocument = null;
    window.vectorSpace?.setChunks?.([]);
  }
  await refreshKnowledgeBases();
  await refreshDataCenter();
  showToast("知识库已删除");
}

async function deleteDataCenterDocument(documentId) {
  if (!documentId || !state.dataCenterKnowledgeBaseId) return;
  const ok = window.confirm("确认删除这个文档吗？会同时删除它的切片和 Chroma 向量。");
  if (!ok) return;
  await apiRequest(`/api/knowledge-bases/${state.dataCenterKnowledgeBaseId}/documents/${documentId}`, { method: "DELETE" });
  state.activeDataChunkId = "";
  if (state.activeKnowledgeBaseId === state.dataCenterKnowledgeBaseId) await refreshLiveKnowledgeBaseData();
  await refreshDataCenter();
  showToast("文档已删除");
}

async function createKnowledgeBase() {
  try {
    const payload = {
      name: $("#kbNameInput").value.trim() || "RAG 可视化学习库",
      description: "从前端真实创建的学习知识库",
    };
    const kb = await apiRequest("/api/knowledge-bases", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.activeKnowledgeBaseId = kb.id;
    showToast("知识库创建成功");
    await refreshKnowledgeBases();
  } catch (error) {
    setBackendStatus(`创建知识库失败：${error.message}`, "error");
  }
}

async function ingestLiveText() {
  const knowledgeBaseId = $("#kbSelect").value;
  if (!knowledgeBaseId) {
    showToast("请先创建或选择知识库");
    return;
  }
  try {
    state.activeKnowledgeBaseId = knowledgeBaseId;
    setPipeline("ingestPipeline", "parse");
    setBackendStatus("正在解析文本...", "ok");
    await wait(180);
    setPipeline("ingestPipeline", "chunk", ["parse"]);
    setBackendStatus("正在切片，并准备写入 PostgreSQL...", "ok");
    await wait(180);
    setPipeline("ingestPipeline", "postgres", ["parse", "chunk"]);
    const file = $("#docFileInput").files?.[0];
    const data = file
      ? await uploadLiveFile(knowledgeBaseId, file)
      : await apiRequest(`/api/knowledge-bases/${knowledgeBaseId}/documents/text`, {
          method: "POST",
          body: JSON.stringify({
            file_name: $("#docNameInput").value.trim() || "rag_live_demo.md",
            content: $("#docContentInput").value,
            chunk_size: Number($("#chunkSizeInput").value || 180),
            overlap: Number($("#overlapInput").value || 40),
          }),
        });
    setPipeline("ingestPipeline", "chroma", ["parse", "chunk", "postgres"]);
    await wait(180);
    $("#liveDocumentId").textContent = data.document_id;
    $("#liveChunkCount").textContent = `${data.chunk_count} 个切片`;
    $("#liveVectorCount").textContent = `${data.chunk_count} 条向量`;
    state.activeDocument = {
      id: data.document_id,
      document_id: data.document_id,
      file_name: data.file_name,
      file_type: data.file_type,
      file_size: data.file_size,
      chunk_count: data.chunk_count,
    };
    state.activeChunks = data.chunks;
    state.previewChunks = [];
    window.vectorSpace?.setKnowledgeBase?.(knowledgeBaseId);
    window.vectorSpace?.setChunks?.(data.chunks);
    renderLiveChunks(data.chunks);
    updateIngestVisualization("done");
    renderSchema(state.activeFlowNode);
    renderChunks(data.chunks[0]?.id || "");
    await refreshLiveDocuments();
    setPipeline("ingestPipeline", "done", ["parse", "chunk", "postgres", "chroma"]);
    await wait(180);
    setPipeline("ingestPipeline", "", ["parse", "chunk", "postgres", "chroma", "done"]);
    setBackendStatus("导入完成：PostgreSQL 和 Chroma 都已写入", "ok");
    showToast("真实 RAG 入库完成");
  } catch (error) {
    setPipeline("ingestPipeline");
    setBackendStatus(`导入失败：${error.message}`, "error");
  }
}

async function previewDocumentChunks() {
  try {
    const file = $("#docFileInput").files?.[0];
    if (file) await readLocalDocumentFile();
    const payload = {
      file_name: $("#docNameInput").value.trim() || "preview.md",
      content: $("#docContentInput").value,
      chunk_size: Number($("#chunkSizeInput").value || 180),
      overlap: Number($("#overlapInput").value || 40),
    };
    if (!payload.content.trim() || payload.content.startsWith("已选择 PDF 文件。")) {
      showToast("PDF 需要点击导入后由后端解析；TXT/MD 可以先预览切片");
      return;
    }
    setPipeline("ingestPipeline", "chunk", ["parse"]);
    const data = await apiRequest("/api/documents/preview-chunks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.previewChunks = data.chunks;
    state.activeChunks = [];
    state.activeDocument = {
      file_name: data.file_name,
      file_type: inferFileType(data.file_name),
      file_size: data.content_length,
      chunk_count: data.chunk_count,
    };
    $("#liveChunkCount").textContent = `${data.chunk_count} 个预览切片`;
    $("#liveVectorCount").textContent = "预览阶段未写入";
    renderLiveChunks(data.chunks);
    updateIngestVisualization("preview");
    renderSchema("chunks");
    renderChunks(data.chunks[0]?.id || "");
    setBackendStatus(`已读取并预览：${data.chunk_count} 个切片，确认后可导入`, "ok");
  } catch (error) {
    setBackendStatus(`预览失败：${error.message}`, "error");
  }
}

async function uploadLiveFile(knowledgeBaseId, file) {
  const form = new FormData();
  form.append("file", file);
  form.append("chunk_size", String(Number($("#chunkSizeInput").value || 180)));
  form.append("overlap", String(Number($("#overlapInput").value || 40)));
  const response = await fetch(`${apiBase()}/api/knowledge-bases/${knowledgeBaseId}/documents/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

async function readLocalDocumentFile() {
  const file = $("#docFileInput").files?.[0];
  if (!file) return;
  $("#docNameInput").value = file.name;
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    $("#docContentInput").value = "已选择 PDF 文件。点击“导入并切片”后，后端会解析 PDF 文本、切片并写入向量数据库。";
    setBackendStatus(`已选择 PDF：${file.name} · 将由后端解析`, "ok");
    return;
  }
  const text = await file.text();
  $("#docContentInput").value = text;
  setBackendStatus(`已读取本地文件：${file.name} · ${text.length} 字符`, "ok");
}

async function refreshLiveChunks() {
  const knowledgeBaseId = $("#kbSelect").value || state.activeKnowledgeBaseId;
  if (!knowledgeBaseId) return;
  const chunks = await apiRequest(`/api/knowledge-bases/${knowledgeBaseId}/chunks`);
  $("#liveChunkCount").textContent = `${chunks.length} 个切片`;
  $("#liveVectorCount").textContent = chunks.length ? "已写入 Chroma" : "等待写入";
  state.activeChunks = chunks;
  window.vectorSpace?.setKnowledgeBase?.(knowledgeBaseId);
  window.vectorSpace?.setChunks?.(chunks);
  renderLiveChunks(chunks);
  updateIngestVisualization(chunks.length ? "done" : "preview");
  renderSchema(state.activeFlowNode);
  renderChunks();
}

async function refreshLiveDocuments() {
  const knowledgeBaseId = $("#kbSelect").value || state.activeKnowledgeBaseId;
  if (!knowledgeBaseId) return;
  const documents = await apiRequest(`/api/knowledge-bases/${knowledgeBaseId}/documents`);
  renderLiveDocuments(documents);
  if (documents.length) {
    const activeDoc = documents[0];
    state.activeDocument = {
      ...activeDoc,
      document_id: activeDoc.id,
    };
    $("#liveDocumentId").textContent = activeDoc.id;
  }
}

async function refreshLiveKnowledgeBaseData() {
  await refreshLiveDocuments();
  await refreshLiveChunks();
}

function renderLiveDocuments(items) {
  $("#liveDocumentList").innerHTML = items.length
    ? items
        .map(
          (doc) => `
            <article class="document-row" data-document-id="${escapeHtml(doc.id)}">
              <div>
                <strong>${escapeHtml(doc.file_name)}</strong>
                <span>${escapeHtml(doc.id)} · ${formatBytes(Number(doc.file_size || 0))} · ${escapeHtml(doc.chunk_count)} 个切片</span>
              </div>
              <b>${escapeHtml(doc.file_type)}</b>
            </article>
          `,
        )
        .join("")
    : `<article class="document-row"><span>当前知识库还没有文档。</span></article>`;
}

function renderLiveChunks(items) {
  $("#liveChunkList").innerHTML = items.length
    ? items
        .map(
          (chunk) => `
            <article class="live-chunk-card">
              <header>
                <span>片段 ${escapeHtml(chunk.chunk_index)}</span>
                <small>${escapeHtml(chunk.id)}</small>
              </header>
              <p>${escapeHtml(chunk.content)}</p>
            </article>
          `,
        )
        .join("")
    : `<article class="live-chunk-card"><p>当前知识库还没有切片。</p></article>`;
}

function updateIngestVisualization(stage = "preview") {
  const doc = state.activeDocument || {};
  const chunks = state.activeChunks.length ? state.activeChunks : state.previewChunks;
  const fileName = doc.file_name || $("#docNameInput")?.value || "等待选择文档";
  $("#flowRawFile").textContent = fileName;
  $("#flowRawDesc").textContent = doc.file_size ? `已读取 ${formatBytes(Number(doc.file_size))}，准备解析为纯文本。` : "已读取文本内容，准备解析。";
  $("#flowSplitStats").textContent = chunks.length
    ? `chunk_size=${$("#chunkSizeInput").value} · overlap=${$("#overlapInput").value} · ${chunks.length} 个切片`
    : "尚未切片";
  $("#flowSplitDesc").textContent = stage === "done" ? "这些切片已经写入 PostgreSQL，检索命中的就是它们。" : "这些是预览切片，还没有写入数据库。";
  $("#flowEmbedStats").textContent = stage === "done" ? `Embedding 384 维 · ${chunks.length} 条` : "预览阶段不生成向量";
  $("#flowIndexStats").textContent = stage === "done" ? `Chroma 已索引 ${chunks.length} 条向量` : "等待写入 Chroma";
  $("#flowNodeUploadText").textContent = fileName;
  $("#flowNodeDocumentText").textContent = stage === "done" ? doc.id || doc.document_id || "已写入" : "预览阶段未写入";
  $("#flowNodeChunkText").textContent = chunks.length ? `${chunks.length} 个切片` : "未切片";
  $("#flowNodeVectorText").textContent = stage === "done" ? `${chunks.length} 条向量` : "还没点击导入";
  $("#flowNodeIndexText").textContent = stage === "done" ? "已可检索" : "还不能检索";
}

async function runLiveSearch() {
  const knowledgeBaseId = $("#kbSelect").value || state.activeKnowledgeBaseId;
  if (!knowledgeBaseId) {
    showToast("请先选择知识库");
    return;
  }
  try {
    if (!state.activeChunks.length) {
      await refreshLiveChunks();
    }
    setPipeline("searchPipeline", "question");
    $("#liveAnswerBox").textContent = "正在把问题转换成查询向量...";
    await wait(180);
    setPipeline("searchPipeline", "search", ["question"]);
    $("#liveAnswerBox").textContent = "正在 Chroma 中检索相似切片...";
    const data = await apiRequest(`/api/knowledge-bases/${knowledgeBaseId}/search`, {
      method: "POST",
      body: JSON.stringify({
        question: $("#liveQuestionInput").value,
        top_k: Number($("#topKInput").value || 3),
        min_score: Number($("#minScoreInput").value || 0.2),
        mode: $("#retrievalModeInput").value,
      }),
    });
    setPipeline("searchPipeline", "rank", ["question", "search"]);
    await wait(180);
    setPipeline("searchPipeline", "answer", ["question", "search", "rank"]);
    $("#liveAnswerBox").textContent = data.answer;
    renderLiveHits(data.hits);
    renderRetrievalExplain(data.retrieval_trace);
    window.vectorSpace?.setSearchResult?.({
      question: data.question,
      queryEmbedding: data.retrieval_trace?.embedding?.preview || [],
      hits: data.hits || [],
    });
    await wait(180);
    setPipeline("searchPipeline", "", ["question", "search", "rank", "answer"]);
    showToast("真实检索完成");
  } catch (error) {
    setPipeline("searchPipeline");
    $("#liveAnswerBox").textContent = `检索失败：${error.message}`;
    $("#liveHitList").innerHTML = "";
    $("#retrievalExplain").classList.remove("is-visible");
    $("#retrievalExplain").innerHTML = "";
  }
}

function renderRetrievalExplain(trace) {
  if (!trace) return;
  const rankingRows = trace.ranking
    .map(
      (item) =>
        `#${item.rank} ${item.file_name} · chunk ${item.chunk_index} · final=${item.score} · vector=${item.vector_score} · bm25=${item.keyword_score} · hybrid=${item.hybrid_score} · 来源=${(item.sources || []).join("+")}`,
    )
    .join("\n");
  $("#retrievalExplain").classList.add("is-visible");
  $("#retrievalExplain").innerHTML = `
    <article class="explain-card">
      <h3>1. 问题向量</h3>
      <p>${escapeHtml(trace.embedding.provider)} · ${escapeHtml(trace.embedding.dimensions)} 维</p>
      <div class="vector-preview">
        ${trace.embedding.preview.map((value) => `<i style="height:${Math.max(8, Math.abs(Number(value)) * 100)}%"></i>`).join("")}
      </div>
    </article>
    <article class="explain-card">
      <h3>2. Chroma 查询</h3>
      <pre>${escapeHtml(JSON.stringify(trace.chroma_query, null, 2))}</pre>
    </article>
    <article class="explain-card">
      <h3>3. BM25 查询</h3>
      <pre>${escapeHtml(JSON.stringify(trace.keyword_query, null, 2))}</pre>
    </article>
    <article class="explain-card">
      <h3>4. 检索模式</h3>
      <p>${escapeHtml(trace.retrieval_mode.mode)} · 向量权重 ${escapeHtml(trace.retrieval_mode.vector_weight)} · BM25 权重 ${escapeHtml(trace.retrieval_mode.keyword_weight)}</p>
      <p>${escapeHtml(trace.retrieval_mode.note)}</p>
    </article>
    <article class="explain-card">
      <h3>5. Top K 排名</h3>
      <pre>${escapeHtml(rankingRows || "没有命中片段")}</pre>
    </article>
    <article class="explain-card">
      <h3>6. 依据判断</h3>
      <p>${escapeHtml(trace.evaluation.verdict)}：命中 ${escapeHtml(trace.context.chunk_count)} 个片段，最高分 ${escapeHtml(trace.evaluation.top_score)}，阈值 ${escapeHtml(trace.evaluation.min_score)}。</p>
      <p>${trace.evaluation.has_evidence ? "有可引用依据，可以基于片段回答。" : "依据不足，应该拒答、提示补充资料，或让用户换一种问法。"}</p>
    </article>
    <article class="explain-card">
      <h3>7. 生成模型</h3>
      <p>${escapeHtml(trace.generation?.used_model ? "已调用大模型" : "本地拒答/兜底")} · ${escapeHtml(trace.generation?.model || trace.generation?.provider || "")}</p>
      <pre>${escapeHtml(JSON.stringify(trace.generation?.usage || {}, null, 2))}</pre>
    </article>
    <article class="explain-card is-wide">
      <h3>8. 拼接进 Prompt 的上下文</h3>
      <pre>${escapeHtml(trace.context.preview || "暂无上下文")}</pre>
    </article>
  `;
}

function renderLiveHits(items) {
  $("#liveHitList").innerHTML = items.length
    ? `<article class="result-note">已做检索后去重：相邻或内容高度相似的 chunk 只保留分数最高的一条。</article>` +
      items
        .map(
          (hit) => `
            <article class="hit-card">
              <div class="rank-badge">${escapeHtml(hit.rank)}</div>
              <div>
                <header>
                  <strong>${escapeHtml(hit.file_name)}</strong>
                  <span>${escapeHtml(hit.chunk_id)} · ${escapeHtml((hit.sources || []).join("+"))}</span>
                </header>
                <p>${escapeHtml(hit.content)}</p>
                <div class="score-grid">
                  ${scoreMeter("Final", Number(hit.score || 0))}
                  ${scoreMeter("Vector", Number(hit.vector_score || 0))}
                  ${scoreMeter("BM25", Number(hit.keyword_score || 0))}
                  ${scoreMeter("Hybrid", Number(hit.hybrid_score || 0))}
                </div>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article class="hit-card"><div></div><p>没有命中片段。</p></article>`;
}

function vectorBarsForChunk(chunk) {
  const values = chunk.embedding_preview;
  if (!values) {
    return Array.from({ length: 16 }, () => `<i class="is-empty" style="height:12%"></i>`).join("");
  }
  return values
    .map((value) => {
      const height = Math.max(8, Math.round(Math.abs(Number(value)) * 180));
      const tone = Number(value) >= 0 ? "is-positive" : "is-negative";
      return `<i class="${tone}" style="height:${height}%"></i>`;
    })
    .join("");
}

function runIngestFlow() {
  clearTimers();
  $$(".flow-node").forEach((node) => node.classList.remove("is-active", "is-done"));
  $$(".flow-lines path").forEach((line) => line.classList.remove("is-active"));
  $$(".transform-card").forEach((card) => card.classList.remove("is-active", "is-done"));
  updateIngestVisualization(state.activeChunks.length ? "done" : "preview");
  renderChunks();
  const steps = [
    ["upload", null, "", "raw"],
    ["documents", "line-upload-docs", "", "raw"],
    ["chunks", "line-docs-chunks", state.activeChunks[0]?.id || state.previewChunks[0]?.id || "chunk_001", "split"],
    ["vectors", "line-chunks-vectors", state.activeChunks[1]?.id || state.previewChunks[1]?.id || "chunk_002", "embed"],
    ["index", "line-vectors-index", state.activeChunks[2]?.id || state.previewChunks[2]?.id || "chunk_003", "index"],
  ];
  steps.forEach(([nodeId, lineId, chunkId, transformId], index) => {
    delay(() => {
      if (lineId) $(`#${lineId}`).classList.add("is-active");
      $$(".flow-node").forEach((node) => {
        if (steps.findIndex((step) => step[0] === node.dataset.flowNode) < index) node.classList.add("is-done");
        node.classList.toggle("is-active", node.dataset.flowNode === nodeId);
      });
      $$(".transform-card").forEach((card) => {
        const cardIndex = ["raw", "split", "embed", "index"].indexOf(card.dataset.transform);
        const currentIndex = ["raw", "split", "embed", "index"].indexOf(transformId);
        card.classList.toggle("is-active", card.dataset.transform === transformId);
        if (cardIndex >= 0 && cardIndex < currentIndex) card.classList.add("is-done");
      });
      state.activeFlowNode = nodeId;
      renderSchema(nodeId);
      renderChunks(chunkId);
    }, index * 850);
  });
  delay(() => showToast("入库流程演示完成：文档、切片、向量、索引已串起来"), steps.length * 850);
}

function renderQueryVector() {
  const values = [38, 74, 18, 55, 82, 28, 64, 45, 90, 36, 58, 22];
  $("#queryVectorBars").innerHTML = values.map((height) => `<i style="height:${height}%"></i>`).join("");
}

function renderHits(activeIndex = -1) {
  $("#hitList").innerHTML = hits
    .map(
      (hit, index) => `
        <article class="hit-card ${index === activeIndex ? "is-active" : ""}">
          <div class="rank-badge">${index + 1}</div>
          <div>
            <header>
              <strong>${escapeHtml(hit.title)}</strong>
              <span>${escapeHtml(hit.doc)} · ${escapeHtml(hit.id)}</span>
            </header>
            <p>${escapeHtml(hit.text)}</p>
            <div class="score-grid">
              ${scoreMeter("Vector", hit.vector)}
              ${scoreMeter("BM25", hit.bm25)}
              ${scoreMeter("Hybrid", hit.hybrid)}
              ${scoreMeter("Rerank", hit.rerank)}
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function scoreMeter(label, value) {
  return `
    <div class="score-meter">
      <span>${label} ${(value || 0).toFixed(2)}</span>
      <div><i style="width:${Math.round((value || 0) * 100)}%"></i></div>
    </div>
  `;
}

function runRetrieval() {
  clearTimers();
  $("#queryVectorCard").classList.remove("is-active");
  $("#vectorDbCard").classList.remove("is-active");
  $("#contextCard").classList.remove("is-active");
  renderHits(-1);
  delay(() => $("#queryVectorCard").classList.add("is-active"), 100);
  delay(() => $("#vectorDbCard").classList.add("is-active"), 700);
  hits.forEach((_, index) => {
    delay(() => renderHits(index), 1200 + index * 450);
  });
  delay(() => {
    $("#contextCard").classList.add("is-active");
    showToast("检索完成：Top K 片段已进入上下文");
  }, 1200 + hits.length * 450);
}

function renderAgentSteps(activeId = state.activeAgentStep) {
  const steps = state.agentSteps.length ? state.agentSteps : agentSteps;
  $("#agentCanvas").innerHTML = steps
    .map(
      (step) => `
        <button class="agent-step ${step.id === activeId ? "is-active" : ""}" data-agent-step="${step.id}">
          <span>${escapeHtml(step.tool)}</span>
          <strong>${escapeHtml(step.phase)}</strong>
          <p>${escapeHtml(step.text)}</p>
        </button>
      `,
    )
    .join("");
  $$("[data-agent-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAgentStep = button.dataset.agentStep;
      renderAgentSteps(state.activeAgentStep);
      renderAgentDetail(state.activeAgentStep);
    });
  });
}

function renderAgentDetail(stepId = state.activeAgentStep) {
  const steps = state.agentSteps.length ? state.agentSteps : agentSteps;
  const step = steps.find((item) => item.id === stepId) || steps[0];
  $("#agentDetail").innerHTML = `
    <h3>${escapeHtml(step.phase)} · ${escapeHtml(step.tool)}</h3>
    <p>${escapeHtml(step.text)}</p>
    <strong>工具输入</strong>
    <pre>${escapeHtml(JSON.stringify(step.input, null, 2))}</pre>
    <strong>工具输出</strong>
    <pre>${escapeHtml(JSON.stringify(step.output, null, 2))}</pre>
  `;
}

function renderAgentPreviewResult(data) {
  const preview = $("#agentPreviewResult");
  if (!preview) return;
  const tasks = data.tasks || [];
  const reflect = (data.steps || []).find((step) => step.id === "reflect");
  preview.innerHTML = `
    <strong>${escapeHtml(data.summary || "Agent 已完成运行。")}</strong>
    <p>下一步：${escapeHtml(reflect?.output?.next_best_task || tasks[0]?.title || "暂无")}</p>
  `;
}

function renderAgentSummary(data) {
  const tasks = data.tasks || [];
  const reflect = (data.steps || []).find((step) => step.id === "reflect");
  const citations = data.citations || [];
  $("#agentFinalResult").innerHTML = `
    <div class="agent-answer-hero">
      <span>大模型最终回答</span>
      <strong>${escapeHtml(data.generation?.model || "模型回答")}</strong>
    </div>
    <div class="agent-answer-box">${formatAnswer(data.final_answer || "没有生成最终回答。")}</div>
    <div class="agent-summary-grid">
      <article><span>知识库</span><strong>${escapeHtml(data.knowledge_base_id || "未选择")}</strong></article>
      <article><span>RAG 运行</span><strong>${escapeHtml(data.rag_run_id || "未生成")}</strong></article>
      <article><span>下一步</span><strong>${escapeHtml(reflect?.output?.next_best_task || tasks[0]?.title || "暂无")}</strong></article>
    </div>
    <strong>引用来源</strong>
    <div class="agent-citation-list">
      ${
        citations.length
          ? citations
              .map(
                (citation, index) => `
                  <details class="agent-citation-card">
                    <summary>
                      <b>[${index + 1}]</b>
                      <span>${escapeHtml(citation.file_name || citation.chunk_id)}</span>
                      <small>chunk ${escapeHtml(citation.chunk_index ?? "-")} · 相关度 ${escapeHtml(Number(citation.score || 0).toFixed(4))}</small>
                    </summary>
                    <div>
                      <p>${escapeHtml(citation.content || "没有返回引用原文。")}</p>
                      <small>来源方式：${escapeHtml((citation.sources || []).join(" + ") || "unknown")} · ${escapeHtml(citation.chunk_id || "")}</small>
                    </div>
                  </details>
                `,
              )
              .join("")
          : `<article class="agent-citation-card"><span>没有可引用来源</span><small>知识库证据不足</small></article>`
      }
    </div>
    <strong>生成任务</strong>
    <div class="agent-task-list">
      ${tasks
        .map(
          (task) => `
            <article>
              <b>${escapeHtml(task.priority)}</b>
              <div>
                <strong>${escapeHtml(task.title)}</strong>
                <p>${escapeHtml(task.description)}</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
  renderAgentPreviewResult(data);
}

function formatAnswer(answer) {
  return escapeHtml(answer)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function runAgent(event) {
  event.preventDefault();
  clearTimers();
  const button = $("#agentForm button[type='submit']");
  const preview = $("#agentPreviewResult");
  const finalResult = $("#agentFinalResult");
  button.disabled = true;
  button.textContent = "Agent 运行中...";
  if (preview) {
    preview.innerHTML = `
      <strong>Agent 正在运行</strong>
      <p>正在规划目标、调用知识库检索、判断证据，再生成可执行任务。</p>
    `;
  }
  if (finalResult) {
    finalResult.innerHTML = `
      <div class="agent-empty-state">
        <strong>正在生成最终结果</strong>
        <p>Agent 正在检索知识库，并让大模型基于引用生成最终回答。</p>
      </div>
    `;
    finalResult.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  try {
    const bases = await apiRequest("/api/knowledge-bases");
    const selectedKb = bases.find((kb) => kb.id === ($("#kbSelect").value || state.activeKnowledgeBaseId || state.dataCenterKnowledgeBaseId));
    const knowledgeBaseId = selectedKb?.id || bases[0]?.id || "";
    const data = await apiRequest("/api/agent-runs", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        agent_type: $("#agentType").value,
        goal: $("#agentGoal").value,
        enable_reflect: $("#enableReflect").checked,
        top_k: 5,
      }),
    });
    state.latestAgentRun = data;
    state.agentSteps = data.steps;
    state.activeAgentStep = data.steps[0]?.id || "plan";
    renderAgentPreviewResult(data);
    renderAgentSteps(state.activeAgentStep);
    renderAgentDetail(state.activeAgentStep);
    data.steps.forEach((step, index) => {
      delay(() => {
        state.activeAgentStep = step.id;
        renderAgentSteps(step.id);
        renderAgentDetail(step.id);
        $$("[data-agent-step]").forEach((node) => {
          const buttonIndex = data.steps.findIndex((item) => item.id === node.dataset.agentStep);
          if (buttonIndex < index) node.classList.add("is-done");
        });
      }, index * 520);
    });
    delay(() => {
      state.activeAgentStep = "summary";
      renderAgentSteps("");
      renderAgentSummary(data);
      $("#agentFinalResult").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(data.summary);
    }, data.steps.length * 520);
  } catch (error) {
    showToast(`Agent 运行失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "运行 Agent 实验";
  }
}

function renderRoadmap() {
  $("#roadmapSteps").innerHTML = roadmap
    .map(
      ([version, title, desc]) => `
        <article class="roadmap-step">
          <b>${escapeHtml(version)}</b>
          <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p></div>
        </article>
      `,
    )
    .join("");
}

function resetDemo() {
  clearTimers();
  state.activeFlowNode = "documents";
  state.activeAgentStep = "plan";
  state.latestAgentRun = null;
  state.agentSteps = [];
  renderSchema();
  renderChunks();
  renderHits();
  renderAgentSteps();
  renderAgentDetail();
  $("#agentFinalResult").innerHTML = `
    <div class="agent-empty-state">
      <strong>还没有最终结果</strong>
      <p>点击“运行 Agent 实验”后，最终回答会优先出现在这里。</p>
    </div>
  `;
  $("#agentPreviewResult").innerHTML = `
    <strong>还没有运行</strong>
    <p>输入目标后，Agent 会先检索知识库，再根据证据生成下一步任务。</p>
  `;
  $("#queryVectorCard").classList.remove("is-active");
  $("#vectorDbCard").classList.remove("is-active");
  $("#contextCard").classList.remove("is-active");
  $("#retrievalExplain").classList.remove("is-visible");
  $("#retrievalExplain").innerHTML = "";
  setPipeline("ingestPipeline");
  setPipeline("searchPipeline");
  $$(".flow-lines path").forEach((line) => line.classList.remove("is-active"));
  $$(".flow-node").forEach((node) => node.classList.remove("is-done"));
  showToast("演示已重置");
}

function bindEvents() {
  bindProjectSwitcher();
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("[data-view-link]");
    if (link) switchView(link.dataset.viewLink);
  });
  $$(".flow-node").forEach((node) => {
    node.addEventListener("click", () => {
      state.activeFlowNode = node.dataset.flowNode;
      renderSchema(state.activeFlowNode);
    });
  });
  $("#runIngestBtn").addEventListener("click", runIngestFlow);
  $("#runRetrievalBtn").addEventListener("click", runRetrieval);
  $("#loadVectorSpaceBtn").addEventListener("click", () => {
    refreshLiveChunks()
      .then(() => {
        window.vectorSpace?.setKnowledgeBase?.($("#kbSelect").value || state.activeKnowledgeBaseId);
        window.vectorSpace?.resize?.();
        showToast("3D 向量空间已载入当前知识库切片");
      })
      .catch((error) => showToast(`载入 3D 数据失败：${error.message}`));
  });
  $("#resetVectorViewBtn").addEventListener("click", () => window.vectorSpace?.resetView?.());
  $("#runVectorSpaceBtn").addEventListener("click", () => runLiveSearch());
  $("#refreshKbBtn").addEventListener("click", refreshKnowledgeBases);
  $("#createKbBtn").addEventListener("click", createKnowledgeBase);
  $("#previewChunksBtn").addEventListener("click", previewDocumentChunks);
  $("#ingestTextBtn").addEventListener("click", ingestLiveText);
  $("#docFileInput").addEventListener("change", () => {
    readLocalDocumentFile().catch((error) => setBackendStatus(`读取文件失败：${error.message}`, "error"));
  });
  $("#liveSearchBtn").addEventListener("click", runLiveSearch);
  $("#refreshDataCenterBtn").addEventListener("click", () => {
    refreshDataCenter().catch((error) => showToast(`数据中心刷新失败：${error.message}`));
  });
  $("#kbSelect").addEventListener("change", () => {
    state.activeKnowledgeBaseId = $("#kbSelect").value;
    state.dataCenterKnowledgeBaseId = state.activeKnowledgeBaseId;
    window.vectorSpace?.setKnowledgeBase?.(state.activeKnowledgeBaseId);
    apiRequest("/api/knowledge-bases").then(renderAgentPreviewKb).catch(() => {});
    refreshLiveKnowledgeBaseData().catch((error) => setBackendStatus(`读取知识库数据失败：${error.message}`, "error"));
  });
  $("#agentForm").addEventListener("submit", runAgent);
  $("#resetDemoBtn").addEventListener("click", resetDemo);
  window.addEventListener("vector-space-ready", () => {
    window.vectorSpace?.setKnowledgeBase?.(state.activeKnowledgeBaseId);
    window.vectorSpace?.setChunks?.(state.activeChunks);
    window.vectorSpace?.resize?.();
  });
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
  if (!trigger || !menu) return;

  const closeMenu = () => {
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  };

  trigger.addEventListener("click", () => {
    const nextOpen = !menu.classList.contains("is-open");
    trigger.classList.toggle("is-open", nextOpen);
    trigger.setAttribute("aria-expanded", String(nextOpen));
    menu.classList.toggle("is-open", nextOpen);
  });

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    if (button.dataset.project === "zhixingzhe") {
      closeMenu();
      return;
    }
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferFileType(fileName) {
  const suffix = String(fileName || "").split(".").pop()?.toLowerCase();
  if (suffix === "pdf") return "pdf";
  if (suffix === "md" || suffix === "markdown") return "markdown";
  if (suffix === "txt") return "text";
  return "text";
}

function init() {
  renderOverview();
  renderSchema();
  renderChunks();
  renderQueryVector();
  renderHits();
  renderAgentSteps();
  renderAgentDetail();
  renderRoadmap();
  bindEvents();
  refreshKnowledgeBases();
}

init();
