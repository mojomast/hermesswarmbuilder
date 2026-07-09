# Bounded Autonomous Creative Iteration Loop

Purpose: let agents improve a creative product through evidence-backed generations without drifting into feature pileups. The loop intentionally alternates divergent exploration (3-5 variants) with convergent selection and synthesis, borrowing from Double Diamond / design sprint practice and iterative UI testing: define the target, prototype alternatives, evaluate with evidence, refine locally, and stop when learning plateaus.

## Core invariants

- Start from a one-sentence objective and 3-5 acceptance criteria.
- Generate **3-5 variants per generation**; fewer loses divergence, more dilutes review quality.
- Compare using screenshots, diffs, test output, and short rationale. Do not decide from prose alone.
- Mash up only the strongest compatible features into the next generation.
- Per generation integration budget:
  - **2-4 accepted features max**.
  - **1 visual motif change max**.
  - **1 new section/screen max**.
  - **0 unrelated features**.
  - **0 tech-stack churn** unless it directly solves the objective and is justified in writing.
- Preserve readability, performance, accessibility, and existing user flows unless the objective explicitly targets them.
- Every addition must map to the objective or a named acceptance criterion.
- Stop and ask after `N` generations, or earlier on plateau/regression.


## Terms used by this loop

This document uses the same vocabulary as the runner and dashboard: a **run** is one runner invocation; an **iteration** is a bounded improvement pass; a **generation** is one loop through variant generation, evaluation, synthesis, and verification; a **variant** is one focused alternative; an **evaluator** scores variants with evidence; **synthesis/mashup** combines only compatible winning features; a **gate** is a required acceptance condition; **evidence** is durable proof; a **decision** records what was accepted, rejected, continued, or forked; a **resume point** is the artifact set a future agent needs; and a **fork** is a new iteration from prior evidence that intentionally explores another direction.

When launched through Hermes Swarm Builder, the runner creates this machine-readable handoff scaffold under the run root:

```text
runs/<run-id>/
  iteration-state.json
  worktrees/variant-*/
  worktrees/mashup/
  artifacts/
    iterations/iteration.json
    source-evidence.json
    variants/*.json
    variants/*.diff
    evaluations/*.json
    synthesis/synthesis.json
    gate-decisions.json
    artifact-manifest.json
```

The product repo may also keep its own `creative-iterations/` tree. The `runs/<run-id>/artifacts/` tree is the dashboard/future-agent handoff format.

Recommended defaults: `N=3` generations for ordinary product work; `N=10` for explicit showcase-catalogue mode; `variants=3-4`, `accepted_features=3`, plateau threshold = no material rubric-score gain for 1-2 consecutive generations. Dashboard/runner hard caps keep showcase mode at 10 generations max.

## Continuous showcase catalogue mode

Showcase-catalogue mode repeats this loop up to 10 times against the same repo. Every generation must be comparable: same objective family, same validation commands, and lineage from prior mashup commit to next base ref. The catalogue is useful only if generations remain meaningfully different but bounded; do not use it as permission for unrelated feature pileups.

Stop conditions are: target generation reached, dashboard stop/hold/pause, failed validation/gate, dirty target repo preflight, no valid evaluated variant, or plateau/regression evidence.

## Loop architecture

```text
0. Intake / freeze scope
   -> objective.md, constraints.md, baseline evidence

1. Baseline capture
   -> screenshot(s), performance/accessibility smoke checks, current feature inventory

2. Diverge: variant generation, 3-5 branches
   -> each variant makes focused changes against same objective
   -> each variant writes a concise claim: what changed, why, evidence expected

3. Evidence capture
   -> screenshots before/after, diff summary, static checks, perf/a11y smoke, manual observations

4. Score and compare
   -> objective fit, visual/UX quality, clarity, implementation quality, risk, constraints
   -> reject variants that violate hard constraints even if attractive

5. Synthesis plan
   -> pick 2-4 features total, identify source variant for each, justify compatibility
   -> explicitly list rejected features and reasons

6. Integrate next generation
   -> implement only synthesis plan; no opportunistic additions

7. Verify generation
   -> screenshots, tests/checks, accessibility/perf/readability pass, traceability matrix

8. Stop / continue gate
   -> continue if meaningful improvement remains and budget allows
   -> stop/ask if N reached, plateau, regression, ambiguous taste decision, or constraint pressure
```

## Roles

### Orchestrator
- Owns objective, constraints, generation count, and stop/ask decisions.
- Freezes scope before each generation.
- Ensures outputs are comparable and evidence-backed.

