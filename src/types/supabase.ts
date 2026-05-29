export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: "customer" | "barber" | "admin"
          full_name: string
          phone: string | null
          avatar_url: string | null
          is_available: boolean
          bio: string | null
          min_booking_buffer: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          role?: "customer" | "barber" | "admin"
          full_name: string
          phone?: string | null
          avatar_url?: string | null
          is_available?: boolean
          bio?: string | null
          min_booking_buffer?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: "customer" | "barber" | "admin"
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          is_available?: boolean
          bio?: string | null
          min_booking_buffer?: number
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          name: string
          description: string | null
          duration_minutes: number
          price: number
          is_active: boolean
          display_order: number
          icon: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          duration_minutes: number
          price: number
          is_active?: boolean
          display_order?: number
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          price?: number
          is_active?: boolean
          display_order?: number
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          customer_id: string
          barber_id: string
          status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
          starts_at: string
          ends_at: string
          total_duration: number
          total_price: number
          customer_note: string | null
          barber_note: string | null
          queue_number: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          barber_id: string
          status?: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
          starts_at: string
          ends_at: string
          total_duration: number
          total_price: number
          customer_note?: string | null
          barber_note?: string | null
          queue_number?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          barber_id?: string
          status?: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
          starts_at?: string
          ends_at?: string
          total_duration?: number
          total_price?: number
          customer_note?: string | null
          barber_note?: string | null
          queue_number?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      appointment_services: {
        Row: {
          id: string
          appointment_id: string
          service_id: string
          price_snapshot: number
          duration_snapshot: number
        }
        Insert: {
          id?: string
          appointment_id: string
          service_id: string
          price_snapshot: number
          duration_snapshot: number
        }
        Update: {
          id?: string
          appointment_id?: string
          service_id?: string
          price_snapshot?: number
          duration_snapshot?: number
        }
      }
      working_hours: {
        Row: {
          id: string
          barber_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_off: boolean
        }
        Insert: {
          id?: string
          barber_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_off?: boolean
        }
        Update: {
          id?: string
          barber_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          is_off?: boolean
        }
      }
      barber_services: {
        Row: {
          barber_id: string
          service_id: string
          custom_price: number | null
        }
        Insert: {
          barber_id: string
          service_id: string
          custom_price?: number | null
        }
        Update: {
          barber_id?: string
          service_id?: string
          custom_price?: number | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_appointment_availability: {
        Args: {
          p_barber_id: string
          p_starts_at: string
          p_ends_at: string
        }
        Returns: unknown
      }
    }
    Enums: {
      user_role: "customer" | "barber" | "admin"
      appointment_status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
