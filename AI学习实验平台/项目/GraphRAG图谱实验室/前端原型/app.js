const storageKey = "graph-rag-lab-data-v1";

const defaultData = {
  entities: [
    { id: "e1", name: "Graph RAG", type: "RAG 架构", note: "把文档中的实体和关系组织成图，再结合检索生成回答。" },
    { id: "e2", name: "知识图谱", type: "数据结构", note: "用节点和边表示实体、概念、事件及它们之间的关系。" },
    { id: "e3", name: "实体抽取", type: "信息抽取", note: "从文本中识别人名、组织、技术、场景等重要对象。" },
    { id: "e4", name: "关系抽取", type: "信息抽取", note: "识别实体之间的关系，例如依赖、适合、属于、导致。" },
    { id: "e5", name: "多跳推理", type: "检索能力", note: "沿多个关系边寻找间接证据，适合复杂关联问题。" },
    { id: "e6", name: "金融风控", type: "业务场景", note: "需要把客户、交易、设备、账户、风险事件关联起来分析。" },
    { id: "e7", name: "法律条文", type: "业务场景", note: "经常需要把法条、案例、主体、行为和责任串起来。" },
    { id: "e8", name: "向量 RAG", type: "RAG 架构", note: "主要依赖 chunk embedding 的语义相似度召回证据。" },
    { id: "e9", name: "Neo4j", type: "图数据库", note: "常用图数据库，适合存节点、边和图查询。" },
  ],
  relations: [
    { from: "Graph RAG", label: "构建于", to: "知识图谱", weight: 0.95 },
    { from: "Graph RAG", label: "需要", to: "实体抽取", weight: 0.9 },
    { from: "Graph RAG", label: "需要", to: "关系抽取", weight: 0.88 },
    { from: "知识图谱", label: "支持", to: "多跳推理", weight: 0.86 },
    { from: "多跳推理", label: "适合", to: "金融风控", weight: 0.92 },
    { from: "多跳推理", label: "适合", to: "法律条文", weight: 0.82 },
    { from: "Graph RAG", label: "补充", to: "向量 RAG", weight: 0.74 },
    { from: "知识图谱", label: "可存入", to: "Neo4j", weight: 0.78 },
    { from: "关系抽取", label: "生成", to: "知识图谱", weight: 0.7 },
  ],
  chunks: [
    {
      id: "c1",
      title: "Graph RAG 基础",
      source: "graph_rag_intro.md",
      entities: ["Graph RAG", "知识图谱", "向量 RAG"],
      text: "Graph RAG 会把文档中的实体和关系构造成知识图谱，再结合文本证据生成回答。它不是替代向量 RAG，而是补充向量检索对关系推理不敏感的问题。",
    },
    {
      id: "c2",
      title: "金融风控场景",
      source: "risk_control.md",
      entities: ["多跳推理", "金融风控", "知识图谱"],
      text: "金融风控常常需要把客户、设备、交易、账户和风险事件串起来分析，单个文档片段不一定包含完整证据，因此适合使用图谱和多跳推理。",
    },
    {
      id: "c3",
      title: "法律知识关联",
      source: "legal_graph.md",
      entities: ["法律条文", "多跳推理", "Graph RAG"],
      text: "法律问答经常要连接法条、案例、主体、行为、责任等多个实体。Graph RAG 可以沿关系路径找到多个证据点，再让模型基于证据回答。",
    },
    {
      id: "c4",
      title: "图数据库落地",
      source: "neo4j.md",
      entities: ["Neo4j", "知识图谱", "关系抽取"],
      text: "生产系统中可以把实体存成节点，把关系存成边，并在 Neo4j 等图数据库里查询路径。图谱查询结果仍然需要回到原文片段做引用。",
    },
  ],
};

