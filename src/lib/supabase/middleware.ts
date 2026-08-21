import { createServerClient as createSSRClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/messages") ||
    request.nextUrl.pathname.startsWith("/library") ||
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/notifications") ||
    request.nextUrl.pathname.startsWith("/friends") ||
    request.nextUrl.pathname.startsWith("/search");

  if (!user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("users" as never)
      .select("id, status" as never)
      .eq("id" as never, user.id)
      .single();

    const profileRow = profile as Record<string, unknown> | null;

    if (!profileRow) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "noProfile");

      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, {
          ...cookie,
        });
      });
      return redirectResponse;
    }

    const userStatus = profileRow.status as string | undefined;

    if (
      (userStatus === "pending" || userStatus === "rejected") &&
      !request.nextUrl.pathname.startsWith("/pending")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }
  }

  const isPublicAuthRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register" ||
    request.nextUrl.pathname.startsWith("/register/") ||
    request.nextUrl.pathname === "/verify" ||
    request.nextUrl.pathname === "/pending";

  if (user && isPublicAuthRoute) {
    let redirectToDashboard = true;

    if (request.nextUrl.pathname === "/pending") {
      const { data: pendingProfile } = await supabase
        .from("users" as never)
        .select("status" as never)
        .eq("id" as never, user.id)
        .single();

      const pendingRow = pendingProfile as Record<string, unknown> | null;
      const status = pendingRow?.status as string | undefined;

      if (status === "pending" || status === "rejected") {
        redirectToDashboard = false;
      }
    }

    if (redirectToDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
