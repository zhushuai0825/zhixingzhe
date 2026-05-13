import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#graphCanvas");
const tooltip = document.querySelector("#graphTooltip");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fbfb);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
camera.position.set(0, 18, 42);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const root = new THREE.Group();
const nodeGroup = new THREE.Group();
const edgeGroup = new THREE.Group();
root.add(edgeGroup, nodeGroup);
scene.add(root);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8c6, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(16, 28, 18);
scene.add(keyLight);

const grid = new THREE.GridHelper(70, 14, 0xa9bfba, 0xdfe9e6);
grid.position.y = -9;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const objects = [];
let payload = { entities: [], relations: [] };
let dragging = false;
let lastX = 0;
let lastY = 0;
let radius = 46;
let theta = Math.PI * 0.08;
let phi = Math.PI * 0.34;

const materials = {
  normal: new THREE.MeshStandardMaterial({ color: 0x16707a, roughness: 0.45, metalness: 0.08 }),
  seed: new THREE.MeshStandardMaterial({ color: 0xb35c2e, roughness: 0.42, metalness: 0.08 }),
  hit: new THREE.MeshStandardMaterial({ color: 0x227650, roughness: 0.42, metalness: 0.08 }),
  selected: new THREE.MeshStandardMaterial({ color: 0x173539, roughness: 0.32, metalness: 0.16 }),
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function positionCamera() {
  const y = Math.sin(phi) * radius;
  const flat = Math.cos(phi) * radius;
  camera.position.set(Math.sin(theta) * flat, y, Math.cos(theta) * flat);
  camera.lookAt(0, 0, 0);
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose();
    if (child.material && !Object.values(materials).includes(child.material)) child.material.dispose();
  }
}

function entityPosition(entity, total) {
  const angle = (entity.index / Math.max(1, total)) * Math.PI * 2;
  const layer = entity.index % 3;
  const r = 10 + layer * 5.5;
  return new THREE.Vector3(
    Math.cos(angle) * r,
    ((entity.index % 5) - 2) * 2.8,
    Math.sin(angle) * r,
  );
}

function relationKey(relation) {
  return `${relation.from}|${relation.label}|${relation.to}`;
}

function renderGraph(nextPayload) {
  payload = nextPayload;
  objects.length = 0;
  clearGroup(nodeGroup);
  clearGroup(edgeGroup);

  const positions = new Map();
  payload.entities.forEach((entity) => {
    const pos = entityPosition(entity, payload.entities.length);
    positions.set(entity.name, pos);
    const size = entity.isSeed ? 1.25 : entity.isHit ? 1.05 : 0.72;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 28, 28), entity.isSelected ? materials.selected : entity.isSeed ? materials.seed : entity.isHit ? materials.hit : materials.normal);
    mesh.position.copy(pos);
    mesh.userData = { type: "entity", entity };
    nodeGroup.add(mesh);
    objects.push(mesh);
    addLabel(entity.name, pos.clone().add(new THREE.Vector3(0, size + 1.0, 0)), entity.isSeed ? "#b35c2e" : entity.isHit ? "#227650" : "#173539");
  });

  payload.relations.forEach((relation) => {
    const from = positions.get(relation.from);
    const to = positions.get(relation.to);
    if (!from || !to) return;
    const material = new THREE.LineBasicMaterial({
      color: relation.isHit ? 0xb35c2e : 0x9db8b3,
      transparent: true,
      opacity: relation.isHit ? 0.9 : 0.38,
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), material);
    line.userData = { type: "relation", relation };
    edgeGroup.add(line);
  });
}

function addLabel(text, position, color) {
  const canvasLabel = document.createElement("canvas");
  const ctx = canvasLabel.getContext("2d");
  const ratio = 2;
  canvasLabel.width = 256 * ratio;
  canvasLabel.height = 64 * ratio;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "rgba(248, 251, 251, 0.92)";
  roundRect(ctx, 8, 10, 240, 36, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "800 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text.slice(0, 14), 128, 34);
  const texture = new THREE.CanvasTexture(canvasLabel);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(7.2, 1.8, 1);
  nodeGroup.add(sprite);
}

function roundRect(ctx, x, y, width, height, radiusValue) {
  ctx.beginPath();
  ctx.moveTo(x + radiusValue, y);
  ctx.lineTo(x + width - radiusValue, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radiusValue);
  ctx.lineTo(x + width, y + height - radiusValue);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radiusValue, y + height);
  ctx.lineTo(x + radiusValue, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radiusValue);
  ctx.lineTo(x, y + radiusValue);
  ctx.quadraticCurveTo(x, y, x + radiusValue, y);
  ctx.closePath();
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pick(event) {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objects, false)[0]?.object;
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (dragging) {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    theta -= dx * 0.008;
    phi = Math.max(-0.15, Math.min(1.2, phi + dy * 0.006));
    lastX = event.clientX;
    lastY = event.clientY;
    positionCamera();
  }
  const hit = pick(event);
  if (!hit) {
    tooltip.classList.remove("is-visible");
    return;
  }
  const { entity } = hit.userData;
  tooltip.innerHTML = `<strong>${entity.name}</strong><span>${entity.type}：${entity.note}</span>`;
  tooltip.style.left = `${Math.min(canvas.clientWidth - 300, Math.max(10, event.offsetX + 14))}px`;
  tooltip.style.top = `${Math.min(canvas.clientHeight - 120, Math.max(10, event.offsetY + 14))}px`;
  tooltip.classList.add("is-visible");
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("click", (event) => {
  const hit = pick(event);
  if (hit?.userData?.entity) {
    window.dispatchEvent(new CustomEvent("graph-rag:select-node", { detail: { id: hit.userData.entity.id } }));
  }
});

canvas.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  radius = Math.max(18, Math.min(76, radius + Math.sign(event.deltaY) * 3));
  positionCamera();
}, { passive: false });

window.addEventListener("resize", resize);
window.addEventListener("graph-rag:update", (event) => {
  renderGraph(event.detail);
  resize();
});

function animate() {
  requestAnimationFrame(animate);
  root.rotation.y += 0.0018;
  renderer.render(scene, camera);
}

resize();
positionCamera();
animate();
