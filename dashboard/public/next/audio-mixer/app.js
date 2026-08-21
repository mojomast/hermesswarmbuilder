import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { reactive, ref, shallowRef } from "../../vendor/vue.js";

const $ = (id) => document.getElementById(id);
const client = createDashboardClient({ maxEvents: 1000 });

// Full client method bindings for complete feature coverage
const actions = {
  selectRun: (runId) => client.selectRun(runId),
  selectIteration: (iterationId) => client.selectIteration(iterationId),
  loadArtifact: (runId, path) => client.loadArtifact(runId, path),
  loadLog: (runId, path) => client.loadLog(runId, path),
  loadDocument: (runId, type) => client.loadDocument(runId, type),
  getProjectPlan: (planId) => client.getProjectPlan(planId),
  listPlanAssistance: () => client.listPlanAssistance(),
  createProjectPlan: (data) => client.createProjectPlan(data),
  updateProjectPlan: (planId, data) => client.updateProjectPlan(planId, data),
  submitProjectPlanForReview: (planId, expectedVersion) => client.submitProjectPlanForReview(planId, expectedVersion),
  approveProjectPlan: (planId, expectedVersion) => client.approveProjectPlan(planId, expectedVersion),
  rejectProjectPlan: (planId, expectedVersion) => client.rejectProjectPlan(planId, expectedVersion),
  launchProjectPlan: (planId, expectedVersion) => client.launchProjectPlan(planId, expectedVersion),
  cloneProjectPlan: (planId) => client.cloneProjectPlan(planId),
  forkProjectPlan: (planId, version) => client.forkProjectPlan(planId, version),
  archiveProjectPlan: (planId) => client.archiveProjectPlan(planId)
};

const snapshot = shallowRef(client.getSnapshot());

const channels = reactive([
  { id: "ch1", name: "CH 1", role: "ARCHITECT", fader: 75, solo: false, cut: false, peak: 45 },
  { id: "ch2", name: "CH 2", role: "CODER", fader: 80, solo: false, cut: false, peak: 65 },
  { id: "ch3", name: "CH 3", role: "TESTER", fader: 60, solo: false, cut: false, peak: 30 },
  { id: "ch4", name: "CH 4", role: "REVIEWER", fader: 50, solo: false, cut: false, peak: 50 },
  { id: "ch5", name: "CH 5", role: "SHOWCASE", fader: 40, solo: false, cut: false, peak: 20 },
  { id: "ch6", name: "CH 6", role: "SYS-BUS", fader: 70, solo: false, cut: false, peak: 40 }
]);

