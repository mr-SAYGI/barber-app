// ============================================================
// src/types/appointment.ts
// Berber Randevu Sistemi — Merkezi TypeScript Tip Tanımları
// ============================================================

// ─────────────────────────────────────────────
// Enum Tipleri (veritabanı enum'larıyla eşleşir)
// ─────────────────────────────────────────────

export type UserRole = "customer" | "barber" | "admin";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

// ─────────────────────────────────────────────
// Veritabanı Satır Tipleri (ham DB kayıtları)
// ─────────────────────────────────────────────

export interface DbProfile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_available: boolean;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  display_order: number;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAppointment {
  id: string;
  customer_id: string;
  barber_id: string;
  status: AppointmentStatus;
  starts_at: string; // ISO 8601
  ends_at: string; // ISO 8601
  total_duration: number; // dakika
  total_price: number;
  customer_note: string | null;
  barber_note: string | null;
  queue_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbAppointmentService {
  id: string;
  appointment_id: string;
  service_id: string;
  price_snapshot: number;
  duration_snapshot: number;
}

export interface DbWorkingHours {
  id: string;
  barber_id: string;
  day_of_week: number; // 0 = Pazar, 6 = Cumartesi
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"
  is_off: boolean;
}

// ─────────────────────────────────────────────
// GET /api/appointments/available-slots
// ─────────────────────────────────────────────

/** Query parametreleri */
export interface AvailableSlotsQuery {
  /** Berber UUID */
  barberId: string;
  /** Tarih: YYYY-MM-DD formatında */
  date: string;
  /** Seçilen hizmetlerin UUID listesi (virgülle ayrılmış) */
  serviceIds: string;
}

/** Tek bir zaman dilimi */
export interface TimeSlot {
  /** Slot başlangıç zamanı — ISO 8601 */
  startsAt: string;
  /** Slot bitiş zamanı — ISO 8601 */
  endsAt: string;
  /** "09:00" formatında gösterim */
  displayTime: string;
  /** Bu slot müsait mi? */
  available: boolean;
}

/** GET endpoint başarılı yanıt */
export interface AvailableSlotsResponse {
  barberId: string;
  date: string;
  /** Toplam hizmet süresi (dk) */
  totalDuration: number;
  /** Çalışma saatleri başlangıcı ("09:00") */
  workStart: string;
  /** Çalışma saatleri bitişi ("18:00") */
  workEnd: string;
  /** Tüm slotlar (müsait + dolu) */
  slots: TimeSlot[];
  /** Sadece müsait slotlar */
  availableSlots: TimeSlot[];
}

// ─────────────────────────────────────────────
// POST /api/appointments
// ─────────────────────────────────────────────

/** POST body */
export interface CreateAppointmentRequest {
  /** Berber UUID */
  barberId: string;
  /** Başlangıç zamanı — ISO 8601 */
  startsAt: string;
  /** Seçilen hizmet UUID listesi (en az 1) */
  serviceIds: string[];
  /** Müşteri notu (opsiyonel) */
  customerNote?: string;
}

/** Oluşturulan randevunun özet bilgisi */
export interface CreatedAppointment {
  id: string;
  status: AppointmentStatus;
  queueNumber: number | null;
  startsAt: string;
  endsAt: string;
  totalDuration: number;
  totalPrice: number;
  barber: Pick<DbProfile, "id" | "full_name" | "avatar_url">;
  services: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    price: number;
    icon: string | null;
  }>;
}

/** POST endpoint başarılı yanıt */
export interface CreateAppointmentResponse {
  success: true;
  appointment: CreatedAppointment;
  message: string;
}

// ─────────────────────────────────────────────
// Genel API Hata Yanıtı
// ─────────────────────────────────────────────

export type ApiErrorCode =
  | "VALIDATION_ERROR"       // Eksik/geçersiz parametreler
  | "CONFLICT"               // Randevu çakışması
  | "BARBER_NOT_FOUND"       // Berber bulunamadı
  | "BARBER_UNAVAILABLE"     // Berber müsait değil
  | "SERVICE_NOT_FOUND"      // Hizmet bulunamadı
  | "WORKING_HOURS_CLOSED"   // Çalışma saatleri dışı
  | "UNAUTHORIZED"           // Kimlik doğrulama gerekli
  | "FORBIDDEN"              // Yetki yok
  | "INTERNAL_ERROR";        // Sunucu hatası

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Validation hataları için alan bazlı detay */
    details?: Record<string, string>;
    /** Çakışma durumunda mevcut randevu bilgisi */
    conflictingAppointment?: {
      startsAt: string;
      endsAt: string;
    };
  };
}

/** Tip güvenli API yanıt birleşimi */
export type ApiResponse<T> = T | ApiErrorResponse;

// ─────────────────────────────────────────────
// Yardımcı Tipler
// ─────────────────────────────────────────────

/** Supabase check_appointment_availability() fonksiyon yanıtı */
export interface AvailabilityCheckResult {
  is_available: boolean;
  conflict_count: number;
  conflict_ids: string[] | null;
}
