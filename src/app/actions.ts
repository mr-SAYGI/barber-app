"use server";

import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { calculateAvailableSlots } from "@/lib/appointments/slots";
import type { DbWorkingHours, TimeSlot } from "@/types/appointment";

// ═══════════════════════════════════════════════════════════════
// AKTİF BERBERLERİ LİSTELE
// ═══════════════════════════════════════════════════════════════
export async function getActiveBarbers() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await (supabase
    .from("profiles") as any)
    .select("id, full_name, avatar_url, bio, is_available")
    .eq("role", "barber")
    .eq("is_available", true);

  // full_name yoksa email'i kullan
  if (error) {
    console.error("getActiveBarbers error:", error.message);
    return [];
  }
  return (data ?? []).map((p: any) => ({
    ...p,
    full_name: p.full_name ?? p.email ?? "Berber",
  }));
}

// ═══════════════════════════════════════════════════════════════
// AKTİF HİZMETLERİ LİSTELE
// ═══════════════════════════════════════════════════════════════
export async function getActiveServices() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await (supabase
    .from("services") as any)
    .select("id, name, duration_minutes, price, icon")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("getActiveServices error:", error.message);
    return [];
  }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// TEK BERBERLİ MOD — Varsayılan Berber ID'sini Döndür
// ═══════════════════════════════════════════════════════════════
export async function getDefaultBarberId(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  // Önce barber rolündeki profillere bak
  const { data: barberProfile } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("role", "barber")
    .limit(1)
    .maybeSingle();

  if (barberProfile?.id) return barberProfile.id;

  // Yoksa working_hours tablosundan herhangi bir barber_id çek
  const { data: wh } = await (supabase
    .from("working_hours") as any)
    .select("barber_id")
    .limit(1)
    .maybeSingle();

  if (wh?.barber_id) return wh.barber_id;

  // Son çare: admin profili döndür
  const { data: admin } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  return admin?.id ?? null;
}


