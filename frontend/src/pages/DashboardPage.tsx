import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { api } from '../api';
import type { AuditEvent, GuardStats, PendingApproval, BenchmarkResult } from '../api';

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  // Live Benchmark State
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);

  const fetchData = async () => {
    try {
      const [s, p, a] = await Promise.all([
        api.getStats(),
        api.listPendingApprovals(),
        api.getAuditLog(),
      ]);
      setStats(s);
      setPendingApprovals(p);
      setAuditLog(a);
    } catch (err) {
      console.error('Failed to poll dashboard data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 3 seconds per Prompt 9
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await api.approvePending(id);
      if (res.approve_url) {
        window.open(res.approve_url, '_blank');
      }
      fetchData();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setActionLoading(id);
      await api.rejectPending(id);
      fetchData();
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunBenchmark = async () => {
    try {
      setBenchmarking(true);
      const res = await api.runBenchmark();
      setBenchmark(res);
    } catch (err: any) {
      alert(`Benchmark execution failed: ${err.message}`);
    } finally {
      setBenchmarking(false);
    }
  };

  const handleExportAuditTrail = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLog, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mandate-guard-audit-trail-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // AG Grid Column Definitions
  const columnDefs: ColDef<AuditEvent>[] = useMemo(
    () => [
      {
        headerName: 'Time',
        field: 'timestamp',
        width: 130,
        sort: 'desc',
        valueFormatter: (params) => {
          if (!params.value) return '';
          return new Date(params.value).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
        },
      },
      {
        headerName: 'Guard Verdict',
        field: 'decision',
        width: 140,
        cellRenderer: (params: any) => {
          const val = params.value;
          if (val === 'ALLOW') {
            return <span className="badge badge-allow">🟢 ALLOW</span>;
          }
          if (val === 'ESCALATE') {
            return <span className="badge badge-escalate">🟡 ESCALATE</span>;
          }
          if (val === 'BLOCK') {
            return <span className="badge badge-block">🔴 BLOCK</span>;
          }
          return <span style={{ color: 'var(--text-muted)' }}>{val || '-'}</span>;
        },
      },
      {
        headerName: 'Purchased Item',
        field: 'item_name',
        width: 220,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Store / Merchant',
        field: 'merchant',
        width: 150,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Price',
        field: 'amount_cents',
        width: 120,
        valueFormatter: (params) => {
          if (params.value === undefined || params.value === null) return '-';
          return `$${(params.value / 100).toFixed(2)}`;
        },
      },
      {
        headerName: 'Why Guard Decided This (Reason Codes)',
        field: 'reason_codes',
        flex: 1,
        minWidth: 260,
        valueFormatter: (params) => {
          if (!params.value || !Array.isArray(params.value)) return '';
          return params.value.join(', ');
        },
      },
      {
        headerName: 'PayPal Order ID',
        field: 'paypal_order_id',
        width: 210,
        cellRenderer: (params: any) => {
          if (!params.value) return <span style={{ color: 'var(--text-muted)' }}>Not Billed</span>;
          return (
            <span className="fingerprint" style={{ color: 'var(--paypal-blue)', background: '#eff6ff', borderColor: '#bfdbfe' }}>
              {params.value}
            </span>
          );
        },
      },
    ],
    []
  );

  const onRowClicked = (event: RowClickedEvent<AuditEvent>) => {
    if (event.data) {
      setSelectedEvent(event.data);
    }
  };

  // Spend calculations
  const spent = stats?.spent_cents || 0;
  const reserved = stats?.reserved_cents || 0;
  const cap = stats?.monthly_cap_cents || 15000;
  const spentPct = Math.min(100, Math.round((spent / (cap || 1)) * 100));
  const reservedPct = Math.min(100 - spentPct, Math.round((reserved / (cap || 1)) * 100));
  const availableCents = Math.max(0, cap - (spent + reserved));

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--paypal-blue)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Step 3 of 3</span> • Control Center
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem', letterSpacing: '-0.025em' }}>
              Dashboard &amp; Human Approval Center
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.975rem', maxWidth: '850px' }}>
              Real-time budget telemetry, human-in-the-loop approvals for large purchases, and immutable audit logs.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowGuide(!showGuide)}
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.5rem 0.9rem', fontSize: '0.85rem', color: 'var(--text-secondary)', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {showGuide ? 'Hide Help Guide ✕' : 'ℹ️ How to Use This Dashboard'}
            </button>
            <Link to="/agent" className="primary-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              🤖 Launch AI Shopper ➡️
            </Link>
          </div>
        </div>
      </div>

      {/* Explainer Box */}
      {showGuide && (
        <div className="info-box" style={{ background: '#f8fafc', borderColor: '#cbd5e1', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ fontWeight: 800, color: 'var(--paypal-dark)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              💡 Quick Guide: Understanding the 3 Sections Below
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-updating live</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ background: '#eff6ff', color: 'var(--paypal-blue)', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>1</span>
                Monthly Spend Telemetry
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Shows how much money the AI has spent vs your maximum cap. <strong>Reserved</strong> means money on hold for pending human approvals so the agent can never exceed your budget.
              </p>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: 8, padding: '1rem' }}>
              <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.9rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ background: '#fffbeb', color: '#d97706', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>2</span>
                Human Approval Queue
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Items that cost <strong>more than your auto-approve limit ($60.00)</strong> pause here. They will NEVER be charged unless you click <strong>"Approve"</strong> to open PayPal Sandbox.
              </p>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ background: '#f1f5f9', color: 'var(--text-primary)', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>3</span>
                Deterministic Audit Trail
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                An immutable log of every action: 🟢 <strong>ALLOW</strong> (checked out), 🟡 <strong>ESCALATE</strong> (sent to you), or 🔴 <strong>BLOCK</strong> (stopped cold). Click any row to view cryptographic proof.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: SPEND METER & STATS */}
      <div className="card">
        <div className="card-title">
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>1. Monthly Budget &amp; Spend Telemetry</span>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.15rem' }}>
              Enforced in integer cents outside the LLM to prevent overspending
            </div>
          </div>
          <span className="fingerprint" style={{ color: 'var(--accent-green)', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
            ● Live Polling (Every 3s)
          </span>
        </div>

        {/* Big numbers row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TOTAL COMMITTED SPEND
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
                ${((spent + reserved) / 100).toFixed(2)}
              </span>
              <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                / ${(cap / 100).toFixed(2)} USD Monthly Cap
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              REMAINING BUDGET
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: availableCents > 0 ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: '0.2rem' }}>
              ${(availableCents / 100).toFixed(2)} USD
            </div>
          </div>
        </div>

        {/* Multi-segment progress bar */}
        <div className="spend-meter-bar" style={{ display: 'flex' }}>
          <div
            style={{
              width: `${spentPct}%`,
              background: '#059669',
              transition: 'width 0.4s ease',
            }}
            title={`Settled Spend: $${(spent / 100).toFixed(2)}`}
          />
          <div
            style={{
              width: `${reservedPct}%`,
              background: '#f59e0b',
              transition: 'width 0.4s ease',
            }}
            title={`Reserved Pending Approvals: $${(reserved / 100).toFixed(2)}`}
          />
        </div>

        {/* Legend for the progress bar */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#059669', display: 'inline-block' }} />
            <span>Settled (Paid via PayPal): <strong>${(spent / 100).toFixed(2)}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
            <span>Reserved (Awaiting Approval/Capture): <strong>${(reserved / 100).toFixed(2)}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#e2e8f0', display: 'inline-block' }} />
            <span>Available to Spend: <strong>${(availableCents / 100).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="stats-grid" style={{ marginBottom: 0 }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
            <div className="stat-label">🟢 ALLOWED PURCHASES</div>
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
              {stats?.allowed_count || 0}
            </div>
            <div className="stat-desc">Auto-approved under threshold limit</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
            <div className="stat-label">🟡 ESCALATED TO HUMAN</div>
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
              {stats?.escalated_count || 0}
            </div>
            <div className="stat-desc">Paused for your manual approval</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
            <div className="stat-label">🔴 BLOCKED ATTEMPTS</div>
            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>
              {stats?.blocked_count || 0}
            </div>
            <div className="stat-desc">Prompt injections &amp; cap violations</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: HUMAN APPROVAL QUEUE */}
      <div className="card">
        <div className="card-title">
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>2. Human Approval Queue (Escalated Orders)</span>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.15rem' }}>
              Purchases exceeding your auto-approval threshold ($60.00) require your confirmation
            </div>
          </div>
          {pendingApprovals.length > 0 && (
            <span className="badge badge-escalate">
              {pendingApprovals.length} ACTION REQUIRED
            </span>
          )}
        </div>

        {/* Simulated Mobile Push Alert Toast if pending exists */}
        {pendingApprovals.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📱</span>
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.875rem' }}>
                Simulated Push Notification Sent to User's Phone (PayPal App)
              </div>
              <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
                "Mandate Guard: Your AI Shopper has requested authorization for a purchase exceeding auto-approval limit. Review below."
              </div>
            </div>
          </div>
        )}

        {pendingApprovals.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨</div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              No Pending Orders in Approval Queue
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '520px', margin: '0 auto 1rem auto' }}>
              When the AI shopper selects an item above your auto-approval threshold (e.g. $119.00 Marathon Shoes), it will pause here for your 1-click authorization before any payment happens.
            </p>
            <Link to="/agent" className="primary-btn" style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}>
              Test an Escalated Purchase in Agent Demo ➡️
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            {pendingApprovals.map((p) => (
              <div
                key={p.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid var(--accent-amber-border)',
                  borderRadius: 12,
                  padding: '1.4rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <span className="badge badge-escalate" style={{ marginBottom: '0.4rem' }}>
                      🟡 Needs Your Approval
                    </span>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 800 }}>{p.item_name}</h4>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Store: <strong>{p.merchant}</strong></span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-amber)' }}>
                      ${(p.amount_cents / 100).toFixed(2)}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>USD</span>
                  </div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem', fontSize: '0.825rem', color: '#92400e', marginBottom: '1.25rem' }}>
                  <strong>Why review needed?</strong> Price exceeds your auto-approve threshold ($60.00). Approving will create a live PayPal Sandbox checkout session.
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className="success-btn"
                    style={{ flex: 1, padding: '0.65rem 0.75rem', fontSize: '0.875rem' }}
                    onClick={() => handleApprove(p.id)}
                    disabled={actionLoading === p.id}
                  >
                    {actionLoading === p.id ? 'Connecting to PayPal...' : '✓ Approve & Open PayPal'}
                  </button>
                  <button
                    style={{ background: '#ffffff', color: '#dc2626', border: '1.5px solid #fca5a5', padding: '0.65rem 1rem', fontSize: '0.875rem', borderRadius: 8, fontWeight: 700 }}
                    onClick={() => handleReject(p.id)}
                    disabled={actionLoading === p.id}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: LIVE SECURITY BENCHMARK RUNNER */}
      <div className="card" style={{ border: '2px solid #bfdbfe', background: '#f8fafc' }}>
        <div className="card-title">
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--paypal-dark)' }}>
              🛡️ Live Adversarial Red-Team Benchmark Battery
            </span>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.15rem' }}>
              Quantitative security proof: runs 120 automated attacks (prompt injections, budget overruns, race conditions)
            </div>
          </div>
          <button
            className="primary-btn"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1.1rem' }}
            onClick={handleRunBenchmark}
            disabled={benchmarking}
          >
            {benchmarking ? 'Executing 120 Attack Tests...' : '▶ Run Live 120-Attack Benchmark'}
          </button>
        </div>

        {benchmark && (
          <div style={{ marginTop: '1rem', background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="badge badge-allow" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
                  ✓ {benchmark.verdict}
                </span>
                <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                  {benchmark.blocked_attacks} / {benchmark.total_attacks} Attacks Blocked ({benchmark.block_rate_pct}%)
                </strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Average Latency: <strong style={{ color: 'var(--paypal-blue)' }}>{benchmark.avg_latency_microseconds} µs</strong> (Total {benchmark.total_elapsed_ms} ms)
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
              {Object.entries(benchmark.attack_categories).map(([category, count]) => (
                <div key={category} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.65rem 0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{category}:</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{count} Blocked</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.85rem', display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>✓ Legitimate Accuracy: <strong>{benchmark.legitimate_accuracy_pct}%</strong></span>
              <span>✓ Monthly Cap Race Prevention: <strong>{benchmark.race_condition_defense ? 'PASSED' : 'FAILED'}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: DETERMINISTIC AUDIT TRAIL */}
      <div className="card">
        <div className="card-title">
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>4. Deterministic Cryptographic Audit Trail</span>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.15rem' }}>
              Full AG Grid log of every purchase evaluation with tamper-evident HMAC verification
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {auditLog.length} Recorded Events
            </span>
            <button
              onClick={handleExportAuditTrail}
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: 6, fontWeight: 600, color: 'var(--paypal-blue)' }}
              title="Download cryptographic audit trail in JSON format"
            >
              📥 Export Audit Trail (.json)
            </button>
          </div>
        </div>

        {/* AG Grid without scroll traps */}
        <div className="ag-theme-quartz" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <AgGridReact
            theme="legacy"
            rowData={auditLog}
            columnDefs={columnDefs}
            domLayout="autoHeight"
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50]}
            onRowClicked={onRowClicked}
            animateRows={true}
          />
        </div>
      </div>

      {/* DRAWER / MODAL FOR SELECTED AUDIT EVENT */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000,
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            style={{
              width: '560px',
              maxWidth: '92vw',
              background: '#ffffff',
              borderLeft: '1px solid var(--border-color)',
              padding: '2.25rem',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div>
                <span className="badge badge-allow" style={{ marginBottom: '0.25rem' }}>Cryptographic Proof</span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Audit Event Payload</h3>
              </div>
              <button
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}
                onClick={() => setSelectedEvent(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Event ID:</span>{' '}
                <span className="fingerprint">{selectedEvent.id}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Event Type:</span>{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{selectedEvent.event_type}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Guard Verdict:</span>{' '}
                <span className={`badge ${selectedEvent.decision === 'ALLOW' ? 'badge-allow' : selectedEvent.decision === 'ESCALATE' ? 'badge-escalate' : 'badge-block'}`}>
                  {selectedEvent.decision || 'N/A'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Timestamp:</span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Item &amp; Merchant:</span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{selectedEvent.item_name} from <strong>{selectedEvent.merchant}</strong></span>
              </div>
              {selectedEvent.amount_cents !== undefined && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Amount:</span>{' '}
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>${(selectedEvent.amount_cents / 100).toFixed(2)} USD</strong>
                </div>
              )}
              {selectedEvent.paypal_order_id && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>PayPal Order ID:</span>{' '}
                  <span className="fingerprint" style={{ color: 'var(--paypal-blue)', background: '#eff6ff', borderColor: '#bfdbfe' }}>
                    {selectedEvent.paypal_order_id}
                  </span>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Reason Codes:</span>{' '}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {selectedEvent.reason_codes.map((r, i) => (
                    <span key={i} className="fingerprint" style={{ background: '#f8fafc' }}>{r}</span>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                  RAW AUDIT EVENT JSON PAYLOAD:
                </span>
                <pre style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, fontSize: '0.8rem', color: '#1e293b', border: '1px solid var(--border-color)', overflowX: 'auto', maxHeight: '220px' }}>
                  {selectedEvent.payload_json ? JSON.stringify(JSON.parse(selectedEvent.payload_json), null, 2) : '{}'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};