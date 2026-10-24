import Link from "next/link";
import { HeroActions, MirrorCta, StylistCta } from "@/components/home/HeroActions";
import ProductCard from "@/components/shop/ProductCard";
import ProductImage from "@/components/shop/ProductImage";
import { Icon } from "@/components/ui/Icon";
import { catalog, heroPhotos as P } from "@/lib/catalog";
import { CATEGORIES } from "@/lib/types";

const newIn = [...catalog.filter((p) => p.badge === "New"), ...catalog.filter((p) => !p.badge)].slice(0, 8);
const bestsellers = catalog.filter((p) => p.badge === "Bestseller" || p.badge === "Limited").slice(0, 4);
const dresses = catalog.filter((p) => p.category === "dresses").slice(0, 4);
const coverFor = (c: string) => catalog.find((p) => p.category === c && p.modelImageUrl) ?? catalog.find((p) => p.category === c)!;

/* eslint-disable @next/next/no-img-element */
export default function Home() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative h-[100svh] min-h-[640px] overflow-hidden bg-ink text-white">
        <img src={P.hero} alt="" className="kenburns absolute inset-0 h-full w-full object-cover object-[60%_30%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
        <div className="shell relative flex h-full flex-col justify-end pb-16 sm:pb-24">
          <p className="nav-link text-white/85">New season · The live fitting room</p>
          <h1 className="display mt-5 max-w-4xl text-[clamp(56px,9vw,152px)] leading-[0.85]">Wear it before<br />you buy it.</h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/85">Browse the collection and see every piece on you, live on camera. Swap outfits in a tap. A stylist double-checks the fit.</p>
          <div className="mt-9"><HeroActions /></div>
        </div>
        <div className="absolute bottom-6 right-6 hidden items-center gap-3 border border-white/20 bg-black/30 p-2 pr-4 text-white backdrop-blur-md md:flex">
          <img src={catalog[11].modelImageUrl ?? catalog[11].imageUrl} alt="" className="h-14 w-11 object-cover" />
          <div className="text-xs leading-tight">
            <p className="font-semibold">{catalog[11].name}</p>
            <p className="text-white/70">Try it on live →</p>
          </div>
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────── */}
      <section className="shell pt-16">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="display text-[clamp(28px,3vw,40px)] leading-none">Shop by category</h2>
          <Link href="/shop" className="nav-link link-underline">Shop all</Link>
        </div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
          {CATEGORIES.map((c) => {
            const p = coverFor(c.key);
            return (
              <Link key={c.key} href={`/shop?c=${c.key}`} className="group relative w-[58vw] shrink-0 snap-start overflow-hidden sm:w-auto">
                <div className="relative aspect-[3/4] overflow-hidden bg-cloud">
                  <ProductImage product={p} variant="model" className="transition duration-[1.2s] ease-out group-hover:scale-[1.06]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
                    <div>
                      <p className="text-lg font-medium leading-tight">{c.label}</p>
                      <p className="text-xs text-white/75">{c.blurb}</p>
                    </div>
                    <span className="grid h-8 w-8 place-items-center bg-white text-ink transition group-hover:translate-x-0.5"><Icon name="arrow" size={14} /></span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── New in ─────────────────────────────────────────── */}
      <section className="shell pt-24">
        <SectionHead eyebrow="Just landed" title="New in" sub="Hover any piece and tap Try on. It appears on you in the Live Mirror, and the camera keeps running while you browse." href="/shop?sort=new" cta="View all" />
        <div className="mt-8 grid grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
          {newIn.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
        </div>
      </section>

      {/* ── Live Mirror feature ────────────────────────────── */}
      <section className="pt-28">
        <div className="grid bg-ink text-white lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden lg:aspect-auto lg:min-h-[680px]">
            <img src={P.yellow} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <span className="chip chip-dark absolute left-5 top-5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE · AI try-on</span>
            {/* floating "now wearing" card */}
            <div className="absolute bottom-6 left-6 right-6 flex max-w-sm items-center gap-3 bg-white p-2.5 pr-4 text-ink shadow-2xl">
              <img src={catalog[0].modelImageUrl} alt="" className="h-16 w-12 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.12em] text-mute">Now wearing</p>
                <p className="truncate text-sm font-semibold">{catalog[0].name}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.1em]">Swap →</span>
            </div>
          </div>
          <div className="flex flex-col justify-center px-6 py-16 sm:px-14 lg:px-20">
            <p className="eyebrow text-white/55">The Live Mirror</p>
            <h2 className="display mt-4 text-[clamp(40px,5vw,76px)] leading-[0.92]">Your camera is<br />the fitting room.</h2>
            <ol className="mt-10 grid gap-0 text-[15px] text-white/75">
              {[
                ["Start once", "Open the mirror and allow your camera. It stays live as you browse the whole store."],
                ["Swap instantly", "Tap Try on on any product and the outfit changes on you in real time, powered by Decart."],
                ["Buy with confidence", "Ask a stylist for a second opinion. A person checks every recommendation."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-6 border-t border-white/15 py-5">
                  <span className="text-sm font-semibold tabular-nums text-white/40">0{i + 1}</span>
                  <span><b className="font-semibold text-white">{t}.</b> {d}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8"><MirrorCta /></div>
            <p className="mt-4 text-xs text-white/45">Live AI try-on streams your camera to Decart to generate the result. We don&apos;t record it.</p>
          </div>
        </div>
      </section>

      {/* ── Bestsellers ────────────────────────────────────── */}
      <section className="shell pt-24">
        <SectionHead eyebrow="Loved most" title="Bestsellers" href="/shop" cta="Shop all" />
        <div className="mt-8 grid grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-4 lg:grid-cols-4">
          {bestsellers.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Editorial split ────────────────────────────────── */}
      <section className="shell grid gap-2 pt-24 md:grid-cols-2">
        {[
          { src: P.stripes, title: "The weekend edit", sub: "Easy pieces for days off", href: "/shop?c=dresses", pos: "50% 20%" },
          { src: P.shirts, title: "Shirt season", sub: "Oxford, poplin, flannel", href: "/shop?c=shirts", pos: "50% 50%" },
        ].map((b) => (
          <Link key={b.title} href={b.href} className="group relative aspect-[4/5] overflow-hidden bg-cloud md:aspect-[5/6]">
            <img src={b.src} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-[1.4s] ease-out group-hover:scale-[1.04]" style={{ objectPosition: b.pos }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
              <h3 className="display text-[clamp(34px,4vw,60px)] leading-none">{b.title}</h3>
              <p className="mt-2 text-sm text-white/80">{b.sub}</p>
              <span className="nav-link mt-6 inline-flex items-center gap-2 border-b border-white pb-1">Shop now <Icon name="arrow" size={14} /></span>
            </div>
          </Link>
        ))}
      </section>

      {/* ── Occasion rail ──────────────────────────────────── */}
      <section className="shell pt-24">
        <SectionHead eyebrow="Wedding season" title="Dresses for every invite" href="/shop?c=dresses" cta="Shop dresses" />
        <div className="mt-8 grid grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-4 lg:grid-cols-4">
          {dresses.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Agents ─────────────────────────────────────────── */}
      <section className="shell pt-28">
        <div className="grid gap-12 border-y hairline py-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow flex items-center gap-2"><Icon name="sparkle" size={12} className="text-accent" /> Powered by AgenticOrg</p>
            <h2 className="display mt-4 text-[clamp(36px,4.4vw,64px)] leading-[0.95]">Styled by agents.<br /><span className="text-mute">Approved by people.</span></h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-2">AI agents find your look, check your order and handle returns. Anything that touches your money or your fit is signed off by a real person first.</p>
            <StylistCta className="mt-8" />
          </div>
          <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
            {[
              ["AI Stylist", "Finds looks for your occasion and budget, then lets you try them on instantly."],
              ["Fit Advisor", "Drafts size advice from your question; a human stylist confirms it."],
              ["Order Guardian", "Screens every order. A team member approves it before payment."],
              ["Returns Desk", "Assesses refunds. A person approves before money moves."],
            ].map(([t, d]) => (
              <div key={t} className="bg-white p-7">
                <p className="font-semibold">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-mute">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Store banner ───────────────────────────────────── */}
      <section className="shell pt-24">
        <div className="relative overflow-hidden bg-ink text-white">
          <img src={P.store} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
          <div className="relative flex flex-col items-start gap-6 px-6 py-20 sm:px-14 lg:flex-row lg:items-end lg:justify-between lg:py-28">
            <div>
              <p className="nav-link text-white/75">Members get more</p>
              <h2 className="display mt-3 text-[clamp(36px,5vw,72px)] leading-[0.92]">Free delivery over ₹1,999.<br />15-day returns.</h2>
            </div>
            <Link href="/shop" className="btn h-12 bg-white px-8 text-ink hover:bg-white/85">Start shopping</Link>
          </div>
        </div>
      </section>

      {/* ── Service row ────────────────────────────────────── */}
      <section className="shell pt-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["truck", "Free delivery", "On orders over ₹1,999"],
            ["return", "15-day returns", "Checked and refunded fast"],
            ["shield", "Secure payments", "UPI, cards and netbanking via Pine Labs"],
            ["mirror", "Live try-on", "On every product, on every page"],
          ].map(([i, t, d]) => (
            <div key={t} className="flex items-start gap-4">
              <Icon name={i as "truck"} size={22} strokeWidth={1.5} />
              <div><p className="text-sm font-semibold">{t}</p><p className="mt-0.5 text-sm text-mute">{d}</p></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function SectionHead({ eyebrow, title, sub, href, cta }: { eyebrow?: string; title: string; sub?: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="display text-[clamp(32px,3.6vw,52px)] leading-none">{title}</h2>
        {sub && <p className="mt-3 max-w-lg text-sm text-mute">{sub}</p>}
      </div>
      <Link href={href} className="nav-link link-underline">{cta}</Link>
    </div>
  );
}
