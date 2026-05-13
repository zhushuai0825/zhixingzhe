const exampleText = `# RAG 系统入门

RAG 是 Retrieval-Augmented Generation 的缩写，中文常称为检索增强生成。它的核心思想是先从知识库中检索相关资料，再让大模型基于资料生成回答。

## 为什么需要文本切分

企业文档通常很长，可能是 PDF、Word、网页、接口文档或测试方案。大模型和向量数据库都不适合直接处理一整本长文档，所以需要把文档拆成多个 chunk。

好的 chunk 应该语义完整，长度适中，并且能被用户问题准确召回。如果 chunk 太短，容易丢上下文；如果 chunk 太长，容易混入噪声，影响检索和回答。

## chunk size 和 overlap

chunk size 控制每个切片的最大长度。overlap 控制相邻切片之间保留多少重复文本。适当 overlap 可以避免答案刚好落在两个切片边界时被切断。

## 常见切分方式

基础方式是按固定字符长度切分。更好的方式是优先按标题、段落、句子等自然边界切分。递归切分会先尝试大分隔符，再尝试小分隔符，最后才按字符硬切。

## 和 Embedding 的关系

文本切分之后，每个 chunk 会单独做 embedding，并写入向量数据库。用户提问时，问题也会做 embedding，然后和 chunk 向量计算相似度，召回最相关的 chunk。`;

const roadmap = [
  ["01", "文本切分", "先把长文档拆成 chunk，学会 chunk size、overlap 和递归切分。"],
  ["02", "Embedding 与相似度", "把 chunk 和查询文本变成向量，理解为什么能算相似。"],
  ["03", "向量库", "把 chunk 原文、向量和 metadata 写入 collection，再查询 Top K。"],
  ["04", "Rerank", "向量库粗召回后，用重排模型把最有用的证据排到前面。"],
  ["05", "知行者 AI 实验室", "把切分、embedding、向量库、rerank、大模型回答和 Agent 串起来。"],
  ["扩展", "ItemCF 推荐算法", "推荐系统是相似度的另一条路线，可以放在 RAG 主线之后学。"],
];