### Variant agents
- Produce one coherent alternative each.
- May improve only the assigned target area.
- Must not add unrelated features, sections, dependencies, or redesign motifs unless assigned.

### Judge / curator
- Scores variants using the rubric.
- Selects features, not whole variants by default.
- Rejects shiny changes that do not serve the objective.

### Integrator
- Builds the next generation from the approved synthesis plan only.
- Maintains traceability from objective -> variant -> accepted feature -> file diff -> evidence.

### QA / regression checker
- Verifies functionality, accessibility, readability, performance, and visual consistency.
- Flags regressions before the next generation begins.

## Hard gates

A generation fails if any of these are true:

- More than 4 accepted features.
- More than 1 visual motif change.
- More than 1 new section/screen.
- Any unrelated feature accepted.
- Tech stack, framework, dependency, routing, build, or state-management churn without written objective-linked justification.
- Key text/readability, keyboard access, contrast, load time, or core flow regresses.
- No screenshot/evidence for the compared result.
- No traceability matrix.

## Scoring rubric

Score each criterion 0-5. Weight can be adjusted per product, but keep it fixed within a run.

| Criterion | Weight | 0 | 3 | 5 |
|---|---:|---|---|---|
| Objective fit | 30% | unrelated | partially supports objective | directly advances primary objective |
| User value / clarity | 20% | confusing | understandable but uneven | immediately clear and useful |
| Visual / experiential quality | 15% | incoherent | acceptable polish | distinctive, coherent, restrained |
| Feasibility / implementation quality | 15% | brittle or large | workable | simple, readable, maintainable |
| Accessibility / inclusivity | 10% | worsens access | neutral / minor issues | improves or preserves strong access |
| Performance / complexity | 10% | heavy or risky | acceptable | lightweight and performant |

Apply penalties after weighted score:

- `-20` hard-to-reverse architecture change.
- `-15` unexplained dependency or tech churn.
- `-10` unclear screenshot/evidence.
- `-10` feature duplicates existing capability.
- `-10` increases cognitive load without objective benefit.

Decision bands:

- `>= 85`: strong candidate for synthesis.
- `70-84`: use selectively if it fills a gap.
- `50-69`: learn from it, usually reject.
- `< 50`: reject.
- Any hard-gate violation: reject or ask human.

## Feature acceptance rubric

An individual feature can be accepted only if all answers are yes:

1. Which objective or acceptance criterion does it serve?
2. What evidence shows it improves the product?
3. Can it be described in one sentence?
4. Is it compatible with other accepted features?
5. Does it fit within the 2-4 feature budget?
6. Does it avoid new motif/section/stack churn, or consume the explicit limited budget?
7. Can it be implemented without reducing readability, performance, or accessibility?

## Plateau and stop rules

Stop and ask the user when any condition is met:

- `generation >= N`.
- Best score improvement `< 5 points` for 2 consecutive generations.
- The same top feature class appears repeatedly but evidence is inconclusive.
- The next useful improvement requires exceeding feature/motif/section budget.
- The remaining choice is subjective brand/taste, not objective fit.
- Verification shows regression that cannot be fixed inside the current generation budget.

Stop without asking and deliver when:

- Acceptance criteria are met.
- No high-value feature remains under constraints.
- Latest generation passes verification and is clearly better than baseline.

## Persistent file set

Use this minimal structure in the product repo:

```text
creative-iterations/
  LOOP.md                         # this operating protocol or project-specific version
  run-YYYYMMDD-HHMM/
    objective.md                  # objective, acceptance criteria, constraints, N
    baseline/
      screenshots/                # baseline visual evidence
      checks.md                   # initial perf/a11y/test state
      feature_inventory.md        # existing sections/motifs/features to protect
    gen-01/
      variants/
        variant-a.md              # claim, changes, evidence links, score
        variant-b.md
        variant-c.md
        variant-d.md
      evidence/
        screenshots/
        diffs.md
        checks.md
      comparison.md               # score table and notes
      synthesis_plan.md           # accepted 2-4 features + rejected features
      traceability.md             # objective -> feature -> variant -> evidence -> files
      verification.md             # final checks and gate result
    gen-02/
      ...
    final_summary.md
```

For lightweight runs, keep only:

```text
creative-iterations/run-*/objective.md
creative-iterations/run-*/gen-*/comparison.md
creative-iterations/run-*/gen-*/synthesis_plan.md
creative-iterations/run-*/gen-*/traceability.md
creative-iterations/run-*/gen-*/verification.md
creative-iterations/run-*/final_summary.md
```

