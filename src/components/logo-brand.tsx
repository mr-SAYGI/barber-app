"use client";

import React, { useState, useEffect } from "react";
import { Scissors } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function LogoBrand({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full" }) {
  const [logo, setLogo] = useState<string | null>(null);

  const dim =
    size === "sm"
      ? "w-8 h-8 rounded-lg"
      : size === "lg"
      ? "w-14 h-14 rounded-2xl"
      : size === "xl"
      ? "w-20 h-20 rounded-[1.5rem]"
      : size === "2xl"
      ? "w-32 h-32 rounded-[2rem]"
      : size === "full"
      ? "w-full h-full"
      : "w-10 h-10 rounded-xl";
  const iconSize =
    size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : size === "xl" ? "w-10 h-10" : size === "2xl" ? "w-16 h-16" : size === "full" ? "w-32 h-32" : "w-5 h-5";

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const fetchLogo = async () => {
      const { data } = await supabase.from("settings").select("logo_data").limit(1).maybeSingle();
      if (data?.logo_data) {
        setLogo(data.logo_data);
      } else {
        setLogo(null);
      }
    };

    fetchLogo();

    // Dinamik olarak başka sekmeden/sayfadan güncellendiğinde yakalamak istersen Realtime:
    const channel = supabase.channel('logo-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (payload) => {
        if (payload.new.logo_data !== undefined) {
          setLogo(payload.new.logo_data);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div
      className={`${dim} bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20 overflow-hidden shrink-0`}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="Salon logosu" className="w-full h-full object-cover" />
      ) : (
        <Scissors className={`${iconSize} text-slate-950 stroke-[2.5]`} />
      )}
    </div>
  );
}
