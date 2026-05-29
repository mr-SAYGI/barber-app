// ============================================================
// src/app/api/appointments/route.ts
//
// POST /api/appointments
// ─────────────────────────────────────────────────────────────
// Yeni randevu oluşturur. İşlem öncesinde:
//   1. Input doğrulama
//   2. Kullanıcı kimlik doğrulaması (Supabase Auth)
//   3. Berber ve hizmet varlık kontrolü
//   4. Çalışma saati kontrolü
//   5. Çift güvenlik çakışma kontrolü:
//      a) check_appointment_availability() DB fonksiyonu
//      b) no_overlapping_appointments EXCLUDE constraint
//
// Request Body:
//   { barberId, startsAt, serviceIds[], customerNote? }
//
// Başarılı Yanıt: 201 Created
//   { success: true, appointment: {...} }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calculateTotalDuration,
  calculateTotalPrice,
  parseTimeToMinutes,
} from "@/lib/appointments/slots";
import type {
  CreateAppointmentRequest,
  CreateAppointmentResponse,
  ApiErrorResponse,
  AvailabilityCheckResult,
  DbWorkingHours,
} from "@/types/appointment";

// ─────────────────────────────────────────────
// Yardımcı: Standart Hata Yanıtı
// ─────────────────────────────────────────────

function errorResponse(
  code: ApiErrorResponse["error"]["code"],
  message: string,
  status: number,
  extra?: Partial<ApiErrorResponse["error"]>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: { code, message, ...extra } },
    { status }
  );
}

// ─────────────────────────────────────────────
// Input Doğrulama
// ─────────────────────────────────────────────

interface PostValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data?: CreateAppointmentRequest;
}

function validatePostBody(body: unknown): PostValidationResult {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return {
      valid: false,
      errors: { body: "Request body geçerli bir JSON nesnesi olmalıdır" },
    };
  }

  const b = body as Record<string, unknown>;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // barberId
  if (!b.barberId || typeof b.barberId !== "string") {
    errors.barberId = "barberId zorunludur";
  } else if (!uuidRegex.test(b.barberId)) {
    errors.barberId = "barberId geçerli bir UUID olmalıdır";
  }

  // startsAt — ISO 8601
  if (!b.startsAt || typeof b.startsAt !== "string") {
    errors.startsAt = "startsAt zorunludur";
  } else {
    const d = new Date(b.startsAt);
    if (isNaN(d.getTime())) {
      errors.startsAt = "startsAt geçerli bir ISO 8601 tarihi olmalıdır";
    } else if (d <= new Date()) {
      errors.startsAt = "Geçmiş bir zaman için randevu oluşturulamaz";
    }
  }

  // serviceIds
  if (!Array.isArray(b.serviceIds) || b.serviceIds.length === 0) {
    errors.serviceIds = "En az bir hizmet seçilmelidir";
  } else {
    const invalidIds = (b.serviceIds as unknown[]).filter(
      (id) => typeof id !== "string" || !uuidRegex.test(id)
    );
    if (invalidIds.length > 0) {
      errors.serviceIds = "Geçersiz service UUID'leri mevcut";
    }
  }

  // customerNote (opsiyonel, max 500 karakter)
  if (
    b.customerNote !== undefined &&
    (typeof b.customerNote !== "string" || b.customerNote.length > 500)
  ) {
    errors.customerNote = "Müşteri notu 500 karakteri geçemez";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    data: {
      barberId: b.barberId as string,
      startsAt: b.startsAt as string,
      serviceIds: b.serviceIds as string[],
      customerNote: b.customerNote as string | undefined,
    },
  };
}

