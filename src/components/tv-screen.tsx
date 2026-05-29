"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import CustomYouTubePlayer from "@/components/CustomYouTubePlayer";
import { LogoBrand } from "@/components/logo-brand";

// ═══════════════════════════════════════════════════════════════
// TİPLER & ARAYÜZLER
// ═══════════════════════════════════════════════════════════════

interface TVAppointment {
  id: string;
  customerName: string;
  serviceName: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  time: string;
  startsAt: string;
}

interface ToastState {
  visible: boolean;
  customerName: string;
  time: string;
  date: string;
}

// ═══════════════════════════════════════════════════════════════
// ANA BİLEŞEN: TV Screen
// ═══════════════════════════════════════════════════════════════

export default function TVScreen() {
  const [appointments, setAppointments] = useState<TVAppointment[]>([]);
  const [marqueeText, setMarqueeText] = useState<string>(
    "✦ PREMIUM BAKIM DENEYİMİ  ✦ RANDEVUSUZ MÜŞTERİ KABUL EDİLİR  ✦ VIP RANDEVULAR İÇİN UYGULAMAMIZI İNDİRİN  ✦ LOUNGE ALANINDA ÜCRETSİZ İÇECEKLER"
  );

  const [currentTime, setCurrentTime] = useState<string>("00:00:00");
  const [currentDateString, setCurrentDateString] = useState<string>("");
  const [currentDayString, setCurrentDayString] = useState<string>("");

  // ── Toast Bildirimi ──
  const [toast, setToast] = useState<ToastState>({ visible: false, customerName: "", time: "", date: "" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── Saat Güncellemesi ──
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      setCurrentDateString(
        now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
      );
      const dayStr = now.toLocaleDateString("tr-TR", { weekday: "long" });
      setCurrentDayString(dayStr.charAt(0).toUpperCase() + dayStr.slice(1));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Toast Bildirimi Göster ──
  const showToast = useCallback((customerName: string, date: string, time: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, customerName, date, time });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 8000);
  }, []);

  // ── Randevuları Çek ──
  const fetchAppointments = useCallback(async () => {
    const todayStr = (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id, 
        status, 
        starts_at, 
        ends_at, 
        customer_note, 
        queue_number,
        customer_id,
        profiles!customer_id (
          full_name
        ),
        appointment_services (
          services (
            name
          )
        )
      `)
      .gte("starts_at", `${todayStr}T00:00:00.000Z`)
      .lte("starts_at", `${todayStr}T23:59:59.999Z`)
      .in("status", ["pending", "confirmed", "in_progress"])
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Randevular çekilemedi:", error.message);
      return;
    }

    const mapped: TVAppointment[] = (data || []).map((row: any) => {
      // customer_note'tan ismi parse et:
      //   [Manuel] Müşteri: Yılmaz Abe | Tel: ...  → admin ekledi
      //   [Müşteri] Ahmet Bey | Tel: ...            → müşteri uygulamadan ekledi
      // Her iki format da aynı regex ile yakalanır.
      const cName = 
        row.profiles?.full_name?.trim() ||
        row.customer_note?.match(
          /\[(?:Manuel|Müşteri)\]\s*(?:Müşteri:\s*)?([^|]+)/
        )?.[1]?.trim() ||
        "Müşteri";
      let sName = "";
      if (row.appointment_services && row.appointment_services.length > 0) {
        sName = row.appointment_services
          .map((aps: any) => aps.services?.name)
          .filter(Boolean)
          .join(", ");
      }
      if (!sName) {
        sName = row.customer_note?.match(/Hizmet:\s*([^|]+)/)?.[1]?.trim() || "Hizmet";
      }

      const time = new Date(row.starts_at).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return { id: row.id, customerName: cName, serviceName: sName, status: row.status, time, startsAt: row.starts_at };
    });

    setAppointments(mapped);
  }, [supabase]);

  // ── Ayarları Çek (Marquee) ──
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("settings")
      .select("marquee_text")
      .limit(1)
      .maybeSingle();
    if (data?.marquee_text) setMarqueeText(data.marquee_text);
  }, [supabase]);

  // ── Realtime Abonelikleri ──
  useEffect(() => {
    fetchAppointments();
    fetchSettings();

    const channel = supabase
      .channel("tv-screen-premium")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        (payload: any) => {
          fetchAppointments();
          
          // Yeni randevu bildirimi
          const row = payload.new;
          
          // Profil verisi join ile gelmeyeceği için (Supabase Realtime Payload'da join yoktur)
          // Burada tekrar fetch yapmak zorundayız.
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", row.customer_id)
            .single()
            .then(({ data: profileData }) => {
              // customer_note'tan ismi parse et (her iki format için)
              const cName = 
                profileData?.full_name?.trim() ||
                row.customer_note?.match(
                  /\[(?:Manuel|Müşteri)\]\s*(?:Müşteri:\s*)?([^|]+)/
                )?.[1]?.trim() ||
                "Müşteri";
              const startsAtDate = new Date(row.starts_at);
              const dateStr = startsAtDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
              const timeStr = startsAtDate.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              showToast(cName, dateStr, timeStr);
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        () => fetchAppointments()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => fetchSettings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [supabase, fetchAppointments, fetchSettings, showToast]);

  // ── Randevu Durumu Yardımcıları ──
  const inChair = appointments.find((a) => a.status === "in_progress") ?? null;
  const waiting = appointments.filter((a) => a.status !== "in_progress");
  const upNext = waiting[0] ?? null;
  const rest = waiting.slice(1);
  const waitingCount = appointments.length;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-black text-white relative">

      {/* ── Gece Grain Dokusu ── */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ══════════════════════════════════════════════════════
          ÜST HEADER: Canlı Sıra Paneli (Sabit, Buzlu Cam)
      ══════════════════════════════════════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex"
        style={{
          height: "220px",
          background: "rgba(18, 20, 21, 0.72)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          borderBottom: "1px solid rgba(212, 175, 55, 0.18)",
        }}
      >
        {/* LOGO KARE ÇERÇEVE */}
        <div 
          className="w-[220px] h-[220px] shrink-0 border-r"
          style={{ borderColor: "rgba(212,175,55,0.18)", background: "rgba(0,0,0,0.5)", padding: "12px" }}
        >
          <LogoBrand size="full" />
        </div>

        {/* SAĞ İÇERİK: SAAT VE KARTLAR */}
        <div className="flex-1 flex flex-col overflow-hidden pl-10">
          {/* — Üst Bilgi Barı: Saat, Tarih + Sıra Başlığı — */}
          <div
            className="flex items-center justify-between pr-14 py-4"
            style={{ borderBottom: "1px solid rgba(212,175,55,0.10)" }}
          >
            {/* Sol: Marka Adı + Saat + Tarih */}
            <div className="flex items-center gap-10">
              <span
                className="text-[#f2ca50] font-black tracking-tighter uppercase"
                style={{ fontSize: "24px", fontFamily: "Montserrat, sans-serif" }}
              >
                İMAJ ERKEK KUAFÖRÜ
              </span>

              {/* Saat */}
              <div
                className="text-white font-black tracking-tighter tabular-nums"
                style={{ fontSize: "64px", fontFamily: "Montserrat, sans-serif", lineHeight: 1 }}
              >
                {currentTime}
              </div>

              {/* Tarih + Gün */}
              <div
                className="flex flex-col justify-center pl-8 text-[#f2ca50] uppercase tracking-widest"
                style={{ borderLeft: "1px solid rgba(212,175,55,0.2)" }}
              >
                <span
                  className="font-bold leading-none opacity-80"
                  style={{ fontSize: "14px", fontFamily: "Montserrat, sans-serif", letterSpacing: "0.05em" }}
                >
                  {currentDateString}
                </span>
                <span
                  className="font-black leading-none mt-2"
                  style={{ fontSize: "36px", fontFamily: "Montserrat, sans-serif" }}
                >
                  {currentDayString}
                </span>
              </div>
            </div>

            {/* Sağ: Sıra Başlığı */}
            <div className="flex items-center gap-3">
              <span
                className="font-semibold text-white/60 uppercase tracking-widest"
                style={{ fontSize: "14px", fontFamily: "Inter, sans-serif" }}
              >
                Canlı Sıra
              </span>
              <span
                className="font-semibold px-3 py-1 rounded-full border text-white/60"
                style={{
                  fontSize: "13px",
                  fontFamily: "Inter, sans-serif",
                  borderColor: "rgba(153,144,124,0.35)",
                  background: "rgba(30,32,33,0.7)",
                }}
              >
                {waitingCount} Bekleyen
              </span>
            </div>
          </div>

          {/* — Alt Bilgi Barı: Yatay Randevu Kartları — */}
          <div className="flex-1 flex gap-4 pr-14 py-3 overflow-x-auto items-center custom-scrollbar">

          {/* Koltukta Kartı */}
          {inChair ? (
            <article
              className="min-w-[280px] h-[110px] flex flex-col justify-center rounded-xl p-4 border relative overflow-hidden shrink-0"
              style={{
                background: "rgba(40,42,43,0.9)",
                borderColor: "#f2ca50",
                boxShadow: "0 0 28px rgba(212,175,55,0.14), inset 0 0 18px rgba(212,175,55,0.05)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="uppercase tracking-widest border border-[#f2ca50] text-[#f2ca50] px-2 py-0.5 rounded-sm"
                  style={{ fontSize: "10px", fontFamily: "Inter, sans-serif", fontWeight: 600, background: "rgba(242,202,80,0.08)" }}
                >
                  Koltukta
                </span>
                <span className="text-white/50 flex items-center gap-1" style={{ fontSize: "12px" }}>
                  <span
                    className="material-symbols-outlined text-[#f2ca50]/60"
                    style={{ fontSize: "14px" }}
                  >
                    timer
                  </span>
                  {inChair.time}
                </span>
              </div>
              <h3
                className="text-white font-bold truncate"
                style={{ fontSize: "18px", fontFamily: "Montserrat, sans-serif", lineHeight: 1.3 }}
              >
                {inChair.customerName}
              </h3>
              <p className="text-white/50 truncate" style={{ fontSize: "12px", fontFamily: "Inter, sans-serif" }}>
                {inChair.serviceName}
              </p>
            </article>
          ) : (
            <article
              className="min-w-[280px] h-[110px] flex flex-col justify-center rounded-xl p-4 border relative overflow-hidden shrink-0"
              style={{
                background: "rgba(40,42,43,0.5)",
                borderColor: "rgba(242,202,80,0.3)",
                boxShadow: "0 0 14px rgba(212,175,55,0.06)",
              }}
            >
              <span
                className="uppercase tracking-widest border border-[#f2ca50]/40 text-[#f2ca50]/60 px-2 py-0.5 rounded-sm mb-2"
                style={{ fontSize: "10px", fontFamily: "Inter, sans-serif", fontWeight: 600, width: "fit-content" }}
              >
                Koltukta
              </span>
              <p className="text-white/30 font-semibold" style={{ fontSize: "16px", fontFamily: "Montserrat, sans-serif" }}>
                Koltuk Müsait
              </p>
            </article>
          )}

          {/* Sıradaki Kartı */}
          {upNext && (
            <article
              className="min-w-[230px] h-[110px] flex flex-col justify-center rounded-xl p-4 border shrink-0"
              style={{
                background: "rgba(18,20,21,0.85)",
                borderColor: "rgba(77,70,53,0.6)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="uppercase tracking-widest border text-white/50 border-white/30 px-2 py-0.5 rounded-sm"
                  style={{ fontSize: "10px", fontFamily: "Inter, sans-serif", fontWeight: 600 }}
                >
                  Sıradaki
                </span>
                <span
                  className="text-white font-bold"
                  style={{ fontSize: "14px", fontFamily: "Inter, sans-serif" }}
                >
                  {upNext.time}
                </span>
              </div>
              <h3
                className="text-white/90 font-bold truncate"
                style={{ fontSize: "17px", fontFamily: "Montserrat, sans-serif", lineHeight: 1.3 }}
              >
                {upNext.customerName}
              </h3>
              <p className="text-white/40 truncate" style={{ fontSize: "12px", fontFamily: "Inter, sans-serif" }}>
                {upNext.serviceName}
              </p>
            </article>
          )}

          {/* Diğer Bekleyenler */}
          {rest.length > 0
            ? rest.map((appt) => (
                <article
                  key={appt.id}
                  className="min-w-[190px] h-[110px] flex flex-col justify-center rounded-xl p-4 border shrink-0"
                  style={{
                    background: "rgba(12,14,15,0.8)",
                    borderColor: "rgba(77,70,53,0.2)",
                  }}
                >
                  <h3
                    className="text-white font-semibold truncate"
                    style={{ fontSize: "15px", fontFamily: "Inter, sans-serif" }}
                  >
                    {appt.customerName}
                  </h3>
                  <span
                    className="uppercase mt-1 text-white/35"
                    style={{ fontSize: "10px", fontFamily: "Inter, sans-serif", letterSpacing: "0.06em" }}
                  >
                    Bekleyen — {appt.time}
                  </span>
                </article>
              ))
            : appointments.length === 0 && (
                <div className="flex items-center justify-center px-6 text-white/30 text-lg font-medium" style={{ fontFamily: "Inter, sans-serif" }}>
                  Bugün için bekleyen randevu yok
                </div>
              )}
        </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          ANA İÇERİK: YouTube Oynatıcı + Galeri
      ══════════════════════════════════════════════════════ */}
      <main
        className="absolute z-0 bg-black overflow-hidden"
        style={{ top: "220px", left: 0, right: 0, bottom: 0 }}
      >
        <CustomYouTubePlayer />
      </main>

      {/* ══════════════════════════════════════════════════════
          TOAST BİLDİRİMİ: Yeni Randevu Uyarısı
      ══════════════════════════════════════════════════════ */}
      <div
        className="fixed z-50 transition-all duration-500 ease-out"
        style={{
          top: "24px",
          right: "24px",
          transform: toast.visible ? "translateY(0) scale(1)" : "translateY(-20px) scale(0.95)",
          opacity: toast.visible ? 1 : 0,
          pointerEvents: toast.visible ? "auto" : "none",
        }}
      >
        <div
          className="flex items-center gap-4 px-6 py-4 rounded-2xl"
          style={{
            background: "#f2ca50",
            color: "#3c2f00",
            boxShadow: "0 10px 40px rgba(212,175,55,0.45)",
            backdropFilter: "blur(20px)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "32px", fontVariationSettings: "'FILL' 1", color: "#3c2f00" }}
          >
            notifications_active
          </span>
          <div className="flex flex-col">
            <span className="font-black leading-tight" style={{ fontSize: "18px", fontFamily: "Montserrat, sans-serif" }}>
              Yeni Randevu Alındı!
            </span>
            <span className="opacity-80 font-medium" style={{ fontSize: "14px", fontFamily: "Inter, sans-serif" }}>
              {toast.customerName} — {toast.date} {toast.time}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ALT BANT: Kayan Marquee
      ══════════════════════════════════════════════════════ */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center overflow-hidden"
        style={{
          height: "72px",
          background: "rgba(0, 0, 0, 0.1)",
          borderTop: "1px solid rgba(212,175,55,0.18)",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div className="w-full overflow-hidden whitespace-nowrap">
          <div
            className="inline-block whitespace-nowrap animate-marquee"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#f2ca50",
              filter: "drop-shadow(0 0 8px rgba(212,175,55,0.4))",
            }}
          >
            {marqueeText}
          </div>
        </div>
      </footer>

      {/* Material Symbols ve Google Fonts yükleme + keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800;900&display=swap');
          
          .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            font-feature-settings: 'liga';
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
          }

          @keyframes marquee {
            0%   { transform: translateX(100vw); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            animation: marquee 30s linear infinite;
            will-change: transform;
          }
          
          .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { 
            background: rgba(212,175,55,0.25); 
            border-radius: 10px; 
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
            background: rgba(212,175,55,0.5); 
          }
        `
      }} />
    </div>
  );
}