// ═══════════════════════════════════════════════════════════════
// MÜŞTERİ İÇİN UYGUN SLOTLARI HESAPLA
// ═══════════════════════════════════════════════════════════════
export async function getCustomerAvailableSlots(
  barberId: string,
  date: string,
  serviceIds: string[]
) {
  const supabase = createSupabaseServerClient();

  // Tatil kontrolü: Bu tarih tatil mi?
  const { data: holiday } = await (supabase
    .from("holidays") as any)
    .select("is_off, name")
    .eq("holiday_date", date)
    .maybeSingle();

  if (holiday?.is_off) {
    return {
      workStart: "",
      workEnd: "",
      slots: [],
      availableSlots: [],
      isHoliday: true,
      holidayName: holiday.name || "Tatil",
    };
  }

  // Seçilen hizmetlerin sürelerini al
  const { data: services, error: servicesError } = await (supabase
    .from("services") as any)
    .select("id, duration_minutes")
    .in("id", serviceIds)
    .eq("is_active", true);

  if (servicesError || !services || services.length === 0) {
    throw new Error("Hizmetler bulunamadı veya pasif durumda.");
  }

  const totalDuration = services.reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
  const dayOfWeek = new Date(date).getDay();

  // Berber o gün çalışıyor mu?
  const { data: workingHours, error: whError } = await (supabase
    .from("working_hours") as any)
    .select("*")
    .eq("barber_id", barberId)
    .eq("day_of_week", dayOfWeek)
    .single();

  if (whError || !workingHours || (workingHours as DbWorkingHours).is_off) {
    return { workStart: "", workEnd: "", slots: [], availableSlots: [] };
  }

  // O günün mevcut aktif randevularını çek
  const dayStart = `${date}T00:00:00+03:00`;
  const dayEnd = `${date}T23:59:59+03:00`;

  const { data: appointments, error: apptError } = await (supabase
    .from("appointments") as any)
    .select("starts_at, ends_at, status")
    .eq("barber_id", barberId)
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd)
    .in("status", ["pending", "confirmed", "in_progress", "completed"]);

  if (apptError) throw new Error(`Mevcut randevular sorgulanamadı: ${apptError.message}`);

  // Berberin profilinden min_booking_buffer ayarını çek
  const { data: barberProfile } = await (supabase
    .from("profiles") as any)
    .select("min_booking_buffer")
    .eq("id", barberId)
    .single();

  const minBookingBufferMinutes = barberProfile?.min_booking_buffer ?? 60;

  // Müsait slotları hesapla
  const result = calculateAvailableSlots({
    date,
    workingHours: workingHours as DbWorkingHours,
    existingAppointments: appointments ?? [],
    totalDurationMinutes: totalDuration,
    minBookingBufferMinutes,
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════
// YENİ RANDEVU OLUŞTUR (Konuk / Otomatik Kayıtlı Müşteri)
// ═══════════════════════════════════════════════════════════════
export interface BookAppointmentInput {
  barberId: string;
  startsAt: string; // ISO 8601
  serviceIds: string[];
  fullName: string;
  phone: string;
  customerNote?: string;
}

export async function bookAppointment(input: BookAppointmentInput) {
  // RLS'yi aşmak ve konuk kayıt yapabilmek için admin client kullanıyoruz
  const supabase = createSupabaseAdminClient();

  const cleanPhone = input.phone.trim();
  const cleanName = input.fullName.trim();

  // 1. Telefon numarasına göre müşteri profili ara
  let { data: profile } = await (supabase
    .from("profiles") as any)
    .select("id")
    .eq("phone", cleanPhone)
    .limit(1)
    .maybeSingle();

  let customerId: string;

  if (!profile) {
    // 2. Profil yoksa yeni bir customer profili oluştur
    // Supabase foreign key (profiles_id_fkey -> auth.users) constraint'ini aşmak için
    // önce hayalet bir auth kullanıcısı oluşturuyoruz.
    const dummyEmail = `guest_${crypto.randomUUID().substring(0, 8)}@example.com`;
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
      throw new Error(`Kullanıcı altyapısı oluşturulamadı: ${authErr?.message}`);
    }

    const newProfileId = authUser.user.id;

    // Veritabanında trigger varsa (handle_new_user vb.) profile zaten oluşmuş olabilir
    const { data: checkProfile } = await (supabase
      .from("profiles") as any)
      .select("id")
      .eq("id", newProfileId)
      .maybeSingle();

    if (!checkProfile) {
      // Trigger yoksa veya oluşturamadıysa manuel ekle
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
        throw new Error(`Müşteri kaydı oluşturulamadı: ${profileErr?.message}`);
      }
    }
    customerId = newProfileId;
  } else {
    customerId = profile.id;
  }

  // Profil bulundu veya oluşturuldu; güncel isim ve telefonu kaydet
  // @ts-ignore
  await supabase.from("profiles").update({ full_name: cleanName, phone: cleanPhone }).eq("id", customerId);

  // 3. Seçilen hizmetlerin detaylarını al
  const { data: services, error: sErr } = await (supabase
    .from("services") as any)
    .select("id, duration_minutes, price")
    .in("id", input.serviceIds)
    .eq("is_active", true);

  if (sErr || !services || services.length === 0) {
    throw new Error("Hizmetler yüklenemedi.");
  }

  const totalDuration = services.reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
  const totalPrice = services.reduce((sum: number, s: any) => sum + s.price, 0);

  const startsAtDate = new Date(input.startsAt);
  const endsAtDate = new Date(startsAtDate.getTime() + totalDuration * 60 * 1000);
  const endsAt = endsAtDate.toISOString();

  // 4. Çakışma kontrolü
  const { data: availabilityData, error: availabilityError } = await (supabase.rpc as any)(
    "check_appointment_availability",
    {
      p_barber_id: input.barberId,
      p_starts_at: input.startsAt,
      p_ends_at: endsAt,
    }
  );

  if (availabilityError || !availabilityData) {
    throw new Error("Müsaitlik kontrolü yapılamadı.");
  }

  if (!(availabilityData as any).is_available) {
    throw new Error("Seçilen saat dolu. Lütfen başka bir saat tercih edin.");
  }

  // 5. Randevuyu ekle
  const { data: newAppt, error: apptErr } = await (supabase
    .from("appointments") as any)
    .insert({
      customer_id: customerId,
      barber_id: input.barberId,
      status: "pending", // İlk başta onay bekliyor durumunda
      starts_at: input.startsAt,
      ends_at: endsAt,
      total_duration: totalDuration,
      total_price: totalPrice,
      customer_note: [
        `[Müşteri] ${cleanName} | Tel: ${cleanPhone}`,
        input.customerNote?.trim() ? `Not: ${input.customerNote.trim()}` : null,
      ].filter(Boolean).join(" | "),
    })
    .select("id")
    .single();

  if (apptErr || !newAppt) {
    throw new Error(`Randevu kaydı başarısız: ${apptErr?.message}`);
  }

  // 6. Hizmet detaylarını yaz (Snapshot)
  const serviceRows = input.serviceIds.map((srvId) => {
    const srv = services.find((s: any) => s.id === srvId)!;
    return {
      appointment_id: newAppt.id,
      service_id: srvId,
      price_snapshot: srv.price,
      duration_snapshot: srv.duration_minutes,
    };
  });

  const { error: srvInsertErr } = await (supabase
    .from("appointment_services") as any)
    .insert(serviceRows);

  if (srvInsertErr) {
    console.error("Hizmet detayları kaydedilemedi:", srvInsertErr);
  }

  return { success: true, appointmentId: newAppt.id };
}

