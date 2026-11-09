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
      setError('No PayPal order token provided in URL');
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
    <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: '2.5rem' }}>
        {capturing && (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Capturing PayPal Payment...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Finalizing transaction with PayPal Sandbox for order <code className="fingerprint">{orderId}</code>
            </p>
          </div>
        )}

        {error && (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>❌</div>
            <h2 style={{ fontSize: '1.5rem', color: 'var(--accent-red)', marginBottom: '0.5rem' }}>
              Payment Capture Failed
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
            <Link to="/dashboard" className="primary-btn">
              Return to Dashboard
            </Link>
          </div>
        )}

        {result && (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontSize: '1.5rem', color: 'var(--accent-green)', marginBottom: '0.5rem' }}>
              PayPal Payment Completed!
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              The purchase was settled in the PayPal Sandbox and committed to the Mandate Guard immutable audit log.
            </p>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order ID:</span>{' '}
                <span className="fingerprint">{result.order_id}</span>
              </div>
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Capture ID:</span>{' '}
                <span className="fingerprint">{result.capture_id}</span>
              </div>
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>{' '}
                <strong style={{ color: 'var(--accent-green)' }}>{result.status}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Settled Amount:</span>{' '}
                <strong style={{ color: '#fff' }}>${(result.amount_cents / 100).toFixed(2)} USD</strong>
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
