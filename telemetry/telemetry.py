#!/usr/bin/env python3
"""Telemetry helper for Hermes Autonomous Project Builder.

Writes canonical APB state/events for the dashboard. Designed for use by the
scheduled orchestrator and any subagent subprocesses.
"""
from __future__ import annotations
import argparse, fcntl, json, os, random, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("AUTONOMOUS_PROJECT_STATE_ROOT", str(Path.home() / ".hermes" / "autonomous-projects")))
STATE = Path(os.environ.get("AUTONOMOUS_PROJECT_STATE", ROOT / "state.json"))
EVENTS = Path(os.environ.get("AUTONOMOUS_PROJECT_EVENTS", ROOT / "events.jsonl"))
LOCK = ROOT / "telemetry.lock"
SCHEMA_EVENT = "apb.telemetry.v1"
SCHEMA_STATE = "apb.state.v1"
RUN_STATES = {"idle","inventory-scanning","selecting","repo-created","spec-drafting","spec-review","spec-approved","devplan-drafting","devplan-review","devplan-approved","building","blocked","deblocking","on-hold","completed","published"}
SECRET_PATTERNS = [
    (re.compile(r"eyJ[a-zA-Z0-9._-]{20,}"), "[REDACTED_JWT]"),
    (re.compile(r"sk-[a-zA-Z0-9_-]{16,}"), "[REDACTED_OPENAI_KEY]"),
    (re.compile(r"gh[pousr]_[a-zA-Z0-9_]{16,}"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,'\"}]+"), r"\1=[REDACTED]"),
    (re.compile(r"-----BEGIN [^-]+ PRIVATE KEY-----.*?-----END [^-]+ PRIVATE KEY-----", re.S), "[REDACTED_PRIVATE_KEY]"),
]

def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def event_id(run_id: str | None) -> str:
    return f"evt-{run_id or 'norun'}-{int(time.time()*1000)}-{random.randrange(16**8):08x}"

def redact_text(s: str) -> str:
    out = s
    for pat, repl in SECRET_PATTERNS:
        out = pat.sub(repl, out)
    if len(out) > 8192:
        out = out[:8192] + "…[truncated]"
    return out

def sanitize(obj: Any) -> Any:
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, list):
        xs = [sanitize(x) for x in obj[:100]]
        if len(obj) > 100: xs.append({"truncated": True, "omitted": len(obj)-100})
        return xs
    if isinstance(obj, dict):
        out = {}
        for i, (k, v) in enumerate(obj.items()):
            if i >= 100:
                out["truncated"] = True; break
            lk = str(k).lower()
            if any(t in lk for t in ("token", "secret", "password", "api_key", "apikey", "authorization")):
                out[k] = "[REDACTED]"
            else:
                out[k] = sanitize(v)
        return out
    return redact_text(str(obj))

def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except Exception:
        return default

def atomic_write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=False))
    os.replace(tmp, path)

