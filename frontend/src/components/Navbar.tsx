import React from 'react';
import { NavLink } from 'react-router-dom';

export const Navbar: React.FC = () => {
  return (
    <header className="navbar">
      <div className="nav-brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>MANDATE GUARD</span>
        <span className="brand-badge">PayPal AI</span>
      </div>
      <nav className="nav-links">
        <NavLink to="/mandate" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          1. Mandate
        </NavLink>
        <NavLink to="/agent" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          2. Shopping Agent
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          3. Dashboard & Audit
        </NavLink>
      </nav>
    </header>
  );
};

