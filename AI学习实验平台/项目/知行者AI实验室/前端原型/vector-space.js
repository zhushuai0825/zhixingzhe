import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#vectorSpaceCanvas");
const stage = document.querySelector("#vectorSpaceStage");
const statusNode = document.querySelector("#spaceStatus");
const statsNode = document.querySelector("#spaceStats");
const kbNameNode = document.querySelector("#spaceKbName");
const questionNode = document.querySelector("#spaceQuestion");
const selectedTitleNode = document.querySelector("#spaceSelectedTitle");
const selectedTextNode = document.querySelector("#spaceSelectedText");

const state = {
  knowledgeBases: [],
  knowledgeBaseId: "",
  chunks: [],
  hits: [],
  question: "",
  queryPreview: [],
  autoRotate: true,
};

const controls = {
  dragging: false,
  panning: false,
  moved: false,
  lastX: 0,
  lastY: 0,
  distance: 54,
  yaw: 0,
  pitch: 0.32,
  target: new THREE.Vector3(0, 0, 0),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7fbfa);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
camera.position.set(0, 18, 54);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const root = new THREE.Group();
scene.add(root);

const grid = new THREE.GridHelper(64, 16, 0x9db8b3, 0xd9e7e4);
grid.position.y = -14;
root.add(grid);

const axes = new THREE.Group();
axes.add(makeAxis(new THREE.Vector3(24, 0, 0), 0x147c72));
axes.add(makeAxis(new THREE.Vector3(0, 24, 0), 0xca7a16));
axes.add(makeAxis(new THREE.Vector3(0, 0, 24), 0x334b7d));
root.add(axes);

const chunkGroup = new THREE.Group();
const lineGroup = new THREE.Group();
root.add(lineGroup, chunkGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const chunkObjects = new Map();
let queryObject = null;
let needsRender = true;

const normalMaterial = new THREE.MeshStandardMaterial({
  color: 0x147c72,
  roughness: 0.42,
  metalness: 0.08,
});
const hitMaterial = new THREE.MeshStandardMaterial({
  color: 0xca7a16,
  emissive: 0x4a2500,
  emissiveIntensity: 0.18,
  roughness: 0.34,
});
const queryMaterial = new THREE.MeshStandardMaterial({
  color: 0x102b2b,
  emissive: 0x147c72,
  emissiveIntensity: 0.2,
  roughness: 0.3,
});
const selectedMaterial = new THREE.MeshStandardMaterial({
  color: 0xf1bd69,
  emissive: 0x4f2d00,
  emissiveIntensity: 0.2,
  roughness: 0.28,
});

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8c6, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(18, 28, 20);
scene.add(keyLight);

function makeAxis(target, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -14, 0), target.clone().add(new THREE.Vector3(0, -14, 0))]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
  return new THREE.Line(geometry, material);
}

function setKnowledgeBases(bases) {
  state.knowledgeBases = bases || [];
  renderLabels();
}

function setKnowledgeBase(id) {
  state.knowledgeBaseId = id || "";
  renderLabels();
}

function setChunks(chunks) {
  state.chunks = (chunks || []).slice(0, 160);
  state.hits = [];
  state.queryPreview = [];
  renderScene();
}

function setSearchResult({ question, queryEmbedding, hits }) {
  state.question = question || "";
  state.queryPreview = queryEmbedding || [];
  state.hits = hits || [];
  mergeHitChunks(hits || []);
  state.autoRotate = false;
  root.rotation.y = 0;
  renderScene();
}

function mergeHitChunks(hits) {
  if (!hits.length) return;
  const existingIds = new Set(state.chunks.map((chunk) => chunk.id));
  const missingChunks = hits
    .filter((hit) => !existingIds.has(hit.chunk_id))
    .map((hit) => ({
      id: hit.chunk_id,
      chunk_index: hit.chunk_index,
      file_name: hit.file_name,
      content: hit.content,
      embedding_preview: [],
    }));
  if (missingChunks.length) {
    state.chunks = state.chunks.concat(missingChunks).slice(0, 160);
  }
}

