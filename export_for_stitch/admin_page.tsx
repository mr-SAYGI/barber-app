"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import {
  Scissors,
  LayoutDashboard,
  Clock,
  History,
  Tv,
  Plus,
  RefreshCw,
  Coins,
  CheckCircle2,
  UserCheck,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  LogOut,
  Settings,
  CalendarCheck,
} from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  getTodayAppointments,
  getHistoryAppointments,
  getSettings,
  getPendingAppointments,
  getFutureAppointments,
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
} from "./components";
import { LogoBrand } from "@/components/logo-brand";

// ═══════════════════════════════════════════════════════════════
// QUICK STAT CARD
// ═══════════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: "amber" | "blue" | "emerald" | "rose";
}) {
  const colorMap = {
    amber: { icon: "text-amber-400", bg: "opacity-[0.04] text-amber-400" },
    blue: { icon: "text-blue-400", bg: "opacity-[0.04] text-blue-400" },
    emerald: { icon: "text-emerald-400", bg: "opacity-[0.04] text-emerald-400" },
    rose: { icon: "text-rose-400", bg: "opacity-[0.04] text-rose-400" },
  };

  return (
    <div className="relative rounded-2xl bg-slate-800/40 border border-slate-700/60 p-4 overflow-hidden">
      <div className={`absolute -right-3 -bottom-3 ${colorMap[color].bg}`}>
        <Icon className="w-16 h-16" />
      </div>
      <div className="flex justify-between items-start mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        <Icon className={`w-4 h-4 ${colorMap[color].icon}`} />
      </div>
      <div className="text-xl font-black text-slate-100">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════

type ActiveTab = "today" | "future" | "history" | "settings";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [futureAppointments, setFutureAppointments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [historyDate, setHistoryDate] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoadingAppts, startApptLoad] = useTransition();
  const [isLoadingFuture, startFutureLoad] = useTransition();
  const [isLoadingHistory, startHistoryLoad] = useTransition();
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
  }, [fetchToday]);

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
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Toast Layer */}
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <LogoBrand size="sm" />
            <div>
              <div className="font-black text-sm text-slate-100 leading-none">
                İMAJ ERKEK KUAFÖRÜ
              </div>
              <div className="text-[10px] text-amber-500/70 font-semibold uppercase tracking-widest leading-none mt-0.5">
                Yönetim
              </div>
            </div>
          </div>

          {/* Date + Time */}
          <div className="hidden sm:flex flex-col items-center">
            <div className="text-xs font-semibold text-slate-500 capitalize">
              {currentDate}
            </div>
            <div className="text-xl font-black tracking-tight text-slate-200">
              {currentTime}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Pending Badge */}
            {pendingAppointments.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {pendingAppointments.length} yeni randevu
              </div>
            )}
            <Link
              href="/tv"
              target="_blank"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              <Tv className="w-3.5 h-3.5" /> TV Ekranı
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Günlük Ciro"
            value={`₺${revenue.toLocaleString("tr-TR")}`}
            sub="Tamamlananlar"
            icon={Coins}
            color="amber"
          />
          <StatCard
            label="Bekleyen"
            value={pendingAppointments.length}
            sub="Aktif randevu"
            icon={Clock}
            color="blue"
          />
          <StatCard
            label="Tamamlanan"
            value={completed.length}
            sub={`Toplam ${appointments.length} randevu`}
            icon={CheckCircle2}
            color="emerald"
          />
          <StatCard
            label="Verimlilik"
            value={`%${rate}`}
            sub="Tamamlanma oranı"
            icon={TrendingUp}
            color={rate >= 70 ? "emerald" : "rose"}
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-slate-900 rounded-2xl border border-slate-800">
          {(
            [
              { id: "today", label: "Bugün", icon: LayoutDashboard },
              { id: "future", label: "Gelecek", icon: CalendarCheck },
              { id: "history", label: "Geçmiş", icon: History },
              { id: "settings", label: "Ayarlar", icon: Settings },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                activeTab === id
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: BUGÜN ── */}
        {activeTab === "today" && (
          <div className="space-y-5">
            {/* Add Appointment Collapsible */}
            <div className="rounded-2xl border border-slate-700/80 overflow-hidden bg-slate-800/20">
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-sm text-slate-200">
                      Manuel Randevu Ekle
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Müşteri adına doğrudan randevu oluştur
                    </div>
                  </div>
                </div>
                {showAddForm ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showAddForm && (
                <div className="px-5 pb-5 border-t border-slate-800/60">
                  <div className="pt-4">
                    <AddAppointmentForm
                      onSuccess={() => {
                        fetchToday();
                        setShowAddForm(false);
                      }}
                      showToast={showToast}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Onay Bekleyenler */}
            {pendingAppointments.length > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-950/20 overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.08)]">
                <div className="px-5 py-4 border-b border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <h2 className="font-black text-sm text-amber-400">Onay Bekleyenler</h2>
                  </div>
                  <span className="text-xs font-bold text-amber-500/70">{pendingAppointments.length} randevu</span>
                </div>
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {pendingAppointments.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      onRefresh={() => fetchToday(selectedDate)}
                      showToast={showToast}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Today's Appointments Header with Date Picker */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="font-black text-base text-slate-200">
                  Günlük Randevular
                  <span className="ml-2 text-sm font-semibold text-slate-500">
                    ({appointments.length})
                  </span>
                </h2>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-xl py-1.5 px-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/40 transition-colors"
                  />
                  <button
                    onClick={() => fetchToday(selectedDate)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingAppts ? "animate-spin" : ""}`}
                    />
                    Yenile
                  </button>
                </div>
              </div>

              {appointments.length === 0 && !isLoadingAppts ? (
                <div className="rounded-2xl border border-slate-800/80 p-12 flex flex-col items-center gap-3 text-center">
                  <Scissors className="w-10 h-10 text-slate-700" />
                  <p className="text-slate-500 text-sm">
                    Bu tarih için randevu bulunamadı.
                    <br />
                    Yukarıdan manuel randevu ekleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {isLoadingAppts
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-40 rounded-2xl bg-slate-800/40 border border-slate-700/60 animate-pulse"
                        />
                      ))
                    : sortedAppointments.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        onRefresh={() => fetchToday(selectedDate)}
                        showToast={showToast}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: GELECEK ── */}
        {activeTab === "future" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-black text-xl text-slate-200">Gelecek Randevular</h2>
                <p className="text-sm text-slate-500 mt-1">Yarından itibaren tüm onaylı ve bekleyen randevular</p>
              </div>
              <button
                onClick={fetchFuture}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingFuture ? "animate-spin" : ""}`} />
                Yenile
              </button>
            </div>

            {futureAppointments.length === 0 && !isLoadingFuture ? (
              <div className="rounded-2xl border border-slate-800/80 p-12 flex flex-col items-center gap-3 text-center bg-slate-800/20">
                <CalendarCheck className="w-10 h-10 text-slate-700" />
                <p className="text-slate-500 text-sm">Gelecek için planlanmış randevu bulunamadı.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {isLoadingFuture && futureAppointments.length === 0 ? (
                   Array.from({ length: 3 }).map((_, i) => (
                     <div key={i} className="h-32 rounded-2xl bg-slate-800/40 border border-slate-700/60 animate-pulse" />
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
                      <div key={dateStr} className="rounded-2xl border border-slate-800/80 bg-slate-900/50 overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-800/30 flex items-center gap-3">
                          <CalendarCheck className="w-4 h-4 text-amber-500" />
                          <h3 className="font-bold text-sm text-amber-400/90">{formattedDate}</h3>
                          <span className="text-xs font-semibold text-slate-500 ml-auto">{appts.length} randevu</span>
                        </div>
                        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
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
          <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-slate-700/60 flex items-center justify-center">
                <History className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-200">Randevu Geçmişi</div>
                <div className="text-[11px] text-slate-500">Son 99 gün — tarih bazlı filtre</div>
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
          <div className="space-y-5">

            {/* Logo Yükleme */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                  <span className="text-base">🖼️</span>
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">Salon Logosu</div>
                  <div className="text-[11px] text-slate-500">Profil resmi gibi değiştirilebilir marka ikonu</div>
                </div>
              </div>
              <LogoUploader showToast={showToast} />
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                  <Tv className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">TV Kayan Yazı</div>
                  <div className="text-[11px] text-slate-500">Bekleme ekranında gösterilen döngüsel metin</div>
                </div>
              </div>
              {settings ? (
                <MarqueeEditor
                  currentText={settings.marquee_text ?? ""}
                  showToast={showToast}
                />
              ) : (
                <div className="py-8 flex justify-center">
                  <div className="animate-pulse text-slate-600 text-sm">Ayarlar yükleniyor...</div>
                </div>
              )}
            </div>

            {/* Hızlı Seçim Hizmetleri */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">Hızlı Seçim Hizmetleri</div>
                  <div className="text-[11px] text-slate-500">
                    Randevu eklerken görünen ön ayarlı hizmetleri düzenle
                  </div>
                </div>
              </div>
              <ServicePresetsEditor showToast={showToast} />
            </div>

            {/* Çalışma Saatleri */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">Çalışma Saatleri</div>
                  <div className="text-[11px] text-slate-500">Haftanın günlerine göre açılış-kapanış saatleri</div>
                </div>
              </div>
              <WorkingHoursEditor showToast={showToast} />
            </div>

            {/* Tatil Yönetimi */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-800/20 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">Tatil Yönetimi</div>
                  <div className="text-[11px] text-slate-500">Resmi tatiller otomatik çekilir, manuel tatil de ekleyebilirsiniz</div>
                </div>
              </div>
              <HolidayManager showToast={showToast} />
            </div>
          </div>
        )}

      </div>

      {/* Marquee CSS injection */}
      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
