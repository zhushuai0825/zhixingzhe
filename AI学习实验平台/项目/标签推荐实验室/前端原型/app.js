const {
  $, users, items, byId, likedItemIds, userProfile, tagRecommendations,
  bindProjectSwitcher, bindViews, renderUserSelect, cardList, tagList, setup3DCanvas,
  renderDataWorkbench,
} = RecoLabKit;

const state = {
  userId: "u1",
  space: { rotationX: -0.42, rotationY: 0.7, zoom: 145, dragging: false, lastX: 0, lastY: 0 },
};

let drawVisual = () => {};

function renderProfile() {
  const user = byId(users, state.userId);
  const liked = likedItemIds(state.userId).map((id) => byId(items, id));
  const profile = userProfile(state.userId);
  const tags = Object.entries(profile).sort((a, b) => b[1] - a[1]);
  $("#profilePanel").innerHTML = `
    <div class="plain-card">
      <strong>${user.name} · ${user.role}</strong>
      <p>第一步先看用户喜欢过什么内容，这些内容的标签会被累加成用户画像。</p>
      ${tagList(liked.map((item) => item.title))}
    </div>
    <div class="plain-card">
      <strong>画像标签权重</strong>
      ${tagList(tags.map(([tag, weight]) => `${tag} x${weight}`))}
      <p>权重越高，说明用户历史里这个标签出现越频繁。候选内容命中这些标签时就会加分。</p>
    </div>
  `;
}

function renderResults() {
  $("#resultPanel").innerHTML = cardList(tagRecommendations(state.userId), 6);
}

function renderTrace() {
  const liked = likedItemIds(state.userId).map((id) => byId(items, id));
  const profile = userProfile(state.userId);
  const entries = tagRecommendations(state.userId);
  const top = entries[0];
  $("#tracePanel").innerHTML = `
    <article class="lesson-card">
      <span>输入</span>
      <strong>用户历史行为</strong>
      <p>系统先读取当前用户喜欢过的物品：${liked.map((item) => item.title).join("、")}。</p>
    </article>
    <article class="lesson-card">
      <span>中间量</span>
      <strong>画像标签权重</strong>
      <p>${Object.entries(profile).map(([tag, weight]) => `${tag}=${weight}`).join("，")}。这一步把“喜欢过什么”变成“偏好什么标签”。</p>
    </article>
    <article class="lesson-card">
      <span>候选</span>
      <strong>过滤已喜欢物品</strong>
      <p>已经喜欢过的内容只用来建模，通常不会再次推荐。剩下的候选再参与打分。</p>
    </article>
    <article class="lesson-card">
      <span>Top 1</span>
      <strong>${top ? top.item.title : "暂无推荐"}</strong>
      <p>${top ? `它命中 ${top.matched.join("、")}，所以分数是 ${top.score.toFixed(4)}。` : "当前没有命中画像的候选物品。"}</p>
    </article>
    <article class="lesson-card">
      <span>为什么</span>
      <strong>为什么不是只数标签个数</strong>
      <p>因为画像里的标签有权重。用户历史里多次出现的标签更能代表兴趣，命中高权重标签更重要。</p>
    </article>
    <article class="lesson-card">
      <span>边界</span>
      <strong>它不是语义理解</strong>
      <p>标签推荐只认识标签。如果两个内容语义很像但标签不同，它可能匹配不到；这就是后面要学 Embedding 推荐的原因。</p>
    </article>
  `;
}

function buildScene() {
  const entries = tagRecommendations(state.userId).slice(0, 8);
  const profile = userProfile(state.userId);
  const nodes = [{
    id: "profile",
    label: "当前用户画像",
    short: "我",
    x: 0,
    y: 0,
    z: 0,
    size: 25,
    color: "#2f6f48",
    meta: `画像标签：${Object.entries(profile).map(([tag, weight]) => `${tag} x${weight}`).join("、")}`,
  }];
  const links = [];
  entries.forEach((entry, index) => {
    const angle = index / Math.max(1, entries.length) * Math.PI * 2;
    const distance = 1.7 - Math.min(1.1, entry.score / 2.4);
    const node = {
      id: entry.item.id,
      label: entry.item.title,
      short: String(index + 1),
      x: Math.cos(angle) * distance,
      y: ((index % 3) - 1) * 0.38,
      z: Math.sin(angle) * distance,
      size: index === 0 ? 23 : 18,
      color: index === 0 ? "#b45f2a" : "#1f6f84",
      meta: `${entry.reason}；候选标签：${entry.item.tags.join(" / ")}；推荐分 ${entry.score.toFixed(4)}`,
    };
    nodes.push(node);
    links.push({ from: "profile", to: node.id, width: Math.max(1.5, entry.score * 2.8), color: index === 0 ? "rgba(180,95,42,0.7)" : "rgba(31,111,132,0.28)" });
  });
  return { title: "标签推荐：候选内容离用户画像越近，说明命中的画像标签越强", nodes, links };
}

function renderRoadmap() {
  const cards = [
    ["标签推荐解决什么问题？", "它解决的是“没有足够协同行为时怎么推荐”的问题。只要内容有标签，系统就能把用户历史标签和候选标签做匹配。", "新上线一门“Graph RAG”课程，还没人点击过。ItemCF 暂时算不出共现，但标签推荐可以用 AI、RAG、图谱这些标签推荐给相关用户。"],
    ["标签从哪里来？", "标签可以人工录入，也可以从标题、正文、分类、Embedding 聚类、图片识别里自动抽取。标签质量越好，推荐越稳。", "一篇文章有“AI、RAG、检索”标签，用户历史里 AI 和 RAG 权重高，这篇文章就容易被推荐。"],
    ["用户画像是什么？", "用户画像不是一句话，而是一组带权重的标签。用户喜欢过的内容越多，画像越能表达他的兴趣方向。", "小周喜欢 RAG 入门、Embedding、向量库，那么他的画像会偏 AI、向量、检索、数据库。"],
    ["它有什么缺点？", "标签太粗会推荐不准，标签太细又容易召回不到；只按标签推荐还会让用户兴趣越来越窄。", "用户看过很多 RAG 内容，系统一直推 RAG，可能错过 Agent、测试智能体等相邻兴趣。"],
    ["面试怎么回答？", "先说输入是用户行为和物品标签，再说画像累计、候选打分、过滤已看、Top N 排序，最后补充冷启动和多路召回。", "回答时不要只说“按标签匹配”，要讲清楚标签权重、候选过滤、打分公式和缺点。"],
  ];
  $("#roadmapPanel").innerHTML = cards.map(([q, a, example]) => `
    <article class="question"><strong>${q}</strong><p>${a}</p><p><b>示例：</b>${example}</p></article>
  `).join("");
}

function renderAll() {
  if (!byId(users, state.userId)) state.userId = users[0]?.id || "";
  renderUserSelect("#userSelect", state.userId, (userId) => {
    state.userId = userId;
    renderAll();
  });
  renderDataWorkbench("#dataWorkbench", state.userId, (event) => {
    if (event.user) state.userId = event.user.id;
    renderAll();
  });
  renderProfile();
  renderResults();
  renderTrace();
  drawVisual();
}

function init() {
  bindProjectSwitcher("tagrec");
  bindViews((viewId) => {
    if (viewId === "visual") drawVisual();
  });
  renderRoadmap();
  drawVisual = setup3DCanvas("#tagCanvas", "#canvasTip", state.space, buildScene);
  renderAll();
}

init();
