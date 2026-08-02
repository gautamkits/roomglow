"use client";

/**
 * Photo-first stepped intake (create_v2).
 *
 * The v1 panel put a three-field chip cascade in front of the uploader — the
 * upload control was literally replaced by "Pick an occasion, theme & colors
 * above to upload your photo" until all three were set. That asks for
 * commitment before showing any value, on mobile, to ad traffic.
 *
 * Here the photo comes second (after only a single mode tap, which is skipped
 * entirely on a ?mode= deep-link), and the occasion questions come after it —
 * one question per screen, auto-advancing, with real defaults pre-selected so
 * the flow is completable without deliberating over every field.
 *
 * v1 lives on in SetupPanel.tsx and is still selected when the create_v2 flag
 * is off, so this is revertible from /admin without a deploy.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Sofa,
  PartyPopper,
  Sparkles,
  Camera,
  Check,
  ChevronLeft,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { getEvent, getEvents, getUpcomingSeasonalEvents } from "@/lib/events";
import type { AppMode, EventConfig, MakeoverConfig } from "@/lib/types";
import { MAKEOVER_STYLES } from "@/lib/makeover";
import { useLocale } from "@/lib/useLocale";
import { trackFunnel } from "@/lib/analytics";
import ImageUpload from "./ImageUpload";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import Field from "./ui/Field";
import StickyBar from "./ui/StickyBar";

interface Props {
  onImageSelected: (
    base64: string,
    mode: AppMode,
    eventConfig: EventConfig | null,
    maxBudget?: number,
    makeoverConfig?: MakeoverConfig | null,
    noBudget?: boolean
  ) => void;
  /** Resolved by CreateSetup so the mode list doesn't reflow after mount. */
  makeoverEnabled?: boolean;
}

type Step = "mode" | "photo" | "occasion" | "details";

const MODES = [
  {
    id: "space" as const,
    Icon: Sofa,
    label: "Redesign a room",
    blurb: "Restyle any space and shop the look",
  },
  {
    id: "event" as const,
    Icon: PartyPopper,
    label: "Plan an event",
    blurb: "Decorate a venue for the occasion",
  },
  {
    id: "makeover" as const,
    Icon: Sparkles,
    label: "Restyle yourself",
    blurb: "Try a new look, head to toe",
  },
];

const PHOTO_TIPS: Record<AppMode, string[]> = {
  space: [
    "Fit the whole space in one frame",
    "Good, even lighting — daytime is best",
    "Declutter first for a cleaner result",
  ],
  event: [
    "Fit the whole venue in one frame",
    "Good, even lighting — daytime is best",
    "Include the wall or table you want decorated",
  ],
  makeover: [
    "Full-body or waist-up, facing the camera",
    "Good, even lighting — plain background works best",
    "Keep your face clearly visible",
  ],
};

