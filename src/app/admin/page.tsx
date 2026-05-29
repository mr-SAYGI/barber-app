"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  getTodayAppointments,
  getHistoryAppointments,
  getSettings,
  getPendingAppointments,
  getFutureAppointments,
  seatCustomer,
  updateAppointmentStatus,
} from "./actions";
import {
  AppointmentCard,
  AddAppointmentForm,
  MarqueeEditor,
  ServicePresetsEditor,
  LogoUploader,
  HistoryTable,
  ToastContainer,
  useToast,
  WorkingHoursEditor,
  HolidayManager,
  BookingBufferEditor,
} from "./components";

type ActiveTab = "today" | "future" | "history" | "settings";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [futureAppointments, setFutureAppointments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [historyDate, setHistoryDate] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoadingAppts, startApptLoad] = useTransition();
  const [isLoadingFuture, startFutureLoad] = useTransition();
  const [isLoadingHistory, startHistoryLoad] = useTransition();
  const [isSeating, startSeating] = useTransition();
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([]);

  const { toasts, show: showToast, dismiss } = useToast();
  const router = useRouter();

  // ── Clock ──────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      );
      setCurrentDate(
        now.toLocaleDateString("tr-TR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      );
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch Today & Pending ────────────────────────────────────────────
  const fetchToday = useCallback((dateStr?: string) => {
    startApptLoad(async () => {
      try {
        const [todayData, pendingData] = await Promise.all([
          getTodayAppointments(dateStr),
          getPendingAppointments(dateStr)
        ]);
        setAppointments(todayData);
        setPendingAppointments(pendingData);
      } catch (e: any) {
        showToast(e.message ?? "Randevular yüklenemedi.", "error");
      }
    });
  }, [showToast]);

  // ── Fetch Future ────────────────────────────────────────────
  const fetchFuture = useCallback(() => {
    startFutureLoad(async () => {
      try {
        const data = await getFutureAppointments();
        setFutureAppointments(data);
      } catch (e: any) {
        showToast(e.message ?? "Gelecek randevular yüklenemedi.", "error");
      }
    });
  }, [showToast]);

  // ── Fetch History ──────────────────────────────────────────
  const fetchHistory = useCallback(
    (date?: string) => {
      startHistoryLoad(async () => {
        try {
          const data = await getHistoryAppointments(date || undefined);
          setHistory(data);
        } catch (e: any) {
          showToast(e.message ?? "Geçmiş yüklenemedi.", "error");
        }
      });
    },
    [showToast]
  );

  // ── Fetch Settings ─────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch {}
  }, []);

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    fetchToday(selectedDate);
    fetchSettings();
  }, [fetchToday, fetchSettings, selectedDate]);

  // ── Realtime: pending randevu gelince header badge güncelle ──────────────────
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel("admin-pending-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => { 
          fetchToday(selectedDate);
          if (activeTab === "future") fetchFuture();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchToday, selectedDate]);

  useEffect(() => {
    if (activeTab === "future") fetchFuture();
    if (activeTab === "history") fetchHistory(historyDate);
  }, [activeTab, historyDate, fetchHistory, fetchFuture]);

  // ── Stats ──────────────────────────────────────────────────
  const completed = appointments.filter((a) => a.status === "completed");
  const revenue = completed.reduce((s, a) => s + (a.total_price ?? 0), 0);
  const rate =
    appointments.length > 0
      ? Math.round(
          (completed.length /
            Math.max(
              appointments.filter((a) => a.status !== "cancelled").length,
              1
            )) *
            100
        )
      : 0;

  const sortedAppointments = [...appointments];

  // ── Koltuk Yönetimi ───────────────────────────────────────────
  const inProgressAppt = appointments.find((a) => a.status === "in_progress");
  const sortedConfirmed = appointments
    .filter((a) => a.status === "confirmed")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextInLine = sortedConfirmed[0];

  const handleSeat = (appointmentId: string) => {
    startSeating(async () => {
      try {
        const res = await seatCustomer(appointmentId, selectedDate);
        if (res.success) {
          showToast("Müşteri koltuğa alındı!", "success");
          fetchToday(selectedDate);
        } else {
          showToast(res.error ?? "Bir hata oluştu.", "error");
        }
      } catch (e: any) {
        showToast(e.message ?? "Hata.", "error");
      }
    });
  };

  const handleSeatNext = () => {
    if (!nextInLine) return;
    handleSeat(nextInLine.id);
  };

  const handleCompleteCurrent = async () => {
    if (!inProgressAppt) return;
    try {
      const res = await updateAppointmentStatus(inProgressAppt.id, "completed");
      if (res.success) {
        showToast("İşlem tamamlandı!", "success");
        fetchToday(selectedDate);
      } else {
        showToast(res.error ?? "Bir hata oluştu.", "error");
      }
    } catch (e: any) {
      showToast(e.message ?? "Hata.", "error");
    }
  };

  // ── Logout ─────────────────────────────────────────────────
  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex selection:bg-primary selection:text-on-primary pb-24 md:pb-0">
      <div className="bg-grain"></div>
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* ── SideNavBar (Desktop) ── */}
      <nav className="hidden md:flex w-[280px] h-screen fixed left-0 top-0 border-r border-outline-variant/10 bg-surface/80 backdrop-blur-xl shadow-xl flex-col py-md px-sm overflow-y-auto z-50">
        <div className="mb-lg px-sm">
          <h1 className="text-headline-md font-headline-md font-black text-primary tracking-tight">İMAJ ERKEK KUAFÖRÜ</h1>
          <p className="text-caption font-caption text-on-surface-variant mt-xs">Yönetici Paneli</p>
        </div>
        <button 
          onClick={() => {
            setActiveTab("today");
            setShowAddForm(true);
          }}
          className="w-full bg-primary text-on-primary font-headline-md text-base rounded-lg py-sm mb-lg shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:bg-primary-fixed transition-colors font-bold"
        >
          Yeni Randevu
        </button>
        <ul className="flex-1 space-y-xs">
          <li>
            <button
              onClick={() => setActiveTab("today")}
              className={`w-full flex items-center gap-sm px-sm py-sm rounded-lg transition-colors duration-200 ${
                activeTab === "today"
                  ? "text-primary border-r-2 border-primary bg-primary/5"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'today' ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
              <span className="text-label-md font-label-md">Bugün</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setActiveTab("future")}
              className={`w-full flex items-center gap-sm px-sm py-sm rounded-lg transition-colors duration-200 ${
                activeTab === "future"
                  ? "text-primary border-r-2 border-primary bg-primary/5"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'future' ? "'FILL' 1" : "'FILL' 0" }}>calendar_month</span>
              <span className="text-label-md font-label-md">Gelecek</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setActiveTab("history")}
              className={`w-full flex items-center gap-sm px-sm py-sm rounded-lg transition-colors duration-200 ${
                activeTab === "history"
                  ? "text-primary border-r-2 border-primary bg-primary/5"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'history' ? "'FILL' 1" : "'FILL' 0" }}>history</span>
              <span className="text-label-md font-label-md">Geçmiş</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-sm px-sm py-sm rounded-lg transition-colors duration-200 ${
                activeTab === "settings"
                  ? "text-primary border-r-2 border-primary bg-primary/5"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
              <span className="text-label-md font-label-md">Ayarlar</span>
            </button>
          </li>
        </ul>
        <div className="mt-auto pt-md border-t border-outline-variant/10">
          <ul className="space-y-xs">
            <li>
              <Link
                href="/tv"
                target="_blank"
                className="flex items-center gap-sm px-sm py-sm rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20 transition-colors duration-200"
              >
                <span className="material-symbols-outlined">tv</span>
                <span className="text-label-md font-label-md">TV Ekranı</span>
              </Link>
            </li>
            <li>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-sm px-sm py-sm rounded-lg text-error hover:bg-error/10 transition-colors duration-200"
              >
                <span className="material-symbols-outlined">logout</span>
                <span className="text-label-md font-label-md">Çıkış Yap</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* ── Bottom Navigation Bar (Mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 glass-panel h-[80px] pb-safe flex justify-around items-center px-2 z-50 rounded-t-2xl md:hidden">
        <button onClick={() => setActiveTab("today")} className="flex flex-col items-center justify-center w-16 gap-1 group">
          <div className={`w-12 h-8 rounded-full flex items-center justify-center mb-1 transition-colors ${activeTab === 'today' ? 'bg-primary/20' : 'group-hover:bg-surface-variant/50'}`}>
            <span className={`material-symbols-outlined ${activeTab === 'today' ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: activeTab === 'today' ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
          </div>
          <span className={`text-[10px] font-label-md ${activeTab === 'today' ? 'text-primary' : 'text-on-surface-variant'}`}>Bugün</span>
        </button>
        <button onClick={() => setActiveTab("future")} className="flex flex-col items-center justify-center w-16 gap-1 group">
          <div className={`w-12 h-8 rounded-full flex items-center justify-center mb-1 transition-colors ${activeTab === 'future' ? 'bg-primary/20' : 'group-hover:bg-surface-variant/50'}`}>
            <span className={`material-symbols-outlined ${activeTab === 'future' ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: activeTab === 'future' ? "'FILL' 1" : "'FILL' 0" }}>calendar_month</span>
          </div>
          <span className={`text-[10px] font-label-md ${activeTab === 'future' ? 'text-primary' : 'text-on-surface-variant'}`}>Gelecek</span>
        </button>
        <button onClick={() => setActiveTab("history")} className="flex flex-col items-center justify-center w-16 gap-1 group">
          <div className={`w-12 h-8 rounded-full flex items-center justify-center mb-1 transition-colors ${activeTab === 'history' ? 'bg-primary/20' : 'group-hover:bg-surface-variant/50'}`}>
            <span className={`material-symbols-outlined ${activeTab === 'history' ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: activeTab === 'history' ? "'FILL' 1" : "'FILL' 0" }}>history</span>
          </div>
          <span className={`text-[10px] font-label-md ${activeTab === 'history' ? 'text-primary' : 'text-on-surface-variant'}`}>Geçmiş</span>
        </button>
        <button onClick={() => setActiveTab("settings")} className="flex flex-col items-center justify-center w-16 gap-1 group">
          <div className={`w-12 h-8 rounded-full flex items-center justify-center mb-1 transition-colors ${activeTab === 'settings' ? 'bg-primary/20' : 'group-hover:bg-surface-variant/50'}`}>
            <span className={`material-symbols-outlined ${activeTab === 'settings' ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
          </div>
          <span className={`text-[10px] font-label-md ${activeTab === 'settings' ? 'text-primary' : 'text-on-surface-variant'}`}>Ayarlar</span>
        </button>
      </nav>

      {/* ── Main Content Area ── */}
      <main className="flex-1 md:ml-[280px] w-full">
        {/* Mobile Header (Only visible on small screens) */}
        <header className="sticky top-0 z-40 w-full glass-panel h-16 flex justify-between items-center px-4 md:hidden">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-headline-md font-headline-md text-primary tracking-tight">Yönetici Paneli</h1>
              <p className="text-caption font-caption text-on-surface-variant">İMAJ ERKEK KUAFÖRÜ</p>
            </div>
          </div>
          <button className="relative p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
            {pendingAppointments.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full gold-glow animate-pulse"></span>
            )}
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex fixed top-0 right-0 w-[calc(100%-280px)] z-40 bg-surface/60 backdrop-blur-md border-b border-outline-variant/10 justify-between items-center h-xl px-lg">
          <div className="flex items-center gap-md">
            <h2 className="text-headline-lg font-headline-lg text-primary tracking-tight capitalize">
              {activeTab === 'today' ? 'Bugün' : activeTab === 'future' ? 'Gelecek Randevular' : activeTab === 'history' ? 'Randevu Geçmişi' : 'Ayarlar'}
            </h2>
          </div>
          <div className="flex items-center gap-md">
            <div className="flex flex-col items-end mr-4">
              <span className="text-body-md font-bold text-on-surface">{currentTime}</span>
              <span className="text-caption text-on-surface-variant">{currentDate}</span>
            </div>
            <button className="text-on-surface-variant hover:text-primary transition-colors relative">
              <span className="material-symbols-outlined text-[24px]">notifications</span>
              {pendingAppointments.length > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-error rounded-full"></span>
              )}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-4 md:pt-[104px] md:px-lg pb-xl space-y-md md:max-w-none max-w-md mx-auto">
          
          {/* ── TAB: BUGÜN ── */}
          {activeTab === "today" && (
            <>
              {/* Mobile Date Header */}
              <div className="flex justify-between items-end md:hidden mb-2">
                <div>
                  <p className="text-label-md font-label-md text-primary tracking-widest uppercase mb-1">BUGÜN</p>
                  <h2 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">{currentDate}</h2>
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-md">
                <div className="glass-panel rounded-xl md:rounded-2xl p-4 md:p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
                  </div>
                  <div>
                    <p className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Günlük Ciro</p>
                    <p className="text-headline-md md:text-display-sm font-headline-md text-on-surface">₺{revenue.toLocaleString("tr-TR")}</p>
                  </div>
                </div>
                
                <div className="glass-panel rounded-xl md:rounded-2xl p-4 md:p-md flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 md:w-24 md:h-24 bg-primary/10 rounded-full blur-xl md:blur-2xl"></div>
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                    {pendingAppointments.length > 0 && (
                      <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                    )}
                  </div>
                  <div className="relative z-10">
                    <p className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Bekleyen</p>
                    <p className="text-headline-md md:text-display-sm font-headline-md text-on-surface">{pendingAppointments.length}</p>
                  </div>
                </div>

                <div className="glass-panel rounded-xl md:rounded-2xl p-4 md:p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <div>
                    <p className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Tamamlanan</p>
                    <p className="text-headline-md md:text-display-sm font-headline-md text-on-surface">{completed.length}</p>
                  </div>
                </div>

                <div className="glass-panel rounded-xl md:rounded-2xl p-4 md:p-md flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bar_chart</span>
                  </div>
                  <div>
                    <p className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Verimlilik</p>
                    <p className="text-headline-md md:text-display-sm font-headline-md text-on-surface">%{rate}</p>
                    <div className="hidden md:block w-full bg-surface-variant rounded-full h-1.5 mt-2">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${rate}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Appointment Button (Mobile) */}
              <div className="md:hidden">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="w-full py-3 rounded-xl border border-primary/30 text-primary font-bold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-primary/10 transition-colors"
                >
                  <span className="material-symbols-outlined">add</span>
                  Manuel Randevu Ekle
                </button>
              </div>

              {showAddForm && (
                <div className="glass-panel rounded-2xl p-4 md:p-md mb-6 relative">
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                  <h3 className="text-headline-md font-headline-md text-on-surface mb-4">Yeni Randevu</h3>
                  <AddAppointmentForm
                    onSuccess={() => {
                      fetchToday(selectedDate);
                      setShowAddForm(false);
                    }}
                    showToast={showToast}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-md mt-8">
                {/* Appointment Management */}
                <div className="lg:col-span-2 glass-panel rounded-2xl p-4 md:p-md flex flex-col">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-md pb-sm border-b border-outline-variant/20 gap-3 md:gap-0">
                    <h3 className="text-headline-md font-headline-md text-on-surface">Randevu Yönetimi</h3>
                    <div className="flex items-center bg-surface-container border border-outline-variant/30 rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          const d = new Date(selectedDate);
                          d.setDate(d.getDate() - 1);
                          const year = d.getFullYear();
                          const month = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          setSelectedDate(`${year}-${month}-${day}`);
                        }}
                        className="px-3 py-1.5 hover:bg-surface-variant/50 text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center border-r border-outline-variant/30"
                        title="Önceki Gün"
                      >
                        <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                      </button>
                      
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent py-1.5 px-3 text-sm font-semibold text-on-surface focus:outline-none w-[130px] text-center"
                        suppressHydrationWarning
                      />

                      <button
                        onClick={() => {
                          const d = new Date(selectedDate);
                          d.setDate(d.getDate() + 1);
                          const year = d.getFullYear();
                          const month = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          setSelectedDate(`${year}-${month}-${day}`);
                        }}
                        className="px-3 py-1.5 hover:bg-surface-variant/50 text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center border-l border-outline-variant/30"
                        title="Sonraki Gün"
                      >
                        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                      </button>
                      
                      <button
                        onClick={() => fetchToday(selectedDate)}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex items-center justify-center border-l border-outline-variant/30"
                        title="Yenile"
                      >
                        <span className={`material-symbols-outlined text-[20px] ${isLoadingAppts ? "animate-spin" : ""}`}>refresh</span>
                      </button>
                    </div>
                  </div>

                  {pendingAppointments.length > 0 && (
                    <div className="mb-6 border-l-2 border-primary pl-4">
                      <h4 className="text-label-md text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        Onay Bekleyenler ({pendingAppointments.length})
                      </h4>
                      <div className="space-y-3">
                        {pendingAppointments.map((appt) => (
                          <div key={appt.id} className="bg-surface-container/50 rounded-xl p-0 border border-primary/30 hover:border-primary/60 transition-colors">
                            <AppointmentCard
                              appt={appt}
                              onRefresh={() => fetchToday(selectedDate)}
                              showToast={showToast}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Koltuk Durum Bannerı ── */}
                  <div className="mb-5 rounded-xl bg-surface-container/60 border border-outline-variant/20 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-surface-container border-b border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>chair</span>
                        <span className="text-sm font-bold text-on-surface">
                          {inProgressAppt ? (
                            <>
                              <span className="text-primary">Koltukta:</span>{" "}
                              {(() => {
                                const noteMatch = inProgressAppt.customer_note?.match(/\[(?:Manuel|Müşteri)\]\s*(?:Müşteri:\s*)?([^|]+)/);
                                return noteMatch ? noteMatch[1].trim() : (inProgressAppt.profiles?.full_name ?? "Müşteri");
                              })()}
                            </>
                          ) : (
                            <span className="text-on-surface-variant">Koltuk müsait</span>
                          )}
                        </span>
                        {inProgressAppt && (
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse ml-1" />
                        )}
                      </div>
                      {nextInLine ? (
                        <button
                          id="btn-seat-next"
                          onClick={handleSeatNext}
                          disabled={isSeating}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-fixed transition-colors shadow-[0_0_12px_rgba(212,175,55,0.2)] disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">skip_next</span>
                          Sıradaki
                        </button>
                      ) : inProgressAppt ? (
                        <button
                          onClick={handleCompleteCurrent}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500/10 text-green-500 text-sm font-bold hover:bg-green-500/20 transition-colors shadow-[0_0_12px_rgba(34,197,94,0.1)] border border-green-500/30"
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          Bitir
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-label-md text-on-surface-variant uppercase tracking-widest mb-3 mt-4">
                      Günlük Randevular ({appointments.length})
                    </h4>
                    {appointments.length === 0 && !isLoadingAppts ? (
                      <div className="p-8 text-center text-on-surface-variant border border-dashed border-outline-variant/20 rounded-xl">
                        <span className="material-symbols-outlined text-[48px] mb-2 opacity-50">event_busy</span>
                        <p>Bu tarih için randevu bulunamadı.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {isLoadingAppts
                          ? Array.from({ length: 4 }).map((_, i) => (
                              <div key={i} className="h-32 rounded-xl bg-surface-container animate-pulse" />
                            ))
                          : sortedAppointments.map((appt) => (
                              <div key={appt.id} className={`rounded-xl overflow-hidden ${
                                appt.status === "in_progress" ? "border-2 border-primary shadow-[0_0_16px_rgba(212,175,55,0.15)]" : "border border-outline-variant/10"
                              }`}>
                                {appt.status === "in_progress" && (
                                  <div className="flex items-center gap-1.5 px-4 py-1.5 bg-primary/10 border-b border-primary/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[11px] font-bold text-primary uppercase tracking-widest">Koltukta</span>
                                  </div>
                                )}
                                <AppointmentCard
                                  appt={appt}
                                  onRefresh={() => fetchToday(selectedDate)}
                                  showToast={showToast}
                                />
                                {appt.status === "confirmed" && (
                                  <div className="px-4 pb-3">
                                    <button
                                      onClick={() => handleSeat(appt.id)}
                                      disabled={isSeating}
                                      className="w-full py-2 rounded-lg border border-primary/40 text-primary text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">chair</span>
                                      Koltuğa Al
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Weekly Revenue & Recent */}
                <div className="flex flex-col gap-md">
                  {/* Revenue Overview Placeholder */}
                  <div className="glass-panel rounded-2xl p-md flex flex-col h-64 hidden lg:flex">
                    <h3 className="text-headline-md font-headline-md text-on-surface mb-md">Haftalık Gelir</h3>
                    <div className="flex-1 flex items-end justify-between gap-xs pt-lg pb-sm border-b border-outline-variant/20">
                      <div className="w-full bg-primary/20 hover:bg-primary/40 rounded-t-sm h-[40%] transition-colors relative group">
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-surface-container-high text-caption px-2 py-1 rounded text-on-surface whitespace-nowrap transition-opacity">Pzt</div>
                      </div>
                      <div className="w-full bg-primary/40 hover:bg-primary/60 rounded-t-sm h-[60%] transition-colors"></div>
                      <div className="w-full bg-primary/30 hover:bg-primary/50 rounded-t-sm h-[50%] transition-colors"></div>
                      <div className="w-full bg-primary shadow-[0_0_10px_rgba(212,175,55,0.3)] rounded-t-sm h-[85%] transition-colors relative">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"></div>
                      </div>
                      <div className="w-full bg-primary/20 hover:bg-primary/40 rounded-t-sm h-[30%] transition-colors"></div>
                      <div className="w-full bg-primary/10 hover:bg-primary/30 rounded-t-sm h-[15%] transition-colors"></div>
                      <div className="w-full bg-primary/10 hover:bg-primary/30 rounded-t-sm h-[20%] transition-colors"></div>
                    </div>
                    <div className="flex justify-between mt-sm text-caption font-caption text-on-surface-variant">
                      <span>Pzt</span>
                      <span>Paz</span>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* ── TAB: GELECEK ── */}
          {activeTab === "future" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-black text-xl text-on-surface">Gelecek Randevular</h2>
                  <p className="text-sm text-on-surface-variant mt-1">Yarından itibaren tüm onaylı ve bekleyen randevular</p>
                </div>
                <button
                  onClick={fetchFuture}
                  className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className={`material-symbols-outlined ${isLoadingFuture ? "animate-spin" : ""}`}>refresh</span>
                  Yenile
                </button>
              </div>

              {futureAppointments.length === 0 && !isLoadingFuture ? (
                <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
                  <span className="material-symbols-outlined text-[48px] text-outline">event_upcoming</span>
                  <p className="text-on-surface-variant text-sm">Gelecek için planlanmış randevu bulunamadı.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {isLoadingFuture && futureAppointments.length === 0 ? (
                     Array.from({ length: 3 }).map((_, i) => (
                       <div key={i} className="h-32 rounded-2xl bg-surface-container animate-pulse" />
                     ))
                  ) : (
                    Object.entries(
                      futureAppointments.reduce((acc: Record<string, any[]>, appt) => {
                        const dateStr = appt.starts_at.split("T")[0];
                        if (!acc[dateStr]) acc[dateStr] = [];
                        acc[dateStr].push(appt);
                        return acc;
                      }, {})
                    ).map(([dateStr, appts]) => {
                      const dateObj = new Date(dateStr);
                      const formattedDate = dateObj.toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        weekday: "long"
                      });
                      
                      return (
                        <div key={dateStr} className="glass-panel rounded-2xl overflow-hidden shadow-sm">
                          <div className="px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary">event</span>
                            <h3 className="font-bold text-sm text-primary">{formattedDate}</h3>
                            <span className="text-xs font-semibold text-on-surface-variant ml-auto">{appts.length} randevu</span>
                          </div>
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {appts.map((appt) => (
                              <AppointmentCard
                                key={appt.id}
                                appt={appt}
                                onRefresh={fetchFuture}
                                showToast={showToast}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: GEÇMİŞ ── */}
          {activeTab === "history" && (
            <div className="glass-panel rounded-2xl p-4 md:p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant">history</span>
                </div>
                <div>
                  <div className="font-bold text-sm md:text-base text-on-surface">Randevu Geçmişi</div>
                  <div className="text-xs text-on-surface-variant">Son 99 gün — tarih bazlı filtre</div>
                </div>
              </div>
              <HistoryTable
                rows={history}
                filterDate={historyDate}
                onDateChange={(d) => {
                  setHistoryDate(d);
                  fetchHistory(d);
                }}
                onRefresh={() => fetchHistory(historyDate)}
                isLoading={isLoadingHistory}
              />
            </div>
          )}

          {/* ── TAB: AYARLAR ── */}
          {activeTab === "settings" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="glass-panel rounded-2xl p-4 md:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">image</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">Salon Logosu</div>
                    <div className="text-xs text-on-surface-variant">Profil resmi gibi değiştirilebilir marka ikonu</div>
                  </div>
                </div>
                <LogoUploader showToast={showToast} />
              </div>

              <div className="glass-panel rounded-2xl p-4 md:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">tv</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">TV Kayan Yazı</div>
                    <div className="text-xs text-on-surface-variant">Bekleme ekranında gösterilen döngüsel metin</div>
                  </div>
                </div>
                {settings ? (
                  <MarqueeEditor
                    currentText={settings.marquee_text ?? ""}
                    showToast={showToast}
                  />
                ) : (
                  <div className="py-8 flex justify-center">
                    <div className="animate-pulse text-on-surface-variant text-sm">Ayarlar yükleniyor...</div>
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-4 md:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">content_cut</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">Hızlı Seçim Hizmetleri</div>
                    <div className="text-xs text-on-surface-variant">Randevu eklerken görünen ön ayarlı hizmetleri düzenle</div>
                  </div>
                </div>
                <ServicePresetsEditor showToast={showToast} />
              </div>

              <div className="glass-panel rounded-2xl p-4 md:p-6 md:col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">timer</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">En Erken Randevu Süresi</div>
                    <div className="text-xs text-on-surface-variant">Müşterilerin anlık saatten en az ne kadar sonrasına randevu alabileceğini belirler.</div>
                  </div>
                </div>
                {settings ? (
                  <BookingBufferEditor
                    currentBuffer={settings.min_booking_buffer ?? 60}
                    showToast={showToast}
                    onUpdate={() => fetchSettings()}
                  />
                ) : (
                  <div className="py-8 flex justify-center">
                    <div className="animate-pulse text-on-surface-variant text-sm">Ayarlar yükleniyor...</div>
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-4 md:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">schedule</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">Çalışma Saatleri</div>
                    <div className="text-xs text-on-surface-variant">Haftanın günlerine göre açılış-kapanış saatleri</div>
                  </div>
                </div>
                <WorkingHoursEditor showToast={showToast} />
              </div>

              <div className="glass-panel rounded-2xl p-4 md:p-6 md:col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">event_busy</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm md:text-base text-on-surface">Tatil Yönetimi</div>
                    <div className="text-xs text-on-surface-variant">Resmi tatiller otomatik çekilir, manuel tatil de ekleyebilirsiniz</div>
                  </div>
                </div>
                <HolidayManager showToast={showToast} />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
