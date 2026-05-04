import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  ListFilter,
  RefreshCw,
  Send
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const SIGNAL_PAGE_SIZE = 25;

type Incident = {
  id: string;
  componentId: string;
  componentType: string;
  severity: "P0" | "P1" | "P2" | "P3";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
  title: string;
  firstSignalAt: string;
  lastSignalAt: string;
  signalCount: number;
  responderGroup: string;
  mttrSeconds?: number | null;
  rca?: Rca | null;
};

type Rca = {
  startTime: string;
  endTime: string;
  rootCauseCategory: string;
  fixApplied: string;
  preventionSteps: string;
};

type RawSignal = {
  _id: string;
  timestamp: string;
  level: string;
  message: string;
  payload: Record<string, unknown>;
};

type SignalPage = {
  items: RawSignal[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Toast = {
  id: number;
  message: string;
  type: "info" | "success" | "error";
};

function App() {
  const [incidents, setIncidents] = React.useState<Incident[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Incident | null>(null);
  const [signals, setSignals] = React.useState<SignalPage>({ items: [], total: 0, page: 1, pageSize: SIGNAL_PAGE_SIZE, totalPages: 1 });
  const [selectedSignalId, setSelectedSignalId] = React.useState<string | null>(null);
  const [signalPage, setSignalPage] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [savingRca, setSavingRca] = React.useState(false);

  const selectedSignal = signals.items.find((signal) => signal._id === selectedSignalId) ?? signals.items[0] ?? null;

  const loadIncidents = React.useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/incidents`);
    if (!response.ok) throw new Error("incident list failed");
    const nextIncidents = await response.json();
    setIncidents(nextIncidents);
    setSelectedId((current) => current ?? nextIncidents[0]?.id ?? null);
  }, []);

  const loadDetail = React.useCallback(async (id: string, page: number) => {
    const [incidentResponse, signalsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/incidents/${id}`),
      fetch(`${API_BASE}/api/incidents/${id}/signals?page=${page}&pageSize=${SIGNAL_PAGE_SIZE}`)
    ]);

    if (!incidentResponse.ok || !signalsResponse.ok) throw new Error("incident detail failed");

    const [incidentBody, signalsBody] = await Promise.all([incidentResponse.json(), signalsResponse.json()]);
    setSelected(incidentBody);
    setSignals(signalsBody);
    setSelectedSignalId((current) => current ?? signalsBody.items[0]?._id ?? null);
  }, []);

  React.useEffect(() => {
    loadIncidents().catch(() => setError("Could not load incidents"));
    const timer = window.setInterval(() => {
      loadIncidents().catch(() => undefined);
      if (selectedId) loadDetail(selectedId, signalPage).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadIncidents, loadDetail, selectedId, signalPage]);

  React.useEffect(() => {
    if (!selectedId) return;
    setSignalPage(1);
    setSelectedSignalId(null);
    loadDetail(selectedId, 1).catch(() => setError("Could not load incident detail"));
  }, [selectedId, loadDetail]);

  React.useEffect(() => {
    if (selectedId) loadDetail(selectedId, signalPage).catch(() => setError("Could not load raw signals"));
  }, [signalPage, selectedId, loadDetail]);

  async function updateStatus(status: Incident["status"]) {
    if (!selected) return;
    const response = await fetch(`${API_BASE}/api/incidents/${selected.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Status update failed");
      return;
    }
    setError(null);
    await loadDetail(selected.id, signalPage);
    await loadIncidents();
  }

  function showToast(message: string, type: Toast["type"]) {
    const nextToast = { id: Date.now(), message, type };
    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 3500);
  }

  async function submitRca(rca: Rca) {
    if (!selected) return;
    setSavingRca(true);
    setError(null);
    showToast("Saving RCA...", "info");
    try {
      const payload = {
        ...rca,
        startTime: new Date(rca.startTime).toISOString(),
        endTime: new Date(rca.endTime).toISOString()
      };
      const response = await fetch(`${API_BASE}/api/incidents/${selected.id}/rca`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = formatApiError(body) ?? "RCA submission failed. Check every field.";
        setError(message);
        showToast(message, "error");
        return;
      }
      showToast("RCA saved successfully", "success");
      await loadDetail(selected.id, signalPage);
    } catch {
      setError("RCA submission failed. Check your backend connection.");
      showToast("RCA submission failed", "error");
    } finally {
      setSavingRca(false);
    }
  }

  async function refreshDashboard() {
    setRefreshing(true);
    setError(null);
    try {
      await loadIncidents();
      if (selectedId) await loadDetail(selectedId, signalPage);
    } catch {
      setError("Could not refresh dashboard");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <h1>Incident Management System</h1>
          <p>Operational incident queue, signal evidence, and RCA closure workflow.</p>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={refreshDashboard} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : ""} size={16} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
          <div className="metric">
            <Activity size={19} />
            <span>{incidents.length} active</span>
          </div>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}

      <section className="layout">
        <IncidentList incidents={incidents} selectedId={selectedId} onSelect={setSelectedId} />
        <section className="workspace">
          <IncidentSummary incident={selected} onStatus={updateStatus} />
          <section className="lower-grid">
            <SignalBrowser
              signals={signals}
              selectedSignal={selectedSignal}
              selectedSignalId={selectedSignalId}
              onSelectSignal={setSelectedSignalId}
              onPage={setSignalPage}
            />
            {selected ? <RcaForm incident={selected} onSubmit={submitRca} saving={savingRca} /> : <EmptyPanel />}
          </section>
        </section>
      </section>
    </main>
  );
}

function IncidentList({
  incidents,
  selectedId,
  onSelect
}: {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel incident-list">
      <div className="panel-heading">
        <ListFilter size={18} />
        <div>
          <h2>Live Feed</h2>
          <p>{incidents.length} active incidents sorted by severity</p>
        </div>
      </div>
      <div className="feed-table" role="table">
        <div className="feed-head" role="row">
          <span>Priority</span>
          <span>Incident</span>
          <span>Status</span>
          <span>Signals</span>
        </div>
        <div className="feed-body">
          {incidents.map((incident) => (
            <button
              className={`feed-row ${incident.id === selectedId ? "selected" : ""}`}
              key={incident.id}
              onClick={() => onSelect(incident.id)}
            >
              <span className={`severity ${incident.severity}`}>{incident.severity}</span>
              <span className="incident-cell">
                <strong>{incident.componentId}</strong>
                <small>{incident.title}</small>
              </span>
              <span className={`status ${incident.status.toLowerCase()}`}>{incident.status}</span>
              <span className="signal-count">{incident.signalCount}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function IncidentSummary({ incident, onStatus }: { incident: Incident | null; onStatus: (status: Incident["status"]) => void }) {
  if (!incident) return <EmptyPanel />;

  return (
    <section className="panel summary-panel">
      <div className="summary-title">
        <div>
          <div className="panel-heading compact">
            <Database size={18} />
            <h2>{incident.componentId}</h2>
          </div>
          <p>{incident.title}</p>
        </div>
        <span className={`severity large ${incident.severity}`}>{incident.severity}</span>
      </div>

      <div className="facts">
        <Fact label="Status" value={incident.status} />
        <Fact label="Responder" value={incident.responderGroup} />
        <Fact label="Component" value={incident.componentType} />
        <Fact label="Signals" value={String(incident.signalCount)} />
        <Fact label="First signal" value={formatDate(incident.firstSignalAt)} />
        <Fact label="Last signal" value={formatDate(incident.lastSignalAt)} />
        <Fact label="MTTR" value={incident.mttrSeconds ? `${incident.mttrSeconds}s` : "Pending"} />
      </div>

      <div className="actions">
        <button onClick={() => onStatus("INVESTIGATING")} disabled={incident.status !== "OPEN"}>
          <Clock size={16} /> Investigating
        </button>
        <button onClick={() => onStatus("RESOLVED")} disabled={incident.status !== "INVESTIGATING"}>
          <CheckCircle2 size={16} /> Resolved
        </button>
        <button onClick={() => onStatus("CLOSED")} disabled={incident.status !== "RESOLVED"}>
          <Send size={16} /> Close
        </button>
      </div>
    </section>
  );
}

function SignalBrowser({
  signals,
  selectedSignal,
  selectedSignalId,
  onSelectSignal,
  onPage
}: {
  signals: SignalPage;
  selectedSignal: RawSignal | null;
  selectedSignalId: string | null;
  onSelectSignal: (id: string) => void;
  onPage: (page: number) => void;
}) {
  return (
    <section className="panel signal-panel">
      <div className="panel-heading split">
        <div className="heading-inline">
          <Activity size={18} />
          <div>
            <h2>Raw Signals</h2>
            <p>{signals.total} linked signals, {signals.pageSize} per page</p>
          </div>
        </div>
        <div className="pager">
          <button onClick={() => onPage(signals.page - 1)} disabled={signals.page <= 1}>Prev</button>
          <span>{signals.page} / {signals.totalPages}</span>
          <button onClick={() => onPage(signals.page + 1)} disabled={signals.page >= signals.totalPages}>Next</button>
        </div>
      </div>

      <div className="signals-layout">
        <div className="signal-table">
          <div className="signal-head">
            <span>Level</span>
            <span>Message</span>
            <span>Time</span>
          </div>
          <div className="signal-body">
            {signals.items.map((signal) => (
              <button
                className={`signal-row ${signal._id === selectedSignalId ? "selected" : ""}`}
                key={signal._id}
                onClick={() => onSelectSignal(signal._id)}
              >
                <span className={`level ${signal.level.toLowerCase()}`}>{signal.level}</span>
                <span>{signal.message}</span>
                <time>{formatTime(signal.timestamp)}</time>
              </button>
            ))}
          </div>
        </div>

        <div className="payload-viewer">
          <div className="payload-heading">
            <FileText size={16} />
            <strong>Selected Payload</strong>
          </div>
          {selectedSignal ? (
            <pre>{JSON.stringify(selectedSignal.payload, null, 2)}</pre>
          ) : (
            <p>No signal selected.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function RcaForm({ incident, onSubmit, saving }: { incident: Incident; onSubmit: (rca: Rca) => void; saving: boolean }) {
  const [form, setForm] = React.useState<Rca>({
    startTime: toLocalDateTime(incident.firstSignalAt),
    endTime: toLocalDateTime(new Date().toISOString()),
    rootCauseCategory: incident.rca?.rootCauseCategory ?? "Database",
    fixApplied: incident.rca?.fixApplied ?? "",
    preventionSteps: incident.rca?.preventionSteps ?? ""
  });

  React.useEffect(() => {
    setForm({
      startTime: toLocalDateTime(incident.firstSignalAt),
      endTime: toLocalDateTime(new Date().toISOString()),
      rootCauseCategory: incident.rca?.rootCauseCategory ?? "Database",
      fixApplied: incident.rca?.fixApplied ?? "",
      preventionSteps: incident.rca?.preventionSteps ?? ""
    });
  }, [incident.id]);

  const complete = form.startTime && form.endTime && form.rootCauseCategory && form.fixApplied.length >= 5 && form.preventionSteps.length >= 5;

  return (
    <form
      className="panel rca"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !saving) onSubmit(form);
      }}
    >
      <div className="panel-heading">
        <CheckCircle2 size={18} />
        <div>
          <h2>RCA</h2>
          <p>Required before closure</p>
        </div>
      </div>
      <label>
        Incident Start
        <input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
      </label>
      <label>
        Incident End
        <input type="datetime-local" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
      </label>
      <label>
        Root Cause Category
        <select value={form.rootCauseCategory} onChange={(event) => setForm({ ...form, rootCauseCategory: event.target.value })}>
          <option>Database</option>
          <option>Cache</option>
          <option>Network</option>
          <option>Deployment</option>
          <option>Capacity</option>
          <option>Unknown</option>
        </select>
      </label>
      <label>
        Fix Applied
        <textarea value={form.fixApplied} onChange={(event) => setForm({ ...form, fixApplied: event.target.value })} />
      </label>
      <label>
        Prevention Steps
        <textarea value={form.preventionSteps} onChange={(event) => setForm({ ...form, preventionSteps: event.target.value })} />
      </label>
      <button type="submit" disabled={!complete || saving}>
        {saving ? (
          <>
            <RefreshCw className="spin" size={16} /> Saving...
          </>
        ) : (
          "Submit RCA"
        )}
      </button>
    </form>
  );
}

function EmptyPanel() {
  return (
    <section className="panel empty">
      <AlertTriangle size={28} />
      <p>Select an incident to inspect workflow, RCA, and raw signal evidence.</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatApiError(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const messages = Object.entries(fieldErrors ?? {}).flatMap(([field, values]) => values.map((value) => `${field}: ${value}`));
    return messages.length > 0 ? messages.join("; ") : null;
  }
  return null;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