function resize() {
  if (!canvas || !stage) return;
  const rect = stage.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(300, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  needsRender = true;
}

function renderScene() {
  chunkGroup.clear();
  lineGroup.clear();
  chunkObjects.clear();
  queryObject = null;

  const hitIds = new Set(state.hits.map((hit) => hit.chunk_id));
  const hitMap = new Map(state.hits.map((hit) => [hit.chunk_id, hit]));
  state.chunks.forEach((chunk, index) => {
    const hit = hitMap.get(chunk.id);
    const score = Number(hit?.score || 0);
    const position = state.hits.length
      ? projectRetrievalPosition(chunk.embedding_preview || [], index, hit, state.hits.length)
      : projectVector(chunk.embedding_preview || [], index);
    const geometry = new THREE.SphereGeometry(hitIds.has(chunk.id) ? 0.72 + score * 0.45 : 0.48, 20, 20);
    const mesh = new THREE.Mesh(geometry, hitIds.has(chunk.id) ? hitMaterial : normalMaterial);
    mesh.position.copy(position);
    mesh.userData = { type: "chunk", chunk, score };
    chunkGroup.add(mesh);
    chunkObjects.set(chunk.id, mesh);
  });

  if (state.queryPreview.length) {
    queryObject = new THREE.Mesh(new THREE.SphereGeometry(1.05, 28, 28), queryMaterial);
    queryObject.position.set(0, 0, 0);
    queryObject.userData = { type: "query" };
    chunkGroup.add(queryObject);

    state.hits.forEach((hit) => {
      const target = chunkObjects.get(hit.chunk_id);
      if (!target) return;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([queryObject.position, target.position]),
        new THREE.LineBasicMaterial({
          color: 0xca7a16,
          transparent: true,
          opacity: Math.max(0.26, Number(hit.score || 0)),
        }),
      );
      lineGroup.add(line);
    });
  }

  renderLabels();
  updateStats();
  needsRender = true;
}

function projectVector(values, index) {
  const padded = Array.from({ length: 16 }, (_, i) => Number(values[i] || 0));
  const x = (padded[0] - padded[1] + padded[4] - padded[5]) * 52;
  const y = (padded[2] - padded[3] + padded[6] - padded[7]) * 52;
  const z = (padded[8] - padded[9] + padded[12] - padded[13]) * 52;
  const fallbackAngle = index * 2.399963;
  const fallbackRadius = 5 + (index % 9) * 1.25;
  return new THREE.Vector3(
    clamp(x || Math.cos(fallbackAngle) * fallbackRadius, -24, 24),
    clamp(y || ((index % 7) - 3) * 2.4, -10, 18),
    clamp(z || Math.sin(fallbackAngle) * fallbackRadius, -24, 24),
  );
}

function projectRetrievalPosition(values, index, hit, hitCount) {
  if (!hit) {
    const base = projectVector(values, index);
    const away = base.length() ? base.normalize() : randomDirection(index);
    return away.multiplyScalar(20 + (index % 6) * 1.8);
  }

  const rank = Math.max(1, Number(hit.rank || 1));
  const score = clamp(Number(hit.score || 0), 0, 1);
  const direction = projectVector(values, index);
  if (!direction.length()) direction.copy(randomDirection(index));
  direction.normalize();

  const ringOffset = (rank - (hitCount + 1) / 2) * 2.8;
  const radius = 3.8 + (1 - score) * 14 + (rank - 1) * 1.2;
  return direction.multiplyScalar(radius).add(new THREE.Vector3(ringOffset, rank % 2 ? 1.4 : -1.2, 0));
}

function randomDirection(index) {
  const angle = index * 2.399963;
  return new THREE.Vector3(Math.cos(angle), ((index % 7) - 3) / 5, Math.sin(angle)).normalize();
}

function updateStats() {
  if (!statusNode || !statsNode) return;
  const hitCount = state.hits.length;
  statusNode.textContent = state.chunks.length
    ? hitCount
      ? "已完成 3D 匹配：橙色点是 Top K 命中"
      : "已载入切片：输入问题后可运行匹配"
    : "等待载入知识库切片";
  statsNode.textContent = `chunk 点 ${state.chunks.length} · 命中 ${hitCount}`;
}

