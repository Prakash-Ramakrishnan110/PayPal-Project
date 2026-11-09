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
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Spending Mandate Compiler
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Type your spending policy in natural language. Gemini compiles it into a structured, cryptographically signed mandate enforced deterministically outside the LLM.
        </p>
      </div>

      <div className="card">
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
          Natural Language Spending Rule:
        </label>
        <textarea
          className="textarea-input"
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          placeholder="e.g. Spend up to $150 this month on running gear, auto-approve under $60..."
        />

        <div style={{ marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            QUICK PRESETS:
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
            {compiling ? 'Compiling with Gemini...' : 'Compile Mandate (Gemini)'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-red)', borderRadius: 8, color: '#fca5a5', marginBottom: '1.5rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Compiled Draft Card */}
      {draft && (
        <div className="card" style={{ borderColor: 'var(--accent-blue)' }}>
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-allow">Compiled Draft</span>
              <span>Mandate Preview</span>
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Awaiting Cryptographic Signature
            </span>
          </div>

          <p style={{ fontSize: '1.05rem', color: '#fff', marginBottom: '1rem', fontStyle: 'italic' }}>
            "{draft.summary}"
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MONTHLY CAP</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>
                ${draft.monthly_cap_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PER-TRANSACTION CAP</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>
                ${draft.per_transaction_cap_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AUTO-APPROVE UNDER</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                ${draft.auto_approve_under_dollars.toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>EXPIRATION</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>
                {draft.expires_in_days} Days
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                ALLOWED MERCHANTS:
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.allowed_merchants.length > 0 ? (
                  draft.allowed_merchants.map((m, i) => (
                    <span key={i} className="fingerprint" style={{ color: 'var(--accent-cyan)' }}>
                      {m}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Any non-blocked</span>
                )}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                BLOCKED CATEGORIES (STRICT):
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.blocked_categories.map((c, i) => (
                  <span key={i} className="fingerprint" style={{ color: 'var(--accent-red)' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {draft.assumptions.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--accent-amber)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Compiler Assumptions &amp; Defaults Applied:
              </span>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                {draft.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="btn-group">
            <button className="success-btn" onClick={handleActivate} disabled={activating}>
              {activating ? 'Signing & Activating...' : 'Sign with HMAC-SHA256 & Activate'}
            </button>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successMandate && (
        <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--accent-green)', borderRadius: 8, marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span className="badge badge-allow">Mandate Active</span>
            <strong style={{ color: '#fff' }}>Mandate Successfully Signed &amp; Activated!</strong>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Cryptographic HMAC-SHA256 Signature:{' '}
            <span className="fingerprint">{successMandate.signature}</span>
          </p>
        </div>
      )}
    </div>
  );
};
