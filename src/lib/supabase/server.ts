// ============================================================
// src/lib/supabase/server.ts
// Supabase — Server-Side Client (API Route'larda kullanılır)
// ============================================================
//
// Server Component ve API Route'larında request başına yeni
// bir client instance oluşturulur; böylece auth cookie'leri
// izole kalır ve kullanıcı oturumları birbirine karışmaz.
//
// Bağımlılık: @supabase/ssr
//   npm install @supabase/ssr @supabase/supabase-js
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase"; // Supabase CLI ile üretilecek tip

/**
 * Kimlik doğrulama gerektiren API route'larında kullanılır.
 * Cookie'leri okur ve kullanıcı oturumunu devam ettirir.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component içinden çağrıldığında set işlemi
            // başarısız olabilir — bu beklenen bir durumdur.
          }
        },
      },
    }
  );
}

/**
 * RLS'yi bypass eden admin işlemleri için service role client.
 * SADECE sunucu tarafında ve güvenli ortamlarda kullanılmalı.
 * ⚠️ Bu anahtarı asla client-side'a sızdırmayın!
 */
export function createSupabaseAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // .env.local'de tutulmalı
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false },
    }
  );
}
