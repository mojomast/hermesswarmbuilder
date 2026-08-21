/**
 * Dashboard C: 3D Spatial Operations Topology Controller
 * WebGPU / WebGL2 3D spatial operations viewport with instancing, GPU picking,
 * on-demand render invalidation, and bidirectional accessible treegrid synchronization.
 */

import * as THREE from "../../vendor/three.js";
import { ControlPlaneClient, deriveCanonicalDisposition, escapeHtml } from "../shared/api-client.js";

class SpatialTopologyController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.canvas = document.getElementById("spatial-canvas");
    this.selectedNodeId = null;
    this.nodes = [];
    this.links = [];
    this.isRendering = false;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.zonePositions = {
      admission: new THREE.Vector3(-160, 0, 0),
      reasoning: new THREE.Vector3(-80, 0, 0),
      codegen: new THREE.Vector3(0, 0, 0),
      testing: new THREE.Vector3(80, 0, 0),
      release: new THREE.Vector3(160, 0, 0)
    };

    this.initElements();
    this.initThreeScene();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      hudStatus: document.getElementById("hud-status"),
      hudRun: document.getElementById("hud-run"),
      hudFreshness: document.getElementById("hud-freshness"),
      treeTableBody: document.getElementById("tree-table-body"),
      inspectorContent: document.getElementById("inspector-content"),
      btnResetCam: document.getElementById("btn-reset-cam")
    };
  }

  initThreeScene() {
    // 1. Renderer Setup (Adaptive WebGL2 / WebGPU fallback)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // 2. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    this.cameraDefaultPos = new THREE.Vector3(0, 180, 320);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.cameraDefaultPos);
    this.camera.lookAt(this.cameraTarget);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(100, 200, 150);
    this.scene.add(dirLight);

    // 4. Ground Grid & Zone Pedestals
    const grid = new THREE.GridHelper(500, 50, 0x1e293b, 0x0f172a);
    grid.position.y = -10;
    this.scene.add(grid);

    this.buildZonePedestals();
    this.buildAuthorityPlanes();
    this.buildInstancedGeometry();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Trigger initial render
    this.requestRender();
  }

  buildZonePedestals() {
    const geo = new THREE.CylinderGeometry(30, 32, 4, 32);
    const zoneKeys = Object.keys(this.zonePositions);

    zoneKeys.forEach((key) => {
      const pos = this.zonePositions[key];
      const mat = new THREE.MeshStandardMaterial({
        color: 0x182030,
        roughness: 0.4,
        metalness: 0.6
      });
      const pedestal = new THREE.Mesh(geo, mat);
      pedestal.position.set(pos.x, -5, pos.z);
      this.scene.add(pedestal);

      // Glowing zone ring
      const ringGeo = new THREE.RingGeometry(29, 31, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, -2.8, pos.z);
      this.scene.add(ring);
    });
  }

  buildAuthorityPlanes() {
    // Top Authority Boundary Line
    const pointsTop = [new THREE.Vector3(-220, 80, 0), new THREE.Vector3(220, 80, 0)];
    const topGeo = new THREE.BufferGeometry().setFromPoints(pointsTop);
    const topMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.5 });
    this.scene.add(new THREE.Line(topGeo, topMat));

    // Bottom Infrastructure Pressure Line
    const pointsBottom = [new THREE.Vector3(-220, -50, 0), new THREE.Vector3(220, -50, 0)];
    const btmGeo = new THREE.BufferGeometry().setFromPoints(pointsBottom);
    const btmMat = new THREE.LineBasicMaterial({ color: 0x384966, transparent: true, opacity: 0.5 });
    this.scene.add(new THREE.Line(btmGeo, btmMat));
  }

  buildInstancedGeometry() {
    // 1. Instanced Agent Nodes (Spheres)
    const nodeGeo = new THREE.SphereGeometry(3.5, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.8 });
    this.nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, 200);
    this.nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodeMesh.count = 0;
    this.scene.add(this.nodeMesh);

    // 2. Instanced Conduits (Cylinders)
    const linkGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const linkMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
    this.linkMesh = new THREE.InstancedMesh(linkGeo, linkMat, 300);
    this.linkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.linkMesh.count = 0;
    this.scene.add(this.linkMesh);

    // 3. Volumetric Blocker Box
    const blockerGeo = new THREE.BoxGeometry(16, 16, 16);
    const blockerMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true });
    this.blockerMesh = new THREE.Mesh(blockerGeo, blockerMat);
    this.blockerMesh.visible = false;
    this.scene.add(this.blockerMesh);
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.requestRender();
    });

    // Pointer Picking
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.nodeMesh);
      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (this.nodes[instanceId]) {
          this.selectNode(this.nodes[instanceId].id);
        }
      }
    });

    // Camera Bookmarks Hotkeys
    window.addEventListener("keydown", (e) => {
      if (e.key === "1") this.frameZone("admission");
      if (e.key === "2") this.frameZone("reasoning");
      if (e.key === "3") this.frameZone("codegen");
      if (e.key === "4") this.frameZone("testing");
      if (e.key === "5") this.frameZone("release");
      if (e.key === "Home" || e.key.toLowerCase() === "r") this.resetCamera();
    });

    this.el.btnResetCam.addEventListener("click", () => this.resetCamera());
  }

  async init() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    await this.client.resyncSnapshots();
    this.client.connectStream();
    this.updateTopologyFromState();
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      this.updateTopologyFromState();
    }
  }

  updateTopologyFromState() {
    const state = this.client.cachedState || {};
    const disposition = deriveCanonicalDisposition(state, {}, null, null);

    this.el.hudStatus.textContent = disposition.label;
    this.el.hudStatus.className = `hud-pill ${disposition.severity === 'error' ? 'error' : 'active'}`;
    this.el.hudRun.textContent = `Run: ${state.currentRunId || 'Idle'}`;
    this.el.hudFreshness.textContent = `Updated: ${state.updatedAt ? state.updatedAt.slice(11, 19) : '--'}`;

    // Synthesize nodes from agents & variants
    const agents = Object.values(state.agents || {});
    this.nodes = [];
    this.links = [];

    // Map agents to spatial zones
    agents.forEach((a, idx) => {
      let zone = "codegen";
      if (a.role?.includes("orchestrat") || a.role?.includes("scan")) zone = "admission";
      else if (a.role?.includes("spec") || a.role?.includes("plan")) zone = "reasoning";
      else if (a.role?.includes("test") || a.role?.includes("audit")) zone = "testing";
      else if (a.role?.includes("publish")) zone = "release";

      const basePos = this.zonePositions[zone] || new THREE.Vector3(0, 0, 0);
      const offset = new THREE.Vector3((idx % 3 - 1) * 12, 10 + Math.floor(idx / 3) * 12, (idx % 2 - 0.5) * 12);
      const pos = basePos.clone().add(offset);

      this.nodes.push({
        id: a.id || `agent-${idx}`,
        label: a.label || a.id,
        role: a.role || "worker",
        status: a.status || "running",
        zone,
        position: pos,
        task: a.currentTask || a.lastMessage || "Active"
      });
    });

    // Build links between sequential agents
    for (let i = 0; i < this.nodes.length - 1; i++) {
      this.links.push({
        source: this.nodes[i].position,
        target: this.nodes[i + 1].position
      });
    }

    // Blocker status
    if (state.status === "blocked" && this.nodes.length > 0) {
      this.blockerMesh.visible = true;
      this.blockerMesh.position.copy(this.nodes[0].position);
    } else {
      this.blockerMesh.visible = false;
    }

    this.renderInstancedMesh();
    this.renderAccessibleTreegrid();
    this.requestRender();
  }

  renderInstancedMesh() {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    this.nodeMesh.count = this.nodes.length;
    this.nodes.forEach((node, i) => {
      dummy.position.copy(node.position);
      dummy.scale.setScalar(node.id === this.selectedNodeId ? 1.5 : 1.0);
      dummy.updateMatrix();
      this.nodeMesh.setMatrixAt(i, dummy.matrix);

      if (node.status === "running") color.setHex(0x10b981);
      else if (node.status === "blocked") color.setHex(0xf43f5e);
      else color.setHex(0x38bdf8);

      this.nodeMesh.setColorAt(i, color);
    });

    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) this.nodeMesh.instanceColor.needsUpdate = true;

    // Links
    const yAxis = new THREE.Vector3(0, 1, 0);
    this.linkMesh.count = this.links.length;
    this.links.forEach((link, i) => {
      const src = link.source;
      const dst = link.target;
      const midpoint = new THREE.Vector3().addVectors(src, dst).multiplyScalar(0.5);
      const delta = new THREE.Vector3().subVectors(dst, src);
      const dist = delta.length();

      if (dist > 0.01) {
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, delta.clone().normalize());
        dummy.position.copy(midpoint);
        dummy.quaternion.copy(quat);
        dummy.scale.set(1, dist, 1);
        dummy.updateMatrix();
        this.linkMesh.setMatrixAt(i, dummy.matrix);
      }
    });
    this.linkMesh.instanceMatrix.needsUpdate = true;
  }

  renderAccessibleTreegrid() {
    this.el.treeTableBody.innerHTML = this.nodes.map((node) => `
      <tr data-node-id="${node.id}" class="${node.id === this.selectedNodeId ? 'selected' : ''}" tabindex="0" role="row">
        <td><strong>${escapeHtml(node.label)}</strong></td>
        <td><span class="hud-pill active">${escapeHtml(node.zone)}</span></td>
        <td style="color: ${node.status === 'running' ? 'var(--color-success)' : 'var(--color-error)'};">${node.status}</td>
      </tr>
    `).join("");

    this.el.treeTableBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => this.selectNode(row.getAttribute("data-node-id")));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          this.selectNode(row.getAttribute("data-node-id"));
        }
      });
    });
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    this.renderInstancedMesh();
    this.renderAccessibleTreegrid();

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-title">
        <span>${escapeHtml(node.label)}</span>
        <span class="hud-pill active">${escapeHtml(node.zone)}</span>
      </div>
      <div style="font-family: var(--font-mono); font-size: 11px; margin-bottom: 8px;">Role: ${escapeHtml(node.role)}</div>
      <div style="margin-bottom: 8px;"><strong>Status:</strong> ${node.status}</div>
      <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; font-size: 11px;">
        <strong>Task:</strong> ${escapeHtml(node.task)}
      </div>
    `;

    // Camera Frame Target
    if (!this.reduceMotion) {
      this.camera.position.set(node.position.x, node.position.y + 40, node.position.z + 80);
      this.camera.lookAt(node.position);
    }
    this.requestRender();
  }

  frameZone(zoneKey) {
    const pos = this.zonePositions[zoneKey];
    if (!pos) return;
    this.camera.position.set(pos.x, 60, pos.z + 120);
    this.camera.lookAt(pos);
    this.requestRender();
  }

  resetCamera() {
    this.camera.position.copy(this.cameraDefaultPos);
    this.camera.lookAt(this.cameraTarget);
    this.requestRender();
  }

  requestRender() {
    if (!this.isRendering) {
      this.isRendering = true;
      requestAnimationFrame(() => {
        this.renderer.render(this.scene, this.camera);
        this.isRendering = false;
      });
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new SpatialTopologyController();
});
