import type { IncidentStatus, RcaInput } from "../types.js";

export class WorkflowError extends Error {
  constructor(message: string, public readonly statusCode = 409) {
    super(message);
  }
}

export function validateTransition(current: IncidentStatus, next: IncidentStatus, rca?: RcaInput | null) {
  const state = createState(current);
  state.transitionTo(next, rca);
}

interface IncidentState {
  transitionTo(next: IncidentStatus, rca?: RcaInput | null): void;
}

class OpenState implements IncidentState {
  transitionTo(next: IncidentStatus) {
    if (next === "OPEN" || next === "INVESTIGATING") return;
    throw new WorkflowError("OPEN incidents can only move to INVESTIGATING");
  }
}

class InvestigatingState implements IncidentState {
  transitionTo(next: IncidentStatus) {
    if (next === "INVESTIGATING" || next === "RESOLVED") return;
    throw new WorkflowError("INVESTIGATING incidents can only move to RESOLVED");
  }
}

class ResolvedState implements IncidentState {
  transitionTo(next: IncidentStatus, rca?: RcaInput | null) {
    if (next === "RESOLVED") return;
    if (next === "CLOSED") {
      if (!rca) {
        throw new WorkflowError("Cannot close incident without a complete RCA", 400);
      }
      return;
    }
    throw new WorkflowError("RESOLVED incidents can only move to CLOSED");
  }
}

class ClosedState implements IncidentState {
  transitionTo(next: IncidentStatus) {
    if (next === "CLOSED") return;
    throw new WorkflowError("CLOSED incidents cannot be reopened in this demo");
  }
}

function createState(status: IncidentStatus): IncidentState {
  switch (status) {
    case "OPEN":
      return new OpenState();
    case "INVESTIGATING":
      return new InvestigatingState();
    case "RESOLVED":
      return new ResolvedState();
    case "CLOSED":
      return new ClosedState();
  }
}
