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
