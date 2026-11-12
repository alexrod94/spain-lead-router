import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Leads España · Hispanic Nomad",
  description: "Leads de personas que quieren mudarse a España, para empresas de reubicación.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
