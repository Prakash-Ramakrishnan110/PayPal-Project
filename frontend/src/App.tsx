import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import type { Mandate } from './api';
import { Navbar } from './components/Navbar';
import { MandateBanner } from './components/MandateBanner';
import { MandatePage } from './pages/MandatePage';
import { AgentPage } from './pages/AgentPage';
import { DashboardPage } from './pages/DashboardPage';
import { PayPalReturn } from './pages/PayPalReturn';
import { PayPalCancel } from './pages/PayPalCancel';
import './App.css';

export function App() {
  const [activeMandate, setActiveMandate] = useState<Mandate | null>(null);

  const fetchActiveMandate = async () => {
    try {
      const res = await api.getActiveMandate();
      setActiveMandate(res);
    } catch (err) {
      console.error('Failed to fetch active mandate:', err);
    }
  };

  useEffect(() => {
    fetchActiveMandate();
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />
        <MandateBanner mandate={activeMandate} onMandateRevoked={fetchActiveMandate} />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/mandate" replace />} />
            <Route
              path="/mandate"
              element={
                <MandatePage
                  activeMandate={activeMandate}
                  onMandateUpdated={fetchActiveMandate}
                />
              }
            />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/paypal/return" element={<PayPalReturn />} />
            <Route path="/paypal/cancel" element={<PayPalCancel />} />
            <Route path="*" element={<Navigate to="/mandate" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
