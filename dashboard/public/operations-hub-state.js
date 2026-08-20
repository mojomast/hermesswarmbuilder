export const ACTIONABLE_REQUEST_STATUSES = new Set(["pending", "claimed"]);
export const ACTIONABLE_QUEUE_STATUSES = new Set(["queued", "pinned", "ready"]);

export function isActionableRequest(request) {
  return !!request && ACTIONABLE_REQUEST_STATUSES.has(request.status);
}

export function deriveOperationsHubState({ state = {}, control = {}, queue = {}, plans = [], plansLoaded = false, runs = [], selectedRunId = null, workflow = "idle" } = {}) {
  const items = Array.isArray(queue.items) ? queue.items : [];
  const pinned = items.find(item => item.id === control.pinnedQueueItemId) || items.find(item => item.status === "pinned");
  const currentRunId = state.currentRunId || null;
  const effectiveSelectedRunId = selectedRunId || currentRunId || runs[0]?.id || null;
  const selectedIsCurrent = !!currentRunId && effectiveSelectedRunId === currentRunId;
  const actionableRequests = [control.nextRunRequest, control.projectLaunchRequest].filter(isActionableRequest);
  const actionableQueue = items.filter(item => ACTIONABLE_QUEUE_STATUSES.has(item.status));
  const pendingPlans = plansLoaded ? plans.filter(plan => !["archived", "completed"].includes(plan.state)).length : null;
  const hold = state.hold || state.block || state.blocker || (control.pause?.requested && control.pause) || (control.stop?.requested && control.stop);
  const holdReason = hold && (hold.reason || hold.message || hold.text) || null;
  const status = state.block || state.blocker || workflow === "blocked" ? "blocked"
    : control.runAdmission === "paused" || state.hold || workflow === "on-hold" ? "on hold"
    : control.stop?.requested ? "stopping"
    : control.pause?.requested ? "pause requested"
    : actionableRequests.length ? "request pending"
    : workflow;
  const hasBlockOrHold = ["blocked", "on hold", "pause requested", "stopping"].includes(status);
  const objective = control.currentObjective?.text || pinned?.objective || state.task || state.currentTask || state.currentProject || "No objective selected yet";
  const safeAction = hasBlockOrHold ? { type: "mission-control", label: "Review blocker" }
    : actionableRequests.length ? { type: "focus-current", label: "Focus actionable request" }
    : currentRunId ? { type: "inspect-run", label: "Inspect current run" }
    : effectiveSelectedRunId ? { type: "inspect-run", label: "Inspect selected run" }
    : actionableQueue.length ? { type: "focus-current", label: "Focus queue" }
    : { type: "project-planner", label: "Open Project Planner" };
  return {
    currentRunId,
    selectedRunId: effectiveSelectedRunId,
    selectedIsCurrent,
    selectedRunLabel: effectiveSelectedRunId ? (selectedIsCurrent ? "Current run" : "Selected historical run") : "No run selected",
    objective,
    holdReason,
    hasBlockOrHold,
    queueCount: actionableQueue.length,
    pendingRequestCount: actionableRequests.length,
    pendingPlans,
    status,
    safeAction,
    actionAvailability: {
      inspectRun: !!effectiveSelectedRunId,
      focusCurrent: !!actionableQueue.length || !!currentRunId || !!effectiveSelectedRunId
    }
  };
}
