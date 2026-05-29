import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Bu endpoint Vercel Cron veya harici bir cron tetikleyici ile
// her gece 00:10'da çalışacak şekilde yapılandırılabilir.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Cron isteğinin yetkisini kontrol et (Opsiyonel ama önerilir)
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // ── 1. Dünün Tarihini Bul ──
    const offset = 3 * 60; // Türkiye saati (+3)
    const now = new Date();
    const turkeyNow = new Date(now.getTime() + offset * 60000);
    turkeyNow.setDate(turkeyNow.getDate() - 1); // dünün verisi

    const yStr = turkeyNow.toISOString().split("T")[0]; // YYYY-MM-DD
    const dateStrForFilename = `${turkeyNow.getDate().toString().padStart(2, '0')}-${(turkeyNow.getMonth()+1).toString().padStart(2, '0')}-${turkeyNow.getFullYear()}`;
    const fileName = `z_raporu_${dateStrForFilename}.csv`;

    // ── 2. Dünün Verilerini Çek ──
    const { data: apps, error: dbErr } = await (supabase
      .from("appointments") as any)
      .select(`
        id, status, total_price, customer_note,
        appointment_services ( services ( name ) )
      `)
      .gte('starts_at', `${yStr}T00:00:00+03:00`)
      .lte('starts_at', `${yStr}T23:59:59+03:00`)
      .eq('status', 'completed');

    if (dbErr) throw new Error(`Veritabanı hatası: ${dbErr.message}`);

    const totalCustomers = apps?.length || 0;
    const totalRevenue = (apps || []).reduce((sum: number, a: any) => sum + (a.total_price || 0), 0);

    const serviceCounts: Record<string, number> = {};
    (apps || []).forEach((a: any) => {
      let hasService = false;
      if (a.appointment_services && a.appointment_services.length > 0) {
        a.appointment_services.forEach((as: any) => {
          const sName = as.services?.name;
          if (sName) {
            serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
            hasService = true;
          }
        });
      }
      
      // Eğer veritabanında hizmet tablosuna bağlı değilse (örn: Manuel randevular)
      if (!hasService && a.customer_note) {
        const match = a.customer_note.match(/Hizmet:\s*([^|]+)/);
        if (match && match[1]) {
          const sName = match[1].trim();
          serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
        }
      }
    });

    const servicesBreakdown = Object.entries(serviceCounts)
      .map(([name, count]) => `${count} ${name}`)
      .join(" + ");

    // ── 3. CSV İçeriğini Hazırla ──
    // UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    let csv = "Tarih,Toplam Müşteri,Toplam Nakit Ciro,Hizmet Kırılımı\n";
    // Tırnak işaretleri arasına alıyoruz ki ayırıcılarla karışmasın
    csv += `"${dateStrForFilename}","${totalCustomers}","${totalRevenue}","${servicesBreakdown}"\n`;
    
    const fileContent = Buffer.from(bom + csv, "utf-8");

    // ── 4. Depolama Kota Kontrolü (Max 62 Dosya) ──
    const bucketName = "z_raporlari";
    
    // Bucket yoksa oluşturmayı dene (Admin client yetkilidir)
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === bucketName)) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }

    const { data: files, error: listErr } = await supabase.storage.from(bucketName).list();
    
    if (listErr) {
      console.warn("Dosyalar listelenemedi:", listErr.message);
    } else if (files) {
      const realFiles = files.filter((f) => f.name.endsWith(".csv"));
      
      if (realFiles.length >= 62) {
        // En eski dosyaları sil, sadece en yeni 61 kalsın (bununla 62 olacak)
        realFiles.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        const toDeleteCount = realFiles.length - 61;
        const filesToDelete = realFiles.slice(0, toDeleteCount).map(f => f.name);
        
        await supabase.storage.from(bucketName).remove(filesToDelete);
        console.log(`[Z-Report Cron] Kota sınırı aşıldı, ${toDeleteCount} adet eski rapor silindi.`);
      }
    }

    // ── 5. CSV'yi Buluta Yükle ──
    const { error: uploadErr } = await supabase.storage.from(bucketName).upload(fileName, fileContent, {
      contentType: "text/csv;charset=utf-8",
      upsert: true,
    });

    if (uploadErr) throw new Error(`Dosya yüklenemedi: ${uploadErr.message}`);

    return NextResponse.json({
      success: true,
      message: "Z raporu başarıyla oluşturuldu ve buluta yüklendi.",
      fileName,
      metrics: {
        totalCustomers,
        totalRevenue,
        servicesBreakdown
      }
    });

  } catch (err: any) {
    console.error("[Z-Report Cron] Hata:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