def with_lock(fn):
    ROOT.mkdir(parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try: return fn()
        finally: fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

def read_state() -> dict[str, Any]:
    s = load_json(STATE, {})
    if not isinstance(s, dict): s = {}
    s.setdefault("schemaVersion", SCHEMA_STATE)
    s.setdefault("agents", {})
    if isinstance(s.get("agents"), list):
        s["agents"] = {a.get("id", f"agent-{i}"): a for i, a in enumerate(s["agents"]) if isinstance(a, dict)}
    return s

def write_state(s: dict[str, Any]) -> None:
    s["schemaVersion"] = SCHEMA_STATE
    s["updatedAt"] = now()
    atomic_write(STATE, s)
    run_id = s.get("currentRunId")
    if run_id:
        run_path = ROOT / "runs" / str(run_id) / "run.json"
        r = load_json(run_path, {}) if run_path.exists() else {}
        if isinstance(r, dict):
            r.update({k: s.get(k) for k in ["schemaVersion","currentRunId","status","phase","currentProject","selectedProject","startedAt","updatedAt","completedAt","agents","blockers","block","hold","task","currentTask","specAdherence","devplanAdherence"] if k in s})
            r["id"] = run_id; r["runId"] = run_id; r["schemaVersion"] = "apb.run.v1"
            atomic_write(run_path, r)

def append_event(evt: dict[str, Any]) -> dict[str, Any]:
    evt = sanitize(evt)
    run_id = evt.get("runId") or evt.get("data", {}).get("runId")
    agent_id = evt.get("agentId") or evt.get("data", {}).get("agentId")
    evt.setdefault("id", event_id(run_id))
    evt.setdefault("ts", now())
    evt.setdefault("level", "info")
    evt.setdefault("source", agent_id or "system")
    evt.setdefault("type", evt.pop("eventType", "event"))
    evt.setdefault("message", evt["type"])
    if run_id: evt["runId"] = run_id
    if agent_id: evt["agentId"] = agent_id
    data = evt.setdefault("data", {})
    if isinstance(data, dict):
        data.setdefault("schemaVersion", SCHEMA_EVENT)
        if run_id: data.setdefault("runId", run_id)
        if agent_id: data.setdefault("agentId", agent_id)
    EVENTS.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS.open("a") as f:
        f.write(json.dumps(evt, separators=(",", ":")) + "\n")
    return evt

def update_agent(args, status: str | None = None):
    def inner():
        s = read_state(); agents = s.setdefault("agents", {})
        aid = args.agent_id
        old = agents.get(aid, {}) if isinstance(agents.get(aid), dict) else {}
        agent = {**old, "id": aid, "label": args.label or old.get("label") or aid, "role": args.role or old.get("role") or "agent", "status": status or args.status or old.get("status") or "running", "currentPhase": args.phase or old.get("currentPhase") or s.get("phase"), "currentTask": args.task or old.get("currentTask") or "", "lastMessage": args.message or old.get("lastMessage") or "", "updatedAt": now()}
        if args.log_path: agent["logPath"] = args.log_path
        if args.artifact: agent["currentArtifact"] = args.artifact
        agents[aid] = agent
        s["lastAction"] = args.message or args.task or f"{aid} {agent['status']}"
        if args.phase and args.phase in RUN_STATES: s["phase"] = args.phase
        write_state(s)
        append_event({"level":"info","type":"agent-status","message":s["lastAction"],"runId":args.run_id,"agentId":aid,"source":aid,"data":{"status":agent["status"],"phase":agent.get("currentPhase"),"task":agent.get("currentTask"),"artifact":agent.get("currentArtifact")}})
    with_lock(inner)

def parse_json_arg(value: str | None) -> Any:
    if not value: return None
    try: return json.loads(value)
    except Exception: return {"text": value}

def tool_event(args, typ: str, level: str):
    data = {"toolCallId": args.tool_call_id, "toolName": args.tool_name, "action": args.action, "status": args.status, "phase": args.phase}
    for attr, key in [("input_json","input"),("output_json","output")]:
        val = parse_json_arg(getattr(args, attr, None))
        if val is not None: data[key] = val
    if args.error: data["error"] = args.error
    if args.duration_ms is not None: data["durationMs"] = args.duration_ms
    append_event({"level":level,"type":typ,"message":args.message or args.action or args.tool_name,"runId":args.run_id,"agentId":args.agent_id,"source":args.agent_id,"data":data})

def set_phase(args):
    def inner():
        s = read_state(); s["currentRunId"] = args.run_id; s["status"] = args.phase; s["phase"] = args.phase; s["task"] = args.task or s.get("task"); s["currentTask"] = args.task or s.get("currentTask"); s["lastAction"] = args.message or f"phase {args.phase}"; write_state(s)
        append_event({"level":"info","type":"phase-change","message":s["lastAction"],"runId":args.run_id,"agentId":"orchestrator","source":"orchestrator","data":{"phase":args.phase,"task":args.task}})
    with_lock(inner)

def complete(args):
    def inner():
        s = read_state(); s["currentRunId"] = args.run_id; s["status"] = "completed"; s["phase"] = "completed"; s["completedAt"] = now(); s["task"] = args.message or "Run completed"; s["lastAction"] = s["task"]; write_state(s)
        append_event({"level":"success","type":"state-change","message":s["lastAction"],"runId":args.run_id,"agentId":"orchestrator","source":"orchestrator","data":{"status":"completed"}})
    with_lock(inner)

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    def common(p):
        p.add_argument("--run-id", required=True); p.add_argument("--agent-id", default="orchestrator"); p.add_argument("--message", default="")
    p = sub.add_parser("set-phase"); common(p); p.add_argument("--phase", required=True); p.add_argument("--task", default="")
    p = sub.add_parser("upsert-agent"); common(p); p.add_argument("--label", default=""); p.add_argument("--role", default=""); p.add_argument("--status", default="running"); p.add_argument("--phase", default=""); p.add_argument("--task", default=""); p.add_argument("--log-path", default=""); p.add_argument("--artifact", default="")
    for cmd in ["tool-start","tool-output","tool-end","tool-error"]:
        p = sub.add_parser(cmd); common(p); p.add_argument("--tool-call-id", required=True); p.add_argument("--tool-name", required=True); p.add_argument("--action", default=""); p.add_argument("--phase", default=""); p.add_argument("--status", default="running"); p.add_argument("--input-json", default=None); p.add_argument("--output-json", default=None); p.add_argument("--error", default=""); p.add_argument("--duration-ms", type=int, default=None)
    p = sub.add_parser("event"); common(p); p.add_argument("--type", required=True); p.add_argument("--level", default="info"); p.add_argument("--source", default=""); p.add_argument("--data-json", default="{}")
    p = sub.add_parser("complete"); common(p)
    args = ap.parse_args()
    if args.cmd == "set-phase": set_phase(args)
    elif args.cmd == "upsert-agent": update_agent(args)
    elif args.cmd.startswith("tool-"):
        typ = {"tool-start":"tool-call-start","tool-output":"tool-call-output","tool-end":"tool-call-end","tool-error":"tool-call-error"}[args.cmd]
        level = "error" if args.cmd == "tool-error" else "success" if args.cmd == "tool-end" else "info"
        tool_event(args, typ, level)
    elif args.cmd == "event":
        append_event({"level":args.level,"source":args.source or args.agent_id,"type":args.type,"message":args.message or args.type,"runId":args.run_id,"agentId":args.agent_id,"data":parse_json_arg(args.data_json) or {}})
    elif args.cmd == "complete": complete(args)

if __name__ == "__main__":
    main()
