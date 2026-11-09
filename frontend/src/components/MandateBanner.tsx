import React, { useState } from 'react';
import { api } from '../api';
import type { Mandate } from '../api';

interface MandateBannerProps {
  mandate: Mandate | null;
  onMandateRevoked: () => void;
}

export const MandateBanner: React.FC<MandateBannerProps> = ({ mandate, onMandateRevoked }) => {
  const [revoking, setRevoking] = useState(false);

  const handleKillSwitch = async () => {
    if (!mandate) return;
    const confirm = window.confirm(
      'EMERGENCY KILL SWITCH: Are you sure you want to stop all spending? This immediately revokes permission and freezes any further agent purchases.'
    );
    if (!confirm) return;

    try {
      setRevoking(true);
      await api.revokeMandate(mandate.id);
      onMandateRevoked();
    } catch (err: any) {
      alert(`Failed to revoke mandate: ${err.message}`);
    } finally {
      setRevoking(false);
    }
  };

  if (!mandate || mandate.status !== 'active') {
    return (
      <div className="mandate-banner" style={{ borderLeft: '4px solid var(--accent-amber)', background: 'var(--accent-amber-bg)' }}>
        <div className="banner-content">
          <span className="status-pill status-empty">STEP 1 NEEDED: NO RULES ACTIVE</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            The AI agent cannot spend anything yet. Go to <strong>"1. Set Rules (Mandate)"</strong> to authorize spending.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mandate-banner" style={{ borderLeft: '4px solid var(--accent-green)', background: '#ffffff' }}>
      <div className="banner-content">
        <span className="status-pill status-active">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }} />
          SPENDING PERMISSION ACTIVE
        </span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          Rule: "{mandate.natural_language}"
        </span>
        <span style={{ color: '#cbd5e1' }}>|</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          Max Monthly Limit: <strong style={{ color: 'var(--text-primary)' }}>${(mandate.monthly_cap_cents / 100).toFixed(2)}</strong> (Auto-approves under ${(mandate.auto_approve_under_cents / 100).toFixed(2)})
        </span>
        <span className="fingerprint" title={`Cryptographic HMAC-SHA256 signature guarantees nobody tampered with your rule`} style={{ background: '#f8fafc', color: 'var(--paypal-blue)' }}>
          🔒 Cryptographically Signed
        </span>
      </div>
      <div>
        <button
          className="kill-switch-btn"
          onClick={handleKillSwitch}
          disabled={revoking}
          title="Emergency Stop: Immediately revokes permission and stops the agent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {revoking ? 'Stopping...' : 'Emergency Kill Switch'}
        </button>
      </div>
    </div>
  );
};
