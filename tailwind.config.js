/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: "#08090B",
        surface: "#14161A",
        raised: "#1E2127",
        "border-subtle": "#23262C",
        champagne: "#C9A961",
        "champagne-light": "#E8D5A8",
        bone: "#F5F3EF",
        muted: "#8A9099",
        confirm: "#2C6B58",
        "on-surface": "#E2E2E8",
        // light side (shop owner)
        paper: "#FAFAF8",
        ink: "#1A1D22",
        "ink-soft": "#6B7280",
        "line-light": "#E8E4DC",
        "accent-light": "#A8853F",
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["64px", { lineHeight: "76px", letterSpacing: "-0.02em", fontWeight: "400" }],
        "display-md": ["40px", { lineHeight: "52px", letterSpacing: "-0.01em", fontWeight: "400" }],
        "headline-lg": ["28px", { lineHeight: "38px", letterSpacing: "0em", fontWeight: "500" }],
        "headline-sm": ["24px", { lineHeight: "32px", letterSpacing: "0em", fontWeight: "500" }],
        "title-md": ["20px", { lineHeight: "28px", letterSpacing: "0.01em", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "0.01em", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "18px", letterSpacing: "0.02em", fontWeight: "400" }],
        eyebrow: ["11px", { lineHeight: "14px", letterSpacing: "0.26em", fontWeight: "600" }],
      },
      borderRadius: { DEFAULT: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.25rem", card: "20px", media: "16px" },
      spacing: {
        "space-xs": "0.375rem",
        "space-sm": "0.75rem",
        "space-md": "1.25rem",
        "space-lg": "2rem",
        "space-xl": "3.5rem",
        gutter: "1.5rem",
        margin: "2.5rem",
      },
      boxShadow: {
        plate: "0 8px 32px rgba(0,0,0,0.45)",
        drawer: "0 16px 48px rgba(0,0,0,0.6)",
        lift: "0 20px 50px rgba(0,0,0,0.7)",
        soft: "0 1px 3px rgba(26,29,34,0.04), 0 8px 24px rgba(26,29,34,0.05)",
      },
    },
  },
  plugins: [],
};
