"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Wallet,
  ArrowUpRight,
  Plus,
  CheckCheck,
  FlaskConical,
  LogOut,
  ArrowRight,
  LockKeyhole,
  Clock3,
  Activity,
  ChevronRight,
} from "lucide-react";
import type { Snapshot, TransactionView } from "@/lib/client-types";
import SecurityLab from "./security-lab";
export const money = (n: number) => new Intl.NumberFormat("en-US").format(n);
export async function api(action: string, body?: unknown) {
  const r = await fetch(
    `/api/${action}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} · ${data.error}`);
  return data;
}
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["organizations", "Organizations", Building2],
  ["commitments", "Funding commitments", Wallet],
  ["approvals", "Approval workspace", CheckCheck],
  ["security", "Security lab", FlaskConical],
] as const;
type Account = {
  id: string;
  name: string;
  memberships: { role: string; organization: { name: string } }[];
};
export default function Workspace() {
  const [data, setData] = useState<Snapshot | null>(null),
    [accounts, setAccounts] = useState<Account[]>([]),
    [view, setView] = useState("dashboard"),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api("snapshot"));
  }
  useEffect(() => {
    Promise.all([
      api("accounts").then(setAccounts),
      api("snapshot")
        .then(setData)
        .catch((e) => {
          if (!String(e).includes("401")) setError(String(e));
        }),
    ])
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="loading">
        <ShieldCheck size={40} />
        <p>Opening your shared ledger…</p>
      </main>
    );
  if (!data)
    return (
      <div className="login">
        <section className="login-story">
          <div className="brand">
            <ShieldCheck />
            TrustVault<span> / UNLOCKED</span>
          </div>
          <div>
            <span className="eyebrow">RMIT HACKATHON 2026</span>
            <h1>
              Shared purpose.
              <br />
              <em>Independent authority.</em>
            </h1>
            <p>
              Bring funding together without handing control to one
              organization.
            </p>
            <div className="authority">
              <span>HCMC</span>
              <i />
              <ShieldCheck size={42} />
              <i />
              <span>HANOI</span>
            </div>
            <p className="small">
              One Transaction. Multiple Authorities. No Single Controller.
            </p>
          </div>
          <footer>
            Synthetic funds. Real policy checks. A clearer path to trust.
          </footer>
        </section>
        <section className="login-panel">
          <span className="eyebrow">DEVELOPMENT SANDBOX</span>
          <h2>Step into TrustVault</h2>
          <p>
            Choose a demo identity to explore the shared funding workspace. No
            password is required in this local simulation.
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="accounts">
            {accounts.map((a) => (
              <button
                disabled={busy}
                key={a.id}
                onClick={() =>
                  run(async () => {
                    await api("login", { userId: a.id });
                    await refresh();
                    setView("dashboard");
                    setSelected(null);
                  })
                }
              >
                <span className="avatar">
                  {a.memberships[0].organization.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{a.memberships[0].organization.name}</strong>
                  <small>{a.memberships[0].role.toLowerCase()}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
          <div className="simulation">
            <LockKeyhole size={18} />
            Development Simulation — Real TideCloak cryptographic enforcement is
            not active.
          </div>
        </section>
      </div>
    );
  const commitments = data.organizations.flatMap((o) => o.commitments),
    total = commitments.reduce((s, c) => s + c.amount, 0),
    available = commitments.reduce((s, c) => s + c.available, 0),
    reserved = commitments.reduce((s, c) => s + c.reserved, 0),
    spent = commitments.reduce((s, c) => s + c.spent, 0);
  const pending = data.transactions.filter(
    (t) => t.state === "PENDING_APPROVAL",
  );
  const current = data.transactions.find((t) => t.id === selected);
  const admin = data.user.memberships.some((m) => m.role === "ADMIN");
  const open = (t: TransactionView) => {
    setSelected(t.id);
    setView("details");
  };
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={29} />
          TrustVault
          <span className="brand-dot" />
        </div>
        <div className="workspace-label">COLLABORATIVE FINANCE</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              className={view === id ? "active" : ""}
              key={id}
              onClick={() => {
                setView(id);
                setError("");
                setNotice("");
              }}
            >
              <Icon size={19} />
              {label}
              {id === "approvals" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="network">
            <span className="live-dot" />
            Simulation network<span>3 independent organizations</span>
          </div>
          <div className="profile">
            <span className="avatar">{data.user.name[0]}</span>
            <div>
              <strong>{data.user.memberships[0].organization.name}</strong>
              <small>{data.user.memberships[0].role.toLowerCase()}</small>
            </div>
            <button
              aria-label="Sign out"
              onClick={() =>
                run(async () => {
                  await api("logout", {});
                  setData(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />
            <strong>
              {view === "details"
                ? "Transaction details"
                : view === "create"
                  ? "New transaction"
                  : nav.find((n) => n[0] === view)?.[1]}
            </strong>
          </span>
          <span className="sandbox">
            <span className="live-dot" />
            Synthetic funds only
          </span>
        </header>
        <div className="simulation banner">
          <LockKeyhole size={15} />
          Development Simulation — Real TideCloak cryptographic enforcement is
          not active.
        </div>
        <div className="session-strip">
          Signed in: {data.user.memberships[0].organization.name} ·{" "}
          {data.user.memberships[0].role.toLowerCase()}
        </div>
        <main className="content" id="main-content">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR SHARED FUNDING WORKSPACE</span>
                  <h1>
                    Collective capital.
                    <br className="mobile-break" /> Individual control.
                  </h1>
                  <p>
                    A clear view of the funds, conditions, and decisions that
                    connect you.
                  </p>
                </div>
                <button className="primary" onClick={() => setView("create")}>
                  <Plus size={18} />
                  New transaction
                </button>
              </div>
              <div className="metrics">
                <Metric
                  label="Total committed"
                  value={total}
                  detail={`${data.organizations.length} active organizations`}
                  icon={<Wallet size={19} />}
                />
                <Metric
                  label="Available to allocate"
                  value={available}
                  detail="Ready for eligible requests"
                  accent
                />
                <Metric
                  label="Reserved funds"
                  value={reserved}
                  detail={`${pending.length} requests awaiting consensus`}
                />
                <Metric
                  label="Settled funds"
                  value={spent}
                  detail={`${data.transactions.filter((t) => t.state === "SETTLED").length} completed transactions`}
                />
              </div>
              <div className="overview-grid">
                <section className="panel funding-panel">
                  <div className="section-title">
                    <h2>One purpose. Three authorities.</h2>
                    <span className="pill">Funding network</span>
                  </div>
                  <p>
                    Every contribution brings its own conditions. Every
                    organization keeps its voice.
                  </p>
                  <div className="funding-network">
                    {data.organizations.map((o, i) => (
                      <div className="fund-node" key={o.id}>
                        <span className={`org-icon org-${i}`}>
                          <Building2 size={23} />
                        </span>
                        <h3>{o.name}</h3>
                        <strong>
                          {money(
                            o.commitments.reduce((s, c) => s + c.available, 0),
                          )}
                          <small> VND</small>
                        </strong>
                        <p>
                          {o.id === "hcmc"
                            ? "Medical expenses only"
                            : o.id === "hanoi"
                              ? "Medical & education"
                              : "Independent verification"}
                        </p>
                        <span className="node-status">
                          <span className="live-dot" />
                          Policy active
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="network-note">
                    <ShieldCheck size={19} />
                    <span>
                      All contributing organizations must approve the exact
                      transaction.
                    </span>
                  </div>
                </section>
                <section className="consensus-card">
                  <span className="eyebrow">APPROVAL DESK</span>
                  <div className="big-number">
                    {pending.length.toString().padStart(2, "0")}
                    <Clock3 size={30} />
                  </div>
                  <h2>
                    Decisions move
                    <br />
                    good things forward.
                  </h2>
                  <p>
                    Review the purpose, evidence, and funding conditions before
                    you add your approval.
                  </p>
                  <button onClick={() => setView("approvals")}>
                    Open approval workspace
                    <ArrowUpRight size={19} />
                  </button>
                </section>
              </div>
              <TransactionTable
                transactions={data.transactions.slice(0, 6)}
                open={open}
                title="Recent transaction activity"
              />
            </>
          )}
          {view === "organizations" && (
            <>
              <Heading
                eyebrow="INDEPENDENT BY DESIGN"
                title="The funding collective"
                text="Three organizations. Shared visibility. Separate authority."
              />
              <div className="org-grid">
                {data.organizations.map((o) => (
                  <section className="panel" key={o.id}>
                    <Building2 className="teal" size={28} />
                    <h2>{o.name}</h2>
                    <p>{o.city} · Synthetic organization</p>
                    <div className="org-balance">
                      {money(
                        o.commitments.reduce((s, c) => s + c.available, 0),
                      )}
                      <small> VND available</small>
                    </div>
                    <h3>Memberships</h3>
                    {o.memberships.map((m, i) => (
                      <div className="list-row" key={i}>
                        <span>{m.user.name}</span>
                        <span className="pill">{m.role}</span>
                      </div>
                    ))}
                    <h3>Contribution policies</h3>
                    {o.commitments.map((c) => (
                      <p key={c.id}>
                        {[
                          ...new Set(c.restrictions.map((r) => r.category)),
                        ].join(" / ")}{" "}
                        ·{" "}
                        {c.independentVerification
                          ? "Independent verification"
                          : "Organization approval"}{" "}
                        · Expires {new Date(c.expiresAt).toLocaleDateString()}
                      </p>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "commitments" && (
            <>
              <Heading
                eyebrow="CONDITIONAL CAPITAL"
                title="Funding commitments"
                text="Define where your contribution can go before it joins the pool."
              />
              {admin && (
                <CommitmentForm
                  data={data}
                  busy={busy}
                  onSubmit={(v) =>
                    run(async () => {
                      await api("commitment", v);
                      await refresh();
                      setNotice(
                        "Funding commitment created. Its restrictions apply to every allocation.",
                      );
                    })
                  }
                />
              )}
              <section className="panel">
                <div className="section-title">
                  <h2>Committed funding</h2>
                  <span className="pill">Integer VND · simulated</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Organization / policy</th>
                        <th>Available</th>
                        <th>Reserved</th>
                        <th>Spent</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.organizations.flatMap((o) =>
                        o.commitments.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{o.name}</strong>
                              <small>
                                {[
                                  ...new Set(
                                    c.restrictions.map((r) => r.category),
                                  ),
                                ].join(", ")}
                                {c.independentVerification
                                  ? " · Independent reviewer"
                                  : ""}
                              </small>
                            </td>
                            <td>{money(c.available)}</td>
                            <td>{money(c.reserved)}</td>
                            <td>{money(c.spent)}</td>
                            <td>
                              {new Date(c.expiresAt).toLocaleDateString()}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {view === "create" && (
            <>
              <Heading
                eyebrow="A PURPOSE WORTH FUNDING"
                title="Create a transaction"
                text="Funding is matched to its conditions. Authority follows the exact request."
              />
              <ProposalForm
                data={data}
                busy={busy}
                onSubmit={(v) =>
                  run(async () => {
                    const t = await api("propose", v);
                    await refresh();
                    setSelected(t.id);
                    setView("details");
                    setNotice(
                      "Funds reserved. The request is ready for independent approvals.",
                    );
                  })
                }
              />
            </>
          )}
          {view === "approvals" && (
            <>
              <Heading
                eyebrow="YOUR AUTHORITY MATTERS"
                title="Approval workspace"
                text="Inspect the evidence and exact allocation. Each organization speaks only for itself."
              />
              <TransactionTable
                title="Requests awaiting review"
                transactions={pending}
                open={open}
              />
              <TransactionTable
                title="Decision history"
                transactions={data.transactions.filter(
                  (t) => t.approvals.length > 0,
                )}
                open={open}
              />
            </>
          )}
          {view === "details" && current && (
            <>
              <Heading
                eyebrow={`TRANSACTION / ${current.id.slice(-8).toUpperCase()}`}
                title={current.description}
                text="Synthetic transaction · all amounts in VND"
              />
              <div className="detail-grid">
                <section className="panel">
                  <div className="section-title">
                    <h2>
                      {money(current.amount)} <small>VND</small>
                    </h2>
                    <Status state={current.state} />
                  </div>
                  <dl>
                    <dt>Beneficiary</dt>
                    <dd>{current.beneficiary.name}</dd>
                    <dt>Destination account</dt>
                    <dd>{current.destination}</dd>
                    <dt>Purpose</dt>
                    <dd>{current.category}</dd>
                    <dt>Evidence reference</dt>
                    <dd>{current.evidence}</dd>
                    <dt>Expires</dt>
                    <dd>{new Date(current.expiresAt).toLocaleString()}</dd>
                  </dl>
                  <h3>Funding allocation</h3>
                  {current.allocations.map((a) => (
                    <div className="list-row" key={a.id}>
                      <span>
                        {a.commitment.organization.name}
                        <small>
                          {a.commitment.independentVerification
                            ? "Independent verification required"
                            : "Organization approval required"}
                        </small>
                      </span>
                      <strong>{money(a.amount)} VND</strong>
                    </div>
                  ))}
                  {!current.allocations.length && (
                    <p>
                      No funds reserved. Use this draft to submit a new
                      proposal.
                    </p>
                  )}
                  <h3>Approval status</h3>
                  {current.allocations.map((a) => (
                    <div className="list-row" key={a.id}>
                      <span>{a.commitment.organization.name}</span>
                      <Status
                        state={
                          current.approvals.find(
                            (p) =>
                              p.organizationId === a.commitment.organizationId,
                          )?.decision ?? "AWAITING"
                        }
                      />
                    </div>
                  ))}
                  <div className="actions">
                    {current.state === "DRAFT" && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const t = await api("propose", {
                              beneficiaryId: current.beneficiaryId,
                              amount: current.amount,
                              category: current.category,
                              destination: current.destination,
                              description: current.description,
                              evidence: current.evidence,
                            });
                            await refresh();
                            setSelected(t.id);
                          })
                        }
                      >
                        Propose this request
                        <ArrowRight size={17} />
                      </button>
                    )}
                    {current.state === "PENDING_APPROVAL" &&
                      data.user.memberships
                        .filter(
                          (m) =>
                            ["ADMIN", "ANALYST"].includes(m.role) &&
                            current.allocations.some(
                              (a) =>
                                a.commitment.organizationId ===
                                m.organizationId,
                            ) &&
                            !current.approvals.some(
                              (a) => a.organizationId === m.organizationId,
                            ),
                        )
                        .map((m) => (
                          <div className="actions" key={m.id}>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api("approve", {
                                    id: current.id,
                                    organizationId: m.organizationId,
                                    decision: "APPROVE",
                                  });
                                  await refresh();
                                  setNotice(
                                    "Approval recorded for this exact payload.",
                                  );
                                })
                              }
                            >
                              Approve for {m.organization.name}
                            </button>
                            <button
                              className="danger-button"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api("approve", {
                                    id: current.id,
                                    organizationId: m.organizationId,
                                    decision: "REJECT",
                                  });
                                  await refresh();
                                })
                              }
                            >
                              Reject
                            </button>
                          </div>
                        ))}
                    {current.state === "AUTHORIZED" && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api("settle", { id: current.id });
                            await refresh();
                            setNotice(
                              "Simulated settlement complete. No real money moved.",
                            );
                          })
                        }
                      >
                        Simulate settlement
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                  </div>
                  {["DRAFT", "PENDING_APPROVAL", "AUTHORIZED"].includes(
                    current.state,
                  ) &&
                    current.creatorId === data.user.id && (
                      <details>
                        <summary>
                          Amend request (invalidates all approvals)
                        </summary>
                        <ProposalForm
                          data={data}
                          busy={busy}
                          initial={current}
                          onSubmit={(v) =>
                            run(async () => {
                              await api("amend", {
                                id: current.id,
                                proposal: v,
                              });
                              await refresh();
                              setNotice(
                                "All previous approvals invalidated and funds released. Re-propose the draft to request fresh approvals.",
                              );
                            })
                          }
                        />
                      </details>
                    )}
                  <details>
                    <summary>Exact payload and security checks</summary>
                    <p>
                      Authorization: {current.authorization?.provider ?? "None"}{" "}
                      · Hash binding:{" "}
                      {current.payloadHash ? "recorded" : "not proposed"} ·
                      Missing organizations:{" "}
                      {current.missingApprovals.join(", ") || "none"} ·
                      Settlement:{" "}
                      {current.settlement ? "recorded" : "not settled"}
                    </p>
                    <code className="hash">
                      SHA-256 {current.payloadHash || "Not yet bound"}
                    </code>
                    <pre>{JSON.stringify(current.exactPayload, null, 2)}</pre>
                  </details>
                </section>
                <section className="panel">
                  <h2>Transaction timeline</h2>
                  <div className="timeline">
                    {current.audit.map((a) => (
                      <div key={a.id}>
                        <span className="timeline-dot" />
                        <strong>{a.action.replaceAll("_", " ")}</strong>
                        <small>{new Date(a.createdAt).toLocaleString()}</small>
                        <p>{a.detail}</p>
                      </div>
                    ))}
                    {!current.audit.length && (
                      <p>
                        Seeded draft. Propose it to begin the approval journey.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "security" && (
            <SecurityLab userId={data.user.id} refresh={refresh} />
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              TrustVault · RMIT Hackathon 2026
            </span>
            <span>
              One Transaction. Multiple Authorities. No Single Controller.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <section className={`metric ${accent ? "metric-accent" : ""}`}>
      <div>
        {label}
        {icon ?? <Activity size={18} />}
      </div>
      <strong>
        {money(value)}
        <small>VND</small>
      </strong>
      <p>{detail}</p>
    </section>
  );
}
export function Status({ state }: { state: string }) {
  return (
    <span className={`status status-${state.toLowerCase()}`}>
      {state.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
function TransactionTable({
  transactions,
  open,
  title,
}: {
  transactions: TransactionView[];
  open: (t: TransactionView) => void;
  title: string;
}) {
  return (
    <section className="panel table-panel">
      <div className="section-title">
        <h2>{title}</h2>
        <span className="muted">{transactions.length} requests</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Request / beneficiary</th>
              <th>Amount</th>
              <th>Purpose</th>
              <th>Status</th>
              <th aria-label="Open details" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>
                  <button className="text-button" onClick={() => open(t)}>
                    {t.description}
                  </button>
                  <small>{t.beneficiary.name}</small>
                </td>
                <td className="amount">
                  {money(t.amount)}
                  <small>VND</small>
                </td>
                <td>
                  <span className="category">{t.category.toLowerCase()}</span>
                </td>
                <td>
                  <Status state={t.state} />
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${t.description}`}
                    onClick={() => open(t)}
                  >
                    <ArrowUpRight size={19} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!transactions.length && (
          <div className="empty">
            <CheckCheck />
            <h3>You’re all caught up</h3>
            <p>New eligible requests will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function ProposalForm({
  data,
  busy,
  onSubmit,
  initial,
}: {
  data: Snapshot;
  busy: boolean;
  onSubmit: (v: unknown) => void;
  initial?: TransactionView;
}) {
  const [preview, setPreview] = useState(""),
    [previewBusy, setPreviewBusy] = useState(false);
  function values(form: HTMLFormElement) {
    const f = new FormData(form);
    return {
      beneficiaryId: String(f.get("beneficiaryId")),
      amount: Number(f.get("amount")),
      category: String(f.get("category")),
      destination: String(f.get("destination")),
      description: String(f.get("description")),
      evidence: String(f.get("evidence")),
    };
  }
  return (
    <form
      className="panel form-panel"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(values(e.currentTarget));
      }}
    >
      <div className="form-grid">
        <label>
          Beneficiary
          <select name="beneficiaryId" defaultValue={initial?.beneficiaryId}>
            {data.beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount (VND)
          <input
            name="amount"
            type="number"
            min="1"
            max="1000000000"
            step="1"
            required
            defaultValue={initial?.amount ?? 12000000}
          />
        </label>
        <label>
          Spending category
          <select name="category" defaultValue={initial?.category ?? "MEDICAL"}>
            <option>MEDICAL</option>
            <option>EDUCATION</option>
            <option>TRAVEL</option>
          </select>
        </label>
        <label>
          Destination account
          <input
            name="destination"
            required
            defaultValue={
              initial?.destination ?? data.beneficiaries[0]?.account
            }
          />
        </label>
        <label className="wide">
          Description
          <input
            name="description"
            minLength={5}
            maxLength={500}
            required
            defaultValue={
              initial?.description ?? "Collaborative medical assistance"
            }
          />
        </label>
        <label className="wide">
          Supporting evidence reference
          <input
            name="evidence"
            minLength={3}
            maxLength={200}
            required
            defaultValue={initial?.evidence ?? "SYNTHETIC-INVOICE-2026"}
          />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={previewBusy || busy}
          onClick={async (e) => {
            setPreviewBusy(true);
            try {
              const v = await api("preview", values(e.currentTarget.form!));
              setPreview(
                v.allocations
                  .map(
                    (a: { commitmentId: string; amount: number }) =>
                      `${a.commitmentId}: ${money(a.amount)} VND`,
                  )
                  .join("\n"),
              );
            } catch (e) {
              setPreview(String(e));
            } finally {
              setPreviewBusy(false);
            }
          }}
        >
          Check eligible funding
        </button>
        <button className="primary" disabled={busy}>
          {initial ? "Save amendment" : "Reserve funds & propose"}
          <ArrowRight size={17} />
        </button>
      </div>
      {preview && (
        <pre role="status" className="preview-result">
          {preview}
        </pre>
      )}
      <p className="form-note">
        Every contributing organization must approve. Preview does not reserve
        funds.
      </p>
    </form>
  );
}
function CommitmentForm({
  data,
  busy,
  onSubmit,
}: {
  data: Snapshot;
  busy: boolean;
  onSubmit: (v: unknown) => void;
}) {
  return (
    <details className="panel commitment-create">
      <summary>
        <Plus size={18} />
        Create a funding commitment
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            organizationId: f.get("organizationId"),
            amount: Number(f.get("amount")),
            categories: f.getAll("categories"),
            beneficiaryId: f.get("beneficiaryId"),
            expiresAt: new Date(String(f.get("expiresAt"))).toISOString(),
            independentVerification: f.has("independentVerification"),
          });
        }}
      >
        <div className="form-grid">
          <label>
            Your organization
            <select name="organizationId">
              {data.user.memberships
                .filter((m) => m.role === "ADMIN")
                .map((m) => (
                  <option key={m.id} value={m.organizationId}>
                    {m.organization.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Contribution (VND)
            <input
              name="amount"
              type="number"
              min="1"
              max="1000000000"
              step="1"
              required
              defaultValue="1000000"
            />
          </label>
          <label>
            Permitted beneficiary
            <select name="beneficiaryId">
              {data.beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expires on
            <input
              name="expiresAt"
              type="date"
              required
              defaultValue="2027-12-31"
            />
          </label>
          <fieldset>
            <legend>Permitted purposes</legend>
            {["MEDICAL", "EDUCATION", "TRAVEL"].map((c) => (
              <label className="check" key={c}>
                <input
                  type="checkbox"
                  name="categories"
                  value={c}
                  defaultChecked={c === "MEDICAL"}
                />
                {c.toLowerCase()}
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input type="checkbox" name="independentVerification" />
            Require a reviewer independent of the requester
          </label>
        </div>
        <button className="primary" disabled={busy}>
          Create commitment
          <Plus size={17} />
        </button>
      </form>
    </details>
  );
}
