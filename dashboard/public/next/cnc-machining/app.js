import {
  createDashboardClient,
  WORKFLOW_PHASES,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

import Alpine from "../../vendor/alpine.js";

// Initialize headless dashboard client
const client = createDashboardClient({ maxEvents: 1000, maxRawMessages: 80 });

// 3D Isometric Toolpath State
let canvas = null;
let ctx = null;
let animFrameId = null;
let orbitAngle = 35;
let toolpathPoints = [];

function generateDefaultToolpath() {
  const pts = [];
  // Spiral pocket milling passes
  for (let t = 0; t < 120; t++) {
    const rad = t * 0.25;
    const r = Math.min(100, t * 1.2);
    const x = Math.cos(rad) * r;
    const y = Math.sin(rad) * (r * 0.75);
    const z = Math.min(30, (t / 120) * 30);
    pts.push({ x, y, z, type: "G01" });
  }
  return pts;
}

toolpathPoints = generateDefaultToolpath();

function initToolpathCanvas(getApp) {
  canvas = document.getElementById("toolpathCanvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");

  function resize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx?.scale(dpr, dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  function render() {
    if (!canvas || !ctx) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const app = getApp();
    if (app.autoRotate) {
      orbitAngle = (orbitAngle + 0.3) % 360;
    }

    const cx = w / 2;
    const cy = h / 2 + 25;
    const rad = (orbitAngle * Math.PI) / 180;

    // Isometric projection helper
    const iso = (x, y, z) => {
      let rx = x;
      let ry = y;
      let rz = z;

      if (app.viewPreset === "top") {
        return { px: cx + x * 1.5, py: cy + y * 1.5 };
      } else if (app.viewPreset === "front") {
        return { px: cx + x * 1.5, py: cy - z * 1.5 };
      } else if (app.viewPreset === "side") {
        return { px: cx + y * 1.5, py: cy - z * 1.5 };
      }

      // Default ISO 3D rotation
      rx = x * Math.cos(rad) - y * Math.sin(rad);
      ry = x * Math.sin(rad) + y * Math.cos(rad);
      return {
        px: cx + (rx - ry) * 0.866,
        py: cy + (rx + ry) * 0.5 - rz * 1.2
      };
    };

    // 1. Grid & Origin Trihedron
    ctx.strokeStyle = "#16202c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -140; i <= 140; i += 35) {
      const p1 = iso(i, -100, 0);
      const p2 = iso(i, 100, 0);
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);

      const p3 = iso(-140, i * 0.7, 0);
      const p4 = iso(140, i * 0.7, 0);
      ctx.moveTo(p3.px, p3.py);
      ctx.lineTo(p4.px, p4.py);
    }
    ctx.stroke();

    // 2. Bounding Stock Billet (Wireframe)
    ctx.strokeStyle = "#273548";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    const corners = [
      [-130, -90, 0], [130, -90, 0], [130, 90, 0], [-130, 90, 0],
      [-130, -90, 50], [130, -90, 50], [130, 90, 50], [-130, 90, 50]
    ].map((c) => iso(...c));

    ctx.beginPath();
    ctx.moveTo(corners[0].px, corners[0].py);
    ctx.lineTo(corners[1].px, corners[1].py);
    ctx.lineTo(corners[2].px, corners[2].py);
    ctx.lineTo(corners[3].px, corners[3].py);
    ctx.closePath();

    ctx.moveTo(corners[4].px, corners[4].py);
    ctx.lineTo(corners[5].px, corners[5].py);
    ctx.lineTo(corners[6].px, corners[6].py);
    ctx.lineTo(corners[7].px, corners[7].py);
    ctx.closePath();

    for (let i = 0; i < 4; i++) {
      ctx.moveTo(corners[i].px, corners[i].py);
      ctx.lineTo(corners[i + 4].px, corners[i + 4].py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Multi-Pass Cutting Trajectories (G01 Green, G00 Yellow, G02/G03 Cyan)
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(34, 197, 94, 0.4)";
    ctx.shadowBlur = 4;
    ctx.beginPath();

    if (toolpathPoints.length > 1) {
      toolpathPoints.forEach((pt, i) => {
        const p = iso(pt.x, pt.y, pt.z);
        if (i === 0) ctx.moveTo(p.px, p.py);
        else ctx.lineTo(p.px, p.py);
      });
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Animated 5-Axis Spindle Head & Cutting Point
    const progress = (Date.now() * 0.05) % (toolpathPoints.length || 1);
    const activePt = toolpathPoints[Math.floor(progress)] || { x: 0, y: 0, z: 20 };
    const head = iso(activePt.x, activePt.y, activePt.z);

    // Spindle Tool Vector (Cyan Cone)
    const spindleTop = iso(activePt.x, activePt.y, activePt.z + 40);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(head.px, head.py);
    ctx.lineTo(spindleTop.px, spindleTop.py);
    ctx.stroke();

    // Spindle Chuck / Holder
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(spindleTop.px, spindleTop.py, 6, 0, Math.PI * 2);
    ctx.fill();

    // Tool Tip Cutting Contact Point (Glowing Emerald / Amber when active)
    ctx.fillStyle = app.isBlocked ? "#ef4444" : "#22c55e";
    ctx.shadowColor = app.isBlocked ? "#ef4444" : "#22c55e";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(head.px, head.py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Chip Ejection Particles if running
    if (app.isRunning) {
      ctx.fillStyle = "#f59e0b";
      for (let s = 0; s < 4; s++) {
        const sx = head.px + (Math.random() * 20 - 10);
        const sy = head.py + (Math.random() * 16 - 8);
        ctx.fillRect(sx, sy, 2, 2);
      }
    }

    animFrameId = requestAnimationFrame(render);
  }
  render();
}

// Alpine Component Definition
window.cncApp = function() {
  let appInstance = null;

  return {
    // Reactive State
    snapshot: client.getSnapshot(),
    machineMode: "auto", // 'auto' | 'mdi' | 'jog' | 'edit'
    selectedWcs: "G54",
    droMode: "ABS",
    unitLabel: "mm",

    // 5-Axis Coordinates
    droX: 42.500,
    droY: 18.200,
    droZ: -4.000,
    droA: 35.000,
    droB: 180.000,

    // Spindle & FRO
    spindleRpm: 14250,
    spindleLoadPct: 42,
    froPct: 100,
    activeToolId: "T01",
    activeToolName: "T01 (LEAD ARCHITECT)",

    // ATC Tool Pockets
    atcTools: [
      { id: "T01", role: "ARCH", name: "Architect Endmill", status: "ready" },
      { id: "T02", role: "CODE", name: "Coder Face-Mill", status: "ready" },
      { id: "T03", role: "TEST", name: "QA Ball-Nose", status: "ready" },
      { id: "T04", role: "REV", name: "Review Reamer", status: "ready" },
      { id: "T05", role: "SHOW", name: "Showcase Chamfer", status: "ready" },
      { id: "T06", role: "SYS", name: "System Probe", status: "ready" }
    ],

    // G-Code Execution Stream Blocks
    gcodeBlocks: [
      { text: "G21 G90 G17 G54 (METRIC ABSOLUTE COORD SYSTEM)", tag: "SETUP" },
      { text: "T01 M06 (SELECT TOOL: ARCHITECT ENGINE)", tag: "ATC" },
      { text: "S14250 M03 (SPINDLE ON CW 14,250 RPM)", tag: "SPINDLE" },
      { text: "G00 X0.000 Y0.000 Z10.000 (RAPID TRAVERSE)", tag: "RAPID" },
      { text: "G01 Z-4.000 F600 (PLUNGE CUTTING PASS)", tag: "CUT" },
      { text: "G01 X42.500 Y18.200 F1200 (SPEC VERIFICATION)", tag: "FEED" },
      { text: "M98 P2001 (CALL SUBROUTINE: DEVPLAN BUILD)", tag: "SUB" },
      { text: "M00 (PROGRAM OPTIONAL STOP: ACCEPTANCE GATE)", tag: "GATE" }
    ],
    activeBlockIndex: 5,
    mdiDirective: "",

    // 3D Viewport Controls
    viewPreset: "iso",
    autoRotate: true,
    toolpathPoints: toolpathPoints,

    // Modals & Workstations
    activeModal: "none",
    telemetrySearch: "",
    telemetryFilter: "all",
    selectedToolEvent: null,

    evidenceTab: "spec",
    loadedDocText: "",
    selectedArtifactName: "",
    loadedArtifactText: "",
    selectedLogName: "",
    loadedLogText: "",
    logTail: 500,

    commandTab: "lifecycle",
    deblockCustomPrompt: "",
    deblockAdviceQuery: "",
    activeAdvice: null,
    newSteeringDirective: "",
    newSteeringScope: "current",
    newQueueTitle: "",
    newQueuePriority: "normal",
    newGateName: "",
    newGateType: "acceptance",
    showcaseLoopCount: 3,

    // CAM Project Plan Editor
    planEditor: {
      planId: "",
      title: "",
      problem: "",
      users: "",
      objectives: "",
      scope: "",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD",
      pipelineType: "classic",
      version: 1,
      expectedVersion: 1
    },

    // Copilot Assistance
    activeAssistanceId: "",
    copilotInputMessage: "",

    // Toasts
    toasts: [],
    toastCounter: 0,

    // Computed Properties via Getters
    get activeProgramName() {
      return this.snapshot.selectedRunId ? `O${this.snapshot.selectedRunId.slice(-4).toUpperCase()}.NC` : "O1001.NC";
    },

    get isRunning() {
      return this.snapshot.connection?.status === "connected" && !this.snapshot.connection?.paused && !this.isBlocked;
    },

    get isPaused() {
      return !!this.snapshot.connection?.paused || this.snapshot.control?.hold;
    },

    get isBlocked() {
      const s = this.snapshot.state;
      return !!(s?.block || s?.blocker || s?.hold || this.snapshot.control?.hold);
    },

    get blockerDetails() {
      const s = this.snapshot.state;
      if (!s) return "";
      const b = s.blocker || s.block;
      if (!b) return "";
      return typeof b === "string" ? b : b.message || b.reason || JSON.stringify(b);
    },

    get filteredEvents() {
      const list = this.snapshot.events || [];
      const q = this.telemetrySearch.trim().toLowerCase();
      const filter = this.telemetryFilter;

      return list.filter((ev) => {
        if (filter === "tools" && !String(ev.type).includes("tool") && !ev.data?.toolName) return false;
        if (filter === "errors" && ev.level !== "error" && !String(ev.type).includes("error") && !ev.data?.error) return false;
        if (filter === "state" && !String(ev.type).includes("phase") && !String(ev.type).includes("state") && ev.type !== "event") return false;
        if (filter === "artifacts" && !String(ev.type).includes("artifact") && !ev.data?.artifact) return false;

        if (!q) return true;
        const dump = `${ev.type} ${ev.message} ${ev.agentId} ${ev.source} ${JSON.stringify(ev.data || {})}`.toLowerCase();
        return dump.includes(q);
      });
    },

    get toolCallEvents() {
      return (this.snapshot.events || []).filter(
        (ev) => String(ev.type).includes("tool") || !!ev.data?.toolName || !!ev.data?.toolCallId
      );
    },

    get currentThreadMessages() {
      const thread = this.snapshot.assistanceDetail;
      if (!thread || thread.id !== this.activeAssistanceId) return [];
      return thread.messages || [];
    },

    get activeAssistanceProposal() {
      const thread = this.snapshot.assistanceDetail;
      if (!thread || thread.id !== this.activeAssistanceId) return null;
      return thread.proposedContent || null;
    },

    // Initialization
    init() {
      appInstance = this;

      // Subscribe to client updates
      client.subscribe((snap) => {
        this.snapshot = snap;
        this.updateDroTelemetry(snap);
      });

      // Connect SSE
      client.connect().catch((err) => {
        console.warn("CNC DNC initial connect caught:", err);
      });

      // Init 3D Toolpath Viewport
      initToolpathCanvas(() => this);
    },

    // DRO Updates
    updateDroTelemetry(snap) {
      const eventsCount = snap.events?.length || 0;
      this.droX = Math.min(100, eventsCount * 0.65);
      this.droY = Math.min(50, (eventsCount % 25) * 2.0);
      const activeAgentsCount = Object.keys(snap.state?.agents || {}).length || 2;
      this.droZ = -activeAgentsCount * 2.0;
      this.spindleLoadPct = Math.min(140, Math.max(15, activeAgentsCount * 22 + (Math.random() * 8 - 4)));

      // Add dynamic G-code line from latest event
      if (snap.events?.length) {
        const latest = snap.events[snap.events.length - 1];
        const blockText = `G01 (AGENT: ${latest.agentId || 'SYS'}) [TASK: ${latest.type || 'EXEC'}] F${Math.round(1200 * (this.froPct / 100))}`;
        if (!this.gcodeBlocks.some((b) => b.text === blockText)) {
          this.gcodeBlocks.push({ text: blockText, tag: "EXEC" });
          if (this.gcodeBlocks.length > 50) this.gcodeBlocks.shift();
          this.activeBlockIndex = this.gcodeBlocks.length - 1;
        }
      }
    },

    formatCoordinate(val) {
      const num = Number(val) || 0;
      const sign = num >= 0 ? "+" : "-";
      return `${sign}${Math.abs(num).toFixed(3).padStart(7, "0")}`;
    },

    formatAngle(val) {
      const num = Number(val) || 0;
      const sign = num >= 0 ? "+" : "-";
      return `${sign}${Math.abs(num).toFixed(3).padStart(7, "0")}°`;
    },

    formatTime(iso) {
      if (!iso) return "--:--:--";
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleTimeString([], { hour12: false });
    },

    formatDate(iso) {
      if (!iso) return "Not recorded";
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    },

    toast(msg, type = "info") {
      const id = ++this.toastCounter;
      this.toasts.push({ id, msg, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 4000);
    },

    copyText(text) {
      if (!text) return;
      navigator.clipboard?.writeText(text).then(() => {
        this.toast("Copied to clipboard", "info");
      }).catch(() => {
        this.toast("Clipboard copy failed", "warn");
      });
    },

    // 3D View Controls
    setViewPreset(preset) {
      this.viewPreset = preset;
      if (preset !== "iso") this.autoRotate = false;
      this.toast(`View oriented to ${preset.toUpperCase()} projection`, "info");
    },

    selectToolPocket(toolId) {
      this.activeToolId = toolId;
      const found = this.atcTools.find((t) => t.id === toolId);
      this.activeToolName = `${toolId} (${found?.name || found?.role || "TOOL"})`;
      this.toast(`ATC Indexing: Pocket ${toolId} mounted in spindle`, "info");
    },

    // Client Stream & Run Management
    togglePauseStream() {
      if (this.snapshot.connection?.paused) {
        client.resume();
        this.toast("DNC bus feed resumed", "info");
      } else {
        client.pause();
        this.toast("DNC bus feed held", "warn");
      }
    },

    async refreshAll() {
      try {
        await client.refresh();
        this.toast("DNC memory & registries re-synchronized", "info");
      } catch (err) {
        this.toast(`DNC sync error: ${err.message}`, "error");
      }
    },

    toggleConnection() {
      if (this.snapshot.connection?.status === "disconnected") {
        client.connect();
        this.toast("Connecting DNC bus to controller...", "info");
      } else {
        client.disconnect();
        this.toast("DNC bus disconnected", "warn");
      }
    },

    async onRunChange(runId) {
      if (!runId) return;
      try {
        await client.selectRun(runId);
        this.toast(`Target part program assigned to Run ${runId}`, "info");
      } catch (err) {
        this.toast(`Select run error: ${err.message}`, "error");
      }
    },

    // Modals
    openModal(modalName, tab = null) {
      this.activeModal = modalName;
      if (modalName === "evidence") {
        if (tab) this.evidenceTab = tab;
        if (this.evidenceTab === "spec") this.loadSpecDocument();
        else if (this.evidenceTab === "devplan") this.loadDevplanDocument();
      } else if (modalName === "command") {
        if (tab) this.commandTab = tab;
      } else if (modalName === "planner") {
        client.refreshPlans();
      } else if (modalName === "copilot") {
        client.listPlanAssistance().then((res) => {
          const items = res?.items || [];
          if (items.length && !this.activeAssistanceId) {
            this.selectAssistanceThread(items[0].id);
          }
        });
      }
    },

    closeModal() {
      this.activeModal = "none";
      this.selectedToolEvent = null;
    },

    inspectToolCall(ev) {
      this.selectedToolEvent = ev;
      this.activeModal = "toolInspector";
    },

    // Hard-Key Controls
    async cycleStart() {
      try {
        await client.command("run-now", {}, { refresh: true });
        this.toast("CYCLE START: Motion sequence executed", "info");
      } catch (err) {
        this.toast(`Cycle Start error: ${err.message}`, "error");
      }
    },

    feedHold() {
      client.pause();
      this.toast("FEED HOLD: Axes halted at current block", "warn");
    },

    async emergencyStop() {
      try {
        await client.command("stop", {}, { refresh: true });
        this.toast("EMERGENCY STOP (E-STOP) LATCHED", "error");
      } catch (err) {
        this.toast(`E-Stop error: ${err.message}`, "error");
      }
    },

    async executeMdiSteer() {
      const directive = this.mdiDirective.trim();
      if (!directive) return this.toast("Enter MDI directive block", "warn");
      try {
        await client.command("steer", { directive, scope: "current" }, { refresh: true });
        this.toast(`MDI EXECUTED: "${directive}"`, "info");
        this.mdiDirective = "";
      } catch (err) {
        this.toast(`MDI execution error: ${err.message}`, "error");
      }
    },

    async executeCommand(type, payload = {}) {
      try {
        const res = await client.command(type, payload, { refresh: true });
        this.toast(`M-CODE [${type.toUpperCase()}] executed`, "info");
        return res;
      } catch (err) {
        this.toast(`Command [${type}] failed: ${err.message}`, "error");
        throw err;
      }
    },

    // Deblock & Recovery Suite
    async sendDeblockPrompt() {
      const prompt = this.deblockCustomPrompt.trim();
      if (!prompt) return this.toast("Enter recovery instructions", "warn");
      try {
        await client.command("deblock", { prompt }, { refresh: true });
        this.toast("Toolpath recovery override dispatched", "info");
        this.deblockCustomPrompt = "";
      } catch (err) {
        this.toast(`Deblock error: ${err.message}`, "error");
      }
    },

    async queryDeblockAdvice() {
      const query = this.deblockAdviceQuery.trim();
      try {
        const res = await client.command("deblock-advice", { query: query || "Resolve active axis interlock" });
        this.activeAdvice = res?.advice || res || { text: "Re-align toolpath vectors and resume cycle start." };
        this.toast("Hermes CAM Deblock Advisory received", "info");
      } catch (err) {
        this.toast(`Deblock advice error: ${err.message}`, "error");
      }
    },

    async approveAdvice() {
      try {
        await client.command("approve-deblock-advice", { adviceId: this.activeAdvice?.id || "default" }, { refresh: true });
        this.toast("Deblock advice approved & alarm reset", "info");
        this.activeAdvice = null;
      } catch (err) {
        this.toast(`Approve advice error: ${err.message}`, "error");
      }
    },

    async denyAdvice() {
      try {
        await client.command("deny-deblock-advice", { adviceId: this.activeAdvice?.id || "default" }, { refresh: true });
        this.toast("Deblock advice dismissed", "warn");
        this.activeAdvice = null;
      } catch (err) {
        this.toast(`Deny advice error: ${err.message}`, "error");
      }
    },

    async addSteering() {
      const directive = this.newSteeringDirective.trim();
      if (!directive) return this.toast("Enter steering directive", "warn");
      try {
        await client.command("steer", { directive, scope: this.newSteeringScope }, { refresh: true });
        this.toast("Steering directive added to CAM controller", "info");
        this.newSteeringDirective = "";
      } catch (err) {
        this.toast(`Add steering error: ${err.message}`, "error");
      }
    },

    async removeSteering(steeringId) {
      try {
        await client.command("remove-steering", { steeringId }, { refresh: true });
        this.toast("Steering directive removed", "info");
      } catch (err) {
        this.toast(`Remove steering error: ${err.message}`, "error");
      }
    },

    // Showcase Loop
    async startShowcaseLoop() {
      try {
        await client.command("start-showcase-loop", { maxIterations: this.showcaseLoopCount }, { refresh: true });
        this.toast(`5-Axis Showcase Loop started (${this.showcaseLoopCount} passes)`, "info");
      } catch (err) {
        this.toast(`Start showcase loop error: ${err.message}`, "error");
      }
    },

    async pauseShowcaseLoop() {
      try {
        await client.command("pause-showcase-loop", {}, { refresh: true });
        this.toast("Showcase loop paused", "warn");
      } catch (err) {
        this.toast(`Pause showcase loop error: ${err.message}`, "error");
      }
    },

    async resumeShowcaseLoop() {
      try {
        await client.command("resume-showcase-loop", {}, { refresh: true });
        this.toast("Showcase loop resumed", "info");
      } catch (err) {
        this.toast(`Resume showcase loop error: ${err.message}`, "error");
      }
    },

    async stopShowcaseLoop() {
      try {
        await client.command("stop-showcase-loop", {}, { refresh: true });
        this.toast("Showcase loop stopped", "warn");
      } catch (err) {
        this.toast(`Stop showcase loop error: ${err.message}`, "error");
      }
    },

    async setShowcaseTarget() {
      try {
        await client.command("set-showcase-target", { maxIterations: this.showcaseLoopCount }, { refresh: true });
        this.toast(`Showcase passes set to ${this.showcaseLoopCount}`, "info");
      } catch (err) {
        this.toast(`Set showcase target error: ${err.message}`, "error");
      }
    },

    // Part Queue
    async addQueueItem() {
      const title = this.newQueueTitle.trim();
      if (!title) return this.toast("Enter part program title", "warn");
      try {
        await client.command("add-queue-item", {
          title,
          objective: title,
          priority: this.newQueuePriority
        }, { refresh: true });
        this.toast("Part job enqueued to spindle backlog", "info");
        this.newQueueTitle = "";
      } catch (err) {
        this.toast(`Enqueue part error: ${err.message}`, "error");
      }
    },

    async pinQueueItem(itemId) {
      try {
        await client.command("pin-queue-item", { itemId }, { refresh: true });
        this.toast(`Part job #${itemId} pinned as primary machining target`, "info");
      } catch (err) {
        this.toast(`Pin part error: ${err.message}`, "error");
      }
    },

    async archiveQueueItem(itemId) {
      try {
        await client.command("archive-queue-item", { itemId }, { refresh: true });
        this.toast(`Part job #${itemId} archived`, "info");
      } catch (err) {
        this.toast(`Archive part error: ${err.message}`, "error");
      }
    },

    async clearQueue() {
      if (!confirm("Clear entire part machining queue?")) return;
      try {
        await client.command("clear-queue", {}, { refresh: true });
        this.toast("Part queue flushed", "warn");
      } catch (err) {
        this.toast(`Clear queue error: ${err.message}`, "error");
      }
    },

    // Go / No-Go Gauges
    async addGate() {
      const name = this.newGateName.trim();
      if (!name) return this.toast("Enter gauge name", "warn");
      try {
        await client.command("add-gate", {
          name,
          gateType: this.newGateType,
          description: `Tolerance gauge for ${name}`
        }, { refresh: true });
        this.toast(`Tolerance gauge "${name}" registered`, "info");
        this.newGateName = "";
      } catch (err) {
        this.toast(`Add gauge error: ${err.message}`, "error");
      }
    },

    async makeGateDecision(gateId, decision, rationale = "") {
      try {
        await client.command("gate-decision", {
          gateId,
          decision,
          rationale: rationale || `CMM tolerance evaluation: ${decision}`
        }, { refresh: true });
        this.toast(`Gauge decision [${decision.toUpperCase()}] logged`, "info");
      } catch (err) {
        this.toast(`Gauge decision error: ${err.message}`, "error");
      }
    },

    async attachGateEvidence(gateId) {
      const evidence = prompt("Enter CMM inspection report / artifact URI:");
      if (!evidence) return;
      try {
        await client.command("attach-gate-evidence", { gateId, evidence }, { refresh: true });
        this.toast("CMM evidence attached to gauge", "info");
      } catch (err) {
        this.toast(`Attach evidence error: ${err.message}`, "error");
      }
    },

    // Evidence & Documents
    async loadSpecDocument() {
      this.evidenceTab = "spec";
      this.loadedDocText = "Loading blueprint SPEC.md...";
      try {
        const doc = await client.loadDocument("spec");
        this.loadedDocText = doc?.text || "Empty blueprint specification.";
      } catch (err) {
        this.loadedDocText = `Blueprint document not found: ${err.message}`;
      }
    },

    async loadDevplanDocument() {
      this.evidenceTab = "devplan";
      this.loadedDocText = "Loading toolpath DEVPLAN.md...";
      try {
        const doc = await client.loadDocument("devplan");
        this.loadedDocText = doc?.text || "Empty toolpath plan.";
      } catch (err) {
        this.loadedDocText = `Toolpath plan not found: ${err.message}`;
      }
    },

    async loadArtifactContent(name) {
      this.selectedArtifactName = name;
      this.loadedArtifactText = "Loading machined artifact...";
      try {
        const res = await client.loadArtifact(name);
        this.loadedArtifactText = res?.text || "Empty artifact payload.";
      } catch (err) {
        this.loadedArtifactText = `Error loading artifact: ${err.message}`;
      }
    },

    async loadLogContent(name) {
      this.selectedLogName = name;
      this.loadedLogText = "Loading machine log tail...";
      try {
        const res = await client.loadLog(name, this.snapshot.selectedRunId, { tail: this.logTail });
        this.loadedLogText = res?.text || "Empty log stream.";
      } catch (err) {
        this.loadedLogText = `Error loading log: ${err.message}`;
      }
    },

    async reloadSelectedLog() {
      if (this.selectedLogName) {
        await this.loadLogContent(this.selectedLogName);
      }
    },

    async selectIteration(iterationId) {
      try {
        await client.selectIteration(iterationId);
        this.toast(`Iteration #${iterationId} loaded`, "info");
      } catch (err) {
        this.toast(`Select iteration error: ${err.message}`, "error");
      }
    },

    // CAM Project Planning
    openNewPlanModal() {
      this.planEditor.planId = "";
      this.planEditor.title = "";
      this.planEditor.problem = "";
      this.planEditor.users = "";
      this.planEditor.objectives = "";
      this.planEditor.scope = "";
      this.planEditor.repoPath = "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder";
      this.planEditor.baseRef = "HEAD";
      this.planEditor.pipelineType = "classic";
      this.planEditor.version = 1;
      this.planEditor.expectedVersion = 1;
      this.openModal("planner");
    },

    async selectPlanForEdit(planId) {
      try {
        const res = await client.getProjectPlan(planId);
        const ledger = res?.ledger || res;
        this.planEditor.planId = ledger.planId || planId;
        this.planEditor.title = ledger.title || "";
        this.planEditor.problem = ledger.problem || "";
        this.planEditor.users = Array.isArray(ledger.users) ? ledger.users.join(", ") : (ledger.users || "");
        this.planEditor.objectives = Array.isArray(ledger.objectives) ? ledger.objectives.join("\n") : (ledger.objectives || "");
        this.planEditor.scope = ledger.scope || "";
        this.planEditor.repoPath = ledger.repoPath || "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder";
        this.planEditor.baseRef = ledger.baseRef || "HEAD";
        this.planEditor.pipelineType = ledger.pipelineType || "classic";
        this.planEditor.version = ledger.version || 1;
        this.planEditor.expectedVersion = ledger.version || 1;
      } catch (err) {
        this.toast(`Load plan error: ${err.message}`, "error");
      }
    },

    async savePlanDraft() {
      const payload = {
        title: this.planEditor.title || "Untitled NC Part Program",
        problem: this.planEditor.problem,
        users: this.planEditor.users.split(",").map((u) => u.trim()).filter(Boolean),
        objectives: this.planEditor.objectives.split("\n").map((o) => o.trim()).filter(Boolean),
        scope: this.planEditor.scope,
        repoPath: this.planEditor.repoPath,
        baseRef: this.planEditor.baseRef,
        pipelineType: this.planEditor.pipelineType
      };

      try {
        if (!this.planEditor.planId) {
          const created = await client.createProjectPlan(payload, { refresh: true });
          this.planEditor.planId = created?.planId || "";
          this.toast("NC Part Program drafted in CAM registry", "info");
        } else {
          await client.updateProjectPlan(
            { planId: this.planEditor.planId, ...payload },
            { expectedVersion: this.planEditor.expectedVersion, refresh: true }
          );
          this.toast(`NC Program ${this.planEditor.planId} updated`, "info");
        }
        await client.refreshPlans();
      } catch (err) {
        this.toast(`Save NC program error: ${err.message}`, "error");
      }
    },

    async submitPlanReview() {
      if (!this.planEditor.planId) return;
      try {
        await client.submitProjectPlanForReview(
          { planId: this.planEditor.planId },
          { expectedVersion: this.planEditor.expectedVersion, refresh: true }
        );
        this.toast(`NC Program ${this.planEditor.planId} submitted for CAM review`, "info");
        await this.selectPlanForEdit(this.planEditor.planId);
      } catch (err) {
        this.toast(`Submit review error: ${err.message}`, "error");
      }
    },

    async approvePlan() {
      if (!this.planEditor.planId) return;
      try {
        await client.approveProjectPlan(
          { planId: this.planEditor.planId },
          { expectedVersion: this.planEditor.expectedVersion, refresh: true }
        );
        this.toast(`NC Program ${this.planEditor.planId} APPROVED`, "info");
        await this.selectPlanForEdit(this.planEditor.planId);
      } catch (err) {
        this.toast(`Approve plan error: ${err.message}`, "error");
      }
    },

    async rejectPlan() {
      if (!this.planEditor.planId) return;
      const rationale = prompt("Enter CAM rejection rationale:");
      if (!rationale) return;
      try {
        await client.rejectProjectPlan(
          { planId: this.planEditor.planId, rationale },
          { expectedVersion: this.planEditor.expectedVersion, refresh: true }
        );
        this.toast(`NC Program ${this.planEditor.planId} rejected`, "warn");
        await this.selectPlanForEdit(this.planEditor.planId);
      } catch (err) {
        this.toast(`Reject plan error: ${err.message}`, "error");
      }
    },

    async launchPlan() {
      if (!this.planEditor.planId) return;
      try {
        await client.launchProjectPlan(
          { planId: this.planEditor.planId },
          { expectedVersion: this.planEditor.expectedVersion, refresh: true }
        );
        this.toast(`🚀 NC Program ${this.planEditor.planId} POSTED & LAUNCHED TO MACHINE SPINDLE`, "info");
        this.closeModal();
      } catch (err) {
        this.toast(`Launch plan error: ${err.message}`, "error");
      }
    },

    async clonePlan() {
      if (!this.planEditor.planId) return;
      try {
        const cloned = await client.cloneProjectPlan({ planId: this.planEditor.planId }, { refresh: true });
        this.toast(`NC Program cloned to ${cloned?.planId || "new instance"}`, "info");
        await client.refreshPlans();
      } catch (err) {
        this.toast(`Clone plan error: ${err.message}`, "error");
      }
    },

    async forkPlan() {
      if (!this.planEditor.planId) return;
      try {
        const forked = await client.forkProjectPlan(
          { planId: this.planEditor.planId, version: this.planEditor.version },
          { refresh: true }
        );
        this.toast(`NC Program forked to rev v${forked?.version || (this.planEditor.version + 1)}`, "info");
        await client.refreshPlans();
      } catch (err) {
        this.toast(`Fork plan error: ${err.message}`, "error");
      }
    },

    async archivePlan() {
      if (!this.planEditor.planId) return;
      if (!confirm(`Archive NC Part Program ${this.planEditor.planId}?`)) return;
      try {
        await client.archiveProjectPlan({ planId: this.planEditor.planId }, { refresh: true });
        this.toast(`NC Program ${this.planEditor.planId} archived`, "info");
        this.openNewPlanModal();
        await client.refreshPlans();
      } catch (err) {
        this.toast(`Archive plan error: ${err.message}`, "error");
      }
    },

    // Copilot Assistance
    async createAssistanceThread(pipelineType = "classic") {
      try {
        const thread = await client.createPlanAssistance(pipelineType);
        this.activeAssistanceId = thread.id;
        this.toast(`Started new ${pipelineType.toUpperCase()} CAM Copilot thread`, "info");
      } catch (err) {
        this.toast(`Create thread error: ${err.message}`, "error");
      }
    },

    async selectAssistanceThread(threadId) {
      this.activeAssistanceId = threadId;
      try {
        await client.getPlanAssistance(threadId);
      } catch (err) {
        this.toast(`Load thread error: ${err.message}`, "error");
      }
    },

    async sendCopilotMessage() {
      const msg = this.copilotInputMessage.trim();
      if (!msg) return;
      if (!this.activeAssistanceId) {
        await this.createAssistanceThread("classic");
      }
      const thread = this.snapshot.assistanceDetail;
      const expectedVersion = thread?.version || 1;

      this.copilotInputMessage = "";
      try {
        await client.messagePlanAssistance(this.activeAssistanceId, expectedVersion, msg);
        this.toast("Transmitted to Hermes CAM Copilot", "info");
        setTimeout(() => {
          const logEl = document.getElementById("copilotChatLog");
          if (logEl) logEl.scrollTop = logEl.scrollHeight;
        }, 50);
      } catch (err) {
        this.toast(`Copilot error: ${err.message}`, "error");
      }
    },

    applyCopilotProposal() {
      const prop = this.activeAssistanceProposal;
      if (!prop) return;
      this.planEditor.title = prop.title || this.planEditor.title || "Hermes Optimized Part Program";
      this.planEditor.problem = prop.problem || this.planEditor.problem;
      this.planEditor.users = Array.isArray(prop.users) ? prop.users.join(", ") : (prop.users || this.planEditor.users);
      this.planEditor.objectives = Array.isArray(prop.objectives) ? prop.objectives.join("\n") : (prop.objectives || this.planEditor.objectives);
      this.planEditor.scope = prop.scope || this.planEditor.scope;
      this.planEditor.pipelineType = prop.pipelineType || this.planEditor.pipelineType;
      this.openModal("planner");
      this.toast("CAM proposal merged into Program Editor", "info");
    },

    // Keyboard Shortcuts
    handleKeydown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
        if (e.key === "Escape") {
          e.target.blur();
          this.closeModal();
        }
        return;
      }

      if (e.key === "Escape") {
        if (this.activeModal !== "none") {
          this.closeModal();
        } else {
          this.emergencyStop();
        }
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        this.cycleStart();
      } else if (e.key.toLowerCase() === "h") {
        this.feedHold();
      } else if (e.key.toLowerCase() === "p") {
        this.openModal("planner");
      } else if (e.key.toLowerCase() === "c") {
        this.openModal("command");
      } else if (e.key.toLowerCase() === "t") {
        this.openModal("telemetry");
      } else if (e.key.toLowerCase() === "e") {
        this.openModal("evidence");
      } else if (e.key.toLowerCase() === "a") {
        this.openModal("copilot");
      } else if (e.key === "?" || e.key === "/") {
        this.openModal("help");
      }
    }
  };
};

Alpine.start();
