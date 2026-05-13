const RecoLabKit = (() => {
  const storageKey = "ai-learning-reco-lab-data-v1";

  const defaultUsers = [
    { id: "u1", name: "小周", role: "测试工程师" },
    { id: "u2", name: "小林", role: "后端工程师" },
    { id: "u3", name: "小许", role: "产品经理" },
    { id: "u4", name: "小陈", role: "算法学习者" },
    { id: "u5", name: "小何", role: "AI 应用开发" },
  ];

  const defaultItems = [
    { id: "i1", title: "RAG 入门", tags: ["AI", "RAG", "检索"] },
    { id: "i2", title: "Embedding 与相似度", tags: ["AI", "向量", "相似度"] },
    { id: "i3", title: "向量数据库实战", tags: ["AI", "向量", "数据库"] },
    { id: "i4", title: "Rerank 精排", tags: ["AI", "排序", "RAG"] },
    { id: "i5", title: "ItemCF 推荐算法", tags: ["推荐", "协同过滤", "相似度"] },
    { id: "i6", title: "UserCF 用户协同过滤", tags: ["推荐", "协同过滤", "用户"] },
    { id: "i7", title: "SVD 矩阵分解", tags: ["推荐", "矩阵分解", "算法"] },
    { id: "i8", title: "推荐系统评估指标", tags: ["推荐", "评估", "指标"] },
    { id: "i9", title: "Agent 工具调用", tags: ["AI", "Agent", "工具"] },
    { id: "i10", title: "A/B 测试入门", tags: ["测试", "评估", "实验"] },
    { id: "i11", title: "标签画像建模", tags: ["推荐", "画像", "标签"] },
    { id: "i12", title: "Graph RAG", tags: ["AI", "RAG", "图谱"] },
  ];

  const defaultInteractions = [
    ["u1", "i1"], ["u1", "i2"], ["u1", "i3"], ["u1", "i10"],
    ["u2", "i1"], ["u2", "i2"], ["u2", "i3"], ["u2", "i4"], ["u2", "i9"],
    ["u3", "i1"], ["u3", "i8"], ["u3", "i10"], ["u3", "i11"],
    ["u4", "i5"], ["u4", "i6"], ["u4", "i7"], ["u4", "i8"],
    ["u5", "i2"], ["u5", "i3"], ["u5", "i4"], ["u5", "i9"], ["u5", "i12"],
  ];

  const defaultItemFactors = {
    i1: [0.82, 0.18], i2: [0.9, 0.25], i3: [0.86, 0.31], i4: [0.74, 0.46],
    i5: [0.22, 0.84], i6: [0.28, 0.78], i7: [0.18, 0.95], i8: [0.4, 0.72],
    i9: [0.78, 0.38], i10: [0.34, 0.52], i11: [0.35, 0.83], i12: [0.88, 0.42],
  };

  const users = JSON.parse(JSON.stringify(defaultUsers));
  const items = JSON.parse(JSON.stringify(defaultItems));
  const interactions = JSON.parse(JSON.stringify(defaultInteractions));
  const itemFactors = JSON.parse(JSON.stringify(defaultItemFactors));

  const projectEntries = [
    ["chunking", "01 文本切分实验室", "把长文档拆成 chunk"],
    ["embedding", "02 Embedding 与相似度", "文本如何变成向量"],
    ["vectordb", "03 向量库实验室", "保存向量并查询 Top K"],
    ["rerank", "04 Rerank 重排序实验室", "把初筛证据重新排序"],
    ["rageval", "05 RAG 评测实验室", "评估检索、引用和回答质量"],
    ["graphrag", "06 Graph RAG 图谱实验室", "实体关系和多跳推理"],
    ["agent", "07 Agent 工程实验室", "目标如何变成工具调用"],
    ["modelprompt", "08 模型调用与 Prompt 工程", "真实模型接入前必学"],
    ["zhixingzhe", "09 知行者 AI 实验室", "完整 RAG 与 Agent 系统"],
    ["itemcf", "10 ItemCF 实验室", "物品共现如何推荐"],
    ["tagrec", "11 标签推荐实验室", "标签画像如何推荐"],
    ["usercf", "12 UserCF 实验室", "相似用户如何贡献推荐"],
    ["svd", "13 SVD 矩阵分解实验室", "隐向量如何预测喜欢"],
    ["recsys", "14 推荐系统总览", "四类推荐算法对比"],
  ];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const byId = (list, id) => list.find((entry) => entry.id === id);
  const likedItemIds = (userId) => interactions.filter(([u]) => u === userId).map(([, itemId]) => itemId);
  const itemSetForUser = (userId) => new Set(likedItemIds(userId));
  const candidatesFor = (userId) => items.filter((item) => !itemSetForUser(userId).has(item.id));
  const usersForItem = (itemId) => interactions.filter(([, i]) => i === itemId).map(([userId]) => userId);

  function cosineFromSets(a, b) {
    const left = new Set(a);
    const right = new Set(b);
    const intersection = [...left].filter((value) => right.has(value)).length;
    return intersection / Math.sqrt(Math.max(1, left.size) * Math.max(1, right.size));
  }

  function userProfile(userId) {
    const profile = {};
    likedItemIds(userId).map((id) => byId(items, id)).forEach((item) => {
      item.tags.forEach((tag) => {
        profile[tag] = (profile[tag] || 0) + 1;
      });
    });
    return profile;
  }

  function tagRecommendations(userId) {
    const profile = userProfile(userId);
    return candidatesFor(userId).map((item) => {
      const matched = item.tags.filter((tag) => profile[tag]);
      const score = matched.reduce((sum, tag) => sum + profile[tag], 0) / Math.sqrt(item.tags.length || 1);
      return { item, score, matched, reason: matched.length ? `命中标签：${matched.join("、")}` : "没有命中用户画像标签" };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  }

  function itemSimilarity(leftId, rightId) {
    return cosineFromSets(usersForItem(leftId), usersForItem(rightId));
  }

  function userSimilarity(leftId, rightId) {
    return cosineFromSets(likedItemIds(leftId), likedItemIds(rightId));
  }

  function similarUsers(userId) {
    return users.filter((user) => user.id !== userId).map((user) => ({
      user,
      score: userSimilarity(userId, user.id),
    })).sort((a, b) => b.score - a.score);
  }

  function usercfRecommendations(userId) {
    const sims = similarUsers(userId).filter((entry) => entry.score > 0);
    return candidatesFor(userId).map((item) => {
      const contributors = sims.filter((entry) => itemSetForUser(entry.user.id).has(item.id));
      const score = contributors.reduce((sum, entry) => sum + entry.score, 0);
      return {
        item,
        score,
        contributors,
        reason: contributors.length ? `相似用户 ${contributors.map((entry) => entry.user.name).join("、")} 喜欢过` : "相似用户没有贡献",
      };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  }

  function dot(a, b) {
    return a.reduce((sum, value, index) => sum + value * b[index], 0);
  }

  function userFactor(userId) {
    const liked = likedItemIds(userId);
    if (!liked.length) return [0, 0];
    const factors = liked.map((itemId) => itemFactors[itemId]).filter(Boolean);
    if (!factors.length) return [0, 0];
    const sum = factors.reduce((acc, factor) => {
      acc[0] += factor[0];
      acc[1] += factor[1];
      return acc;
    }, [0, 0]);
    return [sum[0] / factors.length, sum[1] / factors.length];
  }

  function svdRecommendations(userId) {
    const vector = userFactor(userId);
    return candidatesFor(userId).map((item) => {
      const factor = itemFactors[item.id] || factorFromTags(item.tags);
      const score = dot(vector, factor);
      return {
        item,
        score,
        factor,
        reason: `用户向量 [${vector.map((n) => n.toFixed(2)).join(", ")}] · 物品向量 [${factor.map((n) => n.toFixed(2)).join(", ")}]`,
      };
    }).sort((a, b) => b.score - a.score);
  }

  function replaceArray(target, values) {
    target.splice(0, target.length, ...values);
  }

  function replaceFactors(values) {
    Object.keys(itemFactors).forEach((key) => delete itemFactors[key]);
    Object.assign(itemFactors, values);
  }

  function factorFromTags(tags) {
    const joined = tags.join(" ");
    const ai = ["AI", "RAG", "向量", "数据库", "Agent", "检索", "Embedding"].some((tag) => joined.includes(tag)) ? 0.78 : 0.34;
    const rec = ["推荐", "协同过滤", "矩阵", "算法", "评估", "标签"].some((tag) => joined.includes(tag)) ? 0.82 : 0.28;
    return [Number(ai.toFixed(2)), Number(rec.toFixed(2))];
  }

  function saveData() {
    localStorage.setItem(storageKey, JSON.stringify({ users, items, interactions, itemFactors }));
  }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!parsed?.users || !parsed?.items || !parsed?.interactions || !parsed?.itemFactors) return;
      replaceArray(users, parsed.users);
      replaceArray(items, parsed.items);
      replaceArray(interactions, parsed.interactions);
      replaceFactors(parsed.itemFactors);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  function resetData() {
    replaceArray(users, JSON.parse(JSON.stringify(defaultUsers)));
    replaceArray(items, JSON.parse(JSON.stringify(defaultItems)));
    replaceArray(interactions, JSON.parse(JSON.stringify(defaultInteractions)));
    replaceFactors(JSON.parse(JSON.stringify(defaultItemFactors)));
    saveData();
  }

  function nextId(prefix, list) {
    const max = list.reduce((value, entry) => {
      const number = Number(String(entry.id).replace(prefix, ""));
      return Number.isFinite(number) ? Math.max(value, number) : value;
    }, 0);
    return `${prefix}${max + 1}`;
  }

  function addUser(name, role) {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const user = { id: nextId("u", users), name: trimmedName, role: role.trim() || "自定义用户" };
    users.push(user);
    saveData();
    return user;
  }

  function addItem(title, tagsText) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;
    const tags = tagsText.split(/[,，、\\s]+/).map((tag) => tag.trim()).filter(Boolean);
    const item = { id: nextId("i", items), title: trimmedTitle, tags: tags.length ? tags : ["自定义"] };
    items.push(item);
    itemFactors[item.id] = factorFromTags(item.tags);
    saveData();
    return item;
  }

  function addLike(userId, itemId) {
    if (!userId || !itemId || interactions.some(([u, i]) => u === userId && i === itemId)) return false;
    interactions.push([userId, itemId]);
    saveData();
    return true;
  }

  function removeLike(userId, itemId) {
    const index = interactions.findIndex(([u, i]) => u === userId && i === itemId);
    if (index < 0) return false;
    interactions.splice(index, 1);
    saveData();
    return true;
  }

  function dataSummary() {
    return `${users.length} 个用户 · ${items.length} 个物品 · ${interactions.length} 条喜欢行为`;
  }

  function renderDataWorkbench(containerSelector, currentUserId, onChange) {
    const container = $(containerSelector);
    if (!container) return;
    const liked = itemSetForUser(currentUserId);
    const likeOptions = items
      .filter((item) => !liked.has(item.id))
      .map((item) => `<option value="${item.id}">${item.title} · ${item.tags.join("/")}</option>`)
      .join("");
    const likedItems = likedItemIds(currentUserId).map((id) => byId(items, id)).filter(Boolean);
    container.innerHTML = `
      <div class="data-workbench">
        <div class="plain-card">
          <strong>实验数据中心</strong>
          <p>${dataSummary()}。这里的数据会保存在浏览器本地，06/07/08/09 推荐实验室会共用同一份数据。</p>
          <div class="inline-controls">
            <button class="secondary-btn" data-reset-reco-data type="button">重置演示数据</button>
          </div>
        </div>
        <div class="workbench-grid">
          <div class="plain-card">
            <strong>新增用户</strong>
            <label class="field">用户名称<input id="newUserName" placeholder="例如：小王" /></label>
            <label class="field">用户角色<input id="newUserRole" placeholder="例如：AI 学习者" /></label>
            <button class="primary-btn" data-add-user type="button">创建用户</button>
          </div>
          <div class="plain-card">
            <strong>新增物品</strong>
            <label class="field">物品标题<input id="newItemTitle" placeholder="例如：Graph RAG 实战课" /></label>
            <label class="field">标签<input id="newItemTags" placeholder="例如：AI, RAG, 图谱" /></label>
            <button class="primary-btn" data-add-item type="button">创建物品</button>
          </div>
          <div class="plain-card">
            <strong>给当前用户添加喜欢</strong>
            <label class="field">选择物品<select id="newLikeItem">${likeOptions || "<option value=''>没有可添加物品</option>"}</select></label>
            <button class="primary-btn" data-add-like type="button">添加喜欢</button>
            <p>添加后会立刻影响标签推荐、UserCF 和 SVD 的推荐结果。</p>
          </div>
        </div>
        <div class="plain-card">
          <strong>当前用户已喜欢</strong>
          ${likedItems.length ? `<div class="like-list">${likedItems.map((item) => `
            <span>${item.title}<button data-remove-like="${item.id}" type="button">删除</button></span>
          `).join("")}</div>` : "<p>当前用户还没有喜欢行为，可以先添加几条再观察推荐变化。</p>"}
        </div>
      </div>
    `;
    container.querySelector("[data-add-user]")?.addEventListener("click", () => {
      const user = addUser($("#newUserName").value, $("#newUserRole").value);
      if (user) onChange?.({ type: "user", user });
    });
    container.querySelector("[data-add-item]")?.addEventListener("click", () => {
      const item = addItem($("#newItemTitle").value, $("#newItemTags").value);
      if (item) onChange?.({ type: "item", item });
    });
    container.querySelector("[data-add-like]")?.addEventListener("click", () => {
      if (addLike(currentUserId, $("#newLikeItem").value)) onChange?.({ type: "like" });
    });
    container.querySelector("[data-reset-reco-data]")?.addEventListener("click", () => {
      resetData();
      onChange?.({ type: "reset" });
    });
    container.querySelectorAll("[data-remove-like]").forEach((button) => {
      button.addEventListener("click", () => {
        if (removeLike(currentUserId, button.dataset.removeLike)) onChange?.({ type: "remove-like" });
      });
    });
  }

  loadData();

  function renderProjectMenu(activeProject) {
    const menu = $("#projectMenu");
    if (!menu) return;
    menu.innerHTML = projectEntries.map(([id, title, desc]) => `
      <button class="${id === activeProject ? "is-active" : ""}" data-project="${id}">
        <strong>${title}</strong>
        <span>${desc}</span>
      </button>
    `).join("");
  }

  function bindProjectSwitcher(activeProject) {
    renderProjectMenu(activeProject);
    const trigger = $("#projectTrigger");
    const menu = $("#projectMenu");
    if (!trigger || !menu) return;
    const closeMenu = () => {
      trigger.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
    };
    trigger.addEventListener("click", () => {
      const nextOpen = !menu.classList.contains("is-open");
      trigger.setAttribute("aria-expanded", String(nextOpen));
      menu.classList.toggle("is-open", nextOpen);
    });
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-project]");
      if (!button) return;
      closeMenu();
      if (button.dataset.project === activeProject) return;
      window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".project-switcher")) closeMenu();
    });
  }

  function bindViews(onSwitch) {
    function switchView(viewId) {
      $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
      $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
      const active = $(`.nav-item[data-view="${viewId}"] b`);
      const title = $("#pageTitle");
      if (title && active) title.textContent = active.textContent;
      onSwitch?.(viewId);
    }
    $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
    $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
    return switchView;
  }

  function renderUserSelect(selector, selectedId, onChange) {
    const select = $(selector);
    if (!select) return;
    select.innerHTML = users.map((user) => `<option value="${user.id}">${user.name} · ${user.role}</option>`).join("");
    select.value = selectedId;
    select.onchange = (event) => onChange(event.target.value);
  }

  function cardList(entries, limit = 5) {
    const max = Math.max(0.001, ...entries.map((entry) => entry.score));
    if (!entries.length) {
      return `<div class="plain-card"><strong>暂无推荐</strong><p>当前用户已经覆盖了可推荐内容，或者候选没有正分。换一个用户再观察。</p></div>`;
    }
    return `<div class="result-list">${entries.slice(0, limit).map((entry, index) => `
      <article class="result-card">
        <strong>Top ${index + 1} · ${entry.item.title}</strong>
        <p>${entry.reason}</p>
        <div class="score-bar"><i style="width:${Math.max(5, entry.score / max * 100)}%"></i></div>
        <div class="tag-list">${entry.item.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <p>推荐分：${entry.score.toFixed(4)}</p>
      </article>
    `).join("")}</div>`;
  }

  function tagList(values) {
    return `<div class="tag-list">${values.map((value) => `<span>${value}</span>`).join("")}</div>`;
  }

  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function projectPoint(point, space, w, h) {
    const cosY = Math.cos(space.rotationY);
    const sinY = Math.sin(space.rotationY);
    const cosX = Math.cos(space.rotationX);
    const sinX = Math.sin(space.rotationX);
    const x1 = point.x * cosY - point.z * sinY;
    const z1 = point.x * sinY + point.z * cosY;
    const y1 = point.y * cosX - z1 * sinX;
    const z2 = point.y * sinX + z1 * cosX;
    const depth = 1 / (1 + (z2 + 180) / 760);
    return {
      x: w / 2 + x1 * space.zoom * depth,
      y: h / 2 + y1 * space.zoom * depth,
      z: z2,
      depth,
    };
  }

  function draw3D(canvas, tip, space, scene) {
    const { ctx, w, h } = canvasContext(canvas);
    const projected = new Map();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfdfb";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(47,111,72,0.13)";
    ctx.lineWidth = 1;
    for (let x = -2; x <= 2; x += 1) {
      const a = projectPoint({ x, y: -1.15, z: -1.6 }, space, w, h);
      const b = projectPoint({ x, y: -1.15, z: 1.6 }, space, w, h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let z = -1; z <= 1; z += 0.5) {
      const a = projectPoint({ x: -2.2, y: -1.15, z }, space, w, h);
      const b = projectPoint({ x: 2.2, y: -1.15, z }, space, w, h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.fillStyle = "#173820";
    ctx.font = "900 13px sans-serif";
    ctx.fillText(scene.title, 18, 28);
    ctx.fillStyle = "#68716a";
    ctx.font = "800 12px sans-serif";
    ctx.fillText("拖动旋转 · 滚轮缩放 · 悬停看解释", 18, 50);

    scene.nodes.forEach((node) => projected.set(node.id, projectPoint(node, space, w, h)));
    scene.links.forEach((link) => {
      const from = projected.get(link.from);
      const to = projected.get(link.to);
      if (!from || !to) return;
      ctx.strokeStyle = link.color || "rgba(31,111,132,0.28)";
      ctx.lineWidth = link.width || 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    const hitNodes = scene.nodes.map((node) => ({ node, point: projected.get(node.id) }))
      .sort((a, b) => a.point.z - b.point.z);
    hitNodes.forEach(({ node, point }) => {
      const radius = (node.size || 18) * point.depth;
      ctx.fillStyle = node.color || "#2f6f48";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 ${Math.max(10, 12 * point.depth)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(node.short || node.label.slice(0, 2), point.x, point.y + 4);
      node.hit = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
    });
    ctx.textAlign = "left";
    space.nodes = scene.nodes;
    space.tip = tip;
  }

  function setup3DCanvas(canvasSelector, tipSelector, space, getScene) {
    const canvas = $(canvasSelector);
    const tip = $(tipSelector);
    if (!canvas || !tip) return () => {};
    const render = () => draw3D(canvas, tip, space, getScene());
    canvas.addEventListener("mousedown", (event) => {
      space.dragging = true;
      space.lastX = event.clientX;
      space.lastY = event.clientY;
    });
    window.addEventListener("mouseup", () => {
      space.dragging = false;
    });
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (space.dragging) {
        space.rotationY += (event.clientX - space.lastX) * 0.01;
        space.rotationX += (event.clientY - space.lastY) * 0.01;
        space.lastX = event.clientX;
        space.lastY = event.clientY;
        render();
        return;
      }
      const hovered = (space.nodes || []).find((node) => {
        const hit = node.hit;
        return hit && x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height;
      });
      if (!hovered) {
        tip.classList.remove("is-visible");
        return;
      }
      tip.innerHTML = `<strong>${hovered.label}</strong><span>${hovered.meta}</span>`;
      tip.style.left = `${Math.min(rect.width - 292, Math.max(10, x + 14))}px`;
      tip.style.top = `${Math.min(rect.height - 120, Math.max(10, y + 14))}px`;
      tip.classList.add("is-visible");
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      space.zoom = Math.max(80, Math.min(260, space.zoom - event.deltaY * 0.12));
      render();
    }, { passive: false });
    canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
    window.addEventListener("resize", render);
    return render;
  }

  return {
    $, $$, users, items, interactions, itemFactors, byId, likedItemIds, itemSetForUser,
    userProfile, tagRecommendations, itemSimilarity, userSimilarity, similarUsers,
    usercfRecommendations, userFactor, svdRecommendations, renderProjectMenu,
    bindProjectSwitcher, bindViews, renderUserSelect, cardList, tagList, setup3DCanvas,
    addUser, addItem, addLike, removeLike, resetData, renderDataWorkbench,
  };
})();
