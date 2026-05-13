const documents = [
  {
    id: "c1",
    title: "Rerank 的作用",
    source: "rerank_intro.md",
    quality: 0.96,
    text: "Rerank 会对向量库初步召回的候选 chunk 重新排序，重点判断候选是否能直接回答用户问题。它常用于提升 RAG 证据质量。",
  },
  {
    id: "c2",
    title: "向量召回说明",
    source: "vector_recall.md",
    quality: 0.86,
    text: "向量检索会把 query 和 chunk embedding 放在同一向量空间里，按相似度召回 Top K 候选。它负责先找一批可能相关的片段。",
  },
  {
    id: "c3",
    title: "RAG 幻觉风险",
    source: "rag_quality.md",
    quality: 0.92,
    text: "如果进入 prompt 的上下文包含噪声、过时信息或不能支撑答案的片段，大模型可能会产生幻觉。证据不足时应该拒答。",
  },
  {
    id: "c4",
    title: "Rerank 模型形态",
    source: "rerank_models.md",
    quality: 0.9,
    text: "生产系统常用 cross-encoder reranker、BGE Reranker、Cohere Rerank、Jina Reranker 或大模型打分，对 query 和候选成对评分。",
  },
  {
    id: "c5",
    title: "文本切分参数",
    source: "chunking.md",
    quality: 0.72,
    text: "chunk size 和 overlap 会影响召回质量。切片太短容易丢上下文，切片太长容易混入噪声，都会影响后续检索和 rerank。",
  },
  {
    id: "c6",
    title: "Agent 工具调用",
    source: "agent.md",
    quality: 0.7,
    text: "Agent 会根据目标规划步骤，决定是否调用检索工具、计算工具或生成任务。它可以在证据不足时继续检索。",
  },
  {
    id: "c7",
    title: "Rerank 成本",
    source: "rerank_cost.md",
    quality: 0.88,
    text: "Rerank 需要对 query 和每个候选 chunk 成对计算，通常比向量检索更慢。工程上会先召回 Top K，再只对这一小批候选重排。",
  },
  {
    id: "c8",
    title: "推荐系统排序",
    source: "recommendation_rank.md",
    quality: 0.66,
    text: "推荐系统也会先召回候选，再排序输出 Top N。它和 RAG 的 rerank 思想相似，但推荐目标通常是点击、转化或留存。",
  },
];

const roadmap = [
  ["01", "先理解召回和重排分工", "向量库负责快而广地找候选，Rerank 负责慢一点但更认真地判断候选是否能回答问题。"],
  ["02", "观察排序变化", "同一个 query 下，对比 vector score 和 rerank score。真正能回答问题的 chunk 应该上升。"],
  ["03", "理解证据门", "Rerank 后仍然可能证据不足，低分证据不应该强行交给大模型。"],
  ["04", "理解成本", "Rerank 不能全库跑，通常只对向量召回 Top K 结果重排。Top K 太大成本高，太小又可能漏掉好证据。"],
  ["05", "升级真实模型", "教学版规则看懂后，再接 BGE Reranker、Cohere Rerank、Jina Reranker 或 LLM-as-a-judge。"],
];

const interviews = [
  ["为什么 RAG 需要 Rerank？", "因为向量检索主要看语义相似，可能召回主题相关但不能回答问题的片段。Rerank 会重新判断 query 和 chunk 的精确匹配度，把更能支撑答案的证据排前面。"],
  ["Rerank 和 Embedding 检索有什么区别？", "Embedding 检索通常把 query 和 chunk 分别编码成向量，然后快速算相似度；Rerank 通常成对阅读 query 和 chunk，判断相关性更细，但速度更慢。"],
  ["Rerank 放在 RAG 流程哪里？", "一般放在向量库召回之后、生成回答之前。流程是 chunk 入库、query 向量检索 Top K、rerank 重排、取 Top N 证据、拼 prompt、生成回答。"],
  ["Rerank 会不会增加成本？", "会。因为它要对每个候选重新评分，所以通常只重排 Top 20、Top 50 这样的小候选集，而不是全库重排。"],
  ["怎么评估 Rerank 是否有效？", "可以看命中证据是否上升、MRR、NDCG、Recall@K、人工标注相关性、答案引用准确率和拒答正确率。最终还要看用户真实问题上的回答质量。"],
  ["如果 Rerank 后最高分仍然很低怎么办？", "应该触发证据不足策略：扩大召回、改写 query、换检索方式，或者拒答并提示知识库没有足够依据。不能把低分证据硬塞给大模型。"],
];