// ─────────────────────────────────────────────
// POST Handler
// ─────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateAppointmentResponse | ApiErrorResponse>> {
  try {
    const supabase = createSupabaseServerClient();

    // ── Adım 1: Kimlik Doğrulama ──────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse(
        "UNAUTHORIZED",
        "Randevu oluşturmak için giriş yapmanız gerekiyor",
        401
      );
    }

    // Müşteri profilini çek (ad ve telefon)
    const { data: customerProfile } = await (supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .single() as any);
    const customerFullName = customerProfile?.full_name ?? "";
    const customerPhone = customerProfile?.phone ?? "";

    // ── Adım 2: Request Body Doğrulama ────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "VALIDATION_ERROR",
        "Request body geçerli bir JSON değil",
        400
      );
    }

    const validation = validatePostBody(body);
    if (!validation.valid) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Eksik veya geçersiz alanlar",
        400,
        { details: validation.errors }
      );
    }

    const { barberId, startsAt, serviceIds, customerNote } = validation.data!;
    const startsAtDate = new Date(startsAt);

    // ── Adım 3: Berber Kontrolü ───────────────────────────────
    const { data: barber, error: barberError } = await (supabase
      .from("profiles")
      .select("id, full_name, avatar_url, is_available, role")
      .eq("id", barberId)
      .eq("role", "barber")
      .single() as any);

    if (barberError || !barber) {
      return errorResponse("BARBER_NOT_FOUND", "Berber bulunamadı", 404);
    }

    if (!barber.is_available) {
      return errorResponse(
        "BARBER_UNAVAILABLE",
        "Bu berber şu an randevu almıyor",
        409
      );
    }

    // ── Adım 4: Hizmet Kontrolü & Süre/Fiyat Hesaplama ───────
    const { data: services, error: servicesError } = await (supabase
      .from("services") as any)
      .select("id, name, duration_minutes, price, icon")
      .in("id", serviceIds)
      .eq("is_active", true);

    if (servicesError) {
      console.error("[POST /appointments] Services error:", servicesError);
      return errorResponse("INTERNAL_ERROR", "Hizmetler yüklenemedi", 500);
    }

    const { totalMinutes, missingIds } = calculateTotalDuration(
      services ?? [],
      serviceIds
    );

    if (missingIds.length > 0) {
      return errorResponse(
        "SERVICE_NOT_FOUND",
        `Bazı hizmetler bulunamadı veya aktif değil: ${missingIds.join(", ")}`,
        404
      );
    }

    // Bitiş zamanını hesapla
    const endsAtDate = new Date(
      startsAtDate.getTime() + totalMinutes * 60 * 1000
    );
    const endsAt = endsAtDate.toISOString();

    // Berber bazlı özel fiyatları getir
    const { data: barberServices } = await (supabase
      .from("barber_services") as any)
      .select("service_id, custom_price")
      .eq("barber_id", barberId)
      .in("service_id", serviceIds);

    const totalPrice = calculateTotalPrice(
      services ?? [],
      barberServices ?? [],
      serviceIds
    );

    // ── Adım 5: Çalışma Saati Kontrolü ───────────────────────
    const dayOfWeek = startsAtDate.getDay();

    const { data: workingHours, error: whError } = await (supabase
      .from("working_hours")
      .select("*")
      .eq("barber_id", barberId)
      .eq("day_of_week", dayOfWeek)
      .single() as any);

    if (whError || !workingHours || (workingHours as DbWorkingHours).is_off) {
      return errorResponse(
        "WORKING_HOURS_CLOSED",
        "Berber seçilen tarihte çalışmıyor",
        409
      );
    }

    const wh = workingHours as DbWorkingHours;
    const workStartMs = parseTimeToMinutes(wh.start_time);
    const workEndMs = parseTimeToMinutes(wh.end_time);

    const slotStartMinutes =
      startsAtDate.getHours() * 60 + startsAtDate.getMinutes();
    const slotEndMinutes = slotStartMinutes + totalMinutes;

    if (slotStartMinutes < workStartMs || slotEndMinutes > workEndMs) {
      return errorResponse(
        "WORKING_HOURS_CLOSED",
        `Randevu çalışma saatleri dışında. İzin verilen: ${wh.start_time.slice(0, 5)} - ${wh.end_time.slice(0, 5)}`,
        409
      );
    }

    // ── Adım 6a: DB Fonksiyonu ile Çakışma Kontrolü ──────────
    // Bu, EXCLUDE constraint devreye girmeden önce
    // kullanıcıya anlamlı bir hata mesajı vermemizi sağlar.
    const { data: availabilityData, error: availabilityError } =
      await (supabase.rpc as any)("check_appointment_availability", {
        p_barber_id: barberId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      });

    if (availabilityError) {
      console.error(
        "[POST /appointments] Availability check error:",
        availabilityError
      );
      return errorResponse(
        "INTERNAL_ERROR",
        "Müsaitlik kontrolü yapılamadı",
        500
      );
    }

    const availability = availabilityData as AvailabilityCheckResult;

    if (!availability.is_available) {
      // Çakışan randevunun zamanını öğren (kullanıcıya göster)
      let conflictingAppointment:
        | { startsAt: string; endsAt: string }
        | undefined;

      if (availability.conflict_ids && availability.conflict_ids.length > 0) {
        const { data: conflictData } = await (supabase
          .from("appointments")
          .select("starts_at, ends_at")
          .eq("id", availability.conflict_ids[0])
          .single() as any);

        if (conflictData) {
          conflictingAppointment = {
            startsAt: conflictData.starts_at,
            endsAt: conflictData.ends_at,
          };
        }
      }

      return errorResponse(
        "CONFLICT",
        "Seçilen saat dolu. Lütfen başka bir saat seçin.",
        409,
        { conflictingAppointment }
      );
    }

    // ── Adım 7: Randevuyu Oluştur ─────────────────────────────
    // Not: EXCLUDE constraint (Adım 6b) burada da devreye girer.
    // Race condition durumunda (iki kullanıcı aynı anda aynı slotu seçerse)
    // DB seviyesinde garanti sağlanır.

    const { data: newAppointment, error: insertError } = await ((supabase
      .from("appointments") as any)
      .insert({
        customer_id: user.id,
        barber_id: barberId,
        status: "pending",
        starts_at: startsAt,
        ends_at: endsAt,
        total_duration: totalMinutes,
        total_price: totalPrice,
        customer_note: [
          customerFullName ? `[Müşteri] ${customerFullName}` : null,
          customerPhone ? `Tel: ${customerPhone}` : null,
          customerNote ? `Not: ${customerNote}` : null,
        ].filter(Boolean).join(" | ") || null,
      })
      .select("id, status, queue_number, starts_at, ends_at, total_duration, total_price")
      .single());

    if (insertError) {
      // PostgreSQL exclusion constraint ihlali
      if (
        insertError.code === "23P01" ||
        insertError.message.includes("no_overlapping_appointments")
      ) {
        return errorResponse(
          "CONFLICT",
          "Bu saat başkası tarafından az önce alındı. Lütfen sayfayı yenileyip tekrar deneyin.",
          409
        );
      }

      // Çalışma saati trigger hatası
      if (insertError.message.includes("çalışmıyor")) {
        return errorResponse(
          "WORKING_HOURS_CLOSED",
          insertError.message,
          409
        );
      }

      console.error("[POST /appointments] Insert error:", insertError);
      return errorResponse("INTERNAL_ERROR", "Randevu oluşturulamadı", 500);
    }

    // ── Adım 8: appointment_services kayıtlarını oluştur ──────
    const appointmentServicesRows = serviceIds.map((serviceId) => {
      const service = services!.find((s: any) => s.id === serviceId)!;
      const barberService = (barberServices ?? []).find(
        (bs: any) => bs.service_id === serviceId
      );

      return {
        appointment_id: newAppointment.id,
        service_id: serviceId,
        price_snapshot: barberService?.custom_price ?? service.price,
        duration_snapshot: service.duration_minutes,
      };
    });

    const { error: servicesInsertError } = await (supabase
      .from("appointment_services") as any)
      .insert(appointmentServicesRows);

    if (servicesInsertError) {
      console.error(
        "[POST /appointments] Services insert error:",
        servicesInsertError
      );
      // Randevu oluştu ama servis detayları kaydedilemedi
      // Bu durumu işaretle ama kullanıcıya randevunun oluştuğunu söyle
    }

    // ── Adım 9: Başarılı Yanıt ───────────────────────────────
    const response: CreateAppointmentResponse = {
      success: true,
      message: "Randevunuz başarıyla oluşturuldu! Onay bekleniyor.",
      appointment: {
        id: newAppointment.id,
        status: newAppointment.status,
        queueNumber: newAppointment.queue_number,
        startsAt: newAppointment.starts_at,
        endsAt: newAppointment.ends_at,
        totalDuration: newAppointment.total_duration,
        totalPrice: newAppointment.total_price,
        barber: {
          id: barber.id,
          full_name: barber.full_name,
          avatar_url: barber.avatar_url,
        },
        services: services!.map((s: any) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: s.price,
          icon: s.icon,
        })),
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error("[POST /appointments] Unexpected error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "Beklenmeyen bir hata oluştu",
      500
    );
  }
}
