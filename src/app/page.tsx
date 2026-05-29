"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  getActiveServices,
  getCustomerAvailableSlots,
  bookAppointment,
  queryAppointments,
  cancelCustomerAppointment,
  rescheduleCustomerAppointment,
  getDefaultBarberId,
  getPublicHolidays,
} from "./actions";
import { LogoBrand } from "@/components/logo-brand";

type ToastType = "success" | "error" | "info";
interface Toast { id: number; message: string; type: ToastType; }

export default function Home() {
  const [activeTab, setActiveTab] = useState<"book" | "query">("book");

  // Data
  const [defaultBarberId, setDefaultBarberId] = useState<string | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // Wizard
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  
  // Date & Time
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [allSlots, setAllSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [expandedHour, setExpandedHour] = useState<string | null>(null);

  // Personal Info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  // Query tab
  const [queryInput, setQueryInput] = useState("");
  const [searchedAppointments, setSearchedAppointments] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [isCancelling, startCancelling] = useTransition();
  const [isBooking, startBooking] = useTransition();

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // Date Strip Generation
  const dateStrip = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const isoDate = `${year}-${month}-${day}`;
      return {
        iso: isoDate,
        dayName: d.toLocaleDateString("tr-TR", { weekday: "short" }),
        dayNum: d.getDate(),
        monthYear: d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
        isHoliday: holidays.some(h => h.holiday_date === isoDate),
      };
    });
  }, [holidays]);

  const activeDateObj = dateStrip.find(d => d.iso === selectedDate) || dateStrip[0];

  // ── Initial Load ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [srvs, barberId, hols] = await Promise.all([
          getActiveServices(),
          getDefaultBarberId(),
          getPublicHolidays(),
        ]);
        setServices(srvs);
        setDefaultBarberId(barberId);
        setHolidays(hols);
        // İlk tarihi otomatik seç (bugün)
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        setSelectedDate(`${year}-${month}-${day}`);
      } catch (err) {
        showToast("Veriler yüklenirken bir hata oluştu.", "error");
      } finally {
        setLoadingServices(false);
      }
    };
    load();
  }, []);

  // ── Slot Yükleme (Step 2) ──────────────────────────────────────
  useEffect(() => {
    if (wizardStep === 2 && defaultBarberId && selectedDate) {
      setLoadingSlots(true);
      setSelectedSlot(null);
      setExpandedHour(null);
      getCustomerAvailableSlots(defaultBarberId, selectedDate, selectedServices)
        .then((res) => {
          setAvailableSlots(res.availableSlots || []);
          setAllSlots(res.slots || []);
        })
        .catch((err) => showToast(err.message || "Müsait saatler hesaplanamadı.", "error"))
        .finally(() => setLoadingSlots(false));
    }
  }, [wizardStep, defaultBarberId, selectedDate, selectedServices]);

  // ── Derived ──────────────────────────────────────────────────
  const selectedServiceDetails = services.filter((s) => selectedServices.includes(s.id));
  const totalPrice = selectedServiceDetails.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServiceDetails.reduce((sum, s) => sum + s.duration_minutes, 0);

  // ── Wizard Navigation ────────────────────────────────────────
  const handleNextStep = (step: number) => {
    if (wizardStep === 1 && selectedServices.length === 0) {
      showToast("Lütfen en az bir hizmet seçin.", "error"); return;
    }
    if (wizardStep === 2 && !selectedSlot) {
      showToast("Lütfen randevu saati seçin.", "error"); return;
    }
    if (wizardStep === 3) {
      if (!customerName.trim()) { showToast("Lütfen adınızı soyadınızı girin.", "error"); return; }
      if (!customerPhone.trim()) { showToast("Lütfen telefon numaranızı girin.", "error"); return; }
    }
    setWizardStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handlePrevStep = (step: number) => {
    setWizardStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Book ─────────────────────────────────────────────────────
  const handleBook = () => {
    if (!defaultBarberId) { showToast("Berber bulunamadı, lütfen admini arayın.", "error"); return; }
    startBooking(async () => {
      try {
        const res = await bookAppointment({
          barberId: defaultBarberId,
          startsAt: selectedSlot.startsAt,
          serviceIds: selectedServices,
          fullName: customerName,
          phone: customerPhone,
          customerNote,
        });
        if (res.success && res.appointmentId) {
          setCreatedCode(res.appointmentId);
          setWizardStep(5);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (err: any) {
        showToast(err.message || "Randevu alınamadı. Lütfen tekrar deneyin.", "error");
      }
    });
  };

  // ── Query ────────────────────────────────────────────────────
  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) { showToast("Lütfen telefon veya rezervasyon kodu girin.", "error"); return; }
    startSearch(async () => {
      try {
        const res = await queryAppointments(queryInput);
        setSearchedAppointments(res);
        setHasSearched(true);
        if (res.length === 0) showToast("Aktif randevu bulunamadı.", "info");
        else showToast(`${res.length} randevu bulundu.`, "success");
      } catch { showToast("Arama sırasında hata oluştu.", "error"); }
    });
  };

  const handleCancelAppointment = (id: string) => {
    if (!confirm("Bu randevuyu iptal etmek istediğinize emin misiniz?")) return;
    startCancelling(async () => {
      try {
        const res = await cancelCustomerAppointment(id);
        if (res.success) {
          showToast("Randevu başarıyla iptal edildi.", "success");
          const updated = await queryAppointments(queryInput);
          setSearchedAppointments(updated);
        }
      } catch (err: any) { showToast(err.message || "İptal işlemi başarısız.", "error"); }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Kod kopyalandı!", "success");
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  const handleResetWizard = () => {
    setSelectedServices([]); setSelectedDate(""); setAvailableSlots([]); setAllSlots([]);
    setSelectedSlot(null); setCustomerName(""); setCustomerPhone("");
    setCustomerNote(""); setCreatedCode(""); setWizardStep(1);
    setActiveTab("book");
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; classes: string }> = {
      pending: { label: "Onay Bekliyor", classes: "bg-surface-variant text-primary border-primary/20" },
      confirmed: { label: "Onaylandı", classes: "bg-primary/20 text-primary border-primary/30" },
      in_progress: { label: "İşlemde", classes: "bg-surface-container text-on-surface border-outline/20" },
      completed: { label: "Tamamlandı", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
      cancelled: { label: "İptal", classes: "bg-error/10 text-error border-error/20" },
      no_show: { label: "Gelmedi", classes: "bg-surface-container text-on-surface-variant border-outline-variant/20" },
    };
    const c = configs[status] || { label: status, classes: "bg-surface text-on-surface border-outline" };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border ${c.classes}`}>{c.label}</span>;
  };

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen relative overflow-x-hidden">
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md text-sm font-medium ${
            t.type === "success" ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
            : t.type === "error" ? "bg-error/10 border-error/30 text-error"
            : "bg-surface border-outline-variant text-on-surface"
          }`}>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-50 hover:opacity-100">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>

      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-primary/10 shadow-sm flex justify-between items-center px-4 md:px-gutter py-sm">
        <div className="flex items-center gap-2">
           <LogoBrand size="sm" />
           <h1 className="font-display-sm text-headline-lg-mobile md:text-headline-lg text-primary tracking-tighter uppercase whitespace-nowrap">İmaj Kuaför</h1>
        </div>
        <div className="flex items-center gap-4 text-primary">
          <Link href="/admin" className="hover:text-primary-fixed transition-colors duration-300 active:scale-95">
            <span className="material-symbols-outlined">admin_panel_settings</span>
          </Link>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="pt-[88px] pb-[120px] px-4 md:px-gutter max-w-2xl mx-auto flex flex-col min-h-screen">
        
        {activeTab === "book" && (
          <>
            {/* Progress Indicator */}
            {wizardStep < 5 && (
              <div className="flex justify-between items-center mb-8 relative px-2" id="progress-indicator">
                <div className="absolute top-1/2 left-0 w-full h-[1px] bg-surface-variant -z-10 translate-y-[-50%]"></div>
                <div 
                  className="absolute top-1/2 left-0 h-[2px] bg-primary shadow-[0_0_10px_rgba(212,175,55,0.5)] transition-all duration-300 -z-10 translate-y-[-50%]" 
                  style={{ width: `${((wizardStep - 1) / 3) * 100}%` }}
                ></div>
                
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className={`step-dot flex items-center justify-center rounded-full border-2 border-background transition-all duration-300 ${
                    wizardStep > step ? "w-6 h-6 bg-primary shadow-[0_0_10px_rgba(212,175,55,0.5)] text-background"
                    : wizardStep === step ? "w-6 h-6 bg-primary shadow-[0_0_10px_rgba(212,175,55,0.5)] text-background"
                    : "w-4 h-4 bg-surface-variant"
                  }`}>
                    {wizardStep > step ? (
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    ) : wizardStep === step ? (
                       <span className="text-[10px] font-bold">{step}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* Wizard Steps */}
            <div className="flex-grow flex flex-col">
              
              {/* Step 1: Services */}
              {wizardStep === 1 && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-2">
                    <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Hizmet Seçimi</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">Size uygun olan hizmetleri seçin.</p>
                  </div>
                  
                  {loadingServices ? (
                    <div className="py-12 flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
                      <span className="text-sm text-on-surface-variant">Hizmetler yükleniyor...</span>
                    </div>
                  ) : services.length === 0 ? (
                    <div className="py-12 text-center text-sm text-on-surface-variant border border-outline-variant rounded-xl">
                      Henüz aktif hizmet tanımlanmamış.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {services.map(s => {
                        const isSelected = selectedServices.includes(s.id);
                        return (
                          <label key={s.id} className="group relative block cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              className="peer sr-only" 
                              checked={isSelected}
                              onChange={() => setSelectedServices(prev => isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                            />
                            <div className={`relative overflow-hidden rounded-xl bg-surface-container border p-4 transition-all duration-300 flex items-center justify-between ${
                              isSelected ? "border-primary bg-surface-container-high shadow-[0_0_15px_rgba(212,175,55,0.15)]" : "border-primary/10 hover:border-primary/30"
                            }`}>
                              {/* Background Texture Placeholder */}
                              <div className="absolute inset-0 opacity-[0.03] bg-cover bg-center mix-blend-overlay pointer-events-none" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=800&auto=format&fit=crop')" }}></div>
                              
                              <div className="relative flex items-center gap-4 z-10">
                                <div className="w-12 h-12 rounded-full bg-surface-container-highest border border-primary/20 flex items-center justify-center text-primary">
                                  <span className="material-symbols-outlined">{s.icon || "content_cut"}</span>
                                </div>
                                <div>
                                  <h3 className="font-headline-md text-headline-md text-on-surface">{s.name}</h3>
                                  <p className="font-caption text-caption text-on-surface-variant">{s.duration_minutes} dk</p>
                                </div>
                              </div>
                              <div className="relative z-10 flex flex-col items-end gap-1">
                                <span className="font-headline-md text-headline-md text-primary">₺{s.price}</span>
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                                  isSelected ? "bg-primary border-primary" : "border-primary/30"
                                }`}>
                                  <span className={`material-symbols-outlined text-[16px] text-background transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`} style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-auto pt-6">
                    <button 
                      type="button"
                      onClick={() => handleNextStep(2)}
                      disabled={selectedServices.length === 0}
                      className="w-full bg-primary text-on-primary font-headline-md text-headline-md rounded-full py-4 shadow-[0_0_20px_rgba(212,175,55,0.2)] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
                    >
                      Devam Et <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Date & Time */}
              {wizardStep === 2 && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-2 flex items-center gap-3">
                    <button type="button" onClick={() => handlePrevStep(1)} className="w-10 h-10 rounded-full bg-surface-container border border-primary/10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shrink-0">
                      <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Tarih & Saat</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Size en uygun zamanı seçin.</p>
                    </div>
                  </div>

                  {/* Date Picker Strip */}
                  <div>
                    <h3 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3 tracking-widest">{activeDateObj?.monthYear}</h3>
                    <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                      {dateStrip.map(d => {
                        const isSelected = selectedDate === d.iso;
                        return (
                          <button 
                            key={d.iso}
                            onClick={() => {
                              if(d.isHoliday) { showToast("Bu tarih tatil günüdür.", "error"); return; }
                              setSelectedDate(d.iso);
                            }}
                            className={`flex-shrink-0 w-16 py-3 rounded-lg flex flex-col items-center justify-center transition-all ${
                              isSelected 
                                ? "bg-primary text-on-primary shadow-[0_0_15px_rgba(212,175,55,0.2)]" 
                                : d.isHoliday
                                ? "bg-error/10 border border-error/20 text-error opacity-70 cursor-not-allowed"
                                : "bg-surface-container border border-primary/10 text-on-surface-variant hover:border-primary/40"
                            }`}
                          >
                            <span className={`font-caption text-caption uppercase mb-1 ${isSelected ? "font-bold" : ""}`}>{d.dayName}</span>
                            <span className="font-headline-md text-headline-md">{d.dayNum}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Slots Grid */}
                  <div>
                    <h3 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3 tracking-widest">Müsait Saatler</h3>
                    
                    {!selectedDate ? (
                      <div className="py-8 text-center text-sm text-on-surface-variant border border-outline-variant/30 rounded-xl bg-surface-container-low flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[32px]">event</span>
                        Saatleri görmek için bir gün seçin.
                      </div>
                    ) : loadingSlots ? (
                      <div className="py-8 text-center text-sm text-on-surface-variant flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
                        Hesaplanıyor...
                      </div>
                    ) : allSlots.length === 0 ? (
                      <div className="py-8 text-center text-sm text-error border border-error/20 rounded-xl bg-error/5 flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[32px]">event_busy</span>
                        Bu tarihte müsait saat bulunamadı.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                        {Array.from(new Set(allSlots.map(s => s.displayTime.split(':')[0]))).map(hour => {
                          const hourSlots = allSlots.filter(s => s.displayTime.startsWith(hour + ':'));
                          const isExpanded = expandedHour === hour;
                          const hasAvailable = hourSlots.some(s => s.available);
                          const hasSelected = selectedSlot && hourSlots.some(s => s.startsAt === selectedSlot.startsAt);

                          return (
                            <div key={hour} className="flex flex-col gap-2">
                              <button
                                onClick={() => setExpandedHour(isExpanded ? null : hour)}
                                className={`flex items-center justify-between w-full py-3 px-4 rounded-xl border transition-all ${
                                  hasSelected
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "bg-surface-container border-outline-variant/30 hover:border-primary/40 text-on-surface"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-headline-md text-lg">{hour}:00</span>
                                  {!hasAvailable && (
                                    <span className="text-[10px] uppercase tracking-wider bg-error/10 text-error px-2 py-0.5 rounded font-bold">
                                      Dolu
                                    </span>
                                  )}
                                </div>
                                <span className={`material-symbols-outlined transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                  expand_more
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pl-2 border-l-2 border-primary/20 ml-2 mt-1">
                                  {hourSlots.map(slot => {
                                    const isBooked = !slot.available;
                                    const isSelected = selectedSlot?.startsAt === slot.startsAt;
                                    return (
                                      <button 
                                        key={slot.startsAt}
                                        onClick={() => { if(!isBooked) setSelectedSlot(slot); }}
                                        disabled={isBooked}
                                        className={`py-2.5 rounded-lg font-body-md text-sm transition-all ${
                                          isBooked 
                                            ? "bg-surface-container border border-outline-variant/20 text-on-surface-variant opacity-40 cursor-not-allowed line-through" 
                                            : isSelected
                                            ? "bg-primary text-on-primary font-semibold shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                                            : "bg-surface-container border border-primary/10 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                                        }`}
                                      >
                                        {slot.displayTime}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-6">
                    <button 
                      type="button"
                      onClick={() => handleNextStep(3)}
                      disabled={!selectedSlot}
                      className="w-full bg-primary text-on-primary font-headline-md text-headline-md rounded-full py-4 shadow-[0_0_20px_rgba(212,175,55,0.2)] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
                    >
                      Devam Et <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Personal Info */}
              {wizardStep === 3 && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-2 flex items-center gap-3">
                    <button type="button" onClick={() => handlePrevStep(2)} className="w-10 h-10 rounded-full bg-surface-container border border-primary/10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shrink-0">
                      <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Kişisel Bilgiler</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Randevu onayı için gereklidir.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div className="relative">
                      <label className="font-caption text-caption text-on-surface-variant absolute top-2 left-4">Ad Soyad</label>
                      <input 
                        type="text" 
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-surface-container-highest border-0 border-b border-outline rounded-t-md px-4 pt-7 pb-3 text-on-surface font-body-md text-body-md focus:ring-0 focus:border-primary transition-colors placeholder:text-on-surface-variant/30" 
                        placeholder="Örn: Ahmet Yılmaz" 
                      />
                    </div>
                    <div className="relative">
                      <label className="font-caption text-caption text-on-surface-variant absolute top-2 left-4">Telefon Numarası</label>
                      <input 
                        type="tel" 
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full bg-surface-container-highest border-0 border-b border-outline rounded-t-md px-4 pt-7 pb-3 text-on-surface font-body-md text-body-md focus:ring-0 focus:border-primary transition-colors placeholder:text-on-surface-variant/30" 
                        placeholder="05XX XXX XX XX" 
                      />
                    </div>
                  </div>

                  <div className="mt-auto pt-6">
                    <button 
                      type="button"
                      onClick={() => handleNextStep(4)}
                      className="w-full bg-primary text-on-primary font-headline-md text-headline-md rounded-full py-4 shadow-[0_0_20px_rgba(212,175,55,0.2)] active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                      Özeti İncele <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Summary */}
              {wizardStep === 4 && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-2 flex items-center gap-3">
                    <button type="button" onClick={() => handlePrevStep(3)} className="w-10 h-10 rounded-full bg-surface-container border border-primary/10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shrink-0">
                      <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Onayla</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Randevu detaylarınızı kontrol edin.</p>
                    </div>
                  </div>

                  <div className="bg-surface-container/80 backdrop-blur-md border border-primary/10 rounded-xl p-6 relative overflow-hidden">
                    {/* Decorative subtle glow */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div className="flex items-center gap-4 border-b border-outline-variant/30 pb-4 mb-4 relative z-10">
                      <div className="w-14 h-14 rounded-full bg-surface-container-highest border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-[28px]">calendar_month</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-headline-md text-headline-md text-on-surface truncate">{formatDate(selectedSlot?.startsAt || selectedDate)}</h3>
                        <p className="font-body-md text-body-md text-primary">{selectedSlot?.displayTime}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4 mb-6 relative z-10">
                      <h4 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">Hizmetler</h4>
                      {selectedServiceDetails.map(s => (
                        <div key={s.id} className="flex justify-between items-center">
                          <span className="font-body-md text-body-md text-on-surface">{s.name}</span>
                          <span className="font-body-md text-body-md text-on-surface">₺{s.price}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-2 mb-6 relative z-10">
                       <h4 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">Bilgiler</h4>
                       <div className="text-body-md text-on-surface">{customerName}</div>
                       <div className="text-body-md text-on-surface-variant">{customerPhone}</div>
                    </div>

                    <div className="border-t border-outline-variant/30 pt-4 flex justify-between items-end relative z-10">
                      <span className="font-body-md text-body-md text-on-surface-variant">Toplam <span className="text-sm">({totalDuration} dk)</span></span>
                      <span className="font-display-sm-mobile text-display-sm-mobile text-primary">₺{totalPrice}</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-6">
                    <button 
                      type="button"
                      onClick={handleBook}
                      disabled={isBooking}
                      className="w-full bg-primary text-on-primary font-headline-md text-headline-md rounded-full py-4 shadow-[0_0_20px_rgba(212,175,55,0.2)] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
                    >
                      {isBooking ? (
                        <><span className="material-symbols-outlined animate-spin">progress_activity</span> İşleniyor...</>
                      ) : (
                        <>Randevuyu Onayla <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Success */}
              {wizardStep === 5 && (
                <div className="flex flex-col items-center justify-center text-center px-4 py-12 animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 relative">
                    <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-20"></div>
                    <span className="material-symbols-outlined text-[48px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <h2 className="font-display-sm-mobile text-display-sm-mobile text-on-surface mb-2">Talep Alındı</h2>
                  
                  <div className="bg-surface-container inline-block px-4 py-2 rounded-lg border border-primary/20 mb-6 flex items-center gap-2">
                    <p className="font-label-md text-label-md text-primary tracking-widest uppercase">Kod: {createdCode.slice(0,8)}</p>
                    <button onClick={() => copyToClipboard(createdCode)} className="text-primary hover:text-primary-fixed"><span className="material-symbols-outlined text-[16px]">content_copy</span></button>
                  </div>
                  
                  <p className="font-body-lg text-body-lg text-on-surface-variant mb-2">Onay Bekleniyor</p>
                  <p className="font-body-md text-body-md text-on-surface-variant/70 max-w-xs mb-10">
                    Berberimiz randevunuzu onayladığında SMS alacaksınız. Randevu kodunuzla durumunu sorgulayabilirsiniz.
                  </p>
                  
                  <button 
                    onClick={handleResetWizard} 
                    className="px-8 py-3 rounded-full border border-primary/30 text-primary font-headline-md text-headline-md hover:bg-primary/5 transition-colors"
                  >
                    Yeni Randevu
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────
            TAB: GEÇMİŞ / SORGULAMA (Visits)
            ───────────────────────────────────────────────────── */}
        {activeTab === "query" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-2">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Randevularım</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Telefon veya kod ile randevularınızı bulun.</p>
            </div>

            <form onSubmit={handleQuery} className="flex gap-2.5">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">search</span>
                <input
                  type="text"
                  required
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="05XX XXX XX XX veya Kod"
                  className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-xl py-3.5 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSearching} 
                className="px-6 py-3.5 rounded-xl bg-primary text-on-primary font-headline-md text-sm uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shrink-0 flex items-center justify-center"
              >
                {isSearching ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : "Bul"}
              </button>
            </form>

            {hasSearched && (
              <div className="space-y-4 mt-4">
                <h4 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/20 pb-2">
                  Sonuçlar ({searchedAppointments.length})
                </h4>

                {searchedAppointments.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center gap-3">
                     <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                       <span className="material-symbols-outlined text-[32px]">event_busy</span>
                     </div>
                     <p className="text-sm text-on-surface-variant">Aktif veya geçmiş randevu bulunamadı.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {searchedAppointments.map((appt) => {
                      const isActive = ["pending", "confirmed"].includes(appt.status);
                      return (
                        <div key={appt.id} className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
                          {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
                          <div className="flex justify-between items-start">
                             <div>
                               <h5 className="font-headline-md text-on-surface">{formatDate(appt.starts_at)}</h5>
                               <div className="flex items-center gap-1 text-primary mt-1">
                                 <span className="material-symbols-outlined text-[16px]">schedule</span>
                                 <span className="font-bold">{new Date(appt.starts_at).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"})}</span>
                               </div>
                             </div>
                             {getStatusBadge(appt.status)}
                          </div>
                          
                          <div className="text-sm text-on-surface-variant bg-surface-container p-3 rounded-lg border border-outline-variant/10">
                             {appt.appointment_services?.map((as:any) => as.services?.name).join(", ")}
                          </div>

                          {isActive && (
                            <div className="flex gap-2 pt-2">
                              <button onClick={() => handleCancelAppointment(appt.id)} disabled={isCancelling} className="flex-1 py-2 rounded-lg border border-error/30 text-error text-xs font-bold uppercase tracking-wider hover:bg-error/10 transition-colors">
                                İptal Et
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 w-full rounded-t-[24px] z-50 bg-surface-container-low/90 backdrop-blur-lg border-t border-primary/10 shadow-[0_-4px_20px_rgba(212,175,55,0.1)] flex justify-around items-center h-20 px-4 pb-safe-area-mobile md:hidden">
        <button onClick={() => { setActiveTab("book"); setWizardStep(1); }} className={`flex flex-col items-center justify-center transition-all duration-200 ${activeTab === 'book' && wizardStep === 1 ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: activeTab === 'book' && wizardStep === 1 ? "'FILL' 1" : "'FILL' 0" }}>home</span>
          <span className="font-label-md text-label-md text-[10px]">Ana Sayfa</span>
        </button>
        
        <button onClick={() => setActiveTab("book")} className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full p-2 w-12 h-12 -translate-y-2 shadow-[0_4px_10px_rgba(212,175,55,0.3)] active:scale-90 transition-all duration-200">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>content_cut</span>
        </button>
        
        <button onClick={() => setActiveTab("query")} className={`flex flex-col items-center justify-center transition-all duration-200 ${activeTab === 'query' ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: activeTab === 'query' ? "'FILL' 1" : "'FILL' 0" }}>history</span>
          <span className="font-label-md text-label-md text-[10px]">Geçmiş</span>
        </button>
        
        <button onClick={() => showToast("Profil sayfası yakında eklenecek!", "info")} className="flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-all duration-200">
          <span className="material-symbols-outlined mb-1">account_circle</span>
          <span className="font-label-md text-label-md text-[10px]">Profil</span>
        </button>
      </nav>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
