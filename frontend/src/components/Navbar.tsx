import React from 'react';
import { NavLink } from 'react-router-dom';

export const Navbar: React.FC = () => {
  return (
    <header className="navbar">
      <div className="nav-brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--paypal-dark)' }}>MANDATE GUARD</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>PayPal AI Spending Control</span>
        </div>
        <span className="brand-badge">PayPal AI</span>
      </div>

      {/* 3-Step Clear Flow */}
      <nav className="nav-links">
        <NavLink to="/mandate" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span style={{ background: '#e2e8f0', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', marginRight: '0.4rem', fontWeight: 700 }}>1</span>
          Set Rules (Mandate)
        </NavLink>
        <NavLink to="/agent" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span style={{ background: '#e2e8f0', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', marginRight: '0.4rem', fontWeight: 700 }}>2</span>
          AI Shopping Agent
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span style={{ background: '#e2e8f0', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', marginRight: '0.4rem', fontWeight: 700 }}>3</span>
          Dashboard &amp; Approvals
        </NavLink>
      </nav>
    </header>
  );
};
