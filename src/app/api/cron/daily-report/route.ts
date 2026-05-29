import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ── Adım 1: Yetkilendirme Kontrolü ──────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Vercel Cron, 'Authorization: Bearer <CRON_SECRET>' başlığı gönderir.
    // Geliştirme ortamında CRON_SECRET ayarlanmamışsa testi kolaylaştırmak için geçişe izin veriyoruz.
    if (process.env.NODE_ENV === "production" || cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { success: false, error: "Yetkisiz erişim. Geçersiz veya eksik Cron Secret." },
          { status: 401 }
        );
      }
    }

    const supabase = createSupabaseAdminClient();

    // ── Adım 2: Dünün Tarihini Hesapla ──────────────────────────
    // Gece 00:00'da çalışacağı için, dünün (yeni biten günün) raporunu almalıyız.
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0]; // "YYYY-MM-DD" formatı

    // ── Adım 3: Aktif Berberleri Çek ────────────────────────────
    const { data: barbers, error: barbersError } = await (supabase
      .from("profiles") as any)
      .select("id, full_name")
      .eq("role", "barber")
      .eq("is_available", true);

    if (barbersError || !barbers) {
      console.error("[CRON Z-Report] Berberler çekilemedi:", barbersError);
      return NextResponse.json(
        { success: false, error: "Berberler yüklenemedi." },
        { status: 500 }
      );
    }

    // ── Adım 4: Her Berber İçin Z-Raporunu Tetikle ──────────────
    const results = [];
    for (const barber of barbers) {
      const { data: reportId, error: rpcError } = await (supabase.rpc as any)(
        "generate_daily_report",
        {
          p_barber_id: barber.id,
          p_date: dateStr,
        }
      );

      if (rpcError) {
        console.error(
          `[CRON Z-Report] ${barber.full_name} için rapor oluşturulamadı:`,
          rpcError
        );
        results.push({
          barberId: barber.id,
          name: barber.full_name,
          success: false,
          error: rpcError.message,
        });
      } else {
        results.push({
          barberId: barber.id,
          name: barber.full_name,
          success: true,
          reportId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Dünün (${dateStr}) Z-raporları başarıyla oluşturuldu/güncellendi.`,
      date: dateStr,
      results,
    });
  } catch (err: any) {
    console.error("[CRON Z-Report] Beklenmeyen hata:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Beklenmeyen hata." },
      { status: 500 }
    );
  }
}
