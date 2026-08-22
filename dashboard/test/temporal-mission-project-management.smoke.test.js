import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

const dashboardRoot = resolve(import.meta.dir, "..");

test("Temporal Mission project workspace uses live assistance and durable plan commands instead of success alerts", async () => {
  const source = await Bun.file(join(dashboardRoot, "public/control-planes/temporal-mission/temporal-mission.js")).text();

  const html = await Bun.file(join(dashboardRoot, "public/control-planes/temporal-mission/index.html")).text();
  expect(html).toContain('id="btn-project-mission-control"');
  expect(html).toContain('id="project-mission-drawer"');
  expect(html).toContain('id="project-mission-drawer-content"');
  expect(source).toContain("renderProjectWorkspace()");
  expect(source).toContain("this.el.projectDrawer?.showModal()");
  expect(source).toContain("this.el.projectDrawerContent.innerHTML");
  expect(source).toContain("this.client.createPlanAssistance(pipelineType)");
  expect(source).toContain("this.client.sendPlanAssistanceMessage(assistance.id, assistance.version, message)");
  expect(source).toContain("this.client.createPlan(assistance.proposedContent)");
  expect(source).toContain("this.client.getProjectPlanDetail(planId)");
  expect(source).toContain("this.client.dispatchPlanCommand(action, payload, ledger.version)");
  expect(source).toContain('"withdraw-launch"');
  expect(source).toContain("sourceIterationId");
  expect(source).toContain("sourceRunId");
  expect(source).not.toContain('alert("Continuation plan draft created in state/project-plans/.")');
  expect(source).not.toContain('alert("Fork draft plan created in state/project-plans/.")');
});

test("Temporal Mission separates project management, planning interview/review, and swarm agent drawers", async () => {
  const source = await Bun.file(join(dashboardRoot, "public/control-planes/temporal-mission/temporal-mission.js")).text();
  const html = await Bun.file(join(dashboardRoot, "public/control-planes/temporal-mission/index.html")).text();

  expect(html).toContain('id="btn-swarm-agent"');
  expect(html).toContain('id="planning-interview-drawer"');
  expect(html).toContain('id="planning-review-drawer"');
  expect(html).toContain('id="swarm-agent-drawer"');
  expect(source).toContain('["overview", "Overview"]');
  expect(source).toContain('["plans", "Plans"]');
  expect(source).toContain('["lifecycle", "Lifecycle"]');
  expect(source).toContain('["lineage", "Lineage"]');
  expect(html).toContain('agent answers/control swarm only, cannot edit code/files');

  expect(source).toContain("openPlanningInterview(");
  expect(source).toContain("openPlanningReview(");
  expect(source).toContain("openSwarmAgent(");
  expect(source).toContain("this.client.createSwarmAgentSession(");
  expect(source).toContain("this.client.getSwarmAgentSession(");
  expect(source).toContain("this.client.sendSwarmAgentMessage(");
  expect(source).toContain("this.client.executeSwarmAgentAction(");
  expect(source).toContain("Continue to Plan Review");
  expect(source).toContain("Create draft from proposed plan");
  expect(source).toContain("Confirm action");
  expect(source).not.toContain("Create devplan-ready draft from live proposal");
});