const state = {
  view: "overview",
  source: "loading",
  result: null,
  canvasNodes: [],
  previousResult: null,
  selectedChunkId: "",
  space: {
    rotationX: -0.55,
    rotationY: 0.62,
    zoom: 150,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiBase() {
  return "http://127.0.0.1:8040";
}

function splitPayload() {
  return {
    text: $("#sourceText").value.trim(),
    strategy: $("#strategySelect").value,
    chunkSize: Number($("#chunkSizeInput").value || 260),
    overlap: Number($("#overlapInput").value || 0),
  };
}

async function apiSplit() {
  const response = await fetch(`${apiBase()}/api/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(splitPayload()),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function splitCharacter(text, chunkSize, overlap) {
  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(text.length, start + chunkSize);
    const value = text.slice(start, end);
    if (value.trim()) {
      chunks.push(chunkRecord(chunks.length, value, start, end, chunks.length ? overlap : 0));
    }
    if (end >= text.length) break;
  }
  return chunks;
}

function splitParagraph(text, chunkSize, overlap) {
  const paragraphs = text.split(/\n\s*\n/);
  const merged = [];
  let buffer = "";
  paragraphs.forEach((paragraph) => {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= chunkSize) {
      buffer = candidate;
    } else {
      if (buffer) merged.push(buffer);
      buffer = paragraph;
    }
  });
  if (buffer) merged.push(buffer);
  return chunkParts(merged, chunkSize, overlap);
}

function splitRecursive(text, chunkSize, overlap) {
  const separators = ["\n## ", "\n# ", "\n\n", "。", "；", "\n", "，", " "];
  let units = [text];
  separators.forEach((separator) => {
    const next = [];
    let changed = false;
    units.forEach((unit) => {
      if (unit.length <= chunkSize) {
        next.push(unit);
        return;
      }
      const pieces = splitKeepSeparator(unit, separator);
      if (pieces.length === 1) {
        next.push(unit);
      } else {
        changed = true;
        next.push(...pieces);
      }
    });
    units = next;
    if (changed && units.every((unit) => unit.length <= chunkSize)) return;
  });
  const merged = [];
  let buffer = "";
  units.forEach((unit) => {
    const candidate = buffer ? `${buffer}${unit}` : unit;
    if (candidate.length <= chunkSize) {
      buffer = candidate;
      return;
    }
    if (buffer) merged.push(buffer);
    if (unit.length > chunkSize) {
      for (let index = 0; index < unit.length; index += chunkSize) {
        merged.push(unit.slice(index, index + chunkSize));
      }
      buffer = "";
    } else {
      buffer = unit;
    }
  });
  if (buffer) merged.push(buffer);
  return chunkParts(merged, chunkSize, overlap);
}

function splitKeepSeparator(text, separator) {
  if (!text.includes(separator)) return [text];
  return text.split(separator)
    .filter(Boolean)
    .map((piece, index) => (index === 0 ? piece : `${separator}${piece}`));
}

function chunkParts(parts, chunkSize, overlap) {
  const chunks = [];
  let cursor = 0;
  let previous = "";
  parts.forEach((part) => {
    let clean = part.trim();
    let start = cursor;
    while (clean) {
      const prefix = overlap && previous ? previous.slice(-overlap) : "";
      const bodyLimit = Math.max(1, chunkSize - prefix.length);
      const body = clean.slice(0, bodyLimit);
      clean = clean.slice(bodyLimit);
      const text = prefix ? `${prefix}${body}` : body;
      chunks.push(chunkRecord(chunks.length, text, start, start + body.length, prefix.length));
      previous = text;
      start += body.length;
    }
    cursor += part.length;
  });
  return chunks;
}

function chunkRecord(index, text, start, end, overlapPrefix) {
  return {
    id: `chunk-${index + 1}`,
    text,
    start,
    end,
    length: text.length,
    overlapPrefix,
  };
}

function localSplit() {
  const payload = splitPayload();
  const text = normalizeText(payload.text);
  const overlap = Math.min(payload.overlap, Math.max(0, payload.chunkSize - 1));
  let chunks;
  if (payload.strategy === "character") chunks = splitCharacter(text, payload.chunkSize, overlap);
  else if (payload.strategy === "paragraph") chunks = splitParagraph(text, payload.chunkSize, overlap);
  else chunks = splitRecursive(text, payload.chunkSize, overlap);
  return {
    strategy: payload.strategy,
    chunkSize: payload.chunkSize,
    overlap,
    sourceLength: text.length,
    chunkCount: chunks.length,
    chunks,
    quality: qualitySummary(chunks, payload.chunkSize),
  };
}

function qualitySummary(chunks, chunkSize) {
  if (!chunks.length) return { avgLength: 0, tooShort: 0, tooLong: 0, boundaryRisk: 0 };
  const lengths = chunks.map((chunk) => chunk.length);
  return {
    avgLength: Number((lengths.reduce((sum, value) => sum + value, 0) / lengths.length).toFixed(1)),
    tooShort: lengths.filter((value) => value < chunkSize * 0.35).length,
    tooLong: lengths.filter((value) => value > chunkSize * 1.08).length,
    boundaryRisk: chunks.filter((chunk) => !/[。\n！？.：:]$/.test(chunk.text)).length,
  };
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

async function runSplit() {
  if (!$("#sourceText").value.trim()) {
    showToast("请先填写原始文本");
    return;
  }
  state.previousResult = state.result;
  try {
    state.result = await apiSplit();
    state.source = "backend";
    setBackendStatus("FastAPI · 在线切分", "ok");
  } catch {
    state.result = localSplit();
    state.source = "local";
    setBackendStatus("离线教学切分", "error");
  }
  renderResult();
}

function renderResult() {
  if (!state.result) return;
  renderMetrics();
  renderChunks();
  renderParameterInsight();
  renderStrategyExplanation();
  renderSelectedChunkExplain();
  renderChunkCanvas();
}

function renderMetrics() {
  const result = state.result;
  const metrics = [
    ["原文长度", result.sourceLength],
    ["切片数量", result.chunkCount],
    ["平均长度", result.quality.avgLength],
    ["边界风险", result.quality.boundaryRisk],
  ];
  $("#metricGrid").innerHTML = metrics.map(([label, value]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderParameterInsight() {
  const result = state.result;
  const previous = state.previousResult;
  const theoretical = theoreticalCharacterCount(result.sourceLength, result.chunkSize, result.overlap);
  const changed = previous && previous.chunkCount !== result.chunkCount;
  const sameCount = previous && previous.chunkCount === result.chunkCount;
  const overLimit = result.chunks.filter((chunk) => chunk.length > result.chunkSize).length;
  const naturalBreaks = estimateNaturalBreaks($("#sourceText").value);
  const strategyCopy = result.strategy === "recursive"
    ? "递归切分会优先保留标题、段落、句子等自然边界，所以 Chunk Size 在同一边界区间内变化时，切片数量可能暂时不变。"
    : result.strategy === "paragraph"
      ? "段落切分会优先保留段落完整，只有段落或合并段落超过 Chunk Size 时才继续拆。"
      : "字符切分最直接，理论切片数会随 Chunk Size 和 Overlap 明显变化。";
  const compareCopy = !previous
    ? "这是当前参数的首次计算。"
    : changed
      ? `本次切片数量从 ${previous.chunkCount} 变成 ${result.chunkCount}。`
      : sameCount
        ? `本次切片数量仍是 ${result.chunkCount}，但边界位置和 chunk 长度可能已经变化。`
        : "";

  $("#parameterInsight").innerHTML = `
    <strong>为什么数量可能没变？</strong>
    <p>${strategyCopy}</p>
    <p>这段文本大约有 <b>${naturalBreaks}</b> 个自然边界。递归切分会先尊重这些边界，再考虑 Chunk Size，所以它更像“按语义段落切”，不是简单按字数切。</p>
    <p>如果按纯字符步长估算，当前参数大约会得到 <b>${theoretical}</b> 片；当前 ${strategyLabel(result.strategy)} 实际得到 <b>${result.chunkCount}</b> 片。${compareCopy}</p>
    <p>${overLimit ? `有 ${overLimit} 个 chunk 超过 Chunk Size，需要检查算法。` : "当前每个 chunk 的总长度都没有超过 Chunk Size。"}</p>
  `;
}

function estimateNaturalBreaks(text) {
  const headings = (text.match(/\n#{1,6}\s/g) || []).length + (text.trim().startsWith("#") ? 1 : 0);
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim()).length;
  return Math.max(headings, paragraphs);
}

function theoreticalCharacterCount(length, chunkSize, overlap) {
  const safeOverlap = Math.min(overlap, Math.max(0, chunkSize - 1));
  const step = Math.max(1, chunkSize - safeOverlap);
  return Math.max(1, Math.ceil(Math.max(0, length - chunkSize) / step) + 1);
}

function strategyLabel(strategy) {
  return {
    character: "按字符切分",
    paragraph: "按段落切分",
    recursive: "递归切分",
  }[strategy] || strategy;
}

function renderChunks() {
  const { chunks, chunkSize } = state.result;
  if (!state.selectedChunkId && chunks[0]) state.selectedChunkId = chunks[0].id;
  $("#chunkList").innerHTML = chunks.map((chunk, index) => {
    const risk = chunk.length < chunkSize * 0.35 || !/[。\n！？.：:]$/.test(chunk.text);
    return `
      <article class="chunk-card ${risk ? "is-risk" : ""} ${chunk.id === state.selectedChunkId ? "is-selected" : ""}" data-chunk-id="${chunk.id}">
        <span>${chunk.id}</span>
        <strong>长度 ${chunk.length} · overlap ${chunk.overlapPrefix}</strong>
        <div class="chunk-meta">
          <b>原文位置 ${chunk.start}-${chunk.end}</b>
          <b>${index === 0 ? "首片" : "含上片尾部重叠"}</b>
        </div>
        <div class="chunk-preview">${escapeHtml(chunk.text)}</div>
      </article>
    `;
  }).join("");
}

function renderSelectedChunkExplain() {
  const target = $("#selectedChunkExplain");
  if (!target || !state.result) return;
  const chunk = state.result.chunks.find((item) => item.id === state.selectedChunkId) || state.result.chunks[0];
  if (!chunk) {
    target.innerHTML = "<strong>当前 chunk</strong><p>暂无切片。</p>";
    return;
  }
  target.innerHTML = `
    <strong>${chunk.id} 为什么这样切？</strong>
    <p>${explainChunk(chunk, state.result)}</p>
    <p>原文位置 <b>${chunk.start}-${chunk.end}</b>，总长度 <b>${chunk.length}</b>，其中 overlap <b>${chunk.overlapPrefix}</b>。</p>
  `;
}

function explainChunk(chunk, result) {
  if (result.strategy === "character") {
    return "按字符切分只看固定步长，所以边界最直观，但最容易把句子或段落切断。";
  }
  if (result.strategy === "paragraph") {
    return "按段落切分会尽量保留段落完整；只有段落太长或合并后超过 Chunk Size，才会继续拆。";
  }
  if (chunk.overlapPrefix > 0) {
    return "递归切分先找到标题、段落、句子等自然边界，再把上一片尾部复制进来，避免答案刚好在边界处被切断。";
  }
  return "递归切分先按标题或段落开始新片，这样 chunk 更像一个完整语义单元，后续 embedding 更容易表达主题。";
}

function renderStrategyExplanation() {
  const copy = {
    character: ["按字符切分", "固定步长切，最简单也最容易切断语义。适合理解 chunk size 和 overlap 的基础影响。"],
    paragraph: ["按段落切分", "优先保持段落完整，语义更自然；如果段落过长，仍会继续拆小。"],
    recursive: ["递归切分", "优先尝试标题、段落、句子等自然边界，实在太长才退回硬切，更接近实际 RAG 工程。"],
  }[state.result.strategy];
  $("#strategyExplanation").innerHTML = `<strong>${copy[0]}</strong><p>${copy[1]}</p>`;
}

function renderChunkCanvas() {
  const canvas = $("#chunkCanvas");
  if (!canvas || !state.result) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  drawCanvasFrame(ctx, rect.width, rect.height);
  const chunks = state.result.chunks;
  const maxLength = Math.max(1, state.result.sourceLength);
  const rowHeight = Math.min(64, Math.max(42, (rect.height - 96) / Math.max(1, chunks.length)));
  state.canvasNodes = chunks.map((chunk, index) => {
    const point = chunkPoint(chunk, index, chunks.length, maxLength);
    const screen = project3d(point, rect.width, rect.height);
    const rawWidth = Math.max(40, ((chunk.end - chunk.start) / maxLength) * (rect.width - 180));
    const width = rawWidth * screen.scale;
    const height = Math.max(34, rowHeight - 10) * screen.scale;
    return {
      ...chunk,
      x: screen.x - width / 2,
      y: screen.y - height / 2,
      width,
      height,
      depth: screen.depth,
    };
  }).sort((left, right) => left.depth - right.depth);

  state.canvasNodes.forEach((node) => drawChunkLink(ctx, node, rect.width, rect.height));
  state.canvasNodes.forEach((node, index) => drawChunkNode(ctx, node, index));
  drawCanvasLegend(ctx, rect.width, rect.height);
}

function chunkPoint(chunk, index, count, maxLength) {
  const progress = maxLength ? (chunk.start + chunk.end) / 2 / maxLength : 0;
  const lane = count <= 1 ? 0 : index / (count - 1);
  return {
    x: (progress - 0.5) * 4.6,
    y: (lane - 0.5) * 1.8,
    z: Math.sin(progress * Math.PI * 2) * 0.45 + (chunk.overlapPrefix ? 0.22 : -0.08),
  };
}

function project3d(point, width, height) {
  const { rotationX, rotationY, zoom } = state.space;
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const scale = zoom / (zoom + z2 * 52 + 120);
  return {
    x: width / 2 + x1 * zoom * scale,
    y: height / 2 + y1 * zoom * scale,
    depth: z2,
    scale,
  };
}

function drawChunkLink(ctx, node, width, height) {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  ctx.strokeStyle = "rgba(63,111,53,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, height - 46);
  ctx.lineTo(centerX, centerY);
  ctx.lineTo(width - 70, height - 46);
  ctx.stroke();
}

function drawCanvasLegend(ctx, width, height) {
  ctx.fillStyle = "#294b24";
  ctx.font = "800 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("拖拽旋转 · 滚轮缩放 · 悬停看原因", 54, height - 18);
  ctx.textAlign = "right";
  ctx.fillText("深色厚片 = overlap", width - 54, height - 18);
  ctx.textAlign = "left";
}

function drawCanvasFrame(ctx, width, height) {
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  drawRoundRect(ctx, 28, 48, width - 56, height - 88, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(63,111,53,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(54, height - 36);
  ctx.lineTo(width - 54, height - 36);
  ctx.stroke();
  ctx.fillStyle = "#294b24";
  ctx.font = "900 13px sans-serif";
  ctx.fillText("3D 原文轨道：从左到右表示原文位置", 54, 30);
  ctx.textAlign = "right";
  ctx.fillText(`原文长度 ${state.result.sourceLength}`, width - 54, 30);
  ctx.textAlign = "left";
}

function drawChunkNode(ctx, node, index) {
  const risk = node.length < state.result.chunkSize * 0.35 || !/[。\n！？.：:]$/.test(node.text);
  const selected = node.id === state.selectedChunkId;
  ctx.fillStyle = risk ? "#fff1e7" : index % 2 ? "#edf5e8" : "#f8fbf5";
  ctx.strokeStyle = selected ? "#294b24" : risk ? "#ae5f2b" : "#3f6f35";
  ctx.lineWidth = selected ? 3 : risk ? 2 : 1.2;
  drawRoundRect(ctx, node.x, node.y, node.width, node.height, 8);
  ctx.fill();
  ctx.stroke();

  if (node.overlapPrefix > 0) {
    const overlapWidth = Math.min(node.width * 0.6, Math.max(8, node.width * (node.overlapPrefix / Math.max(1, node.length))));
    ctx.fillStyle = "rgba(174, 95, 43, 0.28)";
    drawRoundRect(ctx, node.x, node.y, overlapWidth, node.height, 8);
    ctx.fill();
  }

  ctx.fillStyle = "#294b24";
  ctx.font = "900 12px sans-serif";
  ctx.fillText(node.id, node.x + 8, node.y + 9);
  ctx.fillStyle = "#6d7469";
  ctx.font = "800 11px sans-serif";
  ctx.fillText(`${node.length} 字`, node.x + 8, node.y + node.height - 17);
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

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  if (view === "visual") renderChunkCanvas();
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
    if (button.dataset.project === "chunking") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });
}

function bindCanvasTooltip() {
  const canvas = $("#chunkCanvas");
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
      renderChunkCanvas();
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
    tooltip.innerHTML = `<strong>${node.id} · ${node.length} 字</strong><span>${escapeHtml(explainChunk(node, state.result))}</span><span>${escapeHtml(node.text.slice(0, 120))}</span>`;
    tooltip.style.left = `${Math.min(rect.width - 290, Math.max(10, x + 14))}px`;
    tooltip.style.top = `${Math.min(rect.height - 110, Math.max(10, y + 14))}px`;
    tooltip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.space.zoom = Math.max(90, Math.min(260, state.space.zoom - event.deltaY * 0.12));
    renderChunkCanvas();
  }, { passive: false });
}

function bindEvents() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", runSplit);
  $("#resetBtn").addEventListener("click", () => {
    $("#sourceText").value = exampleText;
    runSplit();
  });
  $("#strategySelect").addEventListener("change", runSplit);
  $("#chunkSizeInput").addEventListener("input", debounceRunSplit);
  $("#overlapInput").addEventListener("input", debounceRunSplit);
  $("#sourceText").addEventListener("input", debounceRunSplit);
  $("#chunkList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-chunk-id]");
    if (!card) return;
    state.selectedChunkId = card.dataset.chunkId;
    renderChunks();
    renderSelectedChunkExplain();
    renderChunkCanvas();
  });
  window.addEventListener("resize", renderChunkCanvas);
}

function debounceRunSplit() {
  clearTimeout(debounceRunSplit.timer);
  debounceRunSplit.timer = setTimeout(runSplit, 280);
}

async function init() {
  $("#sourceText").value = exampleText;
  bindEvents();
  renderRoadmap();
  await runSplit();
}

init();