const state = {
  query: "Rerank 在 RAG 里起什么作用？",
  recallK: 6,
  finalN: 3,
  strategy: "balanced",
  selectedId: "",
  recallResults: [],
  rerankResults: [],
  canvasNodes: [],
  animationStart: 0,
  animationProgress: 1,
  animationFrame: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function tokenize(text) {
  return (text.match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]/g) || []).map((token) => token.toLowerCase());
}

function keywordSet(text) {
  const tokens = tokenize(text);
  const phrases = [];
  const lower = text.toLowerCase();
  ["rag", "rerank", "embedding", "top k", "top n", "prompt", "chunk", "cross-encoder", "向量", "召回", "重排", "重排序", "证据", "幻觉", "回答", "相似", "成本", "模型"].forEach((word) => {
    if (lower.includes(word)) phrases.push(word);
  });
  return new Set([...tokens, ...phrases]);
}

function overlapScore(query, text) {
  const querySet = keywordSet(query);
  const textSet = keywordSet(text);
  const hits = [...querySet].filter((token) => textSet.has(token));
  const score = hits.length / Math.sqrt(Math.max(1, querySet.size) * Math.max(1, textSet.size));
  return { score: Number(score.toFixed(4)), hits };
}

function answerabilityScore(query, doc) {
  const text = doc.text;
  const asksRole = /作用|做什么|为什么|起什么/.test(query);
  const asksCost = /成本|慢|延迟|耗时/.test(query);
  const asksModel = /模型|cross|bge|cohere|jina/.test(query.toLowerCase());
  let score = 0;
  const reasons = [];
  if (asksRole && /重新排序|重排|证据质量|直接回答/.test(text)) {
    score += 0.36;
    reasons.push("直接解释了 Rerank 的作用");
  }
  if (asksCost && /更慢|成本|Top K|小批候选/.test(text)) {
    score += 0.32;
    reasons.push("回答了成本和候选规模");
  }
  if (asksModel && /cross-encoder|BGE|Cohere|Jina|大模型打分/.test(text)) {
    score += 0.32;
    reasons.push("提到了真实 rerank 模型形态");
  }
  if (/证据|chunk|候选|query/.test(text)) {
    score += 0.12;
    reasons.push("包含 RAG 证据链关键词");
  }
  if (/推荐系统|Agent/.test(text) && !/Rerank|RAG|向量/.test(text)) {
    score -= 0.16;
    reasons.push("主题有偏移");
  }
  return { score: Math.max(0, Number(score.toFixed(4))), reasons };
}

function vectorRecall(query, topK) {
  return documents.map((doc) => {
    const overlap = overlapScore(query, `${doc.title} ${doc.text}`);
    const titleBoost = overlapScore(query, doc.title).score * 0.35;
    const vectorScore = Math.min(1, overlap.score * 1.15 + titleBoost + doc.quality * 0.08);
    return {
      ...doc,
      vectorScore: Number(vectorScore.toFixed(4)),
      vectorHits: overlap.hits,
    };
  }).sort((a, b) => b.vectorScore - a.vectorScore).slice(0, topK);
}