// ═══════════════════════════════════════════════════════════════
// MÜŞTERİ RANDEVULARINI SORGULA
// ═══════════════════════════════════════════════════════════════
export async function queryAppointments(phoneOrCode: string) {
  const supabase = createSupabaseAdminClient();
  const searchStr = phoneOrCode.trim();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(searchStr)) {
    // 1. Doğrudan rezervasyon koduyla (UUID) ara
    const { data, error } = await (supabase.from("appointments") as any)
      .select(`id, status, starts_at, ends_at, total_duration, total_price, customer_note`)
      .eq("id", searchStr);

    if (error) throw new Error("Rezervasyon kodu sorgulanırken hata oluştu. Lütfen kodu kontrol edin.");

    // Müşteri notundan parse edilecek
    const parsedData = (data || []).map((appt: any) => {
      const note = appt.customer_note || "";
      const customerName = note.match(/Müşteri: ([^|]+)/)?.[1]?.trim() || "Müşteri";
      const serviceName = note.match(/Hizmet: ([^|]+)/)?.[1]?.trim() || "Bilinmeyen Hizmet";

      return {
        ...appt,
        profiles: { full_name: customerName },
        appointment_services: [{ services: { name: serviceName } }]
      };
    });

    return parsedData;
  } else {
    // 2. Telefon numarasına ait profili bulup randevularını ara
    const { data: customerProfile } = await (supabase
      .from("profiles") as any)
      .select("id, full_name")
      .eq("phone", searchStr)
      .limit(1)
      .maybeSingle();

    if (!customerProfile) {
      return [];
    }

    const { data, error } = await (supabase.from("appointments") as any)
      .select(`id, status, starts_at, ends_at, total_duration, total_price, customer_note, appointment_services(services(id, name))`)
      .eq("customer_id", customerProfile.id)
      .order("starts_at", { ascending: false });

    if (error) throw new Error("Telefon numarası sorgulanırken hata oluştu.");

    const parsedData = (data || []).map((appt: any) => {
      return {
        ...appt,
        profiles: { full_name: customerProfile.full_name },
      };
    });

    return parsedData;
  }
}

