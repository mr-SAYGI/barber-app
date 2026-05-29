// ============================================================
// src/app/api/appointments/available-slots/route.ts
//
// GET /api/appointments/available-slots
// ─────────────────────────────────────────────────────────────
// Müşterinin seçtiği tarihte, bir berberin müsait zaman
// dilimlerini döndürür.
//
// Query Parametreleri:
//   barberId   — Berber UUID (zorunlu)
//   date       — Tarih YYYY-MM-DD (zorunlu)
//   serviceIds — Virgülle ayrılmış hizmet UUID'leri (zorunlu)
//
// Başarılı Yanıt: 200 OK
//   { barberId, date, totalDuration, workStart, workEnd,
//     slots, availableSlots }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calculateAvailableSlots,
  calculateTotalDuration,
} from "@/lib/appointments/slots";
import type {
  AvailableSlotsResponse,
  ApiErrorResponse,
  DbWorkingHours,
} from "@/types/appointment";

// ─────────────────────────────────────────────
// Yardımcı: Standart Hata Yanıtı
// ─────────────────────────────────────────────

function errorResponse(
  code: ApiErrorResponse["error"]["code"],
  message: string,
  status: number,
  details?: Record<string, string>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: { code, message, ...(details && { details }) } },
    { status }
  );
}

// ─────────────────────────────────────────────
// Input Doğrulama
// ─────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  barberId?: string;
  date?: string;
  serviceIds?: string[];
}

function validateQueryParams(searchParams: URLSearchParams): ValidationResult {
  const errors: Record<string, string> = {};

  const barberId = searchParams.get("barberId")?.trim();
  const date = searchParams.get("date")?.trim();
  const serviceIdsRaw = searchParams.get("serviceIds")?.trim();

  // UUID formatı kontrolü
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!barberId) {
    errors.barberId = "barberId zorunludur";
  } else if (!uuidRegex.test(barberId)) {
    errors.barberId = "barberId geçerli bir UUID olmalıdır";
  }

  // YYYY-MM-DD format kontrolü
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!date) {
    errors.date = "date zorunludur (YYYY-MM-DD)";
  } else if (!dateRegex.test(date)) {
    errors.date = "date YYYY-MM-DD formatında olmalıdır";
  } else {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      errors.date = "Geçersiz tarih";
    } else {
      // Geçmişe randevu alınamaz
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDate < today) {
        errors.date = "Geçmiş bir tarih için slot sorgulanamaz";
      }
    }
  }

  let serviceIds: string[] | undefined;
  if (!serviceIdsRaw) {
    errors.serviceIds = "serviceIds zorunludur";
  } else {
    serviceIds = serviceIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (serviceIds.length === 0) {
      errors.serviceIds = "En az bir hizmet seçilmelidir";
    } else {
      const invalidIds = serviceIds.filter((id) => !uuidRegex.test(id));
      if (invalidIds.length > 0) {
        errors.serviceIds = `Geçersiz service UUID'leri: ${invalidIds.join(", ")}`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    barberId,
    date,
    serviceIds,
  };
}

// ─────────────────────────────────────────────
// GET Handler
// ─────────────────────────────────────────────

export async function GET(
  request: NextRequest
): Promise<NextResponse<AvailableSlotsResponse | ApiErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);

    // 1. Input doğrulama
    const validation = validateQueryParams(searchParams);
    if (!validation.valid) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Eksik veya geçersiz parametreler",
        400,
        validation.errors
      );
    }

    const { barberId, date, serviceIds } = validation as Required<
      typeof validation
    >;

    const supabase = createSupabaseServerClient();

    const { data: barber, error: barberError } = await (supabase
      .from("profiles")
      .select("id, full_name, is_available, role")
      .eq("id", barberId)
      .eq("role", "barber")
      .single() as any);

    if (barberError || !barber) {
      return errorResponse("BARBER_NOT_FOUND", "Berber bulunamadı", 404);
    }

    if (!barber.is_available) {
      return errorResponse(
        "BARBER_UNAVAILABLE",
        "Berber şu an müsait değil",
        409
      );
    }

    // 3. Hizmetleri getir ve toplam süreyi hesapla
    const { data: services, error: servicesError } = await (supabase
      .from("services") as any)
      .select("id, name, duration_minutes, price")
      .in("id", serviceIds)
      .eq("is_active", true);

    if (servicesError) {
      console.error("[available-slots] Services fetch error:", servicesError);
      return errorResponse("INTERNAL_ERROR", "Hizmetler yüklenemedi", 500);
    }

    const { totalMinutes, missingIds } = calculateTotalDuration(
      services ?? [],
      serviceIds
    );

    if (missingIds.length > 0) {
      return errorResponse(
        "SERVICE_NOT_FOUND",
        `Bazı hizmetler bulunamadı: ${missingIds.join(", ")}`,
        404
      );
    }

    if (totalMinutes === 0) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Seçilen hizmetlerin toplam süresi sıfır olamaz",
        400
      );
    }

    // 4. Berberin o günkü çalışma saatlerini getir
    const dayOfWeek = new Date(date).getDay(); // 0 = Pazar

    const { data: workingHours, error: whError } = await (supabase
      .from("working_hours")
      .select("*")
      .eq("barber_id", barberId)
      .eq("day_of_week", dayOfWeek)
      .single() as any);

    if (whError || !workingHours) {
      return errorResponse(
        "WORKING_HOURS_CLOSED",
        "Berber bu gün çalışmıyor",
        409
      );
    }

    if ((workingHours as DbWorkingHours).is_off) {
      return errorResponse(
        "WORKING_HOURS_CLOSED",
        "Berber bu gün izinli",
        409
      );
    }

    // 5. O gün için mevcut randevuları getir (sadece aktif olanlar)
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: appointments, error: apptError } = await (supabase
      .from("appointments") as any)
      .select("starts_at, ends_at, status")
      .eq("barber_id", barberId)
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .not("status", "in", '("cancelled","no_show")');

    if (apptError) {
      console.error("[available-slots] Appointments fetch error:", apptError);
      return errorResponse("INTERNAL_ERROR", "Randevular yüklenemedi", 500);
    }

    // 6. Müsait slotları hesapla
    const result = calculateAvailableSlots({
      date,
      workingHours: workingHours as DbWorkingHours,
      existingAppointments: appointments ?? [],
      totalDurationMinutes: totalMinutes,
    });

    // 7. Başarılı yanıt
    const response: AvailableSlotsResponse = {
      barberId,
      date,
      totalDuration: totalMinutes,
      workStart: result.workStart,
      workEnd: result.workEnd,
      slots: result.slots,
      availableSlots: result.availableSlots,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        // Slotları kısa süre cache'le (30 sn), sık değişebilir
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[available-slots] Unexpected error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "Beklenmeyen bir hata oluştu",
      500
    );
  }
}
