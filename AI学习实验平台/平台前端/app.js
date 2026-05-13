const projects = {
  zhixingzhe: {
    url: "../项目/知行者AI实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  itemcf: {
    url: "../项目/基于物品的协同过滤ItemCF/前端原型/index.html?v=20260513-3d-v3",
  },
  tagrec: {
    url: "../项目/标签推荐实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  usercf: {
    url: "../项目/UserCF实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  svd: {
    url: "../项目/SVD矩阵分解实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  recsys: {
    url: "../项目/推荐系统核心技术实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  embedding: {
    url: "../项目/Embedding与相似度实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  chunking: {
    url: "../项目/文本切分实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  vectordb: {
    url: "../项目/向量库实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  rerank: {
    url: "../项目/Rerank重排序实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  rageval: {
    url: "../项目/RAG评测实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  graphrag: {
    url: "../项目/GraphRAG图谱实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  agent: {
    url: "../项目/Agent工程实验室/前端原型/index.html?v=20260513-3d-v3",
  },
  modelprompt: {
    url: "../项目/模型调用与Prompt工程实验室/前端原型/index.html?v=20260513-3d-v3",
  },
};

const frame = document.querySelector("#projectFrame");

function setProject(projectId) {
  const project = projects[projectId] || projects.zhixingzhe;
  frame.src = project.url;
  localStorage.setItem("learning-platform-project", projectId);
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "learning-platform:switch-project") {
    setProject(event.data.project);
  }
});

setProject(localStorage.getItem("learning-platform-project") || "zhixingzhe");