// ═══════════════════════════════════════════════════════════════
// MÜŞTERİ RANDEVUSUNU İPTAL ET
// ═══════════════════════════════════════════════════════════════
export async function cancelCustomerAppointment(appointmentId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: appt, error: fetchErr } = await (supabase
    .from("appointments") as any)
    .select("status, starts_at")
    .eq("id", appointmentId)
    .single();

  if (fetchErr || !appt) throw new Error("Randevu bulunamadı.");

  if (appt.status === "cancelled") {
    return { success: true };
  }

  if (["completed", "no_show", "in_progress"].includes(appt.status)) {
    throw new Error("Tamamlanmış veya devam eden randevular iptal edilemez.");
  }

  const { error } = await (supabase
    .from("appointments") as any)
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) throw new Error(`İptal işlemi başarısız: ${error.message}`);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// MÜŞTERİ RANDEVUSUNU YENİDEN PLANLA
// ═══════════════════════════════════════════════════════════════
export async function rescheduleCustomerAppointment(
  appointmentId: string,
  startsAt: string // ISO 8601
) {
  const supabase = createSupabaseAdminClient();

  // Mevcut randevu bilgilerini çek
  const { data: appt, error: fetchErr } = await (supabase
    .from("appointments") as any)
    .select("barber_id, total_duration, status")
    .eq("id", appointmentId)
    .single();

  if (fetchErr || !appt) throw new Error("Randevu bulunamadı.");

  if (["completed", "no_show", "in_progress", "cancelled"].includes(appt.status)) {
    throw new Error("Bu randevu yeniden planlanmaya uygun değil.");
  }

  const startsAtDate = new Date(startsAt);
  if (startsAtDate <= new Date()) {
    throw new Error("Geçmiş bir tarihe randevu planlanamaz.");
  }

  const endsAtDate = new Date(startsAtDate.getTime() + appt.total_duration * 60 * 1000);
  const endsAt = endsAtDate.toISOString();

  // 1. Yeni saatler için müsaitlik kontrolü yap
  const { data: availabilityData, error: availabilityError } = await (supabase.rpc as any)(
    "check_appointment_availability",
    {
      p_barber_id: appt.barber_id,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
    }
  );

  if (availabilityError || !availabilityData) {
    throw new Error("Müsaitlik kontrolü gerçekleştirilemedi.");
  }

  if (!(availabilityData as any).is_available) {
    throw new Error("Seçilen saat dolu. Lütfen başka bir saat seçin.");
  }

  // 2. Randevu zamanını güncelle
  const { error } = await (supabase
    .from("appointments") as any)
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .eq("id", appointmentId);

  if (error) throw new Error(`Güncelleme başarısız: ${error.message}`);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// RESMİ TATİLLERİ GETİR (Müşteri Takvimi İçin)
// ═══════════════════════════════════════════════════════════════
export async function getPublicHolidays() {
  const supabase = createSupabaseServerClient();
  const today = (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })();

  const { data, error } = await (supabase
    .from("holidays") as any)
    .select("holiday_date, name, is_off")
    .gte("holiday_date", today)
    .eq("is_off", true);

  if (error) {
    console.error("getPublicHolidays error:", error.message);
    return [];
  }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE PLAYLIST VİDEOLARINI ÇEK (Sunucu Tarafı — Güvenli)
// ═══════════════════════════════════════════════════════════════

export interface YouTubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
}

/**
 * Belirtilen playlist'teki son 20 videoyu YouTube Data API v3 ile çeker.
 * API anahtarı yalnızca sunucu tarafında kullanılır (YOUTUBE_API_KEY).
 * Varsayılan playlist: Lofi Hip Hop (jfKfPfyJRdk kanalının chill playlist'i)
 */
export async function fetchPlaylistVideos(
  playlistId: string = "PLbpi6ZahtOH6Ar_3GPy3workMR9Nt5MNE"
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY bulunamadı (.env.local dosyasını kontrol edin).");
    return [];
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=20&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } }); // 5 dk cache
    const json = await res.json();

    if (json.error) {
      console.error("YouTube API hatası:", json.error.message);
      return [];
    }

    const videos: YouTubeVideo[] = (json.items || [])
      .filter((item: any) => item.snippet?.resourceId?.videoId)
      .map((item: any) => ({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
        channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || "",
        publishedAt: item.snippet.publishedAt || "",
      }));

    return videos;
  } catch (err) {
    console.error("YouTube playlist fetch hatası:", err);
    return [];
  }
}

/**
 * YouTube'da arama yapar. API anahtarı sunucu tarafında güvende kalır.
 */
export async function searchYouTubeVideos(query: string): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !query.trim()) return [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&key=${apiKey}&q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.error) {
      console.error("YouTube search API hatası:", json.error.message);
      return [];
    }

    const videos: YouTubeVideo[] = (json.items || [])
      .filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
        channelTitle: item.snippet.channelTitle || "",
        publishedAt: item.snippet.publishedAt || "",
      }));

    return videos;
  } catch (err) {
    console.error("YouTube search hatası:", err);
    return [];
  }
}

