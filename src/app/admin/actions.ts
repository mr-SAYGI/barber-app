"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase server client (cookie-aware) ────────────────────
function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: any) => {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// ─── RLS bypass eden admin client (Service Role Key zorunlu) ───
// Service Role Key, Supabase Dashboard → Project Settings → API
// altındaki gerçek JWT (eyJ... ile başlayan) olmalıdır.
function getAdminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Geçerli bir Supabase JWT'si eyJ ile başlar
  if (serviceKey && serviceKey.startsWith("eyJ")) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  // Key yoksa veya format hatalıysa uyar
  if (!serviceKey) {
    console.warn(
      "[Admin] SUPABASE_SERVICE_ROLE_KEY tanımlı değil! " +
      "Services/Settings işlemleri RLS hatası verebilir. " +
      ".env.local dosyasına Supabase Dashboard > API > service_role key'ini ekleyin."
    );
  } else {
    console.warn(
      "[Admin] SUPABASE_SERVICE_ROLE_KEY geçersiz format! " +
      "Gerçek key 'eyJ...' ile başlayan JWT olmalıdır. Mevcut değer: " +
      serviceKey.slice(0, 12) + "..."
    );
  }

  // Fallback: anon key (RLS'ye tabi — bazı işlemler başarısız olabilir)
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU — OKUMA
// ═══════════════════════════════════════════════════════════════

function getTurkeyDateRange(dateStr?: string) {
  const offset = 3 * 60;
  const now = new Date();
  const turkeyNow = new Date(now.getTime() + offset * 60000);
  const base = dateStr ?? turkeyNow.toISOString().split("T")[0];
  return {
    start: `${base}T00:00:00+03:00`,
    end:   `${base}T23:59:59+03:00`,
  };
}

export async function getTodayAppointments(dateStr?: string) {
  const supabase = getAdminSupabase();
  const range = getTurkeyDateRange(dateStr);

  const { data, error } = await (supabase
    .from("appointments") as any)
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      total_duration,
      total_price,
      customer_note,
      queue_number,
      profiles!customer_id ( full_name, phone )
    `)
    .gte("starts_at", range.start)
    .lte("starts_at", range.end)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("getTodayAppointments error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPendingAppointments(dateStr?: string) {
  const supabase = getAdminSupabase();
  let query = (supabase
    .from("appointments") as any)
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      total_duration,
      total_price,
      customer_note,
      queue_number,
      profiles!customer_id ( full_name, phone )
    `)
    .eq("status", "pending")
    .order("starts_at", { ascending: true });

  if (dateStr) {
    const range = getTurkeyDateRange(dateStr);
    query = query.gte("starts_at", range.start).lte("starts_at", range.end);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getPendingAppointments error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getFutureAppointments() {
  const supabase = getAdminSupabase();
  const offset = 3 * 60;
  const now = new Date();
  const turkeyNow = new Date(now.getTime() + offset * 60000);
  
  // Yarının başlangıcı
  const tomorrow = new Date(turkeyNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const tomorrowStart = `${tomorrowStr}T00:00:00+03:00`;

  const { data, error } = await (supabase
    .from("appointments") as any)
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      total_duration,
      total_price,
      customer_note,
      queue_number,
      profiles!customer_id ( full_name, phone )
    `)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", tomorrowStart)
    .order("starts_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("getFutureAppointments error:", error.message);
    return [];
  }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU — MANUEL OLUŞTUR (Admin)
// ═══════════════════════════════════════════════════════════════

export interface CreateManualAppointmentInput {
  customerName: string;
  phone: string;
  serviceName: string;
  date: string;       // "YYYY-MM-DD"
  startsAt: string;   // "HH:MM"
  durationMinutes: number;
  price: number;
  note?: string;
}

export async function createManualAppointment(
  input: CreateManualAppointmentInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Admin yetkisiyle bypass ediyoruz, middleware zaten yetkiyi sağlıyor.
  const { data: barberProfile } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  const barberId = barberProfile?.id || "00000000-0000-0000-0000-000000000000";

  const startsAtISO = `${input.date}T${input.startsAt}:00+03:00`;
  const endsAtDate = new Date(startsAtISO);
  endsAtDate.setMinutes(endsAtDate.getMinutes() + input.durationMinutes);
  const endsAtISO = endsAtDate.toISOString();

  const cleanPhone = input.phone.trim();
  const cleanName = input.customerName.trim();

  let { data: profile } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("phone", cleanPhone)
    .limit(1)
    .maybeSingle();

  let customerId: string;

  if (!profile) {
    const dummyEmail = `guest_${crypto.randomUUID().substring(0,8)}@example.com`;
    const dummyPassword = crypto.randomUUID();

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: dummyEmail,
      password: dummyPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        phone: cleanPhone,
        role: "customer"
      }
    });

    if (authErr || !authUser.user) {
      return { success: false, error: `Kullanıcı altyapısı oluşturulamadı: ${authErr?.message}` };
    }

    const newProfileId = authUser.user.id;

    const { data: checkProfile } = await (supabase
      .from("profiles") as any)
      .select("id")
      .eq("id", newProfileId)
      .maybeSingle();

    if (!checkProfile) {
      const { data: newProfile, error: profileErr } = await (supabase
        .from("profiles") as any)
        .insert({
          id: newProfileId,
          full_name: cleanName,
          phone: cleanPhone,
          email: dummyEmail,
          role: "customer",
        })
        .select("id")
        .single();

      if (profileErr || !newProfile) {
        return { success: false, error: `Müşteri kaydı oluşturulamadı: ${profileErr?.message}` };
      }
    }
    customerId = newProfileId;
  } else {
    customerId = profile.id;
  }

  await supabase.from("profiles")
    .update({ full_name: cleanName, phone: cleanPhone })
    .eq("id", customerId);

  const { data: inserted, error } = await (supabase
    .from("appointments") as any)
    .insert({
      customer_id: customerId,
      barber_id: barberId,           // Randevunun berberi de admin/berberin kendisi
      status: "confirmed",
      starts_at: startsAtISO,
      ends_at: endsAtISO,
      total_duration: input.durationMinutes,
      total_price: input.price,
      customer_note: [
        `[Manuel] Müşteri: ${input.customerName}`,
        `Tel: ${input.phone}`,
        `Hizmet: ${input.serviceName}`,
        input.note ? `Not: ${input.note}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01" || error.message?.includes("no_overlapping_appointments")) {
      return { success: false, error: `Seçilen saat başkası tarafından alınmış. (DB Hata: ${error.message || error.code})` };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU — İPTAL ET
// ═══════════════════════════════════════════════════════════════

export async function cancelAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { error } = await (supabase
    .from("appointments") as any)
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU — DURUM GÜNCELLE
// ═══════════════════════════════════════════════════════════════

export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: "confirmed" | "completed" | "cancelled" | "in_progress"
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { error } = await (supabase
    .from("appointments") as any)
    .update({ status: newStatus })
    .eq("id", appointmentId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// RANDEVU — KOLTUĞA AL (Atomik: şimdi koltukta olanı tamamla + yenisini başlat)
// ═══════════════════════════════════════════════════════════════

export async function seatCustomer(
  nextAppointmentId: string,
  dateStr?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();
  const range = getTurkeyDateRange(dateStr);

  // O gün in_progress olan randevuyu tamamlandı yap
  await (supabase
    .from("appointments") as any)
    .update({ status: "completed" })
    .eq("status", "in_progress")
    .gte("starts_at", range.start)
    .lte("starts_at", range.end);

  // Seçilen randevuyu koltukta yap
  const { error } = await (supabase
    .from("appointments") as any)
    .update({ status: "in_progress" })
    .eq("id", nextAppointmentId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — KAYAN YAZI GÜNCELLE
// ═══════════════════════════════════════════════════════════════

export async function updateMarqueeText(
  text: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  if (!text || text.trim().length === 0) {
    return { success: false, error: "Kayan yazı boş olamaz." };
  }
  if (text.length > 500) {
    return { success: false, error: "Kayan yazı 500 karakteri geçemez." };
  }

  // settings tablosunda genelde id=1 veya singleton=true ile upsert yaparız. 
  // Tek satır pattern: singleton kolonu yerine limit(1) kullan
  const { data: existing } = await (supabase.from("settings") as any)
    .select("id")
    .limit(1)
    .maybeSingle();

  let error;
  if (existing?.id) {
    const res = await (supabase.from("settings") as any)
      .update({ marquee_text: text.trim() })
      .eq("id", existing.id);
    error = res.error;
  } else {
    const res = await (supabase.from("settings") as any)
      .insert({
        marquee_text: text.trim()
      });
    error = res.error;
  }

  if (error) return { success: false, error: error.message };

  revalidatePath("/tv");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — MEVCUT KAYAYI YAZI OKU
// ═══════════════════════════════════════════════════════════════

export async function getSettings() {
  const supabase = getAdminSupabase();

  const { data } = await (supabase
    .from("settings") as any)
    .select("id, marquee_text, logo_data")
    .limit(1)
    .maybeSingle();

  // Admin profilinden gecikme süresini çek
  const { data: profile } = await (supabase
    .from("profiles") as any)
    .select("min_booking_buffer")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  return {
    marquee_text: data?.marquee_text ?? "",
    logo_data: data?.logo_data ?? null,
    min_booking_buffer: profile?.min_booking_buffer ?? 60,
  };
}

// ═══════════════════════════════════════════════════════════════
// AYARLAR — REZERVASYON GECİKME SÜRESİNİ GÜNCELLE
// ═══════════════════════════════════════════════════════════════

export async function updateBookingBuffer(minutes: number) {
  const supabase = getAdminSupabase();

  const { data: adminProfile } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!adminProfile?.id) {
    return { success: false, error: "Admin profili bulunamadı." };
  }

  const { error } = await (supabase
    .from("profiles") as any)
    .update({ min_booking_buffer: minutes })
    .eq("id", adminProfile.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// GEÇMİŞ RANDEVULAR (Son 99 Gün)
// ═══════════════════════════════════════════════════════════════

export async function getHistoryAppointments(filterDate?: string) {
  const supabase = getAdminSupabase();

  const now = new Date();
  const ninetyNineDaysAgo = new Date(now);
  ninetyNineDaysAgo.setDate(ninetyNineDaysAgo.getDate() - 99);

  let query = (supabase
    .from("appointments") as any)
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      total_duration,
      total_price,
      customer_note,
      queue_number,
      created_at,
      profiles!customer_id ( full_name, phone )
    `)
    .gte("starts_at", ninetyNineDaysAgo.toISOString())
    .order("starts_at", { ascending: false })
    .limit(500);

  if (filterDate) {
    const range = getTurkeyDateRange(filterDate);
    query = query
      .gte("starts_at", range.start)
      .lte("starts_at", range.end);
  } else {
    // Bugünü hariç tut (sadece geçmiş)
    const range = getTurkeyDateRange();
    query = query.lt("starts_at", range.start);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Geçmiş yüklenemedi: ${error.message}`);
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// HİZMETLER — LİSTESİ
// ═══════════════════════════════════════════════════════════════

export async function getServices() {
  const supabase = getAdminSupabase();

  const { data, error } = await (supabase
    .from("services") as any)
    .select("id, name, duration_minutes, price")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("getServices error:", error.message);
    return [];
  }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// HİZMETLER — CRUD
// ═══════════════════════════════════════════════════════════════

export async function addService(name: string, duration_minutes: number, price: number) {
  const supabase = getAdminSupabase();
  const { error } = await (supabase.from("services") as any).insert({
    name,
    duration_minutes,
    price,
    is_active: true,
    display_order: 999, // Sona ekle; admin sıralayabilir
  });
  if (error) {
    console.error("[addService] Hata:", error.message, error.code);
    const msg =
      error.code === "42501" || error.message.toLowerCase().includes("permission")
        ? "İzin hatası: SUPABASE_SERVICE_ROLE_KEY'i kontrol edin ya da Supabase'de services RLS politikasını düzeltin."
        : error.message;
    return { success: false, error: msg };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export async function updateService(id: string, name: string, duration_minutes: number, price: number) {
  const supabase = getAdminSupabase();
  const { error } = await (supabase.from("services") as any).update({
    name,
    duration_minutes,
    price,
  }).eq("id", id);
  if (error) {
    console.error("[updateService] Hata:", error.message, error.code);
    const msg =
      error.code === "42501" || error.message.toLowerCase().includes("permission")
        ? "İzin hatası: SUPABASE_SERVICE_ROLE_KEY'i kontrol edin ya da Supabase'de services RLS politikasını düzeltin."
        : error.message;
    return { success: false, error: msg };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = getAdminSupabase();
  // Soft-delete: is_active = false olarak işaretle
  const { error } = await (supabase.from("services") as any)
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    console.error("[deleteService] Hata:", error.message, error.code);
    const msg =
      error.code === "42501" || error.message.toLowerCase().includes("permission")
        ? "İzin hatası: SUPABASE_SERVICE_ROLE_KEY'i kontrol edin ya da Supabase'de services RLS politikasını düzeltin."
        : error.message;
    return { success: false, error: msg };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// LOGO GÜNCELLE
// ═══════════════════════════════════════════════════════════════

export async function updateLogoData(dataUrl: string | null) {
  const supabase = getAdminSupabase();
  const { data: existing } = await (supabase.from("settings") as any)
    .select("id")
    .limit(1)
    .maybeSingle();

  let error;
  if (existing?.id) {
    const res = await (supabase.from("settings") as any)
      .update({ logo_data: dataUrl })
      .eq("id", existing.id);
    error = res.error;
  } else {
    const res = await (supabase.from("settings") as any)
      .insert({
        logo_data: dataUrl
      });
    error = res.error;
  }

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// ÇALIŞMA SAATLERİ — CRUD
// ═══════════════════════════════════════════════════════════════

export async function getWorkingHours() {
  const supabase = getAdminSupabase();
  const { data, error } = await (supabase
    .from("working_hours") as any)
    .select("id, barber_id, day_of_week, start_time, end_time, is_off")
    .order("day_of_week", { ascending: true });

  if (error) {
    console.error("[getWorkingHours] Hata:", error.message);
    return [];
  }
  return data ?? [];
}

export async function updateWorkingHoursDay(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  isOff: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Berber ID'sini bul (tek berber modeli)
  const { data: barber } = await (supabase
    .from("profiles") as any)
    .select("id")
    .in("role", ["barber", "admin"])
    .limit(1)
    .maybeSingle();

  if (!barber?.id) {
    return { success: false, error: "Berber profili bulunamadı." };
  }

  const barberId = barber.id;

  // Mevcut kaydı ara
  const { data: existing } = await (supabase
    .from("working_hours") as any)
    .select("id")
    .eq("barber_id", barberId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  let error;
  if (existing?.id) {
    const res = await (supabase.from("working_hours") as any)
      .update({
        start_time: startTime,
        end_time: endTime,
        is_off: isOff,
      })
      .eq("id", existing.id);
    error = res.error;
  } else {
    const res = await (supabase.from("working_hours") as any)
      .insert({
        barber_id: barberId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        is_off: isOff,
      });
    error = res.error;
  }

  if (error) {
    console.error("[updateWorkingHoursDay] Hata:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// TATİLLER — CRUD
// ═══════════════════════════════════════════════════════════════

export async function getHolidays() {
  const supabase = getAdminSupabase();
  const { data, error } = await (supabase
    .from("holidays") as any)
    .select("id, holiday_date, name, is_off, is_manual, created_at")
    .order("holiday_date", { ascending: true });

  if (error) {
    console.error("[getHolidays] Hata:", error.message);
    return [];
  }
  return data ?? [];
}

export async function setHolidayStatus(
  date: string,
  name: string,
  isOff: boolean,
  isManual: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Mevcut kaydı kontrol et
  const { data: existing } = await (supabase
    .from("holidays") as any)
    .select("id")
    .eq("holiday_date", date)
    .maybeSingle();

  let error;
  if (existing?.id) {
    const res = await (supabase.from("holidays") as any)
      .update({
        name,
        is_off: isOff,
        is_manual: isManual,
      })
      .eq("id", existing.id);
    error = res.error;
  } else {
    const res = await (supabase.from("holidays") as any)
      .insert({
        holiday_date: date,
        name,
        is_off: isOff,
        is_manual: isManual,
      });
    error = res.error;
  }

  if (error) {
    console.error("[setHolidayStatus] Hata:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export async function deleteHoliday(
  date: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { error } = await (supabase.from("holidays") as any)
    .delete()
    .eq("holiday_date", date);

  if (error) {
    console.error("[deleteHoliday] Hata:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// Z RAPORLARI
// ═══════════════════════════════════════════════════════════════

export async function getZReportsList() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.storage.from("z_raporlari").list();
  if (error) {
    console.error("Z Raporları çekilemedi:", error.message);
    return [];
  }
  // Sadece csv'leri al, tarihe göre yeni en üstte olsun
  return data
    .filter((f) => f.name.endsWith(".csv"))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export async function getZReportDownloadUrl(fileName: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.storage.from("z_raporlari").createSignedUrl(fileName, 60 * 5); // 5 dakika geçerli
  if (error) {
    console.error("İndirme linki oluşturulamadı:", error.message);
    return null;
  }
  return data?.signedUrl;
}

export async function syncHolidaysFromApi(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const supabase = getAdminSupabase();
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear + 1];
    let totalUpserted = 0;

    for (const year of years) {
      const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/TR`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const holidays: Array<{ date: string; localName: string; name: string }> =
        await res.json();

      for (const h of holidays) {
        // Manuel girilenleri ezmemek için kontrol
        const { data: existing } = await (supabase
          .from("holidays") as any)
          .select("id, is_manual")
          .eq("holiday_date", h.date)
          .maybeSingle();

        if (existing?.is_manual) continue;

        if (existing) {
          await (supabase.from("holidays") as any)
            .update({
              name: h.localName || h.name,
              is_off: true,
              is_manual: false,
            })
            .eq("id", existing.id);
        } else {
          await (supabase.from("holidays") as any)
            .insert({
              holiday_date: h.date,
              name: h.localName || h.name,
              is_off: true,
              is_manual: false,
            });
        }
        totalUpserted++;
      }
    }

    revalidatePath("/admin");
    revalidatePath("/");
    return {
      success: true,
      count: totalUpserted,
    };
  } catch (err: any) {
    console.error("[syncHolidaysFromApi] Hata:", err);
    return { success: false, error: err.message };
  }
}
