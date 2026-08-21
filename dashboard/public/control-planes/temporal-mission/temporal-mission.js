/**
 * Dashboard D: 3D Temporal Mission Environment Controller
 * Longitudinal time-axis corridor with diverging variant splines, synthesis funnels,
 * timeline scrubbing, and accessible chronological waterfall synchronization.
 */

import * as THREE from "../../vendor/three.js";
import { ControlPlaneClient, deriveCanonicalDisposition, escapeHtml } from "../shared/api-client.js";

class TemporalMissionController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.canvas = document.getElementById("temporal-canvas");
    this.selectedChamberIndex = 2; // Default to Variant Arena (Z=0)
    this.isRendering = false;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.chambers = [
      { id: "history", name: "Historical Archive", z: -250, desc: "Past iterations & lineage ledger" },
      { id: "spec", name: "1. Specification Chamber", z: -150, desc: "Requirements & frozen base ref" },
      { id: "draft", name: "2. Architecture Chamber", z: -75, desc: "System modular decomposition" },
      { id: "arena", name: "3. Variant Exploration Arena", z: 0, desc: "Multi-agent diverging worktrees" },
      { id: "eval", name: "4. Evaluation Arena", z: 75, desc: "Multi-axis rubric comparison" },
      { id: "synth", name: "5. Synthesis Funnel", z: 150, desc: "Winner selection & cherry-pick" },
      { id: "gate", name: "6. Gate & Handoff Crystal", z: 250, desc: "Validation verification & handoff" }
    ];

    this.initElements();
    this.initThreeScene();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      hudStatus: document.getElementById("hud-status"),
      hudRun: document.getElementById("hud-run"),
      hudGen: document.getElementById("hud-gen"),
      waterfallList: document.getElementById("waterfall-list"),
      inspectorContent: document.getElementById("inspector-content"),
      scrubberSlider: document.getElementById("scrubber-slider"),
      sliderLabel: document.getElementById("slider-label")
    };
  }

  initThreeScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 3000);
    this.camera.position.set(0, 40, 80);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xa855f7, 2, 800);
    pointLight.position.set(0, 50, 0);
    this.scene.add(pointLight);

    this.buildTemporalCorridor();
    this.buildDivergingVariantBranches();
    this.buildSynthesisFunnel();
    this.requestRender();
  }

  buildTemporalCorridor() {
    // Longitudinal Spine Line
    const spinePoints = [new THREE.Vector3(0, 0, -400), new THREE.Vector3(0, 0, 350)];
    const spineGeo = new THREE.BufferGeometry().setFromPoints(spinePoints);
    const spineMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.4 });
    this.scene.add(new THREE.Line(spineGeo, spineMat));

    // Chamber Portals / Archways
    this.chamberMeshes = [];
    const archGeo = new THREE.TorusGeometry(24, 0.8, 16, 32);

    this.chambers.forEach((ch, idx) => {
      const archMat = new THREE.MeshStandardMaterial({
        color: idx === 3 ? 0x38bdf8 : 0x8b5cf6,
        roughness: 0.3,
        metalness: 0.8
      });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(0, 0, ch.z);
      this.scene.add(arch);
      this.chamberMeshes.push(arch);

      // Floor marker disc
      const discGeo = new THREE.CircleGeometry(16, 32);
      const discMat = new THREE.MeshBasicMaterial({ color: 0x182030, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, -10, ch.z);
      this.scene.add(disc);
    });
  }

  buildDivergingVariantBranches() {
    // 3 Diverging Variant Bézier Splines at Arena (Z=0 to Z=75)
    this.variantBranches = [];
    const kVariants = 3;
    const radius = 25;

    for (let k = 0; k < kVariants; k++) {
      const angle = (k * 2 * Math.PI) / kVariants;
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 0, -20),
        new THREE.Vector3(radius * Math.cos(angle) * 0.4, radius * Math.sin(angle) * 0.4, 10),
        new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 40),
        new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 75)
      );

      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.6, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({ color: k === 0 ? 0x10b981 : 0x38bdf8 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this.scene.add(tube);
      this.variantBranches.push(tube);

      // 3D Evaluation Radar Prism at endpoint
      const radarGeo = new THREE.OctahedronGeometry(4);
      const radarMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, wireframe: true });
      const radar = new THREE.Mesh(radarGeo, radarMat);
      radar.position.copy(curve.getPoint(1));
      this.scene.add(radar);
    }
  }

  buildSynthesisFunnel() {
    // Funnel converging from Z=75 to Z=150
    const funnelGeo = new THREE.ConeGeometry(25, 60, 16, 1, true);
    const funnelMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true, transparent: true, opacity: 0.3 });
    const funnel = new THREE.Mesh(funnelGeo, funnelMat);
    funnel.rotation.x = Math.PI / 2;
    funnel.position.set(0, 0, 112);
    this.scene.add(funnel);

    // Terminal Release Crystal at Z=250
    const crystalGeo = new THREE.DodecahedronGeometry(6);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.1, metalness: 0.9 });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 0, 250);
    this.scene.add(crystal);
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.requestRender();
    });

    this.el.scrubberSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      this.scrubToZ(val);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.jumpChamber(-1);
      if (e.key === "ArrowRight") this.jumpChamber(1);
    });
  }

  async init() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    await this.client.resyncSnapshots();
    this.client.connectStream();
    this.renderWaterfall();
    this.selectChamber(3); // Start at Arena
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      const state = this.client.cachedState || {};
      const disposition = deriveCanonicalDisposition(state, {}, null, null);
      this.el.hudStatus.textContent = disposition.label;
      this.el.hudRun.textContent = `Run: ${state.currentRunId || 'Idle'}`;
    }
  }

  renderWaterfall() {
    this.el.waterfallList.innerHTML = this.chambers.map((ch, idx) => `
      <div class="chamber-card ${idx === this.selectedChamberIndex ? 'active' : ''}" data-idx="${idx}" tabindex="0" role="row">
        <div style="font-weight: 700;">${escapeHtml(ch.name)}</div>
        <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">Z = ${ch.z}m | ${escapeHtml(ch.desc)}</div>
      </div>
    `).join("");

    this.el.waterfallList.querySelectorAll(".chamber-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-idx"), 10);
        this.selectChamber(idx);
      });
    });
  }

  selectChamber(idx) {
    this.selectedChamberIndex = Math.max(0, Math.min(idx, this.chambers.length - 1));
    const ch = this.chambers[this.selectedChamberIndex];
    this.el.scrubberSlider.value = ch.z;
    this.el.sliderLabel.textContent = `${ch.name} (Z = ${ch.z}m)`;

    this.renderWaterfall();
    this.el.inspectorContent.innerHTML = `
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: var(--color-time);">${escapeHtml(ch.name)}</div>
      <div style="color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(ch.desc)}</div>
      <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px;">
        <div><strong>Longitudinal Coordinate:</strong> Z=${ch.z}m</div>
        <div><strong>State Integrity:</strong> Authoritative immutable record</div>
      </div>
    `;

    this.scrubToZ(ch.z);
  }

  jumpChamber(delta) {
    this.selectChamber(this.selectedChamberIndex + delta);
  }

  scrubToZ(zPos) {
    if (this.reduceMotion) {
      this.camera.position.set(0, 30, zPos + 70);
      this.camera.lookAt(0, 0, zPos);
    } else {
      this.camera.position.set(0, 30, zPos + 70);
      this.camera.lookAt(0, 0, zPos);
    }
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
  new TemporalMissionController();
});
