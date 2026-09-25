import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { GARMENTS } from "@/lib/catalogue";

const STEPS = [
  { n: "01", title: "Turn on your camera", body: "Stand where your head and shoulders fit the outline. We guide you in." },
  { n: "02", title: "Tap a garment", body: "A scan sweeps over you while the look is tailored to your body." },
  { n: "03", title: "Move. It moves with you", body: "Turn, raise your arms, switch outfits or colours without stopping." },
];

export default function Home() {
  const rail = GARMENTS.slice(0, 12);
  return (
    <main className="min-h-[100dvh] bg-void text-bone">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <BrandMark />
        <Link href="/live" className="eyebrow text-champagne hover:text-champagne-light">
          Open fitting room →
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-14">
        <div className="fade-up">
          <p className="eyebrow mb-5 flex items-center gap-2 text-champagne">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e5484d] soft-pulse" /> Live try-on
          </p>
          <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-display-lg">
            See it on you.
            <br />
            <span className="text-champagne">Live, in motion.</span>
          </h1>
          <p className="mt-6 max-w-md text-body-lg text-muted">
            Our live fitting room dresses you in Kapadiya couture on your own camera, in real time. Turn around, move
            your arms — the sherwani moves with you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/live" className="btn-primary">
              Start live fitting
            </Link>
            <a href="#how" className="btn-ghost">
              How it works
            </a>
          </div>
          <p className="mt-5 text-body-sm text-muted">
            Works on phone and laptop · Nothing is recorded · Video is processed only while the fitting room is open
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-border-subtle bg-surface shadow-lift">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/boutique.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
            <div className="hero-scan absolute inset-x-0 h-24" />
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-5">
              <div>
                <p className="eyebrow text-champagne">Now fitting</p>
                <p className="mt-1 font-display text-headline-sm">Paisley Sherwani</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-bone backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e5484d]" /> Live
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border-subtle bg-surface/40 py-6">
        <div className="flex gap-3 overflow-x-auto px-5 sm:px-8">
          {rail.map((g) => (
            <Link
              key={g.id}
              href={`/live?g=${g.id}`}
              className="group relative w-32 shrink-0 overflow-hidden rounded-media border border-border-subtle bg-bone"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.image} alt={g.name} loading="lazy" className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-[11px] font-semibold text-bone">
                {g.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <p className="eyebrow text-champagne">How it works</p>
        <h2 className="mt-3 font-display text-display-md">Three steps. No waiting room.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-card border border-border-subtle bg-surface p-6">
              <p className="font-display text-headline-lg text-champagne">{s.n}</p>
              <p className="mt-4 text-title-md text-bone">{s.title}</p>
              <p className="mt-2 text-body-sm text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-card border border-champagne/30 bg-gradient-to-br from-raised to-surface p-8 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-headline-sm">Ready when you are.</p>
            <p className="mt-1 text-body-sm text-muted">Best in good light, standing about an arm&apos;s length from the camera.</p>
          </div>
          <Link href="/live" className="btn-primary">
            Open the fitting room
          </Link>
        </div>
      </section>

      <footer className="border-t border-border-subtle px-5 py-8 text-center text-body-sm text-muted sm:px-8">
        Kapadiya &amp; Sons · Surat · Live try-on is an AI preview — colours and fit may differ from the garment.
      </footer>
    </main>
  );
}