function toast(msg, type = "info") {
  const el = $("amToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#064e3b";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Render Channel Strips
function renderChannelStrips() {
  const bay = $("channelBay");
  if (!bay) return;

  bay.innerHTML = channels.map((ch, idx) => `
    <div class="am-channel-strip" id="${ch.id}">
      <div style="font-size:9px;font-weight:800;text-align:center;color:#64748b;">${ch.name}</div>
      <div class="am-rotary-knob" title="Gain Trim"><div class="am-knob-indicator"></div></div>
      <div class="am-rotary-knob" title="Comp Ratio" style="border-color:#f59e0b;"><div class="am-knob-indicator" style="background:#f59e0b;"></div></div>
      <div class="am-rotary-knob" title="HF EQ" style="border-color:#10b981;"><div class="am-knob-indicator" style="background:#10b981;"></div></div>
      <div class="am-rotary-knob" title="LF EQ" style="border-color:#10b981;"><div class="am-knob-indicator" style="background:#10b981;"></div></div>
      <div class="am-rotary-knob" title="Pan"><div class="am-knob-indicator" style="top:3px;left:13px;"></div></div>

      <div class="am-strip-switches">
        <button class="am-btn-switch solo ${ch.solo ? 'active' : ''}" onclick="window.__toggleSolo(${idx})">SOLO</button>
        <button class="am-btn-switch cut ${ch.cut ? 'active' : ''}" onclick="window.__toggleCut(${idx})">CUT</button>
      </div>

      <div class="am-scribble">${ch.role}</div>

      <div class="am-fader-track" onclick="window.__faderClick(event, ${idx})">
        <div class="am-fader-slot"></div>
        <div class="am-fader-cap" style="bottom:${ch.fader}%;"></div>
      </div>
    </div>
  `).join("");
}

window.__toggleSolo = (idx) => {
  channels[idx].solo = !channels[idx].solo;
  renderChannelStrips();
  toast(`${channels[idx].name} Solo: ${channels[idx].solo ? 'ON' : 'OFF'}`, "info");
};

window.__toggleCut = (idx) => {
  channels[idx].cut = !channels[idx].cut;
  renderChannelStrips();
  toast(`${channels[idx].name} Mute: ${channels[idx].cut ? 'ON' : 'OFF'}`, "warn");
};

window.__faderClick = (e, idx) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const pct = Math.max(0, Math.min(100, Math.round((1 - (clickY / rect.height)) * 100)));
  channels[idx].fader = pct;
  renderChannelStrips();
};

// Meter Bridge Animation
function animateMeters() {
  channels.forEach((ch, idx) => {
    const el = $(`meterCh${idx + 1}`)?.querySelector(".am-meter-bar");
    if (el) {
      const wobble = ch.cut ? 0 : Math.max(5, Math.min(95, ch.peak + (Math.random() * 12 - 6)));
      el.style.setProperty("--meter-level", `${wobble}%`);
    }
  });
  requestAnimationFrame(animateMeters);
}

// Push-to-Talk Slate Intercom
$("btnPushToTalk")?.addEventListener("click", async () => {
  const input = $("slateDirectiveInput");
  const directive = input?.value?.trim();
  if (!directive) return toast("Enter steering directive before pushing PTT", "warn");
  try {
    await client.command("steer", { directive, scope: "current" });
    toast(`SLATE BROADCAST: "${directive}" injected`, "info");
    if (input) input.value = "";
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockIntercom")?.addEventListener("click", async () => {
  const prompt = window.prompt("Enter deblock instructions for console summing bus:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Summing bus deblocked", "info");
  } catch (e) { toast(e.message, "error"); }
});

// Transport Controls
$("btnTransportPause")?.addEventListener("click", () => {
  client.pause();
  toast("Summing engine paused", "warn");
});
$("btnTransportResume")?.addEventListener("click", () => {
  client.resume();
  toast("Summing engine active", "info");
});
$("btnTransportWake")?.addEventListener("click", async () => {
  try {
    await client.command("run-now");
    toast("Immediate tick triggered", "info");
  } catch (e) { toast(e.message, "error"); }
});
$("btnTransportStop")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("EMERGENCY CONSOLE CUT", "error");
  } catch (e) { toast(e.message, "error"); }
});

// Total Recall Project Plans
$("btnNewSessionPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Session Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Audio mixing desk balance",
      users: "sound-engineers",
      objectives: "Verify console channel summing and meters",
      scope: "Master mixer",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Session plan saved to Total Recall", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("recallPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#05070a;border:1px solid #1a222c;padding:5px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:#10b981;">${p.status || 'draft'}</span>
      </div>
      <small style="color:#64748b;">${p.pipelineType || 'classic'} • v${p.version || 1}</small>
    </div>
  `).join("");
}

// Client Subscription
client.subscribe((snap) => {
  snapshot.value = snap;
  const phase = snap.state?.phase || "idle";

  const runEl = $("masterRunId");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";
  const phaseEl = $("phaseBadge");
  if (phaseEl) phaseEl.textContent = phase.toUpperCase();

  renderPlans(snap);
});

client.connect();
client.refresh();
renderChannelStrips();
requestAnimationFrame(animateMeters);
