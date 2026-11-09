import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';

export const PayPalReturn: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('token');
  const [capturing, setCapturing] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('No PayPal order token provided in URL query string.');
      setCapturing(false);
      return;
    }

    const capture = async () => {
      try {
        const res = await api.captureOrder(orderId);
        setResult(res);
      } catch (err: any) {
        setError(err.message || 'Capture failed');
      } finally {
        setCapturing(false);
      }
    };

    capture();
  }, [orderId]);

  return (
    <div style={{ maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: '3rem 2.5rem', boxShadow: 'var(--shadow-md)' }}>
        {capturing && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Capturing PayPal Sandbox Payment...
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Finalizing transaction with PayPal Sandbox Orders v2 for order <code className="fingerprint">{orderId}</code>
            </p>
          </div>
        )}

        {error && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-red)', marginBottom: '0.5rem' }}>
              Payment Capture Failed
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem' }}>{error}</p>
            <Link to="/dashboard" className="primary-btn">
              Return to Dashboard
            </Link>
          </div>
        )}

        {result && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-green)', marginBottom: '0.5rem' }}>
              PayPal Payment Successfully Completed!
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              The purchase was settled through PayPal Sandbox and committed to the Mandate Guard immutable audit trail.
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: 10, marginBottom: '1.75rem', textAlign: 'left', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Order ID:</span>{' '}
                <span className="fingerprint" style={{ color: 'var(--paypal-blue)', background: '#eff6ff' }}>{result.order_id}</span>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Capture ID:</span>{' '}
                <span className="fingerprint">{result.capture_id}</span>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>{' '}
                <strong style={{ color: 'var(--accent-green)' }}>{result.status}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Settled Amount:</span>{' '}
                <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>${(result.amount_cents / 100).toFixed(2)} USD</strong>
              </div>
            </div>

            <Link to="/dashboard" className="success-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
              View in Audit Log &amp; Spend Meter
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
