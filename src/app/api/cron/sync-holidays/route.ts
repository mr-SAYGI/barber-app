import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════
// CRON: Resmi Tatilleri Nager.Date API'den Senkronize Et
// ═══════════════════════════════════════════════════════════════
// Vercel Cron ile 6 ayda bir tetiklenir.
// Manuel olarak admin arayüzünden de çağrılabilir.
// ═══════════════════════════════════════════════════════════════

interface NagerHoliday {
  date: string;       // "YYYY-MM-DD"
  localName: string;  // Türkçe isim
  name: string;       // İngilizce isim
  countryCode: string;
  fixed: boolean;
  global: boolean;
  types: string[];
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function fetchHolidaysForYear(year: number): Promise<NagerHoliday[]> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/TR`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`[sync-holidays] Nager.Date API hatası (${year}):`, res.status);
    return [];
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  // Güvenlik: Vercel Cron Secret veya admin tetikleme kontrolü
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET tanımlıysa kontrol et, değilse x-manual-trigger header'ını kontrol et
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const isManualTrigger = request.headers.get("x-manual-trigger") === "true";
    if (!isManualTrigger) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = getAdminClient();
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear + 1];

    let totalUpserted = 0;

    for (const year of years) {
      const holidays = await fetchHolidaysForYear(year);

      if (holidays.length === 0) continue;

      for (const h of holidays) {
        // Sadece is_manual=false olan kayıtları güncelle/ekle
        // is_manual=true olanları DOKUNMA
        const { data: existing } = await (supabase.from("holidays") as any)
          .select("id, is_manual")
          .eq("holiday_date", h.date)
          .maybeSingle();

        // Manuel girilen tatili ezmemek için atla
        if (existing?.is_manual) continue;

        if (existing) {
          // Mevcut otomatik kaydı güncelle
          await (supabase.from("holidays") as any)
            .update({
              name: h.localName || h.name,
              is_off: true,
              is_manual: false,
            })
            .eq("id", existing.id);
        } else {
          // Yeni kayıt ekle
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

    console.log(`[sync-holidays] ${totalUpserted} tatil senkronize edildi (${years.join(", ")})`);

    return NextResponse.json({
      success: true,
      count: totalUpserted,
      years,
      message: `${totalUpserted} tatil başarıyla güncellendi.`,
    });
  } catch (error: any) {
    console.error("[sync-holidays] Hata:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
