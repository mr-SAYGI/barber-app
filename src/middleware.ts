import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          supabaseResponse.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Sadece giriş durumunu ve kimlik kartındaki damgayı oku (Veritabanını yorma)
  const { data: { user } } = await supabase.auth.getUser();

  // Admin paneline girmeye çalışanlar için kural
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      // Giriş yapmamışsa kapıdan çevir
      return NextResponse.redirect(new URL("/login", request.url));
    }
    
    // Kimlik kartındaki rol damgasını kontrol et
    const userRole = user.user_metadata?.role;
    if (userRole !== "admin" && userRole !== "barber") {
       // Admin değilse ana sayfaya şutla
       return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Zaten giriş yapmış bir patron /login sayfasına gelirse onu direkt içeri al
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const userRole = user.user_metadata?.role;
    if (userRole === "admin" || userRole === "barber") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};