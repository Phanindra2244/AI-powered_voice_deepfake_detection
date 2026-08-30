import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import AudioAnalyzer from './components/AudioAnalyzer';
import VoiceStudio from './components/VoiceStudio';
import WatermarkVerifier from './components/WatermarkVerifier';
import ForensicReports from './components/ForensicReports';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5050/api' : '/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('analyzer');
  const [apiStatus, setApiStatus] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentReportData, setCurrentReportData] = useState(null);

  // Check Backend API Connection
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        if (data.status === 'ONLINE') setApiStatus(true);
      } catch (err) {
        setApiStatus(false);
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToReport = (analysisResult) => {
    setCurrentReportData(analysisResult);
    setActiveTab('reports');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col bg-soc-grid selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Cyberpunk SOC Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        apiStatus={apiStatus}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content Layout with Optional Sidebar */}
      <div className="flex-1 flex max-w-[1700px] w-full mx-auto">
        
        {/* Collapsible Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        {/* Dashboard Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-hidden">
          {activeTab === 'analyzer' && (
            <AudioAnalyzer API_BASE={API_BASE} onNavigateToReport={handleNavigateToReport} />
          )}

          {activeTab === 'studio' && (
            <VoiceStudio API_BASE={API_BASE} />
          )}

          {activeTab === 'watermark' && (
            <WatermarkVerifier API_BASE={API_BASE} />
          )}

          {activeTab === 'reports' && (
            <ForensicReports API_BASE={API_BASE} currentReportData={currentReportData} />
          )}
        </main>
      </div>

      {/* SOC Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md py-4 px-6 text-center text-xs font-mono text-slate-500">
        <div className="max-w-[1700px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>VOICEGUARD CYBERSECURITY SOC • NEURAL SPECTRAL ENGINE v2.4</span>
          </div>
          <div className="text-slate-400">
            Real-Time Audio Analysis • Steganographic Provenance • SHA-256 Chain of Custody
          </div>
        </div>
      </footer>
    </div>
  );
}
