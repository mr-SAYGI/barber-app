"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Scissors,
  Sparkles,
  CalendarDays,
  User,
  Phone,
  FileText,
  Ban,
  CheckCircle,
  Clock,
  Calendar,
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Search,
  Copy,
  Plus,
  Award,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
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
import { Calendar as CalendarPicker } from "@/components/calendar";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
type ToastType = "success" | "error" | "info";
interface Toast { id: number; message: string; type: ToastType; }

// Step labels for 4-step wizard (no barber step)
const STEP_LABELS = ["Hizmet", "Tarih & Saat", "Bilgiler", "Özet"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"book" | "query">("book");

  // Data
  const [defaultBarberId, setDefaultBarberId] = useState<string | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // Wizard: steps 1-4, then 5=success
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [allSlots, setAllSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  // Query tab
  const [queryInput, setQueryInput] = useState("");
  const [searchedAppointments, setSearchedAppointments] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [reschedDate, setReschedDate] = useState("");
  const [reschedSlots, setReschedSlots] = useState<any[]>([]);
  const [loadingReschedSlots, setLoadingReschedSlots] = useState(false);
  const [reschedSelectedSlot, setReschedSelectedSlot] = useState<any>(null);
  const [isReschedulingSubmit, startReschedSubmit] = useTransition();
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
    if (wizardStep === 2 && defaultBarberId && selectedDate && selectedServices.length > 0) {
      setLoadingSlots(true);
      setSelectedSlot(null);
      getCustomerAvailableSlots(defaultBarberId, selectedDate, selectedServices)
        .then((res) => {
          setAvailableSlots(res.availableSlots || []);
          setAllSlots(res.slots || []);
        })
        .catch((err) => showToast(err.message || "Müsait saatler hesaplanamadı.", "error"))
        .finally(() => setLoadingSlots(false));
    }
  }, [wizardStep, defaultBarberId, selectedDate, selectedServices]);

  // ── Reschedule Slot Yükleme ──────────────────────────────────
  useEffect(() => {
    if (reschedulingId && reschedDate) {
      setLoadingReschedSlots(true);
      setReschedSelectedSlot(null);
      const targetAppt = searchedAppointments.find((a) => a.id === reschedulingId);
      if (!targetAppt) return;
      const srvIds = targetAppt.appointment_services?.map((as: any) => as.services?.id || as.service_id) || [];
      getCustomerAvailableSlots(targetAppt.barber_id || defaultBarberId!, reschedDate, srvIds)
        .then((res) => setReschedSlots(res.availableSlots || []))
        .catch(() => showToast("Müsait saatler hesaplanamadı.", "error"))
        .finally(() => setLoadingReschedSlots(false));
    }
  }, [reschedulingId, reschedDate, searchedAppointments, defaultBarberId]);

  // ── Derived ──────────────────────────────────────────────────
  const selectedServiceDetails = services.filter((s) => selectedServices.includes(s.id));
  const totalPrice = selectedServiceDetails.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServiceDetails.reduce((sum, s) => sum + s.duration_minutes, 0);

  // ── Wizard Navigation ────────────────────────────────────────
  const handleNextStep = () => {
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
    setWizardStep((prev) => prev + 1);
  };
  const handlePrevStep = () => setWizardStep((prev) => prev - 1);

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

  const handleRescheduleSubmit = (id: string) => {
    if (!reschedSelectedSlot) { showToast("Lütfen yeni bir saat seçin.", "error"); return; }
    startReschedSubmit(async () => {
      try {
        const res = await rescheduleCustomerAppointment(id, reschedSelectedSlot.startsAt);
        if (res.success) {
          showToast("Randevu başarıyla yeniden planlandı! ✅", "success");
          setReschedulingId(null); setReschedDate(""); setReschedSlots([]); setReschedSelectedSlot(null);
          const updated = await queryAppointments(queryInput);
          setSearchedAppointments(updated);
        }
      } catch (err: any) { showToast(err.message || "Yeniden planlama başarısız.", "error"); }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Kodu kopyalandı! 📋");
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; classes: string }> = {
      pending: { label: "Onay Bekliyor", classes: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
      confirmed: { label: "Onaylandı", classes: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
      in_progress: { label: "İşlemde", classes: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
      completed: { label: "Tamamlandı", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
      cancelled: { label: "İptal Edildi", classes: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
      no_show: { label: "Gelmedi", classes: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
    };
    const c = configs[status] || { label: status, classes: "bg-slate-800 text-slate-400" };
    return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${c.classes}`}>{c.label}</span>;
  };

  const handleResetWizard = () => {
    setSelectedServices([]); setSelectedDate(""); setAvailableSlots([]); setAllSlots([]);
    setSelectedSlot(null); setCustomerName(""); setCustomerPhone("");
    setCustomerNote(""); setCreatedCode(""); setWizardStep(1);
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-4 md:p-6 relative overflow-hidden text-slate-100">

      {/* Background Glow */}
      <div className="absolute top-[-25%] left-[-15%] w-[60%] h-[60%] bg-amber-950/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] bg-emerald-950/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-lg text-xs font-semibold ${
            t.type === "success" ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
            : t.type === "error" ? "bg-rose-950/90 border-rose-500/30 text-rose-300"
            : "bg-slate-900/90 border-slate-700/60 text-slate-300"
          }`}>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-50 hover:opacity-100">×</button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="flex justify-between items-center z-10 py-3 border-b border-slate-900/60 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <LogoBrand size="md" />
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tight text-white leading-none">
              İMAJ <span className="text-amber-400">ERKEK KUAFÖR</span>
            </h1>
            <p className="text-[9px] tracking-widest text-slate-500 font-bold uppercase mt-1">Premium Barber Experience</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white hover:border-slate-700 transition-colors">
            Yönetici Girişi
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-400 font-semibold shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            Online Rezervasyon
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center max-w-5xl mx-auto w-full py-8 z-10">

        {/* Intro */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-bold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Eşsiz Bir Tıraş Deneyimi İçin Hemen Yerini Ayırt
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-3 text-slate-100 leading-tight">
            Prestijli Hizmet, <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-yellow-200 bg-clip-text text-transparent">Kusursuz Sonuç</span>
          </h2>
          <p className="text-slate-400 max-w-md mx-auto text-xs md:text-sm leading-relaxed">
            İstediğiniz hizmetleri seçin, size en uygun günü ve saati belirleyerek randevunuzu anında ayırtın.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl max-w-md w-full mb-8 shadow-inner">
          <button onClick={() => setActiveTab("book")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "book" ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md font-extrabold" : "text-slate-400 hover:text-slate-200"
          }`}>
            <Plus className="w-4 h-4" /> Randevu Al
          </button>
          <button onClick={() => setActiveTab("query")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "query" ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md font-extrabold" : "text-slate-400 hover:text-slate-200"
          }`}>
            <Search className="w-4 h-4" /> Randevum
          </button>
        </div>

        {/* Card */}
        <div className="w-full max-w-3xl bg-slate-900/40 backdrop-blur-sm rounded-3xl p-6 md:p-8 border border-slate-800/70 shadow-2xl relative">

          {/* ─────────────────────────────────────────────────────
              TAB: RANDEVU AL
              ───────────────────────────────────────────────────── */}
          {activeTab === "book" && (
            <div>
              {/* Step Progress */}
              {wizardStep < 5 && (
                <div className="flex items-center justify-between mb-8 max-w-lg mx-auto">
                  {[1, 2, 3, 4].map((step) => (
                    <React.Fragment key={step}>
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border transition-all ${
                          wizardStep === step
                            ? "bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 scale-110"
                            : wizardStep > step
                            ? "bg-slate-900 border-emerald-500/40 text-emerald-400"
                            : "bg-slate-900/40 border-slate-800 text-slate-500"
                        }`}>
                          {wizardStep > step ? <Check className="w-4 h-4 stroke-[3]" /> : step}
                        </div>
                        <span className={`text-[9px] font-bold mt-2 tracking-wider uppercase ${wizardStep === step ? "text-amber-400" : "text-slate-500"}`}>
                          {STEP_LABELS[step - 1]}
                        </span>
                      </div>
                      {step < 4 && (
                        <div className={`flex-1 h-[2px] mx-2 -mt-5 transition-all ${wizardStep > step ? "bg-emerald-500/30" : "bg-slate-800"}`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* ── STEP 1: HİZMET SEÇİMİ ── */}
              {wizardStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Adım 1: Hizmet Seçin</h3>
                    <p className="text-xs text-slate-500 mt-1">Aynı randevuda birden fazla hizmet alabilirsiniz.</p>
                  </div>

                  {loadingServices ? (
                    <div className="py-12 flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                      <span className="text-xs text-slate-500">Hizmetler yükleniyor...</span>
                    </div>
                  ) : services.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500 border border-slate-800 rounded-2xl">
                      Henüz aktif hizmet tanımlanmamış. Lütfen admini arayın.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                      {services.map((s) => {
                        const isSelected = selectedServices.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelectedServices((prev) => isSelected ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-4 ${
                              isSelected
                                ? "bg-amber-500/5 border-amber-500/40 shadow-sm shadow-amber-500/5"
                                : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              {s.icon && <span className="text-xl shrink-0">{s.icon}</span>}
                              <div>
                                <h4 className="font-bold text-sm text-slate-200">{s.name}</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">{s.duration_minutes} dakika</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-extrabold text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                                ₺{s.price}
                              </span>
                              <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                                isSelected ? "bg-amber-400 border-amber-400 text-slate-950" : "border-slate-700 bg-slate-950"
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Seçim özeti */}
                  {selectedServices.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 flex justify-between items-center text-xs">
                      <div className="text-slate-400 font-semibold">
                        Toplam: <span className="text-slate-200">{selectedServices.length} hizmet</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" />{totalDuration} dk</span>
                        <span className="font-black text-sm text-amber-400">₺{totalPrice}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t border-slate-900/40">
                    <button
                      onClick={handleNextStep}
                      disabled={selectedServices.length === 0}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                    >
                      Devam Et <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: TARİH & SAAT ── */}
              {wizardStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Adım 2: Tarih ve Saat Seçin</h3>
                    <p className="text-xs text-slate-500 mt-1">Seçtiğiniz tarihteki müsait saat dilimleri listelenecektir.</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Date Picker */}
                    <div className="md:col-span-1 space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Tarih Seçin</label>
                      <CalendarPicker
                        selectedDate={selectedDate}
                        onSelect={setSelectedDate}
                        minDate={new Date().toISOString().split("T")[0]}
                        holidays={holidays}
                        onHolidayClick={(name) => showToast(`${name} nedeniyle kapalı.`, "error")}
                      />
                    </div>

                    {/* Slots */}
                    <div className="md:col-span-2 space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Saat Seçimi</label>
                      {!selectedDate ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5 h-36">
                          <Calendar className="w-5 h-5 text-slate-600" />
                          Saatleri listelemek için bir tarih seçin.
                        </div>
                      ) : loadingSlots ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2 h-36">
                          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                          Saatler hesaplanıyor...
                        </div>
                      ) : allSlots.length === 0 ? (
                        <div className="rounded-xl border border-rose-500/10 bg-rose-500/[0.02] p-6 text-center text-xs text-rose-400 flex flex-col items-center gap-1.5 h-36">
                          <AlertTriangle className="w-5 h-5 text-rose-500" />
                          Bu tarihte uygun slot bulunamadı. Lütfen başka bir gün deneyin.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[200px] overflow-y-auto pr-1">
                            {allSlots.map((slot) => {
                              const isSel = selectedSlot?.startsAt === slot.startsAt;
                              const isBooked = !slot.available;
                              return (
                                <button
                                  key={slot.startsAt}
                                  type="button"
                                  disabled={isBooked}
                                  onClick={() => { if (!isBooked) setSelectedSlot(slot); }}
                                  className={`py-2 text-[11px] font-bold rounded-lg border transition-all ${
                                    isBooked
                                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400/70 cursor-not-allowed line-through opacity-70"
                                      : isSel
                                      ? "bg-amber-500 border-amber-400 text-slate-950 font-black shadow-md"
                                      : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                  }`}
                                  title={isBooked ? "Bu saat dolu" : slot.displayTime}
                                >
                                  {slot.displayTime}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-slate-700 bg-slate-900/40 inline-block" /> Müsait</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-rose-500/30 bg-rose-500/10 inline-block" /> Dolu</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-amber-400 bg-amber-500 inline-block" /> Seçili</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-slate-900/40">
                    <button onClick={handlePrevStep} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 font-extrabold text-xs uppercase tracking-wider transition-colors">
                      <ArrowLeft className="w-4 h-4" /> Geri Git
                    </button>
                    <button onClick={handleNextStep} disabled={!selectedSlot} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg">
                      Devam Et <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: MÜŞTERİ BİLGİLERİ ── */}
              {wizardStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Adım 3: İletişim Bilgilerinizi Girin</h3>
                    <p className="text-xs text-slate-500 mt-1">Randevunuzu takip etmek için bilgilerinizi doğru girin.</p>
                  </div>

                  <div className="space-y-4 max-w-sm mx-auto w-full">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Ad Soyad *</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Ahmet Yılmaz"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/40 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Telefon Numarası *</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="0532 000 00 00"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/40 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Not (opsiyonel)</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3.5 w-4 h-4 text-slate-500 pointer-events-none" />
                        <textarea
                          value={customerNote}
                          onChange={(e) => setCustomerNote(e.target.value)}
                          placeholder="Özel isteklerinizi yazabilirsiniz..."
                          rows={3}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/40 transition-colors resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-slate-900/40">
                    <button onClick={handlePrevStep} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 font-extrabold text-xs uppercase tracking-wider transition-colors">
                      <ArrowLeft className="w-4 h-4" /> Geri Git
                    </button>
                    <button onClick={handleNextStep} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg">
                      Özeti Gör <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: ÖZET & ONAY ── */}
              {wizardStep === 4 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Adım 4: Özet ve Onay</h3>
                    <p className="text-xs text-slate-500 mt-1">Bilgilerinizi kontrol edin ve randevuyu oluşturun.</p>
                  </div>

                  {/* Summary Card */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block">Randevu Özeti</span>
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between border-b border-slate-900 pb-2">
                        <span className="text-slate-500">Müşteri</span>
                        <span className="font-bold text-slate-200">{customerName}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-900 pb-2">
                        <span className="text-slate-500">Telefon</span>
                        <span className="font-semibold text-slate-300">{customerPhone}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-900 pb-2">
                        <span className="text-slate-500">Tarih</span>
                        <span className="font-semibold text-slate-200">{formatDate(selectedSlot?.startsAt)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-900 pb-2">
                        <span className="text-slate-500">Saat</span>
                        <span className="font-bold text-amber-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />{selectedSlot?.displayTime}
                        </span>
                      </div>
                      <div className="border-b border-slate-900 pb-2 space-y-1">
                        <span className="text-slate-500 block">Hizmetler</span>
                        <div className="font-medium text-slate-300 space-y-0.5">
                          {selectedServiceDetails.map((s) => (
                            <div key={s.id} className="flex justify-between">
                              <span>• {s.name}</span>
                              <span>₺{s.price}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Toplam</span>
                        <span className="font-extrabold text-amber-400">₺{totalPrice} <span className="text-slate-500 font-normal">• {totalDuration} dk</span></span>
                      </div>
                    </div>

                    {/* Pending notice */}
                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2 text-[11px] text-amber-300">
                      <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Randevunuz <strong>onay bekleyen</strong> olarak oluşturulacak. Berberimiz onayladığında aktif hale gelecektir.</span>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-slate-900/40">
                    <button onClick={handlePrevStep} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 font-extrabold text-xs uppercase tracking-wider transition-colors">
                      <ArrowLeft className="w-4 h-4" /> Geri Git
                    </button>
                    <button
                      onClick={handleBook}
                      disabled={isBooking}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg ml-3"
                    >
                      {isBooking ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Oluşturuluyor...</>
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> Randevuyu Oluştur</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 5: BAŞARI ── */}
              {wizardStep === 5 && (
                <div className="text-center py-8 space-y-6 max-w-md mx-auto">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400 animate-bounce">
                    <CheckCircle className="w-10 h-10 stroke-[2]" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-100">Randevunuz Alındı!</h3>
                    <p className="text-sm text-amber-400 font-semibold">⏳ Onay Bekleniyor</p>
                    <p className="text-xs text-slate-400 leading-relaxed px-4">
                      Talebiniz alındı. Berberimiz randevunuzu onayladığında aktif olacaktır.
                      Durumu aşağıdaki kod veya telefon numaranızla sorgulayabilirsiniz.
                    </p>
                  </div>

                  {/* Özet */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-left space-y-2.5">
                    <div className="flex justify-between border-b border-slate-950 pb-1.5">
                      <span className="text-slate-500">Tarih</span>
                      <span className="font-semibold text-slate-200">{formatDate(selectedSlot?.startsAt)}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-950 pb-1.5">
                      <span className="text-slate-500">Saat</span>
                      <span className="font-bold text-amber-400">{selectedSlot?.displayTime}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-950 pb-1.5">
                      <span className="text-slate-500">Hizmetler</span>
                      <span className="font-medium text-slate-300">{selectedServiceDetails.map((s) => s.name).join(", ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Toplam Tutar</span>
                      <span className="font-extrabold text-amber-400">₺{totalPrice}</span>
                    </div>
                  </div>

                  {/* Kod */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Rezervasyon Kodu</span>
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono select-all">
                      <span className="text-slate-300 flex-1 truncate">{createdCode}</span>
                      <button onClick={() => copyToClipboard(createdCode)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Kodu kopyala">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-[9px] text-slate-600 block leading-normal">
                      * Bu kodu veya telefon numaranızı kullanarak randevunuzun durumunu daha sonra sorgulayabilirsiniz.
                    </span>
                  </div>

                  <button onClick={handleResetWizard} className="w-full py-3.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 font-extrabold text-xs uppercase tracking-wider text-slate-300 hover:text-white transition-colors">
                    Yeni Randevu Al
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────
              TAB: RANDEVUM
              ───────────────────────────────────────────────────── */}
          {activeTab === "query" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-200">Randevunuzu Sorgulayın</h3>
                <p className="text-xs text-slate-500 mt-1">Telefon numaranızı veya rezervasyon kodunuzu girerek sorgulayabilirsiniz.</p>
              </div>

              <form onSubmit={handleQuery} className="flex gap-2.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="Telefon veya rezervasyon kodu..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-colors"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sorgula"}
                </button>
              </form>

              {hasSearched && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-900 pb-2">
                    Sorgu Sonuçları ({searchedAppointments.length} kayıt)
                  </h4>

                  {searchedAppointments.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Girilen bilgilere ait aktif randevu kaydı bulunamadı.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                      {searchedAppointments.map((appt) => {
                        const isApptActive = ["pending", "confirmed"].includes(appt.status);
                        const isThisRescheduling = reschedulingId === appt.id;
                        const serviceNames = appt.appointment_services
                          ?.map((as: any) => as.services?.name)
                          .filter(Boolean)
                          .join(", ") || "Bakım";

                        return (
                          <div key={appt.id} className={`p-5 rounded-2xl border bg-slate-900/30 transition-all ${
                            appt.status === "cancelled" ? "border-slate-900 opacity-60 bg-slate-950/20"
                            : appt.status === "completed" ? "border-emerald-500/10 bg-emerald-950/5"
                            : appt.status === "pending" ? "border-amber-500/20 bg-amber-950/5"
                            : "border-slate-800/80"
                          }`}>
                            <div className="flex items-start justify-between gap-3 mb-4">
                              <div>
                                <span className="text-[9px] font-bold font-mono text-slate-600 uppercase block tracking-wider">KOD: {appt.id}</span>
                              </div>
                              {getStatusBadge(appt.status)}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 border-b border-slate-900 pb-3 mb-3">
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-500 font-medium block">Hizmetler</span>
                                <span className="font-semibold text-slate-300 block">{serviceNames}</span>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-500 font-medium block">Tarih & Saat</span>
                                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  {formatDate(appt.starts_at)} @ {formatTime(appt.starts_at)}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-500 font-medium block">Tutar & Süre</span>
                                <span className="font-extrabold text-amber-400">₺{appt.total_price} <span className="font-normal text-[10px] text-slate-500">• {appt.total_duration} dk</span></span>
                              </div>
                            </div>

                            {isApptActive && !isThisRescheduling && (
                              <div className="flex gap-2">
                                <button type="button" onClick={() => handleCancelAppointment(appt.id)} disabled={isCancelling} className="flex items-center justify-center gap-1 px-3.5 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors disabled:opacity-40">
                                  <Ban className="w-3.5 h-3.5" /> İptal Et
                                </button>
                                <button type="button" onClick={() => { setReschedulingId(appt.id); setReschedDate(""); setReschedSlots([]); setReschedSelectedSlot(null); }} className="flex-1 flex items-center justify-center gap-1 px-3.5 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-amber-400 border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                                  <CalendarDays className="w-3.5 h-3.5" /> Saati Değiştir
                                </button>
                              </div>
                            )}

                            {isThisRescheduling && (
                              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Yeniden Planla</span>
                                  <button type="button" onClick={() => setReschedulingId(null)} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold">İptal</button>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                  <div className="space-y-1.5">
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Yeni Tarih</label>
                                    <input type="date" value={reschedDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setReschedDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40 transition-colors" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Müsait Saatler</label>
                                    {!reschedDate ? (
                                      <div className="text-[10px] text-slate-600 bg-slate-900/40 p-2 rounded-lg border border-slate-900 text-center">Tarih seçimi bekleniyor</div>
                                    ) : loadingReschedSlots ? (
                                      <div className="flex items-center justify-center gap-1.5 p-2 text-[10px] text-slate-600"><Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> Aranıyor...</div>
                                    ) : reschedSlots.length === 0 ? (
                                      <div className="text-[10px] text-rose-400 bg-rose-500/[0.01] border border-rose-500/10 p-2 rounded-lg text-center font-semibold">Uygun saat bulunamadı</div>
                                    ) : (
                                      <div className="grid grid-cols-3 gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                                        {reschedSlots.map((slot) => {
                                          const isSel = reschedSelectedSlot?.startsAt === slot.startsAt;
                                          return (
                                            <button key={slot.startsAt} type="button" onClick={() => setReschedSelectedSlot(slot)} className={`py-1 text-[10px] font-bold rounded-lg border transition-all ${isSel ? "bg-amber-500 border-amber-400 text-slate-950 font-black" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"}`}>
                                              {slot.displayTime}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button type="button" onClick={() => handleRescheduleSubmit(appt.id)} disabled={!reschedSelectedSlot || isReschedulingSubmit} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                                  {isReschedulingSubmit ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Güncelleniyor...</> : <><Check className="w-3.5 h-3.5 stroke-[2.5]" /> Yeni Tarihi Kaydet</>}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="z-10 py-6 border-t border-slate-900/60 max-w-5xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-amber-500 shrink-0" /> İMAJ ERKEK KUAFÖRÜ</span>
          <span className="w-1 h-1 bg-slate-800 rounded-full hidden sm:inline" />
          <span>Tüm Hakları Saklıdır &copy; 2026</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="sm:hidden text-slate-400 hover:text-white transition-colors">Yönetici Paneli</Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Güvenli Supabase Rezervasyonu Aktif</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