## Template: objective.md

```md
# Objective

One-sentence objective:

Acceptance criteria:
1.
2.
3.

Non-goals:
-

Budgets:
- Generations: 3
- Variants per generation: 4
- Accepted features per generation: 2-4
- Visual motif changes per generation: 1 max
- New sections per generation: 1 max

Hard constraints:
- No unrelated features.
- No tech-stack churn unless justified.
- Preserve readability, performance, accessibility, and existing core flows.
```

## Template: variant.md

```md
# Variant [A-D]

Hypothesis:

Changes made:
-

Objective mapping:
-

Evidence:
- Screenshot(s):
- Diff summary:
- Checks:

Risks / regressions:
-

Self-score:
- Objective fit:
- Clarity:
- Visual/UX:
- Implementation:
- A11y:
- Performance:
```

## Template: comparison.md

```md
# Generation NN Comparison

| Variant | Objective fit | Clarity | Visual/UX | Impl | A11y | Perf | Penalties | Weighted score | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| A | | | | | | | | | |
| B | | | | | | | | | |
| C | | | | | | | | | |
| D | | | | | | | | | |

Top observed strengths:
1.
2.
3.

Rejected ideas and why:
-

Constraint violations:
-
```

## Template: synthesis_plan.md

```md
# Generation NN Synthesis Plan

Accepted feature budget: [2-4]

| Accepted feature | Source variant | Objective mapping | Evidence | Files expected | Budget consumed |
|---|---|---|---|---|---|
| | | | | | |

Visual motif change used? yes/no; describe if yes.
New section used? yes/no; describe if yes.
Tech-stack churn? no / justified because ...

Integrator instructions:
1.
2.
3.

Do-not-include list:
-
```

## Template: traceability.md

```md
# Traceability

| Objective / criterion | Accepted feature | Source variant | Evidence link | Commit/file diff | Verification status |
|---|---|---|---|---|---|
| | | | | | |
```

## Template: verification.md

```md
# Verification

Screenshots captured:
-

Checks run:
-

Accessibility/readability review:
-

Performance review:
-

Constraint audit:
- Accepted features count:
- Visual motif changes:
- New sections:
- Unrelated features:
- Tech-stack churn:

Gate decision: pass / fail / ask human
Reason:
Next action:
```

## Anti-feature-creep prompts

Use these checks before accepting any change:

- "If this were removed, would the objective suffer?"
- "Is this a new idea, or a clearer version of an existing accepted idea?"
- "Does this consume the only visual motif or section budget?"
- "Are we improving the product or merely increasing surface area?"
- "Can the user perceive the improvement in the screenshot/evidence?"
- "Would a future maintainer understand this in one pass?"

## Recommended autonomous run prompt

```text
Run a bounded creative iteration loop for [product path]. Objective: [objective].
Use 3 generations max, 4 variants per generation, and accept only 2-4 features per generation.
Compare variants with screenshots/evidence, score with the rubric, synthesize strongest compatible features, and preserve readability/performance/accessibility.
Allow at most 1 visual motif change and 1 new section per generation. Do not add unrelated features or change the tech stack unless explicitly justified against the objective.
Persist objective, variant reports, comparison, synthesis plan, traceability, and verification under creative-iterations/run-[timestamp]/.
Stop and ask if generation limit is reached, score plateaus, evidence is ambiguous, or the next improvement would exceed budgets.
```

## Source-informed principles

- Design Council Double Diamond: diverge to understand/generate options, converge to define/deliver; small-scale testing should reject weak solutions and improve promising ones.
- GV Design Sprint: map a focused target, sketch competing solutions, decide, prototype, and test to replace debate with evidence.
- NN/g iterative UI design: iterate through multiple versions because first attempts are rarely problem-free; use testing/evidence to refine local problem areas, not random redesign.


## Future-agent resume checklist

Before stopping a run, make sure a later agent can answer:

1. What was the objective?
2. What generation was last completed?
3. Which variants were generated?
4. What evidence was captured for each variant?
5. Which evaluator decisions were made?
6. What synthesis/mashup was accepted?
7. Which gates passed, failed, or still need evidence?
8. What is the next safe action?
9. Is this a continuation, a resume, or a fork?
10. Which artifact paths prove the above?

Minimum resume artifacts: `iteration-state.json`, `artifacts/source-evidence.json`, `artifacts/variants/*.json`, `artifacts/evaluations/*.json`, `artifacts/synthesis/synthesis.json`, `artifacts/gate-decisions.json`, and `artifacts/artifact-manifest.json`.
