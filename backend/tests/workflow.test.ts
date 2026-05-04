import { describe, expect, it } from "vitest";
import { rcaSchema } from "../src/types.js";
import { validateTransition } from "../src/workflow/state.js";
import { selectAlertStrategy } from "../src/alerting/strategies.js";

describe("RCA validation", () => {
  it("rejects incomplete RCA objects", () => {
    const parsed = rcaSchema.safeParse({
      startTime: new Date(),
      endTime: new Date(),
      rootCauseCategory: "Database",
      fixApplied: "",
      preventionSteps: ""
    });

    expect(parsed.success).toBe(false);
  });

  it("allows RESOLVED to close only when RCA exists", () => {
    expect(() => validateTransition("RESOLVED", "CLOSED", null)).toThrow(/RCA/);

    expect(() =>
      validateTransition("RESOLVED", "CLOSED", {
        startTime: new Date("2026-01-01T00:00:00Z"),
        endTime: new Date("2026-01-01T00:10:00Z"),
        rootCauseCategory: "Database",
        fixApplied: "Restarted connection pool",
        preventionSteps: "Added pool saturation alert"
      })
    ).not.toThrow();
  });

  it("rejects invalid transitions", () => {
    expect(() => validateTransition("OPEN", "RESOLVED")).toThrow(/OPEN/);
  });
});

describe("alert strategies", () => {
  it("maps RDBMS to P0 and cache to P2", () => {
    const timestamp = new Date();
    expect(
      selectAlertStrategy("RDBMS").decide({
        componentId: "RDBMS_PRIMARY_01",
        componentType: "RDBMS",
        timestamp,
        level: "ERROR",
        message: "down",
        payload: {}
      }).severity
    ).toBe("P0");

    expect(
      selectAlertStrategy("CACHE").decide({
        componentId: "CACHE_CLUSTER_01",
        componentType: "CACHE",
        timestamp,
        level: "ERROR",
        message: "slow",
        payload: {}
      }).severity
    ).toBe("P2");
  });
});
