"use client";

import { useEffect } from "react";

/**
 * The last line of defence: an error in the root layout itself, where neither
 * the translations nor the theme nor the stylesheet can be counted on. Plain
 * HTML, inline styles, the three languages side by side, and one button that
 * tries again — never the framework's bare error screen.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="tg">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#f6f7f9",
          color: "#14181f",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Хатогии муваққатӣ</p>
          <p style={{ fontSize: 14, margin: "0 0 4px", color: "#4a5361" }}>Временная ошибка · A temporary error</p>
          <p style={{ fontSize: 14, margin: "0 0 20px", color: "#4a5361" }}>
            Лутфан пас аз чанд сония аз нав кӯшиш кунед. · Попробуйте ещё раз через несколько секунд.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 9999,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 600,
              background: "#e3a130",
              color: "#14181f",
              cursor: "pointer",
            }}
          >
            Аз нав · Повторить · Retry
          </button>
          {error.digest ? <p style={{ fontSize: 12, color: "#8a93a3", marginTop: 16 }}>ID: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