const roadmap = [
  ["01", "先理解普通 RAG 的边界", "普通向量 RAG 找的是相似 chunk。它适合 FAQ、产品手册、制度问答，但遇到跨文档、多实体、多跳关系时容易漏证据。"],
  ["02", "学习实体和关系", "实体是点，关系是边。Graph RAG 的第一步通常是从文档里抽出关键实体，再抽出实体之间的关系。"],
  ["03", "学习图谱存储", "图谱可以存在 Neo4j、NebulaGraph、TuGraph，也可以先用 PostgreSQL 表模拟。核心是节点表、关系表、证据表。"],
  ["04", "学习图检索", "问题先命中实体，然后沿关系做 1 到 3 跳扩散，得到候选路径。路径越长，噪声越多，所以需要限制跳数和关系类型。"],
  ["05", "学习证据回填", "图谱边本身通常不够回答问题。最终还要找回原文 chunk，给大模型提供可引用证据。"],
  ["06", "学习评测", "Graph RAG 要评测路径是否正确、证据是否支撑答案、是否引入无关实体，以及复杂问题是否比普通 RAG 更好。"],
];

const interviews = [
  ["Graph RAG 和普通 RAG 最大区别是什么？", "普通 RAG 主要靠向量相似度找 chunk，Graph RAG 会把知识组织成实体和关系，再沿关系路径找证据。举例：问“某客户为什么被判高风险”，单个 chunk 可能只写交易异常，另一个 chunk 写设备异常，图谱可以把客户、设备、交易、风险事件串起来。"],
  ["Graph RAG 适合什么场景？", "适合实体关系密集、需要多跳推理的场景，例如金融风控、法律、医疗知识关联、企业组织关系、代码依赖分析。不适合简单 FAQ，因为构图成本可能大于收益。"],
  ["Graph RAG 的基本流程是什么？", "文档解析后先抽取实体，再抽取关系，把实体存为节点、关系存为边，同时保留原文 chunk。提问时先识别 query 里的实体，再做图遍历，最后把路径关联的原文证据交给模型回答。"],
  ["为什么图谱边不能直接当最终答案？", "因为图谱边通常是抽取得到的结构化摘要，可能丢上下文，也可能抽错。工程上最好用图谱路径定位证据，再回到原文 chunk 做引用，这样答案更可信。"],
  ["Graph RAG 有哪些风险？", "第一是实体抽取错误，第二是关系抽取错误，第三是多跳扩散带来噪声，第四是图谱更新成本高，第五是评测更复杂。面试回答时要讲收益，也要讲成本。"],
  ["Graph RAG 和 Hybrid RAG 可以一起用吗？", "可以。常见做法是向量检索找语义相关 chunk，BM25 找关键词强匹配 chunk，图谱检索找实体关系路径，然后把多路召回结果融合，再用 Rerank 提准。"],
  ["图数据库一定要用 Neo4j 吗？", "不一定。学习阶段可以用内存对象或 PostgreSQL 表模拟节点和边。生产阶段根据规模和查询复杂度选择 Neo4j、NebulaGraph、TuGraph，或者 PostgreSQL + recursive CTE。"],
  ["Graph RAG 怎么评测？", "除了普通 RAG 的 Recall、MRR、忠实度，还要看实体识别准确率、关系准确率、路径命中率、路径噪声率、多跳问题回答正确率。核心是证明图谱真的提高了复杂问题质量。"],
];

const state = {
  data: loadData(),
  selectedNodeId: null,
  result: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (parsed?.entities && parsed?.relations && parsed?.chunks) return parsed;
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
  state.selectedNodeId = null;
  saveData();
  runGraphRag();
}

function tokenize(text) {
  return (text.match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]+/g) || []).map((item) => item.toLowerCase());
}

function textScore(query, text) {
  const queryTokens = new Set(tokenize(query));
  const textTokens = new Set(tokenize(text));
  const hits = [...queryTokens].filter((token) => [...textTokens].some((word) => word.includes(token) || token.includes(word)));
  return hits.length / Math.sqrt(Math.max(1, queryTokens.size) * Math.max(1, textTokens.size));
}

function entityByName(name) {
  return state.data.entities.find((entity) => entity.name === name);
}

