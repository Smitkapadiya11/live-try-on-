// Fonts are self-hosted, not pulled from Google at runtime.
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "./globals.css";

export const metadata = {
  title: "Kapadiya & Sons — Live Try-On",
  description: "Stand in front of your camera and watch our couture move with you, live. Kapadiya & Sons, Surat.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-void font-body text-body-lg text-on-surface antialiased">{children}</body>
    </html>
  );
}
