import React from 'react';
import { Link } from 'react-router-dom';

export const PayPalCancel: React.FC = () => {
  return (
    <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: '2.5rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>ℹ️</div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>PayPal Payment Cancelled</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          The PayPal checkout session was cancelled by the user. No funds were captured and your mandate cap remains preserved.
        </p>
        <Link to="/dashboard" className="primary-btn">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};
