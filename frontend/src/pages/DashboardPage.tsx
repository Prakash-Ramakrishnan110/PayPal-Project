import React, { useEffect, useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { api } from '../api';
import type { AuditEvent, GuardStats, PendingApproval } from '../api';

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  // AG Grid Column Definitions
  const columnDefs: ColDef<AuditEvent>[] = useMemo(
    () => [
      {
        headerName: 'Time',
        field: 'timestamp',
        width: 160,
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
        headerName: 'Decision',
        field: 'decision',
        width: 140,
        cellRenderer: (params: any) => {
          const val = params.value;
          if (val === 'ALLOW') {
            return <span className="badge badge-allow">ALLOW</span>;
          }
          if (val === 'ESCALATE') {
            return <span className="badge badge-escalate">ESCALATE</span>;
          }
          if (val === 'BLOCK') {
            return <span className="badge badge-block">BLOCK</span>;
          }
          return <span style={{ color: 'var(--text-muted)' }}>{val || '-'}</span>;
        },
      },
      {
        headerName: 'Item',
        field: 'item_name',
        width: 220,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Merchant',
        field: 'merchant',
        width: 150,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Amount',
        field: 'amount_cents',
        width: 130,
        valueFormatter: (params) => {
          if (params.value === undefined || params.value === null) return '-';
          return `$${(params.value / 100).toFixed(2)}`;
        },
      },
      {
        headerName: 'Reason Codes',
        field: 'reason_codes',
        flex: 1,
        minWidth: 230,
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
          if (!params.value) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
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

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem', letterSpacing: '-0.025em' }}>
          Real-Time Spending &amp; Audit Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '850px' }}>
          Live budget telemetry, human-in-the-loop approvals queue, and immutable AG Grid cryptographic audit log.
        </p>
      </div>

      {/* Spend Meter & Stats Grid */}
      <div className="card">
        <div className="card-title">
          <span>Monthly Spend Telemetry</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Live Polling (3s)
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
              ${((spent + reserved) / 100).toFixed(2)}
            </span>
            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginLeft: '0.4rem', fontWeight: 600 }}>
              / ${(cap / 100).toFixed(2)} USD
            </span>
            {reserved > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-amber)', marginLeft: '0.75rem', fontWeight: 600 }}>
                (${ (reserved / 100).toFixed(2) } reserved pending)
              </span>
            )}
          </div>
          <div style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: '1rem' }}>
            ${(Math.max(0, cap - (spent + reserved)) / 100).toFixed(2)} Available Budget
          </div>
        </div>

        {/* Multi-segment progress bar */}
        <div className="spend-meter-bar" style={{ display: 'flex' }}>
          <div
            style={{
              width: `${spentPct}%`,
              background: 'linear-gradient(90deg, #10b981, #06b6d4)',
              transition: 'width 0.4s ease',
            }}
            title={`Settled Spend: $${(spent / 100).toFixed(2)}`}
          />
          <div
            style={{
              width: `${reservedPct}%`,
              background: 'linear-gradient(90deg, #f59e0b, #d97706)',
              transition: 'width 0.4s ease',
            }}
            title={`Reserved Pending: $${(reserved / 100).toFixed(2)}`}
          />
        </div>

        <div className="stats-grid" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          <div className="stat-card">
            <div className="stat-label">ALLOWED PURCHASES</div>
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
              {stats?.allowed_count || 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ESCALATED TO HUMAN</div>
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
              {stats?.escalated_count || 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">BLOCKED ATTACKS / LIMITS</div>
            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>
              {stats?.blocked_count || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals Panel */}
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>Human Approval Queue (Escalated by Policy Engine)</span>
            {pendingApprovals.length > 0 && (
              <span className="badge badge-escalate">{pendingApprovals.length} PENDING</span>
            )}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Purchases above auto-approval threshold
          </span>
        </div>

        {pendingApprovals.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', padding: '1rem 0' }}>
            No pending approvals. Purchases within auto-approve limits proceed straight to PayPal.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {pendingApprovals.map((p) => (
              <div
                key={p.id}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid var(--accent-amber-border)',
                  borderRadius: 10,
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                  <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 700 }}>{p.item_name}</h4>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Merchant: <strong>{p.merchant}</strong></span>
                  </div>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-amber)' }}>
                    ${(p.amount_cents / 100).toFixed(2)}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Reason: Exceeds auto-approve threshold. Requires human authorization to generate PayPal checkout order.
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    className="success-btn"
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                    onClick={() => handleApprove(p.id)}
                    disabled={actionLoading === p.id}
                  >
                    {actionLoading === p.id ? 'Processing...' : 'Approve & Open PayPal'}
                  </button>
                  <button
                    style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: 8, fontWeight: 600 }}
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

      {/* AG Grid Audit Log */}
      <div className="card">
        <div className="card-title">
          <span>Deterministic Audit Trail (AG Grid Community)</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Click any row to inspect raw cryptographic payload
          </span>
        </div>

        <div className="ag-theme-quartz" style={{ height: 420, width: '100%', borderRadius: 8, overflow: 'hidden' }}>
          <AgGridReact
            rowData={auditLog}
            columnDefs={columnDefs}
            pagination={true}
            paginationPageSize={10}
            onRowClicked={onRowClicked}
            rowSelection="single"
            animateRows={true}
          />
        </div>
      </div>

      {/* Drawer / Modal for Selected Row Inspection */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000,
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            style={{
              width: '540px',
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
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Audit Event Payload</h3>
              <button
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }}
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
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Verdict:</span>{' '}
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
