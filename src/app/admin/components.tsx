"use client";

import React, { useState, useTransition, useCallback, useEffect } from "react";
import {
  Plus,
  X,
  Check,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Scissors,
  DollarSign,
  FileText,
  Save,
  CalendarDays,
  Ban,
  Pencil,
  Trash2,
  GripVertical,
  CalendarCheck,
  Globe,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  createManualAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  updateMarqueeText,
  updateLogoData,
  addService,
  updateService,
  deleteService,
  getServices,
  getWorkingHours,
  updateWorkingHoursDay,
  getHolidays,
  setHolidayStatus,
  deleteHoliday,
  syncHolidaysFromApi,
  getZReportsList,
  getZReportDownloadUrl,
  type CreateManualAppointmentInput,
} from "./actions";

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, show, dismiss };
}

export function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md text-sm font-medium ${
            t.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
              : t.type === "error"
              ? "bg-error/10 border-error/30 text-error"
              : "bg-surface border-outline-variant text-on-surface"
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {t.type === "success" && <span className="material-symbols-outlined w-4 h-4 text-emerald-400 text-[18px]">check_circle</span>}
            {t.type === "error" && <span className="material-symbols-outlined w-4 h-4 text-error text-[18px]">warning</span>}
          </div>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU DURUM BADGE
// ═══════════════════════════════════════════════════════════════

export function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; classes: string }> = {
    pending: { label: "Bekliyor", classes: "bg-surface-variant text-primary border-primary/20" },
    confirmed: { label: "Onaylandı", classes: "bg-primary/20 text-primary border-primary/30" },
    in_progress: { label: "İşlemde", classes: "bg-surface-container text-on-surface border-outline/20" },
    completed: { label: "Tamamlandı", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    cancelled: { label: "İptal", classes: "bg-error/10 text-error border-error/20" },
    no_show: { label: "Gelmedi", classes: "bg-surface-container text-on-surface-variant border-outline-variant/20" },
  };

  const cfg = configs[status] ?? { label: status, classes: "bg-surface text-on-surface border-outline" };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU KARTLARI
// ═══════════════════════════════════════════════════════════════

interface AppointmentCardProps {
  appt: any;
  onRefresh: () => void;
  showToast: (msg: string, type: ToastType) => void;
}

export function AppointmentCard({ appt, onRefresh, showToast }: AppointmentCardProps) {
  const [isActionPending, startTransition] = useTransition();

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  const customerName = 
    appt.profiles?.full_name?.trim() ||
    appt.customer_note?.match(
      /\[(?:Manuel|Müşteri)\]\s*(?:Müşteri:\s*)?([^|]+)/
    )?.[1]?.trim() ||
    "Müşteri";

  const phone = 
    appt.profiles?.phone ||
    appt.customer_note?.match(/Tel:\s*([^|]+)/)?.[1]?.trim() || 
    "";

  const initials = customerName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleAction = (action: "confirm" | "complete" | "cancel") => {
    startTransition(async () => {
      let res: { success: boolean; error?: string };
      if (action === "cancel") {
        res = await cancelAppointment(appt.id);
      } else {
        const statusMap = { confirm: "confirmed", complete: "completed" } as const;
        res = await updateAppointmentStatus(appt.id, statusMap[action]);
      }
      if (res.success) {
        showToast(
          action === "cancel" ? "Randevu iptal edildi." : action === "confirm" ? "Randevu onaylandı." : "Randevu tamamlandı.",
          action === "cancel" ? "error" : "success"
        );
        onRefresh();
      } else {
        showToast(res.error ?? "Bir hata oluştu.", "error");
      }
    });
  };

  const isPending = appt.status === "pending";

  return (
    <div className={`p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative transition-colors ${
        appt.status === "completed" ? "opacity-70"
        : appt.status === "cancelled" ? "opacity-50 grayscale"
        : "hover:bg-surface-variant/10"
      }`}
    >
      {isActionPending && (
        <div className="absolute inset-0 bg-background/80 z-10 flex items-center justify-center gap-2 backdrop-blur-sm rounded-xl">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <span className="text-sm font-medium text-on-surface">İşleniyor...</span>
        </div>
      )}
      
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="w-12 h-12 rounded-full bg-surface-variant border border-outline-variant/30 overflow-hidden flex items-center justify-center text-on-surface-variant font-headline-md shrink-0">
           {initials}
        </div>
        <div className="min-w-0">
          <h4 className="text-body-md font-body-md text-on-surface font-semibold truncate">{customerName}</h4>
          <p className="text-caption font-caption text-on-surface-variant truncate">
            {appt.appointment_services?.[0]?.services?.name ?? appt.customer_note?.match(/Hizmet: ([^|]+)/)?.[1]?.trim() ?? "—"} • {formatTime(appt.starts_at)}
          </p>
          {phone && phone !== "—" && (
            <p className="text-[11px] text-on-surface-variant/70 truncate flex items-center gap-1 mt-0.5">
              <span className="material-symbols-outlined text-[12px]">phone</span>
              {phone}
            </p>
          )}
        </div>
      </div>

      {!["completed", "cancelled", "no_show"].includes(appt.status) && (
        <div className="flex gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
          {isPending ? (
            <>
              <button
                onClick={() => handleAction("cancel")}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-label-md font-label-md text-error border border-error/30 hover:bg-error/10 transition-colors"
              >
                Reddet
              </button>
              <button
                onClick={() => handleAction("confirm")}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-label-md font-label-md text-on-primary bg-primary shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:bg-primary-fixed transition-colors"
              >
                Onayla
              </button>
            </>
          ) : (
            <>
              <button onClick={() => handleAction("cancel")} className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-label-md font-label-md text-error border border-error/30 hover:bg-error/10 transition-colors">
                İptal
              </button>
              {appt.status === "confirmed" && (
                <button onClick={() => handleAction("complete")} className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-label-md font-label-md text-on-primary bg-primary shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:bg-primary-fixed transition-colors">
                  Tamamla
                </button>
              )}
            </>
          )}
        </div>
      )}
      {["completed", "cancelled", "no_show"].includes(appt.status) && (
        <div className="mt-2 sm:mt-0 w-full sm:w-auto text-right">
           <StatusBadge status={appt.status} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MANUEL RANDEVU EKLEME FORMU
// ═══════════════════════════════════════════════════════════════

interface AddAppointmentFormProps {
  onSuccess: () => void;
  showToast: (msg: string, type: ToastType) => void;
}

export function AddAppointmentForm({ onSuccess, showToast }: AddAppointmentFormProps) {
  const [isPending, startTransition] = useTransition();
  const [presets, setPresets] = useState<any[]>([]);
  
  const defaultDate = (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();

  const [form, setForm] = useState<CreateManualAppointmentInput>({
    customerName: "", phone: "", serviceName: "", date: defaultDate, startsAt: "", durationMinutes: 30, price: 0, note: "",
  });

  useEffect(() => {
    getServices().then((data) => setPresets(data));
  }, []);

  const set = (key: keyof CreateManualAppointmentInput, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (preset: any) => {
    set("serviceName", preset.name);
    set("durationMinutes", preset.duration_minutes);
    set("price", preset.price);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim() || !form.startsAt || !form.serviceName.trim() || !form.date) {
      showToast("Zorunlu alanları doldurun.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createManualAppointment(form);
      if (res.success) {
        showToast("Randevu başarıyla eklendi!", "success");
        setForm({ customerName: "", phone: "", serviceName: "", date: defaultDate, startsAt: "", durationMinutes: 30, price: 0, note: "" });
        onSuccess();
      } else {
        showToast(res.error ?? "Randevu eklenemedi.", "error");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Müşteri Adı *</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">person</span>
            <input type="text" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Ahmet Yılmaz" required className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Telefon</label>
          <div className="relative">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">phone</span>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0532 000 0000" className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-label-md font-label-md text-on-surface-variant mb-2">Hızlı Hizmet Seçimi</label>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded text-xs font-bold border transition-all text-left ${
                form.serviceName === p.name
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-surface border-outline-variant/50 text-on-surface hover:border-primary/50"
              }`}
            >
              <span className="block">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Hizmet Adı *</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">content_cut</span>
            <input type="text" value={form.serviceName} onChange={(e) => set("serviceName", e.target.value)} placeholder="Hizmet" required className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Tarih *</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">calendar_today</span>
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Saat *</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">schedule</span>
            <input type="time" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} required className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Süre (dk)</label>
          <input type="number" min={5} max={240} value={form.durationMinutes} onChange={(e) => set("durationMinutes", parseInt(e.target.value))} className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Ücret (₺)</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">payments</span>
            <input type="number" min={0} value={form.price} onChange={(e) => set("price", parseInt(e.target.value))} className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Not (opsiyonel)</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">edit_note</span>
            <input type="text" value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Özel istek..." className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2 pl-10 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
      </div>

      <button type="submit" disabled={isPending} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-on-primary font-bold shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:bg-primary-fixed transition-colors disabled:opacity-50">
        {isPending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">add</span>}
        {isPending ? "Ekleniyor..." : "Randevu Ekle"}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
// TV KAYAN YAZI GÜNCELLEME
// ═══════════════════════════════════════════════════════════════

interface MarqueeEditorProps {
  currentText: string;
  showToast: (msg: string, type: ToastType) => void;
}

export function MarqueeEditor({ currentText, showToast }: MarqueeEditorProps) {
  const [text, setText] = useState(currentText);
  const [isPending, setIsPending] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) {
      showToast("Kayan yazı boş olamaz.", "error");
      return;
    }
    setIsPending(true);
    try {
      const res = await updateMarqueeText(text);
      if (res.success) {
        showToast("✅ Kayan yazı TV'ye yayınlandı!", "success");
      } else {
        showToast(res.error ?? "Kayıt başarısız.", "error");
      }
    } catch (e: any) {
      showToast(e?.message ?? "Beklenmeyen hata.", "error");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-surface-container border border-outline-variant/30 p-3 overflow-hidden">
        <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Canlı Önizleme (TV Kayan Yazı)</p>
        <div className="overflow-hidden">
          <div className="whitespace-nowrap text-sm font-semibold text-primary" style={{ animation: "marquee 12s linear infinite" }}>
            💈 {text || "—"}
          </div>
        </div>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder="TV ekranında gösterilecek kayan yazı..." className="w-full bg-surface border border-outline-variant/50 rounded-xl p-3 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary transition-colors resize-none" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-on-surface-variant">{text.length} / 500</span>
        <button
          onClick={handleSave}
          disabled={isPending || !text.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> : <span className="material-symbols-outlined text-[16px]">save</span>}
          {isPending ? "Kaydediliyor..." : "TV'ye Yayınla"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGO YÜKLEYİCİ
// ═══════════════════════════════════════════════════════════════

export function LogoUploader({ showToast }: { showToast: (msg: string, type: ToastType) => void }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { createBrowserClient } = await import("@supabase/ssr");
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase.from("settings").select("logo_data").limit(1).maybeSingle();
      if (data?.logo_data) setLogo(data.logo_data);
    };
    fetchSettings();
  }, []);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) { showToast("Lütfen geçerli bir resim dosyası seçin.", "error"); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("Dosya boyutu 2 MB'dan küçük olmalı.", "error"); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) { showToast("Dosya okunamadı.", "error"); return; }
      try {
        const res = await updateLogoData(dataUrl);
        if (res.success) {
          setLogo(dataUrl);
          showToast("✅ Logo başarıyla kaydedildi!", "success");
        } else {
          showToast(res.error ?? "Logo kaydedilemedi.", "error");
        }
      } catch (err: any) {
        showToast(err?.message ?? "Beklenmeyen hata.", "error");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = () => {
    startTransition(async () => {
      const res = await updateLogoData(null);
      if (res.success) {
        setLogo(null);
        showToast("Logo kaldırıldı, varsayılan ikon kullanılacak.", "info");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-surface-variant flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/30">
          {logo
            ? <img src={logo} alt="Mevcut logo" className="w-full h-full object-cover" />
            : <span className="material-symbols-outlined text-[36px] text-on-surface-variant">content_cut</span>
          }
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {logo ? "Logo yüklü. Değiştirmek için yeni bir resim seç." : "Henüz özel logo yok. Berber simgesi kullanılıyor."}
          </p>
          <div className="flex gap-2">
            <button onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-[16px]">upload</span>{logo ? "Değiştir" : "Logo Yükle"}
            </button>
            {logo && (
              <button onClick={handleRemove} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-bold hover:bg-error/20 transition-colors">
                <span className="material-symbols-outlined text-[16px]">delete</span>Kaldır
              </button>
            )}
          </div>
        </div>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
          dragging ? "border-primary bg-primary/10 text-primary" : "border-outline-variant hover:border-primary/40 hover:bg-primary/5 text-on-surface-variant hover:text-primary"
        }`}
      >
        <span className="material-symbols-outlined text-[32px]">photo_camera</span>
        <p className="text-xs font-semibold">Sürükle bırak veya tıkla</p>
        <p className="text-[10px] opacity-60">PNG, JPG, SVG · Maks 2 MB</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <p className="text-[10px] text-on-surface-variant">Logo tüm sayfalarda görünür ve tarayıcında saklanır.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HİZMET ÖN AYAR DÜZENLEYİCİ
// ═══════════════════════════════════════════════════════════════

interface ServicePresetsEditorProps {
  showToast: (msg: string, type: ToastType) => void;
}

export function ServicePresetsEditor({ showToast }: ServicePresetsEditorProps) {
  const [presets, setPresets] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", duration: 0, price: 0 });
  const [newForm, setNewForm] = useState({ name: "", duration: 30, price: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    const data = await getServices();
    setPresets(data);
  };

  useEffect(() => { loadData(); }, []);

  const startEdit = (p: any) => { setEditingId(p.id); setEditForm({ name: p.name, duration: p.duration_minutes, price: p.price }); };
  
  const saveEdit = (id: string) => {
    if (!editForm.name.trim()) { showToast("Hizmet adı boş olamaz.", "error"); return; }
    startTransition(async () => {
      const res = await updateService(id, editForm.name.trim(), editForm.duration, editForm.price);
      if (res.success) {
        showToast("Hizmet güncellendi.", "success");
        setEditingId(null);
        await loadData();
      } else {
        showToast(res.error ?? "Güncellenemedi.", "error");
      }
    });
  };
  
  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteService(id);
      if (res.success) {
        showToast("Hizmet silindi.", "info");
        await loadData();
      } else {
        showToast(res.error ?? "Silinemedi.", "error");
      }
    });
  };
  
  const handleAdd = () => {
    if (!newForm.name.trim()) { showToast("Hizmet adı boş olamaz.", "error"); return; }
    startTransition(async () => {
      const res = await addService(newForm.name.trim(), newForm.duration, newForm.price);
      if (res.success) {
        showToast("Yeni hizmet eklendi.", "success");
        setNewForm({ name: "", duration: 30, price: 0 });
        setShowAdd(false);
        await loadData();
      } else {
        showToast(res.error ?? "Eklenemedi.", "error");
      }
    });
  };

  const inputCls = "w-full bg-surface border border-outline-variant/50 rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {presets.map((p) => (
          <div key={p.id} className="rounded-xl border border-outline-variant/60 bg-surface-container overflow-hidden">
            {editingId === p.id ? (
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Hizmet Adı</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Süre (dk)</label>
                    <input type="number" min={1} max={480} value={editForm.duration} onChange={(e) => setEditForm((f) => ({ ...f, duration: parseInt(e.target.value) || 0 }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Ücret (₺)</label>
                    <input type="number" min={0} value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: parseInt(e.target.value) || 0 }))} className={inputCls} />
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={() => saveEdit(p.id)} disabled={isPending} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined text-[14px]">check</span> Kaydet
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-surface-variant border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-variant/80 transition-colors">
                      <span className="material-symbols-outlined text-[14px]">close</span> İptal
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">drag_indicator</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-on-surface truncate">{p.name}</div>
                  <div className="text-[11px] text-on-surface-variant font-mono">{p.duration_minutes} dk • ₺{p.price}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors" title="Düzenle">
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={isPending} className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50" title="Sil">
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2">Yeni Hizmet</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Hizmet Adı *</label>
              <input type="text" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn: Fön" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Süre (dk)</label>
              <input type="number" min={1} max={480} value={newForm.duration} onChange={(e) => setNewForm((f) => ({ ...f, duration: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Ücret (₺)</label>
              <input type="number" min={0} value={newForm.price} onChange={(e) => setNewForm((f) => ({ ...f, price: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleAdd} disabled={isPending} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 transition-colors disabled:opacity-50">
                <span className="material-symbols-outlined text-[14px]">add</span> Ekle
              </button>
              <button onClick={() => setShowAdd(false)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-surface-variant border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-variant/80 transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span> İptal
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-outline-variant text-on-surface-variant text-xs font-bold hover:border-primary/40 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[14px]">add</span> Yeni Hizmet Ekle
          </button>
        </div>
      )}
      <p className="text-[10px] text-on-surface-variant">Değişiklikler "Randevu Ekle" formundaki hızlı seçim butonlarına anında yansır.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GEÇMİŞ TABLO
// ═══════════════════════════════════════════════════════════════

interface HistoryTableProps {
  rows: any[];
  filterDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function HistoryTable({ rows, filterDate, onDateChange, onRefresh, isLoading }: HistoryTableProps) {
  const [isZReportModalOpen, setIsZReportModalOpen] = useState(false);
  const [zReports, setZReports] = useState<any[]>([]);
  const [isLoadingZReports, setIsLoadingZReports] = useState(false);
  
  const totalRevenue = rows.filter((r) => r.status === "completed").reduce((s, r) => s + (r.total_price ?? 0), 0);

  const formatDT = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      time: d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const handlePrevDay = () => {
    const d = filterDate ? new Date(filterDate) : new Date();
    d.setDate(d.getDate() - 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    onDateChange(`${d.getFullYear()}-${m}-${day}`);
  };

  const handleNextDay = () => {
    const d = filterDate ? new Date(filterDate) : new Date();
    d.setDate(d.getDate() + 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    onDateChange(`${d.getFullYear()}-${m}-${day}`);
  };

  const handleOpenZReportModal = async () => {
    setIsZReportModalOpen(true);
    setIsLoadingZReports(true);
    try {
      const data = await getZReportsList();
      setZReports(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingZReports(false);
    }
  };

  const handleDownloadReport = async (fileName: string) => {
    const url = await getZReportDownloadUrl(fileName);
    if (url) {
      window.open(url, '_blank');
    } else {
      alert("İndirme linki alınamadı.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={handlePrevDay} className="w-10 h-10 rounded-xl bg-surface border border-outline-variant/50 flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors" title="Önceki Gün">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <div className="relative w-40">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant">calendar_today</span>
              <input type="date" value={filterDate} onChange={(e) => onDateChange(e.target.value)} max={(() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })()} className="w-full bg-surface border border-outline-variant/50 rounded-xl py-2 pl-9 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors" suppressHydrationWarning />
            </div>
            <button onClick={handleNextDay} className="w-10 h-10 rounded-xl bg-surface border border-outline-variant/50 flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors" title="Sonraki Gün">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
          {filterDate && (
            <button onClick={() => onDateChange("")} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">× Temizle</button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-on-surface-variant">
          <span><span className="font-bold text-on-surface">{rows.length}</span> kayıt</span>
          <span>Ciro: <span className="font-bold text-primary">₺{totalRevenue.toLocaleString("tr-TR")}</span></span>
          <button onClick={handleOpenZReportModal} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors font-medium">
            <span className="material-symbols-outlined text-[16px]">receipt_long</span> Arşiv
          </button>
          <button onClick={onRefresh} className="text-on-surface-variant hover:text-on-surface transition-colors">↺ Yenile</button>
        </div>
      </div>

      {isZReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl border border-outline-variant/30 w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">cloud_download</span>
                Z Raporu Arşivi
              </h3>
              <button onClick={() => setIsZReportModalOpen(false)} className="w-8 h-8 rounded-full bg-surface hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingZReports ? (
                <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin mb-2">progress_activity</span>
                  <span>Arşiv yükleniyor...</span>
                </div>
              ) : zReports.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-50">folder_off</span>
                  <p>Henüz hiçbir Z raporu oluşturulmamış.</p>
                  <p className="text-xs mt-1 opacity-70">Raporlar gece 00:10'da otomatik olarak oluşur.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {zReports.map((file, i) => (
                    <li key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-variant/30 border border-outline-variant/30 hover:bg-surface-variant/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">description</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm text-on-surface">{file.name}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {new Date(file.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleDownloadReport(file.name)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-primary border border-primary/20 hover:bg-primary/10 transition-colors" title="CSV Olarak İndir">
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/60">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-variant/30">
              {["Tarih", "Saat", "Müşteri / Hizmet", "Süre", "Ücret", "Durum"].map((h) => (
                <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="py-12 text-center"><span className="material-symbols-outlined animate-spin text-[24px] text-primary mx-auto">progress_activity</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant text-sm">Bu tarih aralığında kayıt bulunamadı.</td></tr>
            ) : rows.map((row) => {
              const { date, time } = formatDT(row.starts_at);
              const noteMatch = row.customer_note?.match(/\[(?:Manuel|Müşteri)\]\s*(?:Müşteri:\s*)?([^|]+)/);
              const customer = noteMatch ? noteMatch[1].trim() : (row.profiles?.full_name ?? "—");
              const service = row.appointment_services?.[0]?.services?.name ?? row.customer_note?.match(/Hizmet: ([^|]+)/)?.[1]?.trim() ?? "—";
              return (
                <tr key={row.id} className="border-b border-outline-variant/40 hover:bg-surface-variant/20 transition-colors">
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap font-mono text-xs">{date}</td>
                  <td className="px-4 py-3 text-on-surface whitespace-nowrap font-mono text-xs">{time}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-on-surface text-sm leading-tight">{customer}</div>
                    <div className="text-[11px] text-on-surface-variant">{service}</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">{row.total_duration} dk</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="font-bold text-primary">₺{row.total_price}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={row.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ÇALIŞMA SAATLERİ DÜZENLEYİCİ
// ═══════════════════════════════════════════════════════════════

const DAY_NAMES_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Pzt -> Paz sırasıyla göster

const DEFAULT_HOURS: Record<number, { start: string; end: string; off: boolean }> = {
  0: { start: "09:00", end: "19:00", off: true },  // Pazar kapalı
  1: { start: "09:00", end: "19:00", off: false },
  2: { start: "09:00", end: "19:00", off: false },
  3: { start: "09:00", end: "19:00", off: false },
  4: { start: "09:00", end: "19:00", off: false },
  5: { start: "09:00", end: "19:00", off: false },
  6: { start: "09:00", end: "19:00", off: false },
};

interface WorkingHoursEditorProps {
  showToast: (msg: string, type: ToastType) => void;
}

export function WorkingHoursEditor({ showToast }: WorkingHoursEditorProps) {
  const [hours, setHours] = useState<Record<number, { start: string; end: string; off: boolean }>>(DEFAULT_HOURS);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await getWorkingHours();
      if (data.length > 0) {
        const mapped: Record<number, { start: string; end: string; off: boolean }> = { ...DEFAULT_HOURS };
        data.forEach((wh: any) => {
          mapped[wh.day_of_week] = {
            start: wh.start_time?.slice(0, 5) || "09:00",
            end: wh.end_time?.slice(0, 5) || "19:00",
            off: wh.is_off ?? false,
          };
        });
        setHours(mapped);
      }
      setLoaded(true);
    };
    load();
  }, []);

  const handleSaveDay = async (dayOfWeek: number) => {
    setSavingDay(dayOfWeek);
    const h = hours[dayOfWeek];
    const res = await updateWorkingHoursDay(dayOfWeek, h.start, h.end, h.off);
    if (res.success) {
      showToast(`${DAY_NAMES_TR[dayOfWeek]} güncellendi.`, "success");
    } else {
      showToast(res.error ?? "Güncellenemedi.", "error");
    }
    setSavingDay(null);
  };

  if (!loaded) return <div className="py-6 flex justify-center"><span className="material-symbols-outlined animate-spin text-[24px] text-primary">progress_activity</span></div>;

  return (
    <div className="space-y-2">
      {DISPLAY_ORDER.map((dow) => {
        const h = hours[dow];
        const isSaving = savingDay === dow;
        return (
          <div key={dow} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
            h.off ? "border-outline-variant/50 bg-background/30 opacity-60" : "border-outline-variant/60 bg-surface/50"
          }`}>
            {/* Gün Adı */}
            <div className="w-20 shrink-0">
              <span className="text-xs font-bold text-on-surface">{DAY_NAMES_TR[dow]}</span>
            </div>

            {/* Toggle */}
            <button
              type="button"
              onClick={() => setHours((prev) => ({ ...prev, [dow]: { ...prev[dow], off: !prev[dow].off } }))}
              className={`shrink-0 transition-colors ${h.off ? "text-on-surface-variant" : "text-primary"}`}
              title={h.off ? "Açık yap" : "Kapalı yap"}
            >
              {h.off ? <span className="material-symbols-outlined text-[28px]">toggle_off</span> : <span className="material-symbols-outlined text-[28px]">toggle_on</span>}
            </button>

            {h.off ? (
              <span className="text-xs text-on-surface-variant font-semibold flex-1">Kapalı</span>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={h.start}
                  onChange={(e) => setHours((prev) => ({ ...prev, [dow]: { ...prev[dow], start: e.target.value } }))}
                  className="bg-surface border border-outline-variant/80 rounded-lg py-1.5 px-2 text-xs text-on-surface focus:outline-none focus:border-primary/40 transition-colors w-24"
                />
                <span className="text-on-surface-variant text-xs">—</span>
                <input
                  type="time"
                  value={h.end}
                  onChange={(e) => setHours((prev) => ({ ...prev, [dow]: { ...prev[dow], end: e.target.value } }))}
                  className="bg-surface border border-outline-variant/80 rounded-lg py-1.5 px-2 text-xs text-on-surface focus:outline-none focus:border-primary/40 transition-colors w-24"
                />
              </div>
            )}

            {/* Kaydet */}
            <button
              onClick={() => handleSaveDay(dow)}
              disabled={isSaving}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {isSaving ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">save</span>}
            </button>
          </div>
        );
      })}
      <p className="text-[10px] text-on-surface-variant pt-1">Her günü ayrı ayrı kaydedebilirsiniz. Müşteri ekranına anında yansır.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TATİL YÖNETİCİSİ
// ═══════════════════════════════════════════════════════════════

interface HolidayManagerProps {
  showToast: (msg: string, type: ToastType) => void;
}

export function HolidayManager({ showToast }: HolidayManagerProps) {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsOff, setNewIsOff] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  const loadData = async () => {
    const data = await getHolidays();
    setHolidays(data);
    setLoaded(true);
  };

  useEffect(() => { loadData(); }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncHolidaysFromApi();
      if (res.success) {
        showToast(`${res.count ?? 0} tatil API'den güncellendi.`, "success");
        await loadData();
      } else {
        showToast(res.error ?? "Senkronizasyon başarısız.", "error");
      }
    } catch {
      showToast("API senkronizasyon hatası.", "error");
    }
    setIsSyncing(false);
  };

  const handleToggle = (h: any) => {
    startTransition(async () => {
      const res = await setHolidayStatus(h.holiday_date, h.name, !h.is_off, true);
      if (res.success) {
        showToast(`${h.name}: ${!h.is_off ? "Tatil (Kapalı)" : "Çalışma Günü (Açık)"} olarak ayarlandı.`, "success");
        await loadData();
      } else {
        showToast(res.error ?? "Güncellenemedi.", "error");
      }
    });
  };

  const handleDelete = (h: any) => {
    startTransition(async () => {
      const res = await deleteHoliday(h.holiday_date);
      if (res.success) {
        showToast(`${h.name} silindi.`, "info");
        await loadData();
      } else {
        showToast(res.error ?? "Silinemedi.", "error");
      }
    });
  };

  const handleAdd = () => {
    if (!newDate || !newName.trim()) {
      showToast("Tarih ve isim zorunludur.", "error");
      return;
    }
    startTransition(async () => {
      const res = await setHolidayStatus(newDate, newName.trim(), newIsOff, true);
      if (res.success) {
        showToast(`${newName} eklendi.`, "success");
        setNewDate(""); setNewName(""); setNewIsOff(true); setShowAdd(false);
        await loadData();
      } else {
        showToast(res.error ?? "Eklenemedi.", "error");
      }
    });
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "short" });
  };

  if (!loaded) return <div className="py-6 flex justify-center"><span className="material-symbols-outlined animate-spin text-[24px] text-primary">progress_activity</span></div>;

  const today = (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();
  const futureHolidays = holidays.filter((h) => h.holiday_date >= today);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          {isSyncing ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">language</span>}
          {isSyncing ? "Senkronize ediliyor..." : "Tatilleri Güncelle (API)"}
        </button>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span> Özel Tatil Ekle
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Yeni Tatil</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Tarih *</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-surface border border-outline-variant/80 rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:outline-none focus:border-primary/40 transition-colors" />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">İsim *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Örn: İzin günü"
                className="w-full bg-surface border border-outline-variant/80 rounded-lg py-1.5 px-2.5 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleAdd} disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 transition-colors disabled:opacity-50">
                <span className="material-symbols-outlined text-[14px]">add</span> Ekle
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-surface-variant border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-variant/80 transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span> İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {futureHolidays.length === 0 ? (
        <div className="py-8 text-center text-xs text-on-surface-variant">
          Yaklaşan tatil kaydı yok. Yukarıdaki butona tıklayarak API'den çekebilirsiniz.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {futureHolidays.map((h) => (
            <div key={h.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-all ${
              h.is_off ? "border-error/15 bg-error/[0.03]" : "border-outline-variant/50 bg-surface/30 opacity-60"
            }`}>
              <span className={`material-symbols-outlined text-[16px] shrink-0 ${h.is_off ? "text-error" : "text-on-surface-variant"}`}>event_available</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-on-surface truncate">{h.name}</div>
                <div className="text-[10px] text-on-surface-variant">{formatDate(h.holiday_date)}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${
                h.is_manual
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}>
                {h.is_manual ? "Manuel" : "Otomatik"}
              </span>
              <button
                onClick={() => handleToggle(h)}
                className={`shrink-0 transition-colors ${h.is_off ? "text-error hover:text-on-surface-variant" : "text-on-surface-variant hover:text-error"}`}
                title={h.is_off ? "Tatili İptal Et (Çalışılacak)" : "Tatil Yap (Kapalı olacak)"}
              >
                {h.is_off ? <span className="material-symbols-outlined text-[24px]">toggle_on</span> : <span className="material-symbols-outlined text-[24px]">toggle_off</span>}
              </button>
              <button
                onClick={() => handleDelete(h)}
                disabled={isPending}
                className="shrink-0 p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                title="Sil"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-on-surface-variant">Otomatik tatiller Nager.Date API'den çekilir. Manuel olanlar API güncellemesinden etkilenmez.</p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// BOOKING BUFFER EDITOR
// ═══════════════════════════════════════════════════════════════

export function BookingBufferEditor({ 
  currentBuffer, 
  showToast,
  onUpdate
}: { 
  currentBuffer: number; 
  showToast: (msg: string, type: ToastType) => void;
  onUpdate?: () => void;
}) {
  const [isSaving, startSaving] = useTransition();

  const handleSave = (minutes: number) => {
    startSaving(async () => {
      try {
        const { updateBookingBuffer } = await import("./actions");
        const res = await updateBookingBuffer(minutes);
        if (res.success) {
          showToast("Randevu gecikme süresi güncellendi.", "success");
          if (onUpdate) onUpdate();
        } else {
          showToast(res.error || "Güncellenemedi.", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Bir hata oluştu.", "error");
      }
    });
  };

  const options = [
    { label: "30 Dakika", value: 30 },
    { label: "1 Saat", value: 60 },
    { label: "2 Saat", value: 120 },
  ];

  return (
    <div className="flex gap-3">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => handleSave(opt.value)}
          disabled={isSaving}
          className={`flex-1 py-3 px-4 rounded-xl border text-center font-bold text-sm transition-all ${
            currentBuffer === opt.value
              ? "bg-primary text-on-primary border-primary shadow-[0_0_15px_rgba(212,175,55,0.2)]"
              : "bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
          } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
