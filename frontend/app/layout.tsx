import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScaleClip Local",
  description: "Local-first video clipping studio",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
