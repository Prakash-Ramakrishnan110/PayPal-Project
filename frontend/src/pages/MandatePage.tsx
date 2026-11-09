import React, { useState } from 'react';
import { api } from '../api';
import type { Mandate, MandateDraft } from '../api';

interface MandatePageProps {
  onMandateUpdated: () => void;
  activeMandate?: Mandate | null;
}

const PRESET_CHIPS = [
  'Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60',
  'Spend up to $80 this month on tech accessories and electronics, auto-approve under $35',
  'Spend up to $200 this month on athletic wear, max 2 items per order, auto-approve under $50',
];

export const MandatePage: React.FC<MandatePageProps> = ({ onMandateUpdated }) => {
  const [ruleText, setRuleText] = useState(
    'Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60'
  );
  const [compiling, setCompiling] = useState(false);
  const [activating, setActivating] = useState(false);
  const [draft, setDraft] = useState<MandateDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMandate, setSuccessMandate] = useState<Mandate | null>(null);

  const handleCompile = async () => {
    if (!ruleText.trim()) return;
    try {
      setCompiling(true);
      setError(null);
      setSuccessMandate(null);
      const res = await api.compileDraft(ruleText);
      setDraft(res);
    } catch (err: any) {
      setError(err.message || 'Failed to compile mandate draft');
    } finally {
      setCompiling(false);
    }
  };

  const handleActivate = async () => {
    if (!draft) return;
    try {
      setActivating(true);
      setError(null);
      const res = await api.activateMandate(draft);
      setSuccessMandate(res);
      onMandateUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to activate mandate');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem', letterSpacing: '-0.025em' }}>
          Spending Mandate Compiler
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '850px' }}>
          Define spending constraints in plain English. Gemini translates them into a tamper-evident, cryptographically signed mandate enforced deterministically outside the LLM.
        </p>
      </div>

      <div className="card">
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
          Natural Language Spending Policy:
        </label>
        <textarea
          className="textarea-input"
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          placeholder="e.g. Spend up to $150 this month on running gear, auto-approve under $60..."
        />

        <div style={{ marginTop: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
            CLICK TO LOAD EXAMPLE POLICY:
          </span>
          <div className="chip-container">
            {PRESET_CHIPS.map((chip, idx) => (
              <button key={idx} className="chip" onClick={() => setRuleText(chip)}>
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="btn-group">
          <button className="primary-btn" onClick={handleCompile} disabled={compiling || !ruleText.trim()}>
            {compiling ? 'Compiling with Gemini AI...' : 'Compile Mandate (Gemini)'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1.25rem', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', borderRadius: 10, color: 'var(--accent-red)', marginBottom: '1.5rem', fontWeight: 500 }}>
          <strong style={{ fontWeight: 700 }}>Compilation Error:</strong> {error}
        </div>
      )}

      {/* Compiled Draft Card */}
      {draft && (
        <div className="card" style={{ border: '2px solid #bfdbfe', background: '#ffffff', boxShadow: 'var(--shadow-md)' }}>
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="badge badge-allow">Compiled Draft</span>
              <span style={{ color: 'var(--text-primary)' }}>Mandate Specification</span>
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Step 2 of 2: Review &amp; Cryptographically Sign
            </span>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--paypal-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
              Summary Restatement:
            </span>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              "{draft.summary}"
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>MONTHLY CAP</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                ${draft.monthly_cap_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>PER-TRANSACTION CAP</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                ${draft.per_transaction_cap_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--accent-green-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>AUTO-APPROVE UNDER</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.25rem' }}>
                ${draft.auto_approve_under_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>VALIDITY</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {draft.expires_in_days} Days
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                ALLOWED MERCHANTS
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.allowed_merchants.length > 0 ? (
                  draft.allowed_merchants.map((m, i) => (
                    <span key={i} className="fingerprint" style={{ color: 'var(--paypal-blue)', background: '#ffffff' }}>
                      {m}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Any non-blocked merchant</span>
                )}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                BLOCKED CATEGORIES (STRICT REJECTION)
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.blocked_categories.map((c, i) => (
                  <span key={i} className="fingerprint" style={{ color: 'var(--accent-red)', background: '#ffffff' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {draft.assumptions.length > 0 && (
            <div style={{ background: 'var(--accent-amber-bg)', border: '1px solid var(--accent-amber-border)', padding: '1rem 1.25rem', borderRadius: 8, marginBottom: '1.5rem' }}>
              <span style={{ color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                Compiler Conservative Defaults &amp; Assumptions:
              </span>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {draft.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="btn-group">
            <button className="success-btn" onClick={handleActivate} disabled={activating}>
              {activating ? 'Signing with HMAC-SHA256...' : 'Sign with HMAC-SHA256 & Activate Mandate'}
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMandate && (
        <div style={{ padding: '1.25rem', background: 'var(--accent-green-bg)', border: '1.5px solid var(--accent-green-border)', borderRadius: 10, marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <span className="badge badge-allow">Active &amp; Enforced</span>
            <strong style={{ color: 'var(--accent-green)', fontSize: '1rem' }}>
              Mandate Successfully Signed &amp; Activated!
            </strong>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Cryptographic HMAC-SHA256 Signature:{' '}
            <span className="fingerprint" style={{ background: '#ffffff', color: 'var(--text-primary)' }}>
              {successMandate.signature}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
