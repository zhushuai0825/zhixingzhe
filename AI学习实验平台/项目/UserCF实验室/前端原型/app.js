const {
  $, users, byId, likedItemIds, similarUsers, usercfRecommendations,
  bindProjectSwitcher, bindViews, renderUserSelect, cardList, tagList, setup3DCanvas,
  renderDataWorkbench,
} = RecoLabKit;

const state = {
  userId: "u1",
  space: { rotationX: -0.46, rotationY: 0.72, zoom: 145, dragging: false, lastX: 0, lastY: 0 },
};

let drawVisual = () => {};

function itemTitles(ids) {
  return ids.map((id) => RecoLabKit.byId(RecoLabKit.items, id).title);
}

function renderSimilarUsers() {
  const current = byId(users, state.userId);
  const rows = similarUsers(state.userId);
  $("#similarUsers").innerHTML = `
    <div class="plain-card">
      <strong>${current.name} 已喜欢</strong>
      ${tagList(itemTitles(likedItemIds(state.userId)))}
      <p>UserCF 先把每个用户表示成“喜欢物品集合”，再比较集合重合程度。</p>
    </div>
    <div class="result-list">
      ${rows.map((entry, index) => `
        <article class="result-card">
          <strong>${index + 1}. ${entry.user.name} · 相似度 ${entry.score.toFixed(4)}</strong>
          ${tagList(itemTitles(likedItemIds(entry.user.id)))}
          <p>共同喜欢越多，相似度越高；相似用户喜欢而当前用户没喜欢的内容会成为候选。</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderResults() {
  $("#resultPanel").innerHTML = cardList(usercfRecommendations(state.userId), 6);
}

function renderTrace() {
  const current = byId(users, state.userId);
  const currentItems = itemTitles(likedItemIds(state.userId));
  const sims = similarUsers(state.userId);
  const positive = sims.filter((entry) => entry.score > 0);
  const entries = usercfRecommendations(state.userId);
  const top = entries[0];
  $("#tracePanel").innerHTML = `
    <article class="lesson-card">
      <span>输入</span>
      <strong>${current.name} 的喜欢集合</strong>
      <p>{${currentItems.join("，")}}。UserCF 的用户不是一句简介，而是一组行为。</p>
    </article>
    <article class="lesson-card">
      <span>相似度</span>
      <strong>找相似用户</strong>
      <p>${positive.length ? positive.map((entry) => `${entry.user.name}=${entry.score.toFixed(4)}`).join("，") : "当前没有正相似用户"}。</p>
    </article>
    <article class="lesson-card">
      <span>候选</span>
      <strong>从相似用户拿物品</strong>
      <p>候选必须满足两个条件：相似用户喜欢过，并且当前用户还没喜欢过。</p>
    </article>
    <article class="lesson-card">
      <span>Top 1</span>
      <strong>${top ? top.item.title : "暂无推荐"}</strong>
      <p>${top ? `${top.reason}，分数 ${top.score.toFixed(4)}。如果多个相似用户都喜欢它，贡献会累加。` : "没有相似用户贡献出可推荐候选。"}</p>
    </article>
    <article class="lesson-card">
      <span>为什么</span>
      <strong>它不看标题语义</strong>
      <p>UserCF 不知道“RAG”和“向量库”语义相关，它只看用户行为集合是否重合。</p>
    </article>
    <article class="lesson-card">
      <span>边界</span>
      <strong>新用户很难推荐</strong>
      <p>如果一个新用户没有任何行为，系统无法计算他和谁相似，需要热门、标签或人工引导兜底。</p>
    </article>
  `;
}

function buildScene() {
  const sims = similarUsers(state.userId);
  const recs = usercfRecommendations(state.userId).slice(0, 5);
  const nodes = [{
    id: state.userId,
    label: `当前用户：${byId(users, state.userId).name}`,
    short: "我",
    x: -0.72,
    y: 0,
    z: 0,
    size: 25,
    color: "#2f6f48",
    meta: `已喜欢：${itemTitles(likedItemIds(state.userId)).join("、")}`,
  }];
  const links = [];
  sims.forEach((entry, index) => {
    const distance = 1.7 - entry.score;
    const angle = index / Math.max(1, sims.length) * Math.PI * 2;
    nodes.push({
      id: entry.user.id,
      label: `相似用户：${entry.user.name}`,
      short: entry.user.name.slice(1, 2),
      x: -0.72 + Math.cos(angle) * distance,
      y: ((index % 3) - 1) * 0.35,
      z: Math.sin(angle) * distance,
      size: 18,
      color: entry.score > 0 ? "#1f6f84" : "#8a938b",
      meta: `相似度 ${entry.score.toFixed(4)}；喜欢：${itemTitles(likedItemIds(entry.user.id)).join("、")}`,
    });
    if (entry.score > 0) links.push({ from: state.userId, to: entry.user.id, width: Math.max(1.2, entry.score * 8), color: "rgba(31,111,132,0.34)" });
  });
  recs.forEach((entry, index) => {
    const y = -0.8 + index * 0.4;
    nodes.push({
      id: entry.item.id,
      label: `推荐候选：${entry.item.title}`,
      short: String(index + 1),
      x: 1.25,
      y,
      z: 0.55 - index * 0.22,
      size: index === 0 ? 23 : 18,
      color: index === 0 ? "#b45f2a" : "#2f6f48",
      meta: `${entry.reason}；推荐分 ${entry.score.toFixed(4)}；标签：${entry.item.tags.join(" / ")}`,
    });
    entry.contributors.forEach((contributor) => {
      links.push({ from: contributor.user.id, to: entry.item.id, width: Math.max(1.2, contributor.score * 8), color: index === 0 ? "rgba(180,95,42,0.68)" : "rgba(47,111,72,0.24)" });
    });
  });
  return { title: "UserCF：先靠近相似用户，再由相似用户把候选物品推过来", nodes, links };
}

function renderRoadmap() {
  const cards = [
    ["UserCF 一句话怎么讲？", "找到和当前用户行为相似的人，把这些相似用户喜欢但当前用户没接触过的物品推荐出来。", "你和小林都喜欢 RAG、Embedding、向量库，小林还喜欢 Rerank，那么 Rerank 就可能推荐给你。"],
    ["用户相似度怎么计算？", "这里用集合余弦：共同喜欢数量 / sqrt(用户A喜欢数 * 用户B喜欢数)。它看的是行为重合，不看标题语义。", "A 喜欢 4 个，B 喜欢 5 个，共同喜欢 3 个，相似度约等于 3 / sqrt(20)。"],
    ["候选物品怎么产生？", "候选来自相似用户的历史行为，但要过滤掉当前用户已经喜欢过的内容。", "当前用户已喜欢 RAG，推荐结果里一般不再出现 RAG，而会出现相似用户额外喜欢的内容。"],
    ["UserCF 和 ItemCF 区别？", "UserCF 问“谁和我像”；ItemCF 问“我喜欢的东西和什么东西像”。工业里 ItemCF 更常见，因为物品相对稳定。", "新闻、课程、商品推荐里，物品相似关系比用户相似关系更容易缓存。"],
    ["面试常追问什么？", "数据量大时怎么优化、冷启动怎么办、相似度如何离线计算、怎么过滤已看、如何做 Top N 和评估。", "可以回答：离线预计算相似用户或相似物品，线上只做召回、合并、过滤、排序。"],
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
  renderSimilarUsers();
  renderResults();
  renderTrace();
  drawVisual();
}

function init() {
  bindProjectSwitcher("usercf");
  bindViews((viewId) => {
    if (viewId === "visual") drawVisual();
  });
  renderRoadmap();
  drawVisual = setup3DCanvas("#userCanvas", "#canvasTip", state.space, buildScene);
  renderAll();
}

init();
