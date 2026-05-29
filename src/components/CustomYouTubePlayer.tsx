"use client";

import React, { useEffect, useState, useCallback, useTransition, useRef } from "react";
import {
  fetchPlaylistVideos,
  searchYouTubeVideos,
  type YouTubeVideo,
} from "@/app/actions";
import {
  Search,
  Play,
  Loader2,
  ListMusic,
  Music4,
  Volume2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// PROPSlar
// ═══════════════════════════════════════════════════════════════

interface CustomYouTubePlayerProps {
  playlistId?: string;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════

export default function CustomYouTubePlayer({
  playlistId,
  className = "",
}: CustomYouTubePlayerProps) {
  // ── State ──
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Arama ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── İlk yükleme: Playlist videolarını çek ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchPlaylistVideos(playlistId);
      setVideos(data);
      if (data.length > 0) {
        setActiveVideo(data[0]);
      }
      setLoading(false);
    };
    load();
  }, [playlistId]);

  // ── YouTube Arama (Server Action üzerinden, güvenli) ──
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    startTransition(async () => {
      const results = await searchYouTubeVideos(searchQuery);
      setSearchResults(results);
      setIsSearchMode(true);
    });
  };

  const clearSearch = () => {
    setSearchResults([]);
    setSearchQuery("");
    setIsSearchMode(false);
  };

  // ── Video seç ──
  const selectVideo = (video: YouTubeVideo) => {
    setActiveVideo(video);
  };

  // ── Gösterilecek liste ──
  const displayList = isSearchMode ? searchResults : videos;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full w-full gap-4 ${className}`}>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
          style={{ background: "rgba(242,202,80,0.1)", border: "2px solid rgba(242,202,80,0.2)" }}
        >
          <Music4 className="w-8 h-8 text-[#f2ca50]/60" />
        </div>
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#f2ca50]" />
          <span
            className="text-white/50 font-semibold"
            style={{ fontSize: "16px", fontFamily: "Inter, sans-serif" }}
          >
            Playlist yükleniyor...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-row h-full w-full overflow-hidden ${className}`}>

      {/* ══════════════════════════════════════════════════════
          SOL: ANA OYNATICI (Büyük iframe)
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 relative bg-black overflow-hidden" style={{ minWidth: 0 }}>
        {activeVideo ? (
          <>
            <iframe
              key={activeVideo.videoId}
              src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1&rel=0&modestbranding=1`}
              className="absolute inset-0 w-full h-full border-none z-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={activeVideo.title}
            />
            {/* Oynatılıyor bilgisi — alt gradient */}
            <div
              className="absolute bottom-0 left-0 right-0 z-20 px-5 py-3 flex items-center gap-3"
              style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(242,202,80,0.15)" }}
              >
                <Volume2 className="w-3.5 h-3.5 text-[#f2ca50]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold truncate" style={{ fontSize: "13px", fontFamily: "Inter, sans-serif" }}>
                  {activeVideo.title}
                </p>
                <p className="text-white/40 truncate" style={{ fontSize: "11px", fontFamily: "Inter, sans-serif" }}>
                  {activeVideo.channelTitle}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full gap-4"
            style={{ background: "radial-gradient(ellipse at center, rgba(30,25,10,0.95) 0%, rgba(10,10,12,1) 70%)" }}
          >
            <Music4 className="w-16 h-16 text-[#f2ca50]/30" />
            <p className="text-white/30 font-semibold" style={{ fontSize: "18px", fontFamily: "Montserrat, sans-serif" }}>
              Sağ panelden bir video seçin
            </p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          SAĞ: DİKEY ARAMA + VİDEO LİSTESİ
      ══════════════════════════════════════════════════════ */}
      <div
        className="shrink-0 flex flex-col h-full overflow-hidden"
        style={{
          width: "340px",
          background: "rgba(14,15,16,0.96)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderLeft: "1px solid rgba(212,175,55,0.12)",
        }}
      >
        {/* ── Başlık ── */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid rgba(212,175,55,0.08)" }}
        >
          <ListMusic className="w-4 h-4 text-[#f2ca50]/60" />
          <span
            className="font-semibold text-white/50 uppercase tracking-widest flex-1"
            style={{ fontSize: "11px", fontFamily: "Inter, sans-serif" }}
          >
            {isSearchMode ? `Arama Sonuçları` : "Oynatma Listesi"}
          </span>
          {isSearchMode && (
            <button
              onClick={clearSearch}
              className="text-[#f2ca50]/60 hover:text-[#f2ca50] transition-colors font-semibold"
              style={{ fontSize: "11px", fontFamily: "Inter, sans-serif" }}
            >
              ✕ Temizle
            </button>
          )}
        </div>

        {/* ── Arama Çubuğu ── */}
        <div
          className="flex gap-2 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid rgba(212,175,55,0.06)" }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Video ara..."
              className="w-full rounded-lg py-2 pl-8 pr-3 text-xs text-white placeholder-white/20 focus:outline-none"
              style={{
                background: "rgba(40,42,43,0.8)",
                border: "1px solid rgba(77,70,53,0.35)",
                fontFamily: "Inter, sans-serif",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(242,202,80,0.4)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(77,70,53,0.35)")}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isPending || !searchQuery.trim()}
            className="px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-30 flex items-center gap-1 shrink-0"
            style={{
              background: "#f2ca50",
              color: "#3c2f00",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* ── Video Listesi (Dikey Kaydırma) ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 flex flex-col gap-2" style={{ minHeight: 0 }}>
          {/* Yükleniyor */}
          {isPending && (
            <div className="flex items-center justify-center py-10 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#f2ca50]" />
              <span className="text-white/40" style={{ fontFamily: "Inter, sans-serif", fontSize: "13px" }}>
                Aranıyor...
              </span>
            </div>
          )}

          {/* Boş */}
          {!isPending && displayList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-white/25">
              <Music4 className="w-8 h-8" />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "13px" }}>
                {isSearchMode ? "Sonuç bulunamadı" : "Playlist boş"}
              </span>
            </div>
          )}

          {/* Video Kartları */}
          {!isPending &&
            displayList.map((video) => {
              const isActive = activeVideo?.videoId === video.videoId;
              return (
                <button
                  key={video.videoId}
                  onClick={() => selectVideo(video)}
                  className="flex items-start gap-3 rounded-xl p-2 text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.98] group w-full"
                  style={{
                    background: isActive ? "rgba(242,202,80,0.08)" : "rgba(40,42,43,0.5)",
                    border: isActive
                      ? "1px solid rgba(242,202,80,0.4)"
                      : "1px solid rgba(77,70,53,0.15)",
                    boxShadow: isActive ? "0 0 16px rgba(242,202,80,0.08)" : "none",
                  }}
                  title={video.title}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative shrink-0 rounded-lg overflow-hidden"
                    style={{ width: "120px", height: "68px" }}
                  >
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {/* Hover / Active Overlay */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-all ${
                        isActive ? "bg-black/40" : "bg-black/0 group-hover:bg-black/40"
                      }`}
                    >
                      {isActive ? (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(242,202,80,0.9)" }}
                        >
                          <Volume2 className="w-4 h-4 text-[#3c2f00]" />
                        </div>
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: "rgba(242,202,80,0.85)" }}
                        >
                          <Play className="w-4 h-4 text-[#3c2f00] ml-0.5" />
                        </div>
                      )}
                    </div>

                    {/* Oynatılıyor etiketi */}
                    {isActive && (
                      <div
                        className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                        style={{
                          background: "rgba(242,202,80,0.9)",
                          color: "#3c2f00",
                          fontFamily: "Inter, sans-serif",
                        }}
                      >
                        ▶ Çalıyor
                      </div>
                    )}
                  </div>

                  {/* Bilgi */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <p
                      className={`font-semibold line-clamp-2 leading-snug ${isActive ? "text-[#f2ca50]" : "text-white"}`}
                      style={{ fontSize: "12px", fontFamily: "Inter, sans-serif" }}
                    >
                      {video.title}
                    </p>
                    <p
                      className="text-white/35 line-clamp-1 mt-1"
                      style={{ fontSize: "10px", fontFamily: "Inter, sans-serif" }}
                    >
                      {video.channelTitle}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
