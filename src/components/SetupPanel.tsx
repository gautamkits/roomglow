"use client";

import { useState, useEffect } from "react";
import { Sofa, PartyPopper, Calendar, Sparkles, Camera, Check } from "lucide-react";
import { getEvent, getEvents } from "@/lib/events";
import type { AppMode, EventConfig, MakeoverConfig } from "@/lib/types";
import { MAKEOVER_STYLES } from "@/lib/makeover";
import { useLocale } from "@/lib/useLocale";
import ImageUpload from "./ImageUpload";

interface SetupPanelProps {
  onImageSelected: (
    base64: string,
    mode: AppMode,
    eventConfig: EventConfig | null,
    maxBudget?: number,
    makeoverConfig?: MakeoverConfig | null
  ) => void;
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
        selected
          ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

export default function SetupPanel({ onImageSelected }: SetupPanelProps) {
  const { locale, budgetMin, budgetMax, budgetStep, formatBudget } = useLocale();
  const events = getEvents(locale);
  const [mode, setMode] = useState<AppMode>("space");
  const [eventId, setEventId] = useState<string | null>(null);
  const [subTheme, setSubTheme] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<string | null>(null);
  const [honoree, setHonoree] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [maxBudget, setMaxBudget] = useState(budgetMin * 5);
  // Budget starts pre-set to a sensible default so the uploader is visible
  // immediately — users can still adjust the slider. Gating upload behind a
  // manual slider touch made the upload box appear only "sometimes".
  const [budgetSet, setBudgetSet] = useState(true);
  const [makeoverStyleId, setMakeoverStyleId] = useState<string | null>(null);
  const [makeoverGender, setMakeoverGender] = useState<string | null>(null);
  const [makeoverEnabled, setMakeoverEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/features")
      .then((r) => r.json())
      .then((d) => setMakeoverEnabled(!!d.makeover))
      .catch(() => {});
  }, []);

  // Honor a ?mode= deep-link from the homepage mode tiles (space/event/makeover).
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "space" || m === "event" || m === "makeover") setMode(m);
  }, []);

  const event = eventId ? getEvent(eventId) : undefined;
  const eventConfigReady =
    mode !== "event" || (!!event && !!subTheme && !!colorScheme);
  const makeoverReady = mode !== "makeover" || !!makeoverStyleId;
  const eventReady = eventConfigReady && makeoverReady && budgetSet;
  // Gender picker only for child-centric events (birthday, baby shower, …)
  const showGender = !!event?.gendered;

  const buildConfig = (): EventConfig | null => {
    if (mode !== "event" || !event || !subTheme || !colorScheme) return null;
    return {
      eventType: event.id,
      eventLabel: event.label,
      subTheme,
      colorScheme,
      honoree: honoree.trim() || undefined,
      eventDate: eventDate || undefined,
      gender: showGender && gender ? gender : undefined,
    };
  };

  const buildMakeoverConfig = (): MakeoverConfig | null => {
    if (mode !== "makeover" || !makeoverStyleId) return null;
    const style = MAKEOVER_STYLES.find((s) => s.id === makeoverStyleId);
    if (!style) return null;
    return { styleType: style.id, styleLabel: style.label, gender: makeoverGender || undefined };
  };

  const handleImage = (base64: string) => {
    onImageSelected(base64, mode, buildConfig(), maxBudget, buildMakeoverConfig());
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
      {/* Mode toggle */}
      <div className={`grid gap-2 ${makeoverEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
        {(
          [
            { id: "space", Icon: Sofa, label: "Interior designer" },
            { id: "event", Icon: PartyPopper, label: "Event planner" },
            ...(makeoverEnabled ? [{ id: "makeover", Icon: Sparkles, label: "Personal makeover" }] : []),
          ] as const
        ).map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setMode(id as AppMode)}
            className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
              mode === id
                ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {/* Inline event options */}
      {mode === "event" && (
        <div className="space-y-3 animate-fade-up">
          <div className="flex flex-wrap gap-1.5">
            {events.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setEventId(e.id);
                  setSubTheme(null);
                  setColorScheme(null);
                  setGender(null);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                  eventId === e.id
                    ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <span>{e.icon}</span>
                {e.label}
              </button>
            ))}
          </div>

          {event && (
            <div className="space-y-2.5 animate-fade-up">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">
                  Theme
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {event.subThemes.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      selected={subTheme === t}
                      onClick={() => setSubTheme(t)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">
                  Colors
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {event.colorSchemes.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      selected={colorScheme === c}
                      onClick={() => setColorScheme(c)}
                    />
                  ))}
                </div>
              </div>
              {showGender && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">
                    For a (optional)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
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
              <input
                type="text"
                value={honoree}
                onChange={(e) => setHonoree(e.target.value)}
                placeholder="Who's it for? (optional)"
                className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
              />
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
                  placeholder="Event date (optional)"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Max budget — required */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Max budget
            {!budgetSet && <span className="text-orange-700"> *</span>}
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {budgetSet ? (
              <>
                {formatBudget(maxBudget)}
                {maxBudget >= budgetMax && "+"}
              </>
            ) : (
              <span className="text-zinc-400 font-normal text-xs">
                Slide to set
              </span>
            )}
          </span>
        </div>
        <input
          type="range"
          min={budgetMin}
          max={budgetMax}
          step={budgetStep}
          value={maxBudget}
          onChange={(e) => {
            setMaxBudget(Number(e.target.value));
            setBudgetSet(true);
          }}
          className="w-full accent-orange-700"
        />
        <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
          <span>{formatBudget(budgetMin)}</span>
          <span>{formatBudget(budgetMax)}+</span>
        </div>
      </div>

      {/* Makeover style picker */}
      {mode === "makeover" && (
        <div className="space-y-3 animate-fade-up">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">Choose your look</p>
            <div className="flex flex-wrap gap-1.5">
              {MAKEOVER_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setMakeoverStyleId(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    makeoverStyleId === s.id
                      ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <span>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">Style for (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {["Women", "Men", "Non-binary / either"].map((g) => (
                <Chip key={g} label={g} selected={makeoverGender === g} onClick={() => setMakeoverGender(makeoverGender === g ? null : g)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Photo tips — prominent, since photo quality drives output quality */}
      <div className="rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-lg bg-amber-400/30 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
            <Camera size={15} className="text-amber-700 dark:text-amber-400" />
          </span>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            For the best result
          </p>
        </div>
        <ul className="space-y-1">
          {(mode === "makeover"
            ? [
                "Full-body or waist-up, facing the camera",
                "Good, even lighting — a plain background works best",
                "Keep your face clearly visible",
              ]
            : [
                "Declutter first — remove clothes, boxes & personal items",
                "Good, even lighting (daytime is best)",
                "Fit the whole space in one frame",
              ]
          ).map((tip) => (
            <li
              key={tip}
              className="flex items-start gap-1.5 text-xs text-amber-900/90 dark:text-amber-200/80 leading-relaxed"
            >
              <Check size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Upload — gated until event options / makeover style are set */}
      <div className="pt-1">
        {eventReady ? (
          <ImageUpload onImageSelected={handleImage} />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
            <p className="text-sm text-zinc-500">
              {mode === "makeover" && !makeoverStyleId
                ? "Pick a style look, then set your budget to upload"
                : !eventConfigReady
                ? "Pick an occasion, theme & colors, then set your budget to upload"
                : "Set your max budget to upload your photo"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