function rerank(query, candidates, strategy) {
  const weights = {
    balanced: { vector: 0.28, exact: 0.3, answer: 0.32, quality: 0.1 },
    strict: { vector: 0.16, exact: 0.26, answer: 0.48, quality: 0.1 },
    semantic: { vector: 0.52, exact: 0.2, answer: 0.18, quality: 0.1 },
  }[strategy];

  return candidates.map((doc) => {
    const exact = overlapScore(query, `${doc.title} ${doc.text}`);
    const answerability = answerabilityScore(query, doc);
    const rerankScore = (
      doc.vectorScore * weights.vector
      + exact.score * weights.exact
      + answerability.score * weights.answer
      + doc.quality * weights.quality
    );
    return {
      ...doc,
      exactScore: exact.score,
      exactHits: exact.hits,
      answerabilityScore: answerability.score,
      answerabilityReasons: answerability.reasons,
      rerankScore: Number(rerankScore.toFixed(4)),
    };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}

function runExperiment() {
  state.query = $("#queryInput").value.trim() || "Rerank 在 RAG 里起什么作用？";
  state.recallK = Number($("#recallKSelect").value);
  state.finalN = Number($("#finalNSelect").value);
  state.strategy = $("#strategySelect").value;
  state.recallResults = vectorRecall(state.query, state.recallK);
  state.rerankResults = rerank(state.query, state.recallResults, state.strategy);
  if (!state.selectedId || !state.rerankResults.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.rerankResults[0]?.id || "";
  }
  startRankAnimation();
  renderAll();
}

function renderResultCard(item, index, mode) {
  const isRerank = mode === "rerank";
  const score = isRerank ? item.rerankScore : item.vectorScore;
  const label = isRerank ? "Rerank 分" : "向量分";
  const selected = item.id === state.selectedId ? " is-selected" : "";
  const shift = state.recallResults.findIndex((entry) => entry.id === item.id) - state.rerankResults.findIndex((entry) => entry.id === item.id);
  const shiftText = isRerank ? (shift > 0 ? `上升 ${shift} 位` : shift < 0 ? `下降 ${Math.abs(shift)} 位` : "名次不变") : `初筛第 ${index + 1}`;
  return `
    <article class="result-card${selected}" data-doc-id="${item.id}">
      <div class="result-top">
        <strong>${index + 1}. ${item.title}</strong>
        <b>${label} ${score.toFixed(4)}</b>
      </div>
      <p>${item.text}</p>
      <div class="tag-row">
        <span>${item.source}</span>
        <span>${shiftText}</span>
        <span>质量 ${item.quality.toFixed(2)}</span>
      </div>
    </article>
  `;
}

function renderLists() {
  $("#recallStatus").textContent = `${state.recallResults.length} 条`;
  $("#rerankStatus").textContent = `保留 Top ${state.finalN}`;
  $("#recallList").innerHTML = state.recallResults.map((item, index) => renderResultCard(item, index, "recall")).join("");
  $("#rerankList").innerHTML = state.rerankResults.slice(0, state.finalN).map((item, index) => renderResultCard(item, index, "rerank")).join("");
  $$("[data-doc-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.dataset.docId;
      renderAll();
    });
  });
}

function renderDetail() {
  const item = state.rerankResults.find((entry) => entry.id === state.selectedId) || state.rerankResults[0];
  if (!item) {
    $("#detailPanel").innerHTML = `<div class="empty-card">还没有运行实验。</div>`;
    return;
  }
  const recallRank = state.recallResults.findIndex((entry) => entry.id === item.id) + 1;
  const rerankRank = state.rerankResults.findIndex((entry) => entry.id === item.id) + 1;
  $("#detailPanel").innerHTML = `
    <div class="plain-card">
      <strong>${item.title}</strong>
      <p>${item.text}</p>
      <div class="why-box">
        <span>向量初筛第 ${recallRank}</span>
        <span>Rerank 后第 ${rerankRank}</span>
        <span>${item.source}</span>
      </div>
    </div>
    <div class="vector-bars">
      ${barRow("向量相似", item.vectorScore, "#16707a")}
      ${barRow("词面匹配", item.exactScore, "#2f7d55")}
      ${barRow("可回答性", item.answerabilityScore, "#b35c2e")}
      ${barRow("来源质量", item.quality, "#6f5fb3")}
      ${barRow("最终重排", item.rerankScore, "#173539")}
    </div>
    <div class="plain-card">
      <strong>为什么这样排</strong>
      <p>${item.answerabilityReasons.length ? item.answerabilityReasons.join("；") : "它有一定语义相似，但没有明显回答问题的关键句，所以 rerank 不会给太高分。"}</p>
      <div class="tag-row">${item.exactHits.slice(0, 8).map((hit) => `<span>${hit}</span>`).join("")}</div>
    </div>
  `;
}

function barRow(label, value, color) {
  return `
    <div class="bar-row">
      <span>${label}</span>
      <div><i style="width:${Math.max(3, value * 100)}%;background:${color}"></i></div>
      <b>${value.toFixed(3)}</b>
    </div>
  `;
}