export default function SetupPanelV2({
  onImageSelected,
  makeoverEnabled = false,
}: Props) {
  const { locale, budgetMin, budgetMax, budgetStep, formatBudget } = useLocale();
  const events = useMemo(() => getEvents(locale), [locale]);

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<AppMode>("space");
  const [photo, setPhoto] = useState<string | null>(null);

  const [eventId, setEventId] = useState<string | null>(null);
  const [subTheme, setSubTheme] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<string | null>(null);
  const [honoree, setHonoree] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [gender, setGender] = useState<string | null>(null);

  const [makeoverStyleId, setMakeoverStyleId] = useState<string | null>(null);
  const [makeoverGender, setMakeoverGender] = useState<string | null>(null);

  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [budgetMode, setBudgetMode] = useState<"auto" | "unlimited" | "custom">("auto");
  const [maxBudget, setMaxBudget] = useState(budgetMin * 5);

  // budgetMin is locale-derived and corrects after mount; v1 computed the
  // initial cap once from the SSR default and never re-synced.
  useEffect(() => {
    setMaxBudget((c) => (c === 0 ? budgetMin * 5 : c));
  }, [budgetMin]);

  // A ?mode= deep-link from the home tiles already answers the mode question,
  // so skip straight to the photo.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "space" || m === "event" || m === "makeover") {
      setMode(m);
      setStep("photo");
    }
    trackFunnel("setup_started", { mode: m || "space" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const event = eventId ? getEvent(eventId) : undefined;

  // The occasion list is ~13 chips in one wrapped block in v1. Lead with what's
  // seasonally imminent, then evergreen, and hide the tail behind an expander.
  const suggestedEvents = useMemo(() => {
    const soon = getUpcomingSeasonalEvents(locale)
      .slice(0, 3)
      .map(({ event: e }) => e);
    const evergreen = events.filter((e) => !e.season).slice(0, 4);
    const seen = new Set<string>();
    return [...soon, ...evergreen].filter((e) =>
      seen.has(e.id) ? false : (seen.add(e.id), true)
    );
  }, [events, locale]);

  const visibleEvents = showAllEvents ? events : suggestedEvents;

  function pickEvent(id: string) {
    const def = getEvent(id);
    setEventId(id);
    // Pre-select the leading theme/colour rather than leaving them null, so the
    // next screen is a confirmation rather than two more mandatory decisions.
    setSubTheme(def?.subThemes[0] ?? null);
    setColorScheme(def?.colorSchemes[0] ?? null);
    setGender(null);
    setHonoree("");
    setEventDate("");
    trackFunnel("occasion_selected", { event: id });
    setStep("details"); // auto-advance — no Next button
  }

  function handlePhoto(base64: string) {
    setPhoto(base64);
    trackFunnel("photo_selected", { mode });
    if (mode === "event") setStep("occasion");
    else setStep("details");
  }

  function buildEventConfig(): EventConfig | null {
    if (mode !== "event" || !event || !subTheme || !colorScheme) return null;
    return {
      eventType: event.id,
      eventLabel: event.label,
      subTheme,
      colorScheme,
      honoree:
        (!event.season || event.askHonoree) && honoree.trim()
          ? honoree.trim()
          : undefined,
      eventDate: !event.season && eventDate ? eventDate : undefined,
      gender: event.gendered && gender ? gender : undefined,
    };
  }

  function buildMakeoverConfig(): MakeoverConfig | null {
    if (mode !== "makeover" || !makeoverStyleId) return null;
    const style = MAKEOVER_STYLES.find((s) => s.id === makeoverStyleId);
    if (!style) return null;
    return {
      styleType: style.id,
      styleLabel: style.label,
      gender: makeoverGender || undefined,
    };
  }

  function submit() {
    if (!photo) return;
    onImageSelected(
      photo,
      mode,
      buildEventConfig(),
      budgetMode === "custom" ? maxBudget : undefined,
      buildMakeoverConfig(),
      budgetMode === "unlimited"
    );
  }

  const canSubmit =
    !!photo &&
    (mode !== "event" || (!!event && !!subTheme && !!colorScheme)) &&
    (mode !== "makeover" || !!makeoverStyleId);

  const back = () => {
    if (step === "details") setStep(mode === "event" ? "occasion" : "photo");
    else if (step === "occasion") setStep("photo");
    else if (step === "photo") setStep("mode");
  };

  const stepIndex = ["mode", "photo", "occasion", "details"].indexOf(step);
  const totalSteps = mode === "event" ? 4 : 3;
  const shownIndex = mode === "event" ? stepIndex : Math.min(stepIndex, 2);

  return (
    <div className="flex flex-col min-h-[60dvh]">
      {/* Header: back + progress dots */}
      <div className="flex items-center gap-3 mb-4 min-h-8">
        {step !== "mode" && (
          <button
            onClick={back}
            aria-label="Back"
            className="w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === shownIndex
                  ? "w-6 bg-orange-700"
                  : i < shownIndex
                    ? "w-1.5 bg-orange-300"
                    : "w-1.5 bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1">
        {/* ── Step 1: what are we designing ── */}
        {step === "mode" && (
          <div className="animate-fade-up">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              What are we designing?
            </h2>
            <p className="text-sm text-zinc-500 mb-4">
              One photo is all it takes.
            </p>
            {/* Reserve all three rows so resolving /api/features doesn't reflow
                the layout under the user's thumb. */}
            <div className="grid gap-2.5">
              {MODES.map(({ id, Icon, label, blurb }) => {
                if (id === "makeover" && !makeoverEnabled) return null;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setMode(id);
                      setStep("photo");
                    }}
                    className="flex items-center gap-3.5 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left hover:border-orange-700 transition-colors"
                  >
                    <span className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                      <Icon size={20} strokeWidth={1.75} className="text-orange-700 dark:text-orange-400" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {label}
                      </span>
                      <span className="block text-xs text-zinc-500">{blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: the photo ── */}
        {step === "photo" && (
          <div className="animate-fade-up">
            {/* Each string is one expression rather than text interleaved with
                a conditional — the interleaved form silently dropped the space
                around the substitution ("read the roomand design"). */}
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              {mode === "makeover"
                ? "Add your photo"
                : mode === "event"
                  ? "Add a photo of the venue"
                  : "Add a photo of the space"}
            </h2>
            <p className="text-sm text-zinc-500 mb-4">
              {mode === "makeover"
                ? "We'll read your look and style around it."
                : mode === "event"
                  ? "We'll read the venue and decorate around what's already there."
                  : "We'll read the room and design around what's already there."}
            </p>
            <ImageUpload onImageSelected={handlePhoto} />
            <ul className="mt-4 space-y-1.5">
              {PHOTO_TIPS[mode].map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed"
                >
                  <Check size={13} className="text-orange-700 mt-0.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Step 3 (event only): the occasion ── */}
        {step === "occasion" && (
          <div className="animate-fade-up">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              What&apos;s the occasion?
            </h2>
            <p className="text-sm text-zinc-500 mb-4">
              Tap one — we&apos;ll suggest a theme you can change.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {visibleEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => pickEvent(e.id)}
                  className="flex items-center gap-2 px-3.5 min-h-14 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left text-sm text-zinc-800 dark:text-zinc-200 hover:border-orange-700 transition-colors"
                >
                  <span className="text-lg shrink-0">{e.icon}</span>
                  <span className="min-w-0 leading-tight">{e.label}</span>
                </button>
              ))}
            </div>
            {!showAllEvents && events.length > visibleEvents.length && (
              <button
                onClick={() => setShowAllEvents(true)}
                className="mt-3 inline-flex items-center gap-1 text-sm text-orange-700 font-medium"
              >
                More occasions
                <ChevronDown size={15} />
              </button>
            )}
          </div>
        )}

        {/* ── Step 4: confirm the details ── */}
        {step === "details" && (
          <div className="animate-fade-up space-y-5">
            {mode === "event" && event && (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                    {event.label} — how should it look?
                  </h2>
                  <p className="text-sm text-zinc-500">
                    We&apos;ve picked a popular combination. Change anything you like.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Theme</p>
                  <div className="flex flex-wrap gap-2">
                    {event.subThemes.map((t) => (
                      <Chip key={t} label={t} selected={subTheme === t} onClick={() => setSubTheme(t)} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Colours</p>
                  <div className="flex flex-wrap gap-2">
                    {event.colorSchemes.map((c) => (
                      <Chip key={c} label={c} selected={colorScheme === c} onClick={() => setColorScheme(c)} />
                    ))}
                  </div>
                </div>

                {/* Genuinely optional — collapsed so it doesn't lengthen the
                    screen for the majority who skip it. */}
                <button
                  onClick={() => setShowExtras((v) => !v)}
                  className="inline-flex items-center gap-1 text-sm text-orange-700 font-medium"
                >
                  {showExtras ? "Hide details" : "Add details (optional)"}
                  <ChevronDown
                    size={15}
                    className={`transition-transform ${showExtras ? "rotate-180" : ""}`}
                  />
                </button>
                {showExtras && (
                  <div className="space-y-4 animate-fade-up">
                    {event.gendered && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">For a</p>
                        <div className="flex flex-wrap gap-2">
                          {["Boy", "Girl", "Either / neutral"].map((g) => (
                            <Chip
                              key={g}
                              label={g}
                              selected={gender === g}
                              onClick={() => setGender(gender === g ? null : g)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {(!event.season || event.askHonoree) && (
                      <Field
                        label="Who's it for?"
                        value={honoree}
                        onChange={(e) => setHonoree(e.target.value)}
                        placeholder="Name (optional)"
                        autoComplete="off"
                        enterKeyHint="done"
                        maxLength={60}
                      />
                    )}
                    {!event.season && (
                      <Field
                        label="Event date"
                        type="date"
                        value={eventDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setEventDate(e.target.value)}
                        icon={<Calendar size={15} />}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {mode === "makeover" && (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                    Pick your look
                  </h2>
                  <p className="text-sm text-zinc-500">We&apos;ll style you head to toe.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MAKEOVER_STYLES.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.label}
                      icon={<span>{s.icon}</span>}
                      selected={makeoverStyleId === s.id}
                      onClick={() => setMakeoverStyleId(s.id)}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setShowExtras((v) => !v)}
                  className="inline-flex items-center gap-1 text-sm text-orange-700 font-medium"
                >
                  {showExtras ? "Hide details" : "Add details (optional)"}
                  <ChevronDown size={15} className={`transition-transform ${showExtras ? "rotate-180" : ""}`} />
                </button>
                {showExtras && (
                  <div className="flex flex-wrap gap-2 animate-fade-up">
                    {["Women", "Men", "Non-binary / either"].map((g) => (
                      <Chip
                        key={g}
                        label={g}
                        selected={makeoverGender === g}
                        onClick={() => setMakeoverGender(makeoverGender === g ? null : g)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === "space" && (
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                  Ready to redesign
                </h2>
                <p className="text-sm text-zinc-500">
                  We&apos;ll restyle the space and find every piece to shop.
                </p>
              </div>
            )}

            {/* Budget — unchanged behaviour, still Auto by default and still
                out of the critical path. */}
            <details className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Budget</span>
                <span className="text-xs text-zinc-400">
                  {budgetMode === "auto"
                    ? "Auto (recommended)"
                    : budgetMode === "unlimited"
                      ? "No limit"
                      : `Up to ${formatBudget(maxBudget)}${maxBudget >= budgetMax ? "+" : ""}`}
                </span>
              </summary>
              <div className="mt-3">
                <div className="flex gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs mb-2 w-fit">
                  {(
                    [
                      { id: "auto", label: "Auto" },
                      { id: "unlimited", label: "No limit" },
                      { id: "custom", label: "Set max" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBudgetMode(id)}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        budgetMode === id
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium shadow-sm"
                          : "text-zinc-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {budgetMode === "custom" ? (
                  <>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs text-zinc-500">Max spend</span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatBudget(maxBudget)}
                        {maxBudget >= budgetMax && "+"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={budgetMin}
                      max={budgetMax}
                      step={budgetStep}
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(Number(e.target.value))}
                      className="w-full accent-orange-700"
                    />
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {budgetMode === "auto"
                      ? "We pick the best value for a full, great-looking design based on real product prices."
                      : "No cap — the AI chooses whatever best suits the design."}
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* The CTA is now always reachable without scrolling. */}
      {step === "details" && (
        <StickyBar className="mt-6">
          <Button
            size="lg"
            fullWidth
            onClick={submit}
            disabled={!canSubmit}
            leftIcon={<Camera size={17} />}
          >
            {canSubmit ? "Create my design" : "Pick a look to continue"}
          </Button>
        </StickyBar>
      )}
    </div>
  );
}
