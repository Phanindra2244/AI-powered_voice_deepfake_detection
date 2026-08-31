import React, { useState, useEffect } from 'react';
import { ShieldAlert, Bell, X, AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, Eye, ShieldCheck, Zap, Filter, Edit3 } from 'lucide-react';

export default function SecurityAlertDrawer({ API_BASE, isOpen, onClose, alertCount, setAlertCount }) {
  const [activeTab, setActiveTab] = useState('incidents'); // 'incidents' | 'rag'
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [noteText, setNoteText] = useState('');

  // RAG State
  const [ragQuery, setRagQuery] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResult, setRagResult] = useState(null);
  const [kbDocs, setKbDocs] = useState([]);

  const handleQueryRAG = async (e) => {
    if (e) e.preventDefault();
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery.trim() })
      });
      const data = await res.json();
      setRagResult(data);
    } catch (err) {
      setRagResult({
        success: true,
        answer: 'I do not have sufficient verified information in my knowledge base to answer this.',
        citations: []
      });
    } finally {
      setRagLoading(false);
    }
  };

  const fetchKBDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/rag/documents`);
      const data = await res.json();
      if (data.success) setKbDocs(data.documents || []);
    } catch (e) {}
  };

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/incidents?limit=50`;
      if (filterSeverity !== 'ALL') url += `&severity=${filterSeverity}`;
      if (filterStatus !== 'ALL') url += `&status=${filterStatus}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.incidents) {
        setIncidents(data.incidents);
        const unhandled = data.incidents.filter(i => i.status === 'NEW').length;
        if (setAlertCount) setAlertCount(unhandled);
      }
    } catch (err) {
      console.error('Failed to fetch security incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchIncidents();
    }
  }, [isOpen, filterSeverity, filterStatus]);

  // SSE Stream Listener
  useEffect(() => {
    let eventSource = null;
    try {
      const streamUrl = `${API_BASE}/alerts/stream`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.incident_id) {
            setIncidents((prev) => [data, ...prev.filter(i => i.incident_id !== data.incident_id)]);
            if (setAlertCount) setAlertCount((prev) => prev + 1);
          } else if (data && data.type === 'STATUS_UPDATE' && data.incident) {
            setIncidents((prev) => prev.map(i => i.incident_id === data.incident.incident_id ? data.incident : i));
          }
        } catch (e) {}
      };
    } catch (e) {
      console.warn('SSE alert stream connection fallback:', e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [API_BASE]);

  const handleUpdateStatus = async (incidentId, newStatus, notes = '') => {
    try {
      const res = await fetch(`${API_BASE}/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, analyst_notes: notes })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setIncidents((prev) => prev.map(i => i.incident_id === incidentId ? data.data : i));
        setEditingNotesId(null);
      }
    } catch (e) {
      alert('Failed to update incident status: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 flex flex-col justify-between shadow-2xl space-y-4 animate-in slide-in-from-right duration-300">
        
        {/* Top Header & Tab Switcher */}
        <div className="space-y-3 border-b border-slate-800 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  {activeTab === 'incidents' ? 'SECURITY INCIDENT DISPATCH' : 'RAG KNOWLEDGE ASSISTANT'}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {activeTab === 'incidents' ? 'SQLite SIEM Database & SOAR Dispatch' : 'Grounded AI Intelligence & Vector Search'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setActiveTab('incidents')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'incidents' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400'
              }`}
            >
              SOC Incidents ({alertCount})
            </button>
            <button
              onClick={() => {
                setActiveTab('rag');
                fetchKBDocuments();
              }}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'rag' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
              }`}
            >
              RAG Knowledge Base
            </button>
          </div>
        </div>

        {activeTab === 'rag' ? (
          <div className="flex-1 flex flex-col justify-between space-y-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 font-mono text-xs pr-1">
              
              {/* Ingested Knowledge Base Files List */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase block font-bold">VERIFIED KNOWLEDGE BASE DOCUMENTS</span>
                <div className="space-y-1.5">
                  {kbDocs.map((doc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] text-cyan-300 bg-slate-900 p-2 rounded-lg border border-slate-800">
                      <span className="truncate">📄 {doc.name}</span>
                      <span className="text-slate-500 font-sans text-[10px]">{Math.round(doc.size_bytes / 1024)} KB</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grounded Query Answer & Citation View */}
              {ragResult && (
                <div className="cyber-panel p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-400">GROUNDED AI ANSWER</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                      GROUNDED CONTEXT
                    </span>
                  </div>

                  <p className="text-slate-200 leading-relaxed font-sans text-xs whitespace-pre-wrap bg-slate-900 p-3 rounded-lg border border-slate-850">
                    {ragResult.answer}
                  </p>

                  {ragResult.citations && ragResult.citations.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-850">
                      <span className="text-[10px] text-slate-400 font-bold block">VERIFIED SOURCE CITATIONS:</span>
                      {ragResult.citations.map((cite, i) => (
                        <div key={i} className="text-[10px] text-cyan-400 bg-slate-900 p-1.5 rounded border border-slate-800 truncate">
                          {cite}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* RAG Query Input Form */}
            <form onSubmit={handleQueryRAG} className="space-y-2 font-mono text-xs pt-2 border-t border-slate-800">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder="Ask knowledge base (e.g. vocoder cutoff threshold)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 pr-10 text-slate-200 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={ragLoading}
                  className="absolute right-2 p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all"
                >
                  {ragLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Filtering Toolbar */}
            <div className="flex items-center gap-2 font-mono text-xs bg-slate-950 p-2 rounded-xl border border-slate-800">
              <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-slate-900 text-slate-300 border border-slate-800 rounded px-2 py-1 focus:outline-none"
              >
                <option value="ALL">Severity: All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-900 text-slate-300 border border-slate-800 rounded px-2 py-1 focus:outline-none"
              >
                <option value="ALL">Status: All</option>
                <option value="NEW">New</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            {/* Alerts Feed */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {incidents.length > 0 ? (
            incidents.map((inc) => (
              <div
                key={inc.incident_id || inc.alert_id}
                className="cyber-panel p-4 backdrop-blur-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-3 font-mono text-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${
                      inc.severity === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border-rose-800 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                        : inc.severity === 'HIGH'
                        ? 'bg-orange-950 text-orange-300 border-orange-800'
                        : 'bg-amber-950 text-amber-300 border-amber-800'
                    }`}
                  >
                    {inc.severity} ({inc.risk_score || inc.composite_score}%)
                  </span>
                  <span className="text-[10px] text-slate-500">{inc.incident_id || inc.alert_id}</span>
                </div>

                <div>
                  <span className="font-bold text-slate-200 block text-xs">{inc.target_identity}</span>
                  <span className="text-[11px] text-slate-400 block font-sans">Caller: {inc.caller_id}</span>
                </div>

                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-850 space-y-1 font-sans text-[11px] text-slate-300">
                  {inc.threat_indicators?.map((ind, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 shrink-0"></span>
                      <span>{ind}</span>
                    </div>
                  ))}
                </div>

                {inc.analyst_notes && (
                  <div className="text-[10px] text-cyan-300 bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 uppercase block font-mono">Analyst Notes:</span>
                    <p className="font-sans italic">{inc.analyst_notes}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-2">
                  <select
                    value={inc.status}
                    onChange={(e) => handleUpdateStatus(inc.incident_id, e.target.value, inc.analyst_notes)}
                    className="bg-slate-900 text-cyan-300 font-bold border border-slate-800 rounded px-2 py-1 text-[11px] focus:outline-none"
                  >
                    <option value="NEW">Status: NEW</option>
                    <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                    <option value="INVESTIGATING">INVESTIGATING</option>
                    <option value="RESOLVED">RESOLVED</option>
                  </select>

                  <button
                    onClick={() => {
                      setEditingNotesId(inc.incident_id);
                      setNoteText(inc.analyst_notes || '');
                    }}
                    className="text-[10px] text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Notes</span>
                  </button>
                </div>

                {editingNotesId === inc.incident_id && (
                  <div className="pt-2 space-y-2 border-t border-slate-800">
                    <textarea
                      rows={2}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add analyst notes..."
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 text-xs focus:border-cyan-400 focus:outline-none font-sans"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingNotesId(null)}
                        className="px-2 py-1 rounded bg-slate-900 text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(inc.incident_id, inc.status, noteText)}
                        className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 font-mono text-xs space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-500/50 mx-auto" />
              <p>No active security incidents flagged. All systems nominal.</p>
            </div>
          )}
        </div>
        </>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
          <button
            onClick={fetchIncidents}
            className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-400"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Feed</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
          >
            Close Drawer
          </button>
        </div>

      </div>
    </div>
  );
}
