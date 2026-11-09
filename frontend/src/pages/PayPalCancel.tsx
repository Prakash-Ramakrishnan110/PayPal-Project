import React from 'react';
import { Link } from 'react-router-dom';

export const PayPalCancel: React.FC = () => {
  return (
    <div style={{ maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: '3rem 2.5rem', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>ℹ️</div>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          PayPal Checkout Cancelled
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
          The PayPal checkout session was cancelled by the user. No funds were captured and your monthly spending budget remains fully preserved.
        </p>
        <Link to="/dashboard" className="primary-btn">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};