function entityById(id) {
  return state.data.entities.find((entity) => entity.id === id);
}

function nextId(prefix, list) {
  const max = list.reduce((value, item) => {
    const number = Number(String(item.id).replace(prefix, ""));
    return Number.isFinite(number) ? Math.max(value, number) : value;
  }, 0);
  return `${prefix}${max + 1}`;
}

function findSeeds(query, mode) {
  const rows = state.data.entities.map((entity) => {
    const direct = query.toLowerCase().includes(entity.name.toLowerCase()) ? 1 : 0;
    const score = mode === "entity"
      ? Math.max(direct, textScore(query, `${entity.name} ${entity.type} ${entity.note}`))
      : textScore(query, `${entity.name} ${entity.type} ${entity.note}`);
    return { ...entity, score };
  }).filter((entity) => entity.score > 0).sort((a, b) => b.score - a.score);
  return rows.slice(0, 3);
}

function neighbors(name) {
  return state.data.relations.filter((relation) => relation.from === name || relation.to === name).map((relation) => ({
    relation,
    next: relation.from === name ? relation.to : relation.from,
  }));
}

function pathKey(path) {
  return path.map((step) => `${step.from}-${step.label}-${step.to}`).join("|");
}

function traverse(seeds, maxHop) {
  const paths = [];
  const seen = new Set();
  const queue = seeds.map((seed) => ({ current: seed.name, path: [], visited: new Set([seed.name]), seed }));
  while (queue.length) {
    const item = queue.shift();
    if (item.path.length >= maxHop) continue;
    neighbors(item.current).forEach(({ relation, next }) => {
      if (item.visited.has(next)) return;
      const path = [...item.path, relation];
      const key = pathKey(path);
      if (!seen.has(key)) {
        seen.add(key);
        paths.push({ seed: item.seed, end: next, path, score: scorePath(item.seed, path) });
      }
      queue.push({
        current: next,
        seed: item.seed,
        path,
        visited: new Set([...item.visited, next]),
      });
    });
  }
  return paths.sort((a, b) => b.score - a.score).slice(0, 8);
}

function scorePath(seed, path) {
  const relationScore = path.reduce((sum, relation) => sum + relation.weight, 0) / Math.max(1, path.length);
  const hopPenalty = 1 / path.length;
  return seed.score * 0.45 + relationScore * 0.4 + hopPenalty * 0.15;
}

function entitiesInPath(path) {
  return [...new Set(path.flatMap((relation) => [relation.from, relation.to]))];
}

