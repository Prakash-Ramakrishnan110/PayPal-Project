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
      'KILL SWITCH: Are you sure you want to immediately revoke this spending mandate? Any future agent purchases will be blocked!'
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
      <div className="mandate-banner" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
        <div className="banner-content">
          <span className="status-pill status-empty">NO ACTIVE MANDATE</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Agent cannot authorize purchases until a signed spending mandate is compiled and activated.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mandate-banner" style={{ borderLeft: '4px solid var(--accent-green)' }}>
      <div className="banner-content">
        <span className="status-pill status-active">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)' }} />
          MANDATE ACTIVE
        </span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          "{mandate.natural_language}"
        </span>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          Cap: <strong style={{ color: '#fff' }}>${(mandate.monthly_cap_cents / 100).toFixed(2)}</strong> (Auto-approve &lt; ${(mandate.auto_approve_under_cents / 100).toFixed(2)})
        </span>
        <span className="fingerprint" title={`Full HMAC: ${mandate.signature}`}>
          HMAC: {mandate.signature.slice(0, 12)}...
        </span>
      </div>
      <div>
        <button
          className="kill-switch-btn"
          onClick={handleKillSwitch}
          disabled={revoking}
          title="Instant Kill Switch: Revoke this mandate and halt all purchases"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {revoking ? 'Revoking...' : 'Kill Switch'}
        </button>
      </div>
    </div>
  );
};
