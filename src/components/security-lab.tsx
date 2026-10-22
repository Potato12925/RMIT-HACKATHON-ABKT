"use client";
import { useState } from "react";
import { FlaskConical, Play, CheckCircle2, XCircle } from "lucide-react";
import { runScenarios, type Exchange } from "@/lib/scenarios";
import { api } from "./workspace";
export default function SecurityLab({
  userId,
  refresh,
}: {
  userId: string;
  refresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Exchange[]>([]),
    [running, setRunning] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VERIFY THE BOUNDARIES</span>
          <h1>Trust, under pressure.</h1>
          <p>
            Eight scenarios. Actual API requests. Visible backend decisions.
          </p>
        </div>
        <FlaskConical className="teal" size={38} />
      </div>
      <div className="lab-intro panel">
        <div>
          <h2>A working security demonstration</h2>
          <p>
            The runner switches between local demo identities, adds 12,000,000
            synthetic VND, and tests collaborative settlement, restrictions,
            roles, anonymous access, organization boundaries, amendments,
            replay, and missing quorum. It restores your identity when finished.
          </p>
          <p>
            These results demonstrate centralized application checks. They do
            not prove Tide network cryptographic enforcement.
          </p>
        </div>
        <button
          className="primary"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            setRows([]);
            setError("");
            try {
              await runScenarios(
                async (action, body, anonymous) => {
                  const r = await fetch(`/api/${action}`, {
                    method: body === undefined ? "GET" : "POST",
                    headers:
                      body === undefined
                        ? {}
                        : { "Content-Type": "application/json" },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    credentials: anonymous ? "omit" : "same-origin",
                    cache: "no-store",
                  });
                  return { status: r.status, body: await r.json() };
                },
                (row) => setRows((old) => [...old, row]),
              );
            } catch (e) {
              setError(String(e));
            } finally {
              try {
                await api("login", { userId });
                await refresh();
              } catch (e) {
                setError(String(e));
              }
              setRunning(false);
            }
          }}
        >
          <Play size={17} />
          {running ? "Running live requests…" : "Run security scenarios"}
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="section-title">
          <h2>Live request log</h2>
          <span className="pill">
            {rows.filter((r) => r.passed).length} / {rows.length} checks passed
          </span>
        </div>
        {!rows.length && (
          <div className="empty">
            <FlaskConical />
            <h3>See the policy engine in action</h3>
            <p>
              Run the scenarios to inspect status codes and backend responses.
            </p>
          </div>
        )}
        <div aria-live="polite">
          {rows.map((r, i) => (
            <details className="lab-result" key={i}>
              <summary>
                {r.passed ? (
                  <CheckCircle2 size={18} className="teal" />
                ) : (
                  <XCircle size={18} />
                )}
                <span>
                  {r.label}
                  <small>/api/{r.action}</small>
                </span>
                <b className={r.status >= 400 ? "http-denied" : "http-ok"}>
                  HTTP {r.status}
                </b>
              </summary>
              <p>
                Expected HTTP {r.expected}.{" "}
                {r.passed ? "Matched." : "Unexpected result."}
              </p>
              <pre>{JSON.stringify(r.body, null, 2)}</pre>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