function renderGate() {
  const finalEvidence = state.rerankResults.slice(0, state.finalN);
  const best = finalEvidence[0]?.rerankScore || 0;
  const enough = best >= 0.22 && finalEvidence.some((item) => item.answerabilityScore >= 0.2);
  $("#gatePanel").innerHTML = `
    <div class="plain-card">
      <strong>${enough ? "证据可以进入 prompt" : "证据不足，建议拒答或继续检索"}</strong>
      <p>${enough ? "最高分证据能直接支撑回答，可以把 Top N 证据拼进 prompt。" : "当前候选相关性或可回答性偏低，强行生成容易幻觉。"}</p>
    </div>
    <div class="plain-card">
      <strong>最终证据包</strong>
      ${finalEvidence.map((item, index) => `<p>${index + 1}. ${item.title}：${item.rerankScore.toFixed(4)}</p>`).join("")}
    </div>
  `;
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap.map(([step, title, text]) => `
    <article class="doc-card">
      <span>${step}</span>
      <strong>${title}</strong>
      <p>${text}</p>
    </article>
  `).join("");
}

function renderInterview() {
  $("#interviewList").innerHTML = interviews.map(([question, answer]) => `
    <article class="doc-card">
      <strong>${question}</strong>
      <p>${answer}</p>
      <p><b>回答模板：</b>先说明 Rerank 位于召回之后，再讲它重新判断 query-chunk 相关性，最后补充成本和评估。</p>
    </article>
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

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function rankShift(item) {
  return state.recallResults.findIndex((entry) => entry.id === item.id) - state.rerankResults.findIndex((entry) => entry.id === item.id);
}

function projectRankPoint(point, width, height) {
  const depth = 1 / (1 + point.z / 760);
  return {
    x: width / 2 + point.x * depth,
    y: height * 0.58 + point.y * depth - point.z * 0.16,
    depth,
  };
}

function drawRankGrid(ctx, width, height) {
  ctx.fillStyle = "#f8fbfb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#173539";
  ctx.font = "900 14px sans-serif";
  ctx.fillText("3D Rerank 排序轨道：左后方是向量召回，右前方是重排结果", 24, 32);
  ctx.fillStyle = "#687573";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("绿线表示上升，红线表示下降，棕色表示当前选中证据", 24, 54);
  ctx.strokeStyle = "rgba(22,112,122,0.12)";
  for (let x = -380; x <= 380; x += 76) {
    const a = projectRankPoint({ x, y: 128, z: 60 }, width, height);
    const b = projectRankPoint({ x, y: 128, z: 540 }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let z = 60; z <= 540; z += 80) {
    const a = projectRankPoint({ x: -390, y: 128, z }, width, height);
    const b = projectRankPoint({ x: 390, y: 128, z }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function drawRankCanvas() {
  const canvas = $("#rankCanvas");
  if (!canvas) return;
  const { ctx, width, height } = canvasContext(canvas);
  const progress = easeInOut(state.animationProgress ?? 1);
  ctx.clearRect(0, 0, width, height);
  drawRankGrid(ctx, width, height);
  const gap = Math.min(54, Math.max(38, 300 / Math.max(1, state.recallResults.length)));
  const leftMap = new Map();
  const rightMap = new Map();
  state.canvasNodes = [];

  state.recallResults.forEach((item, index) => {
    leftMap.set(item.id, projectRankPoint({ x: -260, y: -112 + index * gap, z: 130 }, width, height));
  });
  state.rerankResults.forEach((item, index) => {
    rightMap.set(item.id, projectRankPoint({ x: 260, y: -112 + index * gap, z: 430 }, width, height));
  });

  state.recallResults.forEach((item) => {
    const from = leftMap.get(item.id);
    const to = rightMap.get(item.id);
    if (!from || !to) return;
    const selected = item.id === state.selectedId;
    const shift = rankShift(item);
    ctx.strokeStyle = selected ? "rgba(179,92,46,0.82)" : shift > 0 ? "rgba(34,118,80,0.32)" : shift < 0 ? "rgba(163,61,52,0.24)" : "rgba(22,112,122,0.18)";
    ctx.lineWidth = selected ? 4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(width * 0.42, from.y - 120, width * 0.58, to.y - 120, to.x, to.y);
    ctx.stroke();
  });

  function drawCard(item, point, index, mode) {
    const selected = item.id === state.selectedId;
    const cardW = 150 * point.depth;
    const cardH = 48 * point.depth;
    const x = point.x - cardW / 2;
    const y = point.y - cardH / 2;
    ctx.fillStyle = "rgba(23,53,57,0.14)";
    ctx.beginPath();
    ctx.ellipse(point.x, point.y + cardH * 0.7, cardW * 0.45, 9 * point.depth, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = selected ? "#fff1e8" : "#ffffff";
    ctx.strokeStyle = selected ? "#b35c2e" : "rgba(22,112,122,0.22)";
    ctx.lineWidth = selected ? 2 : 1;
    drawRoundRect(ctx, x, y, cardW, cardH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = selected ? "#b35c2e" : "#16707a";
    ctx.font = `900 ${Math.max(10, 12 * point.depth)}px sans-serif`;
    ctx.fillText(`${mode} ${index + 1}`, x + 10, y + 15 * point.depth);
    ctx.fillStyle = "#202827";
    ctx.font = `900 ${Math.max(10, 13 * point.depth)}px sans-serif`;
    ctx.fillText(item.title.slice(0, 12), x + 10, y + 34 * point.depth);
    state.canvasNodes.push({
      x,
      y,
      width: cardW,
      height: cardH,
      id: item.id,
      label: item.title,
      meta: `向量分 ${item.vectorScore.toFixed(4)}，Rerank 分 ${(item.rerankScore || 0).toFixed(4)}`,
    });
  }

  state.recallResults.forEach((item, index) => drawCard(item, leftMap.get(item.id), index, "召回"));
  state.rerankResults.forEach((item, index) => drawCard(item, rightMap.get(item.id), index, "重排"));

  state.recallResults.forEach((item) => {
    const from = leftMap.get(item.id);
    const to = rightMap.get(item.id);
    if (!from || !to) return;
    const selected = item.id === state.selectedId;
    const x = from.x + ((to.x - from.x) * progress);
    const y = from.y + ((to.y - from.y) * progress) - Math.sin(progress * Math.PI) * 64;
    const shift = rankShift(item);
    ctx.beginPath();
    ctx.fillStyle = selected ? "#b35c2e" : shift > 0 ? "#227650" : shift < 0 ? "#a33d34" : "#16707a";
    ctx.arc(x, y, selected ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.id.replace("c", ""), x, y + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  });

  ctx.fillStyle = "#687573";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("图形由当前 query、Top K、策略实时计算。Rerank 的重点是候选在 3D 排序轨道上的换位。", 24, height - 18);
}

function startRankAnimation() {
  cancelAnimationFrame(state.animationFrame);
  state.animationStart = performance.now();
  state.animationProgress = 0;
  const tick = (now) => {
    state.animationProgress = Math.min(1, (now - state.animationStart) / 900);
    drawRankCanvas();
    if (state.animationProgress < 1) {
      state.animationFrame = requestAnimationFrame(tick);
    }
  };
  state.animationFrame = requestAnimationFrame(tick);
}

function bindCanvasTooltip() {
  const canvas = $("#rankCanvas");
  const tip = $("#canvasTooltip");
  if (!canvas || !tip) return;
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.canvasNodes.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    if (!node) {
      tip.classList.remove("is-visible");
      return;
    }
    tip.innerHTML = `<strong>${node.label}</strong><span>${node.meta}</span><p>点击实验台中的卡片可以查看完整解释。</p>`;
    tip.style.left = `${Math.min(rect.width - 320, Math.max(10, x + 14))}px`;
    tip.style.top = `${Math.min(rect.height - 130, Math.max(10, y + 14))}px`;
    tip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
}

function renderAll() {
  renderLists();
  renderDetail();
  renderGate();
  drawRankCanvas();
}

function switchView(view) {
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active?.textContent || "Rerank 重排序实验室";
  if (view === "visual") startRankAnimation();
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
    if (button.dataset.project === "rerank") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) close();
  });
}

function init() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", runExperiment);
  ["queryInput", "recallKSelect", "finalNSelect", "strategySelect"].forEach((id) => {
    $(`#${id}`).addEventListener("change", runExperiment);
  });
  $("#queryInput").addEventListener("input", () => {
    clearTimeout(state.inputTimer);
    state.inputTimer = setTimeout(runExperiment, 260);
  });
  renderRoadmap();
  renderInterview();
  runExperiment();
  window.addEventListener("resize", drawRankCanvas);
}

init();
