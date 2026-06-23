"use client";

import { signIn } from "next-auth/react";
import {
  Camera,
  Wand2,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  Star,
  ArrowRight,
  PartyPopper,
} from "lucide-react";
import Footer from "./Footer";
import BeforeAfterSlider from "./BeforeAfterSlider";
import GalleryPreview from "./GalleryPreview";
import { EVENTS } from "@/lib/events";

const EVENT_HOOKS: Record<string, string> = {
  birthday: "Balloon arches, backdrops & themed décor",
  anniversary: "Romantic, elegant celebration setups",
  annaprasan: "Traditional rice-ceremony décor",
  baby_shower: "Sweet, cohesive welcome themes",
};

const STEPS = [
  {
    Icon: Camera,
    title: "Upload a photo",
    desc: "Snap any room or event space — no setup needed.",
  },
  {
    Icon: Wand2,
    title: "AI redesigns it",
    desc: "Get a photorealistic, designer-quality transformation in seconds.",
  },
  {
    Icon: ShoppingBag,
    title: "Shop the exact look",
    desc: "Every item is matched to a real product you can buy instantly.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I uploaded my messy living room and got a design I actually loved — then bought the rug and lamp in one tap.",
    name: "Priya S.",
    role: "Bengaluru",
  },
  {
    quote:
      "Used it for my daughter's first birthday. The decoration plan was gorgeous and I shopped it all from the list.",
    name: "Rahul M.",
    role: "Pune",
  },
  {
    quote:
      "Felt like having an interior designer in my pocket. The before/after genuinely surprised me.",
    name: "Ayesha K.",
    role: "Mumbai",
  },
];

const FAQS = [
  {
    q: "How does it work?",
    a: "Upload a photo of your room or venue. Our AI analyses the space, designs it, generates a realistic preview, and matches every item to a real product you can buy.",
  },
  {
    q: "Are the products real?",
    a: "Yes. Each item in your design links to a real listing with live pricing, so you can recreate the exact look.",
  },
  {
    q: "Can I use it for parties and events?",
    a: "Yes — pick your occasion (birthday, anniversary, annaprasan, baby shower) and a theme, upload the venue photo, and get a shoppable decoration plan.",
  },
  {
    q: "Is my photo private?",
    a: "Your photos are used only to generate your design and are saved to your private profile. We never sell your data.",
  },
  {
    q: "How much does it cost?",
    a: "It's free to start — sign in, design, and explore your results at no charge.",
  },
];

export default function Landing() {
  const go = () => signIn("google");

  return (
    <div className="flex flex-col">
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-hero-glow" />
        <div className="max-w-5xl mx-auto px-5 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-5 backdrop-blur-sm">
              <Sparkles size={13} className="text-orange-700" />
              Designer rooms & event décor — from one photo
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.04] mb-5">
              Redesign your room.
              <br />
              <span className="text-orange-700">Shop the exact look.</span>
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md mb-7">
              Upload a photo and our AI transforms your space into a
              designer-quality room — then finds the exact products to buy it,
              instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={go}
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-all shadow-lg shadow-orange-700/20 hover:shadow-orange-700/30"
              >
                Transform my room — free
                <ArrowRight
                  size={17}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </div>
            <div className="flex items-center gap-4 mt-6 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-orange-700" />
                Free to start
              </span>
              <span className="flex items-center gap-1.5">
                <Star size={14} className="fill-amber-400 text-amber-400" />
                Loved by early users
              </span>
            </div>
          </div>

          {/* Real before → after transformation */}
          <div className="animate-fade-up-delay-1">
            <BeforeAfterSlider
              beforeSrc="/samples/patio-before.jpg"
              afterSrc="/samples/patio-after.png"
              beforeLabel="Before"
              afterLabel="RoomGlow"
            />
            <p className="text-center text-xs text-zinc-400 mt-3">
              ← Drag to see a real transformation
            </p>
          </div>
        </div>
      </section>

      {/* ─── GALLERY (main attraction) ─── */}
      <GalleryPreview />

      {/* ─── HOW IT WORKS ─── */}
      <section className="max-w-5xl mx-auto px-5 py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
            From photo to shoppable design in 3 steps
          </h2>
          <p className="text-zinc-500">No skills, no shopping rabbit holes.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {STEPS.map(({ Icon, title, desc }, i) => (
            <div
              key={title}
              className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
            >
              <span className="absolute top-5 right-5 text-5xl font-semibold text-zinc-100 dark:text-zinc-800 leading-none">
                {i + 1}
              </span>
              <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mb-4">
                <Icon size={20} strokeWidth={1.75} className="text-orange-700" />
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                {title}
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CELEBRATIONS ─── */}
      <section className="bg-white dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 py-16 w-full">
          <div className="text-center max-w-xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium mb-4">
              <PartyPopper size={13} />
              Also for celebrations
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              Planning a celebration? We design that too.
            </h2>
            <p className="text-zinc-500">
              Upload a photo of your venue and get a themed decoration plan —
              balloons, backdrops, lights and more — every item shoppable in one
              tap.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-9">
            {EVENTS.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900 p-5"
              >
                <span className="text-2xl leading-none">{e.icon}</span>
                <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100 mt-3">
                  {e.label}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed mt-1 mb-3">
                  {EVENT_HOOKS[e.id]}
                </p>
                <div className="flex flex-wrap gap-1">
                  {e.subThemes.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] text-zinc-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={go}
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors"
            >
              Plan my event — free
              <ArrowRight
                size={16}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </button>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section className="bg-white dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 py-16 w-full">
          <div className="grid sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900 p-6"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <blockquote className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                  “{t.quote}”
                </blockquote>
                <figcaption className="text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {t.name}
                  </span>
                  <span className="text-zinc-400"> · {t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="max-w-2xl mx-auto px-5 py-16 w-full">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8 text-center">
          Frequently asked
        </h2>
        <div className="space-y-3">
          {FAQS.map((f) => (
            <div
              key={f.q}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1.5">
                {f.q}
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="max-w-5xl mx-auto px-5 pb-20 w-full">
        <div className="relative overflow-hidden rounded-3xl bg-zinc-900 dark:bg-zinc-800 px-8 py-14 text-center">
          <div className="absolute inset-0 -z-0 bg-cta-glow opacity-80" />
          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-3">
              See your room transformed in seconds
            </h2>
            <p className="text-zinc-300 mb-7 max-w-md mx-auto">
              Upload one photo. Get a designer-quality room and the exact
              products to make it real.
            </p>
            <button
              onClick={go}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-medium text-zinc-900 bg-white hover:bg-zinc-100 transition-colors"
            >
              <Camera size={17} />
              Start with a photo — free
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

