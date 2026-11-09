import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Mandate, MandateDraft } from '../api';

interface MandatePageProps {
  onMandateUpdated: () => void;
  activeMandate?: Mandate | null;
}

const PRESET_CHIPS = [
  {
    label: '👟 Running Gear (Default)',
    text: 'Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60',
    desc: 'Max $150/mo • Auto-approves under $60 • Running stores only',
  },
  {
    label: '💻 Tech Accessories',
    text: 'Spend up to $80 this month on tech accessories and electronics, auto-approve under $35',
    desc: 'Max $80/mo • Auto-approves under $35 • Electronics only',
  },
  {
    label: '🎽 Athletic Wear (Strict)',
    text: 'Spend up to $200 this month on athletic wear, max 2 items per order, auto-approve under $50',
    desc: 'Max $200/mo • Auto-approves under $50 • Max 2 items per purchase',
  },
];

export const MandatePage: React.FC<MandatePageProps> = ({ onMandateUpdated, activeMandate }) => {
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
    <div style={{ maxWidth: '1050px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--paypal-blue)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Step 1 of 3</span> • Spending Rules Configuration
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem', letterSpacing: '-0.025em' }}>
          Define Your AI Spending Mandate
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.975rem', maxWidth: '850px' }}>
          Tell the AI how much money it is allowed to spend in plain English. Gemini compiles your instructions into a structured, cryptographically signed policy that is enforced 100% deterministically outside the LLM.
        </p>
      </div>

      {/* Explanation Banner */}
      <div className="info-box" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
        <div className="info-box-title" style={{ color: 'var(--paypal-dark)' }}>
          <span>💡 How the Mandate Protects Your Money</span>
        </div>
        <div className="info-box-desc">
          When an AI shopping agent tries to buy something, Mandate Guard checks it against your mandate:
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <li><strong>Auto-Approve Limit:</strong> If the purchase is within allowed categories and costs LESS than this amount, it is automatically approved for PayPal checkout.</li>
            <li><strong>Human Review (Escalation):</strong> If the item is allowed but costs MORE than this amount, it pauses in your Dashboard queue for you to click "Approve".</li>
            <li><strong>Hard Limits &amp; Blocked Items:</strong> Any attempt to buy gift cards, crypto, or exceed monthly caps is rejected immediately.</li>
          </ul>
        </div>
      </div>

      {/* Input Form Card */}
      <div className="card">
        <label style={{ display: 'block', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
          Type Your Spending Rule in Plain English:
        </label>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Include budget cap, category or stores, and your auto-approval threshold.
        </p>

        <textarea
          className="textarea-input"
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          placeholder="e.g. Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60..."
          rows={3}
        />

        {/* Preset Chips */}
        <div style={{ marginTop: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
            OR CLICK TO CHOOSE A PRE-BUILT DEMO POLICY:
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
            {PRESET_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setRuleText(chip.text)}
                style={{
                  background: ruleText === chip.text ? '#eff6ff' : '#ffffff',
                  border: ruleText === chip.text ? '2px solid var(--paypal-blue)' : '1px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '0.85rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{chip.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{chip.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="btn-group" style={{ marginTop: '1.5rem' }}>
          <button className="primary-btn" onClick={handleCompile} disabled={compiling || !ruleText.trim()}>
            {compiling ? 'Compiling with Gemini AI...' : 'Compile Mandate with Gemini ➡️'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1.25rem', background: 'var(--accent-red-bg)', border: '1.5px solid var(--accent-red-border)', borderRadius: 10, color: 'var(--accent-red)', marginBottom: '1.5rem', fontWeight: 500 }}>
          <strong style={{ fontWeight: 700 }}>Compilation Error:</strong> {error}
        </div>
      )}

      {/* Compiled Draft Review Card */}
      {draft && (
        <div className="card" style={{ border: '2px solid #bfdbfe', background: '#ffffff', boxShadow: 'var(--shadow-md)' }}>
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="badge badge-allow">✓ Compiled Successfully</span>
              <span style={{ color: 'var(--text-primary)' }}>Review &amp; Sign Your Spending Policy</span>
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Step 2 of 2: Cryptographic Activation
            </span>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--paypal-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
              Gemini Plain-English Restatement:
            </span>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              "{draft.summary}"
            </p>
          </div>

          {/* Extracted Metrics Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>1. MONTHLY BUDGET CAP</div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                ${draft.monthly_cap_dollars.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Hard ceiling for entire month</div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>2. MAX PER TRANSACTION</div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                ${draft.per_transaction_cap_dollars.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Max allowed for 1 item</div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1.5px solid var(--accent-green-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>3. AUTO-APPROVE UNDER</div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.25rem' }}>
                ${draft.auto_approve_under_dollars.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>No human review needed below this</div>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>4. POLICY DURATION</div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {draft.expires_in_days} Days
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Auto-expires after this time</div>
            </div>
          </div>

          {/* Merchants and Blocked Categories */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                ALLOWED MERCHANTS (STORES)
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.allowed_merchants.length > 0 ? (
                  draft.allowed_merchants.map((m, i) => (
                    <span key={i} className="fingerprint" style={{ color: 'var(--paypal-blue)', background: '#ffffff', borderColor: '#bfdbfe' }}>
                      ✓ {m}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Any non-blocked merchant</span>
                )}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                BLOCKED CATEGORIES (ZERO TOLERANCE)
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {draft.blocked_categories.map((c, i) => (
                  <span key={i} className="fingerprint" style={{ color: 'var(--accent-red)', background: '#ffffff', borderColor: '#fca5a5' }}>
                    ✕ {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="btn-group">
            <button className="success-btn" onClick={handleActivate} disabled={activating} style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>
              {activating ? 'Signing with HMAC-SHA256...' : '🔒 Cryptographically Sign & Activate Mandate'}
            </button>
          </div>
        </div>
      )}

      {/* Success Notification & Next Step Guide */}
      {(successMandate || (activeMandate && activeMandate.status === 'active')) && (
        <div className="next-step-card">
          <div>
            <div className="next-step-title">
              ✅ Step 1 Complete: Spending Mandate is Active &amp; Enforced!
            </div>
            <div className="next-step-desc">
              Your AI agent now has an active spending allowance under strict deterministic control.
            </div>
          </div>
          <Link to="/agent" className="primary-btn" style={{ fontSize: '0.95rem', padding: '0.75rem 1.5rem', textDecoration: 'none' }}>
            Go to Step 2: Test AI Shopper ➡️
          </Link>
        </div>
      )}
    </div>
  );
};