function renderLabels() {
  const kb = state.knowledgeBases.find((item) => item.id === state.knowledgeBaseId);
  if (kbNameNode) kbNameNode.textContent = kb ? kb.name : state.knowledgeBaseId || "未选择";
  if (questionNode) questionNode.textContent = state.question || document.querySelector("#liveQuestionInput")?.value || "等待输入问题";
}

function selectObject(object) {
  chunkObjects.forEach((mesh) => {
    const isHit = state.hits.some((hit) => hit.chunk_id === mesh.userData.chunk.id);
    mesh.material = isHit ? hitMaterial : normalMaterial;
  });
  if (!object?.userData?.chunk) return;
  object.material = selectedMaterial;
  const { chunk, score } = object.userData;
  if (selectedTitleNode) selectedTitleNode.textContent = `片段 ${chunk.chunk_index} · ${score ? `相关度 ${score.toFixed(4)}` : "未命中"}`;
  if (selectedTextNode) selectedTextNode.textContent = chunk.content || "暂无内容";
  needsRender = true;
}

function onPointerDown(event) {
  if (!canvas) return;
  controls.dragging = true;
  controls.panning = event.shiftKey;
  controls.moved = false;
  controls.lastX = event.clientX;
  controls.lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
  state.autoRotate = false;
}

function onPointerMove(event) {
  if (!controls.dragging) return;
  const dx = event.clientX - controls.lastX;
  const dy = event.clientY - controls.lastY;
  if (Math.abs(dx) + Math.abs(dy) > 4) controls.moved = true;
  controls.lastX = event.clientX;
  controls.lastY = event.clientY;
  if (controls.panning || event.shiftKey) {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    controls.target.addScaledVector(right, -dx * 0.035);
    controls.target.addScaledVector(up, dy * 0.035);
  } else {
    controls.yaw -= dx * 0.006;
    controls.pitch = clamp(controls.pitch - dy * 0.006, -1.15, 1.15);
  }
  updateCamera();
}

function onPointerUp(event) {
  if (!controls.moved) pickPoint(event);
  controls.dragging = false;
  controls.panning = false;
  canvas?.releasePointerCapture?.(event.pointerId);
}

function onWheel(event) {
  event.preventDefault();
  state.autoRotate = false;
  controls.distance = clamp(controls.distance + event.deltaY * 0.04, 18, 110);
  updateCamera();
}

function pickPoint(event) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(Array.from(chunkObjects.values()), false);
  selectObject(intersects[0]?.object);
}

function updateCamera() {
  const radius = controls.distance;
  const x = Math.sin(controls.yaw) * Math.cos(controls.pitch) * radius;
  const y = Math.sin(controls.pitch) * radius;
  const z = Math.cos(controls.yaw) * Math.cos(controls.pitch) * radius;
  camera.position.copy(controls.target).add(new THREE.Vector3(x, y, z));
  camera.lookAt(controls.target);
  needsRender = true;
}

function resetView() {
  controls.distance = 54;
  controls.yaw = 0;
  controls.pitch = 0.32;
  controls.target.set(0, 0, 0);
  root.rotation.y = 0;
  state.autoRotate = false;
  updateCamera();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function animate() {
  requestAnimationFrame(animate);
  if (state.autoRotate) {
    root.rotation.y += 0.0028;
    needsRender = true;
  }
  if (queryObject) {
    queryObject.scale.setScalar(1 + Math.sin(Date.now() * 0.004) * 0.08);
    needsRender = true;
  }
  if (!needsRender) return;
  renderer.render(scene, camera);
  needsRender = false;
}

if (canvas) {
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("dblclick", pickPoint);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", resize);
  resize();
  renderScene();
  animate();
}

window.vectorSpace = {
  setKnowledgeBases,
  setKnowledgeBase,
  setChunks,
  setSearchResult,
  resize,
  resetView,
};

window.dispatchEvent(new CustomEvent("vector-space-ready"));
