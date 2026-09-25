// The house mark. It appears on every screen — quietly on most, at full
// strength on the result, because that is the frame the customer photographs.

export function Monogram({ className = "h-10 w-auto" }) {
  return (
    <svg viewBox="0 0 200 60" fill="none" className={className} aria-label="Kapadiya and Sons">
      <path
        d="M25 15L25 45M25 30L40 15M28 27L42 45"
        stroke="#C9A961" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="50" cy="30" r="2" fill="#E8D5A8" />
      <path
        d="M58 20C58 16 68 15 68 22C68 30 58 30 58 38C58 45 69 44 69 40"
        stroke="#C9A961" strokeWidth="2" strokeLinecap="round"
      />
      <text
        x="80" y="32" fill="#F5F3EF" fontFamily="Playfair Display, Georgia, serif"
        fontSize="15" letterSpacing="3" fontWeight="500"
      >
        KAPADIYA
      </text>
      <text
        x="80" y="44" fill="#C9A961" fontFamily="Manrope, sans-serif"
        fontSize="7" letterSpacing="4" fontWeight="600"
      >
        SURAT • EST. 1968
      </text>
    </svg>
  );
}

// The quiet version — top-left on working screens. Present, never shouting.
export function BrandMark({ strong = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        className={`inline-block h-[5px] w-[5px] rounded-full bg-champagne ${
          strong ? "" : "soft-pulse"
        }`}
      />
      <span
        className="eyebrow text-champagne"
        style={{ opacity: strong ? 1 : 0.6 }}
      >
        Kapadiya &amp; Sons
      </span>
      {strong && <span className="h-px w-10 bg-champagne/70" />}
    </div>
  );
}
