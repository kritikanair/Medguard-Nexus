import React, { createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import LiveMonitor from './pages/LiveMonitor';
import DigitalTwin from './pages/DigitalTwin';
import { useSocket } from './hooks/useSocket';

// ── Socket context so all pages share one connection ─────────────────────────
export const SocketContext = createContext(null);
export const useSocketCtx  = () => useContext(SocketContext);

export default function App() {
  const socketData = useSocket();

  return (
    <SocketContext.Provider value={socketData}>
      <BrowserRouter>
        <Navbar
          connectionState={socketData.connectionState}
          streaming={socketData.streaming}
        />
        <Routes>
          <Route path="/"     element={<Dashboard />} />
          <Route path="/logs" element={<LiveMonitor />} />
          <Route path="/twin" element={<DigitalTwin />} />
        </Routes>
      </BrowserRouter>
    </SocketContext.Provider>
  );
}