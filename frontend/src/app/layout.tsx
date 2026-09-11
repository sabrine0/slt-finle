import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STLS Hybrid Command Platform",
  description: "Smart Traffic Light System command center for citywide traffic operations.",
};

// Without this, mobile browsers render the page at desktop width and force
// pinch-zoom. The dashboard is desktop-first, but at least the viewport
// should match the device width so flex/grid + responsive Tailwind classes
// behave correctly under DevTools' phone emulator and on real devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#05070a] text-[#f7f3ea] flex flex-col">
        {children}
      </body>
    </html>
  );
}
