// ============================================================
// src/lib/appointments/slots.ts
// Slot Hesaplama İş Mantığı
// ============================================================
//
// Bu modül, bir berberin belirli bir tarihteki müsait zaman
// dilimlerini hesaplar. API route'larından ayrı tutulması,
// mantığın bağımsız test edilmesini ve yeniden kullanılmasını
// sağlar.
// ============================================================

import type {
  TimeSlot,
  DbWorkingHours,
  DbAppointment,
} from "@/types/appointment";

// ─────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────

/** Varsayılan slot granülaritesi (dakika) */
const DEFAULT_SLOT_INTERVAL_MINUTES = 10;

// ─────────────────────────────────────────────
// Yardımcı Fonksiyonlar
// ─────────────────────────────────────────────

/**
 * "HH:MM:SS" veya "HH:MM" formatındaki zaman stringini
 * dakika cinsine dönüştürür.
 * @example parseTimeToMinutes("09:30") === 570
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Dakika cinsindeki değeri "HH:MM" formatına dönüştürür.
 * @example formatMinutesToTime(570) === "09:30"
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Verilen tarih ve "HH:MM" zamanını UTC Date nesnesine birleştirir.
 * Zaman dilimi karışıklığını önlemek için her zaman
 * tarih stringi + zaman stringi olarak işler.
 */
function combineDateAndTime(dateStr: string, timeStr: string): Date {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM" veya "HH:MM:SS"
  // Sunucu zaman diliminden bağımsız olarak her zaman Türkiye saati (+03:00) kabul et
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${dateStr}T${time}+03:00`);
}

// ─────────────────────────────────────────────
// Temel Slot Hesaplama Fonksiyonu
// ─────────────────────────────────────────────

export interface SlotCalculationInput {
  date: string;               // "YYYY-MM-DD"
  workingHours: DbWorkingHours;
  existingAppointments: Pick<DbAppointment, "starts_at" | "ends_at" | "status">[];
  totalDurationMinutes: number;
  slotIntervalMinutes?: number;
  minBookingBufferMinutes?: number;
}

export interface SlotCalculationResult {
  workStart: string;       // "HH:MM"
  workEnd: string;         // "HH:MM"
  slots: TimeSlot[];
  availableSlots: TimeSlot[];
}

/**
 * Berberin çalışma saatlerini ve mevcut randevularını kullanarak
 * müsait zaman dilimlerini hesaplar.
 *
 * Algoritma:
 * 1. Çalışma saatlerini slotIntervalMinutes aralıklarla böl
 * 2. Her slot için [slot_start, slot_start + totalDuration] aralığının
 *    mevcut randevularla çakışıp çakışmadığını kontrol et
 * 3. Çalışma saati bitimine sığmayan slotları ele
 */
export function calculateAvailableSlots(
  input: SlotCalculationInput
): SlotCalculationResult {
  const {
    date,
    workingHours,
    existingAppointments,
    totalDurationMinutes,
    slotIntervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES,
    minBookingBufferMinutes = 60,
  } = input;

  const workStartMinutes = parseTimeToMinutes(workingHours.start_time);
  const workEndMinutes = parseTimeToMinutes(workingHours.end_time);
  const workStart = formatMinutesToTime(workStartMinutes);
  const workEnd = formatMinutesToTime(workEndMinutes);

  // Aktif randevuların zaman aralıklarını çöz
  const busyRanges = existingAppointments
    .filter((a) => !["cancelled", "no_show"].includes(a.status))
    .map((a) => ({
      start: new Date(a.starts_at).getTime(),
      end: new Date(a.ends_at).getTime(),
    }));

  const slots: TimeSlot[] = [];
  let slotStartMinutes = workStartMinutes;

  // Çalışma saati boyunca tüm olası slotları oluştur
  while (slotStartMinutes + totalDurationMinutes <= workEndMinutes) {
    const slotEndMinutes = slotStartMinutes + totalDurationMinutes;

    const slotStartTime = combineDateAndTime(
      date,
      formatMinutesToTime(slotStartMinutes)
    );
    const slotEndTime = combineDateAndTime(
      date,
      formatMinutesToTime(slotEndMinutes)
    );

    const slotStartMs = slotStartTime.getTime();
    const slotEndMs = slotEndTime.getTime();

    // Dolu mu? → Herhangi bir aktif randevuyla örtüşüyor mu?
    const isOccupied = busyRanges.some(
      (busy) => slotStartMs < busy.end && slotEndMs > busy.start
    );

    // Geçmiş zaman veya çok yakın zaman (seçilen süre + 10 dk sonrası olmalı)
    const isTooEarly = slotStartMs < (Date.now() + (minBookingBufferMinutes + 10) * 60 * 1000);

    slots.push({
      startsAt: slotStartTime.toISOString(),
      endsAt: slotEndTime.toISOString(),
      displayTime: formatMinutesToTime(slotStartMinutes),
      available: !isOccupied && !isTooEarly,
    });

    // Bir sonraki slota geç
    slotStartMinutes += slotIntervalMinutes;
  }

  return {
    workStart,
    workEnd,
    slots,
    availableSlots: slots.filter((s) => s.available),
  };
}

// ─────────────────────────────────────────────
// Hizmet Süresi Hesaplama
// ─────────────────────────────────────────────

/**
 * Seçilen hizmetlerin toplam süresini döndürür.
 * Hizmet bulunamazsa hata fırlatır.
 */
export function calculateTotalDuration(
  services: Array<{ id: string; duration_minutes: number }>,
  selectedServiceIds: string[]
): { totalMinutes: number; foundIds: string[]; missingIds: string[] } {
  const foundIds: string[] = [];
  const missingIds: string[] = [];
  let totalMinutes = 0;

  for (const serviceId of selectedServiceIds) {
    const service = services.find((s) => s.id === serviceId);
    if (service) {
      totalMinutes += service.duration_minutes;
      foundIds.push(serviceId);
    } else {
      missingIds.push(serviceId);
    }
  }

  return { totalMinutes, foundIds, missingIds };
}

/**
 * Seçilen hizmetlerin toplam fiyatını hesaplar.
 * Berber bazlı özel fiyatı varsa onu kullanır.
 */
export function calculateTotalPrice(
  services: Array<{ id: string; price: number }>,
  barberServices: Array<{ service_id: string; custom_price: number | null }>,
  selectedServiceIds: string[]
): number {
  return selectedServiceIds.reduce((total, serviceId) => {
    const barberService = barberServices.find(
      (bs) => bs.service_id === serviceId
    );
    const baseService = services.find((s) => s.id === serviceId);

    if (!baseService) return total;

    // Özel fiyat varsa kullan, yoksa standart fiyatı kullan
    const price = barberService?.custom_price ?? baseService.price;
    return total + price;
  }, 0);
}
