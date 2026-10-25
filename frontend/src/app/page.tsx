'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  fetchScheduledEmails,
  fetchSentEmails,
  fetchStats,
  scheduleEmailsPayload,
  connectSlackWebhook,
  getSlackStatus,
} from '../api';
import { EmailJob, DashboardStats, UserProfile } from '../types';

export default function DashboardPage() {
  // Auth state (simulates Google OAuth login as required)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [user, setUser] = useState<UserProfile>({
    name: 'Vamsi Siva Ganesh',
    email: 'vamsi@reachinbox.ai',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  });

  // Data states
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledJobs, setScheduledJobs] = useState<EmailJob[]>([]);
  const [sentJobs, setSentJobs] = useState<EmailJob[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    scheduled: 0,
    sent: 0,
    failed: 0,
    rateLimited: 0,
    total: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Modal states
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [isSlackOpen, setIsSlackOpen] = useState<boolean>(false);
  const [slackWebhook, setSlackWebhook] = useState<string>('');
  const [slackConnected, setSlackConnected] = useState<boolean>(false);
  const [isPingingSlack, setIsPingingSlack] = useState<boolean>(false);

  // Compose Form states
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeBody, setComposeBody] = useState<string>('');
  const [composeRecipientsText, setComposeRecipientsText] = useState<string>('');
  const [parsedRecipients, setParsedRecipients] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string>('');
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(50);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Initial load
  const loadData = async () => {
    setLoading(true);
    try {
      const [scheduled, sent, statsData, slackData] = await Promise.all([
        fetchScheduledEmails(searchQuery),
        fetchSentEmails(searchQuery),
        fetchStats(),
        getSlackStatus(),
      ]);
      setScheduledJobs(scheduled);
      setSentJobs(sent);
      setStats(statsData);
      setSlackConnected(slackData.connected);
    } catch (e: any) {
      showToast('Error syncing data from server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000); // 12s auto-refresh for live queue updates
    return () => clearInterval(interval);
  }, [searchQuery]);

  // CSV parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Extract all email addresses from CSV/text
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
      const matches = text.match(emailRegex) || [];
      const uniqueEmails = Array.from(new Set(matches.map((m) => m.toLowerCase())));

      if (uniqueEmails.length === 0) {
        showToast('No valid email addresses found in file', 'error');
        return;
      }

      setParsedRecipients(uniqueEmails);
      showToast(`Extracted ${uniqueEmails.length} recipient email(s) from ${file.name}`);
    };
    reader.readAsText(file);
  };

  // Submit Compose Form
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Combine CSV emails with manual text input
    const manualEmails = composeRecipientsText
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));

    const allEmails = Array.from(new Set([...parsedRecipients, ...manualEmails]));

    if (allEmails.length === 0) {
      showToast('Please upload a CSV or specify at least one recipient email', 'error');
      return;
    }

    if (!composeSubject.trim() || !composeBody.trim()) {
      showToast('Please provide an email subject and body', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await scheduleEmailsPayload({
        emails: allEmails,
        subject: composeSubject,
        body: composeBody,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        delayBetweenEmailsSeconds: Number(delaySeconds) || 2,
        hourlyLimit: Number(hourlyLimit) || 50,
      });

      showToast(`Success! Scheduled ${res.count || allEmails.length} email job(s) in BullMQ.`);
      setIsComposeOpen(false);
      // Reset form
      setComposeSubject('');
      setComposeBody('');
      setComposeRecipientsText('');
      setParsedRecipients([]);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Scheduling failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Slack Connection
  const handleConnectSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slackWebhook.startsWith('https://hooks.slack.com')) {
      showToast('Invalid Slack webhook URL. Must start with https://hooks.slack.com', 'error');
      return;
    }

    setIsPingingSlack(true);
    try {
      await connectSlackWebhook(slackWebhook);
      setSlackConnected(true);
      setIsSlackOpen(false);
      showToast('Slack webhook verified and connected! Alerts will trigger on rate limit.');
    } catch (err: any) {
      showToast(err.message || 'Failed to connect Slack webhook', 'error');
    } finally {
      setIsPingingSlack(false);
    }
  };

  // Google Login view
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 selection:bg-indigo-500 selection:text-white">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
              RI
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">ReachInbox.ai</h1>
              <p className="text-xs text-slate-400">Full-stack Email Job Scheduler</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-sm text-slate-400 mb-8">
            Sign in with your Google account to access your high-throughput BullMQ email dispatch
            dashboard.
          </p>

          <button
            onClick={() => setIsAuthenticated(true)}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google OAuth
          </button>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>BullMQ Queue Engine (No cron jobs)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span>Redis Atomic Sliding-Window Rate Limiter</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
              <span>Live Slack Notifications on Throttling</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-slate-900 border-emerald-500/50 text-emerald-300'
              : 'bg-slate-900 border-rose-500/50 text-rose-300'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping"></span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-500 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/25">
              RI
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-lg tracking-tight text-white">ReachInbox</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                  BullMQ Scheduler
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Persistent Redis Queue & Rate-Limiter Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Bull-Board Link */}
            <a
              href="http://localhost:5000/admin/queues"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700/60 transition-colors"
            >
              <span>Queue Board</span>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* Connect Slack Button */}
            <button
              onClick={() => setIsSlackOpen(true)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                slackConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${slackConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span>{slackConnected ? 'Slack Connected' : 'Connect Slack'}</span>
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover border border-slate-700"
              />
              <div className="hidden lg:block text-left text-xs leading-tight">
                <p className="font-semibold text-slate-200">{user.name}</p>
                <p className="text-slate-400 text-[11px]">{user.email}</p>
              </div>
              <button
                onClick={() => setIsAuthenticated(false)}
                title="Logout"
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        {/* Metric Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Scheduled Queue</span>
              <span className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                ⏱️
              </span>
            </div>
            <div className="text-3xl font-extrabold text-white">{stats.scheduled}</div>
            <p className="text-xs text-slate-500 mt-1">Pending dispatch in BullMQ</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Dispatched Emails</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                ✨
              </span>
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">{stats.sent}</div>
            <p className="text-xs text-slate-500 mt-1">Sent via Ethereal SMTP</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Rate Limit Hits</span>
              <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                🛡️
              </span>
            </div>
            <div className="text-3xl font-extrabold text-amber-400">{stats.rateLimited}</div>
            <p className="text-xs text-slate-500 mt-1">Delayed +1h & notified Slack</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Handled</span>
              <span className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                📊
              </span>
            </div>
            <div className="text-3xl font-extrabold text-white">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">Zero job loss across restarts</p>
          </div>
        </section>

        {/* Action Bar (Search, Tab Switcher, Compose CTA) */}
        <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="inline-flex p-1 bg-slate-900/80 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'scheduled'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Scheduled Emails</span>
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-950/60 text-[10px]">
                {scheduledJobs.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'sent'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Sent Emails</span>
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-950/60 text-[10px]">
                {sentJobs.length}
              </span>
            </button>
          </div>

          {/* Search & Compose CTA */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search recipient or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={loadData}
              title="Refresh Queue"
              className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button
              onClick={() => setIsComposeOpen(true)}
              className="py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2 active:scale-95"
            >
              <span>+ Compose New Email</span>
            </button>
          </div>
        </section>

        {/* Data Table */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
          {activeTab === 'scheduled' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-5">Recipient</th>
                    <th className="py-3.5 px-5">Subject</th>
                    <th className="py-3.5 px-5">Scheduled Time</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5">Sender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading && scheduledJobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p>Syncing scheduled queue from BullMQ...</p>
                      </td>
                    </tr>
                  ) : scheduledJobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-400 text-xl">
                          📬
                        </div>
                        <h3 className="font-semibold text-slate-300">No scheduled emails found</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Ready to launch your email sequence? Click "Compose New Email" to upload a CSV of leads.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    scheduledJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-5 font-medium text-slate-200">
                          {job.recipientEmail}
                        </td>
                        <td className="py-3.5 px-5 text-slate-300 max-w-xs truncate">
                          {job.subject}
                        </td>
                        <td className="py-3.5 px-5 text-slate-400 font-mono text-[11px]">
                          {new Date(job.scheduledAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5">
                          {job.status === 'RATE_LIMITED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                              Delayed +1h (Rate Limit Hit)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                              Queued in BullMQ
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-slate-400 text-[11px]">
                          {job.sender?.email || 'Default Sender'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-5">Recipient</th>
                    <th className="py-3.5 px-5">Subject</th>
                    <th className="py-3.5 px-5">Sent Timestamp</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5">Live Ethereal Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading && sentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p>Loading sent emails archive...</p>
                      </td>
                    </tr>
                  ) : sentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-400 text-xl">
                          ✉️
                        </div>
                        <h3 className="font-semibold text-slate-300">No sent emails recorded yet</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Dispatched emails will appear here along with live links to view the Ethereal SMTP inbox.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    sentJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-5 font-medium text-slate-200">
                          {job.recipientEmail}
                        </td>
                        <td className="py-3.5 px-5 text-slate-300 max-w-xs truncate">
                          {job.subject}
                        </td>
                        <td className="py-3.5 px-5 text-slate-400 font-mono text-[11px]">
                          {job.sentAt ? new Date(job.sentAt).toLocaleString() : 'Just now'}
                        </td>
                        <td className="py-3.5 px-5">
                          {job.status === 'SENT' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              Dispatched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5">
                          {job.etherealPreviewUrl ? (
                            <a
                              href={job.etherealPreviewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-medium transition-colors"
                            >
                              <span>View Email</span>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Ethereal Sandbox</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Compose Email Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Compose Scheduled Email Sequence</h3>
                <p className="text-xs text-slate-400">Batch parse CSV leads and dispatch via BullMQ delayed queue</p>
              </div>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              {/* CSV Upload Area */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Lead Recipients (Upload CSV or text)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-950/40"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="text-xl mb-1">📁</div>
                  <p className="text-xs font-medium text-slate-300">
                    Click to browse or drop your CSV / text lead file
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Columns will be auto-parsed via PapaParse for email addresses
                  </p>
                </div>

                {parsedRecipients.length > 0 && (
                  <div className="mt-2.5 p-2 bg-indigo-950/40 border border-indigo-500/30 rounded-lg flex items-center justify-between text-xs text-indigo-300">
                    <span>
                      ✓ Detected <strong>{parsedRecipients.length}</strong> lead recipient(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setParsedRecipients([])}
                      className="text-slate-400 hover:text-slate-200 text-[11px]"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Manual input fallback */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Or enter manual recipients (comma or newline separated)
                </label>
                <textarea
                  rows={2}
                  placeholder="lead1@company.com, lead2@company.com"
                  value={composeRecipientsText}
                  onChange={(e) => setComposeRecipientsText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scaling outreach pipeline with ReachInbox AI"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Body (HTML / Text)
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hi {{name}}, wanted to reach out regarding your email scheduling..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Scheduling Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Start Time (Default: Now)
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Delay Between Sends (sec)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Hourly Limit (per sender)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/25 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Enqueuing Jobs...</span>
                    </>
                  ) : (
                    <span>Schedule Batch</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Slack Modal */}
      {isSlackOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  #
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Connect Slack Webhook</h3>
                  <p className="text-xs text-slate-400">Receive live alerts when rate limits are exceeded</p>
                </div>
              </div>
              <button
                onClick={() => setIsSlackOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When an email sender reaches its hourly limit, the scheduler automatically delays the job
              by +1 hour and sends a live message to your specified Slack channel.
            </p>

            <form onSubmit={handleConnectSlack} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Incoming Webhook URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  value={slackWebhook}
                  onChange={(e) => setSlackWebhook(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSlackOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isPingingSlack}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/25 flex items-center gap-2 disabled:opacity-50"
                >
                  {isPingingSlack ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Verifying Webhook...</span>
                    </>
                  ) : (
                    <span>Save & Send Test Alert</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