function evidenceFor(paths) {
  const names = new Set(paths.flatMap((item) => entitiesInPath(item.path)));
  return state.data.chunks.map((chunk) => {
    const matched = chunk.entities.filter((name) => names.has(name));
    return { ...chunk, matched, score: matched.length / Math.sqrt(Math.max(1, chunk.entities.length)) };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}

function runGraphRag() {
  const query = $("#queryInput").value.trim();
  const maxHop = Number($("#hopSelect").value);
  const seedMode = $("#seedSelect").value;
  const seeds = findSeeds(query, seedMode);
  const paths = traverse(seeds, maxHop);
  const evidence = evidenceFor(paths);
  state.result = { query, maxHop, seedMode, seeds, paths, evidence };
  if (!state.selectedNodeId && seeds[0]) state.selectedNodeId = seeds[0].id;
  renderAll();
  window.dispatchEvent(new CustomEvent("graph-rag:update", { detail: buildGraphPayload() }));
}

function buildGraphPayload() {
  const result = state.result || { seeds: [], paths: [], evidence: [] };
  const seedNames = new Set(result.seeds.map((seed) => seed.name));
  const pathNames = new Set(result.paths.flatMap((item) => entitiesInPath(item.path)));
  const pathRelations = new Set(result.paths.flatMap((item) => item.path.map((relation) => `${relation.from}|${relation.label}|${relation.to}`)));
  return {
    entities: state.data.entities.map((entity, index) => ({
      ...entity,
      index,
      isSeed: seedNames.has(entity.name),
      isHit: pathNames.has(entity.name),
      isSelected: entity.id === state.selectedNodeId,
    })),
    relations: state.data.relations.map((relation) => ({
      ...relation,
      isHit: pathRelations.has(`${relation.from}|${relation.label}|${relation.to}`),
    })),
  };
}

function renderPaths() {
  const { paths } = state.result;
  $("#pathStatus").textContent = `${paths.length} 条路径`;
  $("#pathList").innerHTML = paths.length ? paths.map((item, index) => `
    <article class="result-card ${index === 0 ? "is-selected" : ""}" data-path-index="${index}">
      <div class="result-top">
        <strong>${index + 1}. ${item.seed.name} -> ${item.end}</strong>
        <b>${item.score.toFixed(3)}</b>
      </div>
      <p>${item.path.map((relation) => `${relation.from} --${relation.label}--> ${relation.to}`).join(" / ")}</p>
      <div class="tag-row">
        <span>${item.path.length} 跳</span>
        <span>起点分 ${item.seed.score.toFixed(2)}</span>
        <span>关系强度 ${item.path.map((relation) => relation.weight.toFixed(2)).join(", ")}</span>
      </div>
    </article>
  `).join("") : `<div class="plain-card"><strong>没有路径</strong><p>问题没有命中实体，或者当前图谱关系太少。你可以新增实体和关系再试。</p></div>`;
}

function renderAnswer() {
  const { evidence, paths, seeds } = state.result;
  const enough = evidence.length > 0 && paths.length > 0;
  $("#answerStatus").textContent = enough ? "可生成回答" : "证据不足";
  const answer = enough
    ? `问题先命中 ${seeds.map((seed) => seed.name).join("、")}，再沿关系找到 ${paths.slice(0, 2).map((item) => item.end).join("、")}。结合证据片段，可以说明：${evidence[0].text}`
    : "当前图谱没有足够路径和原文证据，正确行为是提示依据不足，而不是编造。";
  $("#answerPanel").innerHTML = `
    <div class="plain-card">
      <strong>回答草稿</strong>
      <p>${answer}</p>
    </div>
    <div class="result-list">
      ${evidence.map((chunk) => `
        <article class="result-card">
          <div class="result-top"><strong>${chunk.title}</strong><b>${chunk.score.toFixed(3)}</b></div>
          <p>${chunk.text}</p>
          <div class="tag-row">
            <span>${chunk.source}</span>
            <span>关联实体：${chunk.matched.join("、")}</span>
          </div>
        </article>
      `).join("") || `<div class="plain-card"><strong>没有原文证据</strong><p>图谱路径必须回到 chunk。只有关系边，没有原文引用，不能放心生成最终答案。</p></div>`}
    </div>
  `;
}

function renderGraphData() {
  $("#graphDataPanel").innerHTML = `
    <div class="stat-grid">
      <div><strong>${state.data.entities.length}</strong><span>实体节点</span></div>
      <div><strong>${state.data.relations.length}</strong><span>关系边</span></div>
      <div><strong>${state.data.chunks.length}</strong><span>证据片段</span></div>
    </div>
    <div class="result-list compact-list">
      ${state.data.entities.map((entity) => `
        <article class="result-card" data-entity-id="${entity.id}">
          <div class="result-top"><strong>${entity.name}</strong><b>${entity.type}</b></div>
          <p>${entity.note}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDetail() {
  const entity = entityById(state.selectedNodeId) || state.data.entities[0];
  if (!entity) return;
  const connected = state.data.relations.filter((relation) => relation.from === entity.name || relation.to === entity.name);
  const chunks = state.data.chunks.filter((chunk) => chunk.entities.includes(entity.name));
  $("#detailPanel").innerHTML = `
    <div class="plain-card">
      <strong>${entity.name}</strong>
      <p>${entity.note}</p>
      <div class="tag-row"><span>${entity.type}</span><span>${connected.length} 条关系</span><span>${chunks.length} 个证据片段</span></div>
    </div>
    <div class="plain-card">
      <strong>相邻关系</strong>
      <p>${connected.map((relation) => `${relation.from} --${relation.label}--> ${relation.to}`).join("；") || "暂无关系"}</p>
    </div>
    <div class="plain-card">
      <strong>关联证据</strong>
      <p>${chunks.map((chunk) => chunk.title).join("、") || "暂无证据"}</p>
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

function renderAll() {
  renderPaths();
  renderAnswer();
  renderGraphData();
  renderDetail();
}

function switchView(view) {
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active?.textContent || "Graph RAG 图谱实验室";
  if (view === "visual") {
    window.dispatchEvent(new CustomEvent("graph-rag:update", { detail: buildGraphPayload() }));
  }
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
    if (button.dataset.project === "graphrag") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) close();
  });
}

function addEntity() {
  const name = $("#entityName").value.trim();
  if (!name || entityByName(name)) return;
  state.data.entities.push({
    id: nextId("e", state.data.entities),
    name,
    type: $("#entityType").value.trim() || "自定义实体",
    note: "你手动添加的实体，可以继续给它添加关系和证据。",
  });
  $("#entityName").value = "";
  $("#entityType").value = "";
  saveData();
  runGraphRag();
}

function addRelation() {
  const from = $("#relationFrom").value.trim();
  const label = $("#relationLabel").value.trim();
  const to = $("#relationTo").value.trim();
  if (!from || !label || !to) return;
  [from, to].forEach((name) => {
    if (!entityByName(name)) {
      state.data.entities.push({ id: nextId("e", state.data.entities), name, type: "自定义实体", note: "由关系自动补充的实体。" });
    }
  });
  state.data.relations.push({ from, label, to, weight: 0.72 });
  $("#relationFrom").value = "";
  $("#relationLabel").value = "";
  $("#relationTo").value = "";
  saveData();
  runGraphRag();
}

function addChunk() {
  const title = $("#chunkTitle").value.trim();
  const text = $("#chunkText").value.trim();
  const entities = $("#chunkEntities").value.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
  if (!title || !text) return;
  entities.forEach((name) => {
    if (!entityByName(name)) {
      state.data.entities.push({ id: nextId("e", state.data.entities), name, type: "自定义实体", note: "由证据片段自动补充的实体。" });
    }
  });
  state.data.chunks.push({
    id: nextId("c", state.data.chunks),
    title,
    source: "custom_note.md",
    entities,
    text,
  });
  $("#chunkTitle").value = "";
  $("#chunkText").value = "";
  $("#chunkEntities").value = "";
  saveData();
  runGraphRag();
}

function init() {
  bindProjectSwitcher();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", runGraphRag);
  $("#resetBtn").addEventListener("click", resetData);
  $("#hopSelect").addEventListener("change", runGraphRag);
  $("#seedSelect").addEventListener("change", runGraphRag);
  $("#addEntityBtn").addEventListener("click", addEntity);
  $("#addRelationBtn").addEventListener("click", addRelation);
  $("#addChunkBtn").addEventListener("click", addChunk);
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-entity-id]");
    const pathCard = event.target.closest("[data-path-index]");
    if (!card && !pathCard) return;
    if (card) {
      state.selectedNodeId = card.dataset.entityId;
    } else {
      const pathItem = state.result.paths[Number(pathCard.dataset.pathIndex)];
      state.selectedNodeId = entityByName(pathItem?.end)?.id || state.selectedNodeId;
    }
    renderDetail();
    window.dispatchEvent(new CustomEvent("graph-rag:update", { detail: buildGraphPayload() }));
  });
  window.addEventListener("graph-rag:select-node", (event) => {
    state.selectedNodeId = event.detail.id;
    renderDetail();
    window.dispatchEvent(new CustomEvent("graph-rag:update", { detail: buildGraphPayload() }));
  });
  renderRoadmap();
  renderInterview();
  runGraphRag();
}

init();
