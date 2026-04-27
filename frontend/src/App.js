import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import LiveMonitor from './pages/LiveMonitor';
import { api } from './api';

export default function App() {
  const [health, setHealth]       = useState(false);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    const check = () =>
      api.health()
        .then(d => { setHealth(true); setStreaming(d.streaming); })
        .catch(() => setHealth(false));
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <BrowserRouter>
      <Navbar health={health} streaming={streaming} />
      <Routes>
        <Route path="/"      element={<Dashboard streaming={streaming} />} />
        <Route path="/logs"  element={<LiveMonitor />} />
      </Routes>
    </BrowserRouter>
  );
}