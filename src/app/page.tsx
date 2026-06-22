"use client";

import { useState } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import {
  Camera,
  Wand2,
  ShoppingBag,
  RotateCcw,
  Loader2,
  Check,
  User,
  Sparkles,
  Download,
} from "lucide-react";
import { useRoomFlow } from "@/hooks/useRoomFlow";
import { useUserLibrary } from "@/lib/useUserLibrary";
import SetupPanel from "@/components/SetupPanel";
import ProductSelection from "@/components/ProductSelection";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import PaywallOverlay from "@/components/PaywallOverlay";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import DesignGrid from "@/components/dashboard/DesignGrid";

const STEPS = [
  { Icon: Camera, title: "Upload a photo", desc: "Any room, any angle" },
  { Icon: Wand2, title: "AI redesigns it", desc: "Real products, placed naturally" },
  { Icon: ShoppingBag, title: "Shop the look", desc: "Buy each piece on Amazon" },
];


function HomeContent() {
  const {
    step,
    mode,
    eventConfig,
    image,
    generatedImage,
    roomAnalysis,
    products,
    hotspots,
    designNarrative,
    designId,
    isUnlocked,
    error,
    statusMessage,
    handleImageSelected,
    handleProductSelection,
    handleUnlocked,
    reset,
  } = useRoomFlow();
  const { data: session, status: sessionStatus } = useSession();
  const { designs, eventDates, loading: libraryLoading } = useUserLibrary(
    sessionStatus === "authenticated" && step === "upload"
  );

  const [showBefore, setShowBefore] = useState(false);
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const isLoading =
    step === "analyzing" || step === "generating" || step === "curating";
  const loadingIndex =
    step === "analyzing" ? 0 : step === "generating" ? 1 : step === "curating" ? 2 : 0;

  const isEvent = mode === "event";
  const persona = isEvent ? "Your event planner" : "Your interior designer";

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <button
            onClick={reset}
            className="flex items-center gap-2"
            aria-label="RoomGlow home"
          >
            <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
              <Wand2 size={14} className="text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              RoomGlow
            </span>
          </button>
          <div className="flex items-center gap-3">
            {step !== "mode-select" && step !== "upload" && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <RotateCcw size={14} />
                Start over
              </button>
            )}
            {session ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => (window.location.href = "/profile")}
                  className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700"
                >
                  {session.user?.image ? (
                    <img src={session.user.image} alt="" className="w-full h-full" />
                  ) : (
                    <User size={16} className="m-auto text-zinc-400" />
                  )}
                </button>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-medium transition-colors"
              >
                <User size={14} />
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5">
        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ─── AUTH GATE — must sign in before designing ─── */}
        {sessionStatus === "loading" && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {sessionStatus === "unauthenticated" && (
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center py-12 md:py-20">
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-700" />
                AI space &amp; event design
              </div>
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.05] mb-4">
                Design any space,
                <br />
                for any moment.
              </h1>
              <p className="text-base text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md mb-8">
                Your personal interior designer or event planner — upload a
                photo and they&apos;ll style your space with real products,
                placed naturally. Then show you exactly what to buy.
              </p>
              <div className="space-y-4">
                {STEPS.map(({ Icon, title, desc }) => (
                  <div key={title} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center shrink-0">
                      <Icon size={17} strokeWidth={1.75} className="text-orange-700" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {title}
                      </p>
                      <p className="text-xs text-zinc-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-up-delay-1">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-4">
                  <Wand2 size={24} className="text-orange-700" />
                </div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                  Sign in to start
                </h2>
                <p className="text-sm text-zinc-500 mb-6">
                  Create an account to design your space and save every result
                  to your profile.
                </p>
                <button
                  onClick={() => signIn("google")}
                  className="w-full py-3 rounded-lg font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2"
                >
                  <User size={16} />
                  Continue with Google
                </button>
                <p className="text-xs text-zinc-400 mt-4">
                  Free to start · Your designs are saved automatically
                </p>
              </div>
            </div>
          </div>
        )}

        {sessionStatus === "authenticated" && (
          <>
        {/* ─── DASHBOARD (authenticated home) ─── */}
        {step === "upload" && (
          <div className="py-6">
            {/* Compact header: greeting + inline stats */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5 animate-fade-up">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Welcome back, {firstName}
              </h1>
              {!libraryLoading && designs.length > 0 && (
                <p className="text-sm text-zinc-400">
                  {designs.length} design{designs.length !== 1 ? "s" : ""}
                  {eventDates.length > 0 && (
                    <> · {eventDates.length} upcoming</>
                  )}
                </p>
              )}
            </div>

            {!libraryLoading && designs.length > 0 ? (
              /* ─── Has designs: two-column layout ─── */
              <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-start animate-fade-up-delay-1">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-7 h-7 rounded-lg bg-orange-700 flex items-center justify-center">
                      <Wand2 size={15} className="text-white" />
                    </span>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                      Start a new design
                    </h2>
                  </div>
                  <SetupPanel onImageSelected={handleImageSelected} />
                </div>

                <div className="space-y-5">
                  {eventDates.length > 0 && (
                    <UpcomingEvents eventDates={eventDates} />
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">
                        Recent designs
                      </h2>
                      {designs.length > 4 && (
                        <button
                          onClick={() => (window.location.href = "/profile")}
                          className="text-sm text-orange-700 hover:text-orange-800 font-medium transition-colors"
                        >
                          View all
                        </button>
                      )}
                    </div>
                    <DesignGrid designs={designs} limit={4} />
                  </div>
                </div>
              </div>
            ) : (
              /* ─── No designs: centered single column ─── */
              <div className="max-w-xl mx-auto animate-fade-up-delay-1">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-7 h-7 rounded-lg bg-orange-700 flex items-center justify-center">
                      <Wand2 size={15} className="text-white" />
                    </span>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                      Create your first design
                    </h2>
                  </div>
                  <SetupPanel onImageSelected={handleImageSelected} />
                </div>
                <p className="text-center text-xs text-zinc-400 mt-4">
                  Powered by AI · Products from Amazon
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── LOADING ─── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-28">
            <div className="w-full max-w-md">
              <div className="flex items-center gap-2.5 mb-5">
                <Loader2 size={18} className="text-orange-700 animate-spin" />
                <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {step === "analyzing" &&
                    `${persona} is studying your space...`}
                  {step === "generating" &&
                    `${persona} is creating a design plan...`}
                  {step === "curating" &&
                    `${persona} is hand-picking the best products...`}
                </p>
              </div>

              {/* thin indeterminate progress bar */}
              <div className="relative h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden progress-bar mb-6" />

              {/* stepper with persona-driven labels */}
              <div className="flex items-center justify-between">
                {(isEvent
                  ? ["Understanding", "Planning", "Sourcing", "Staging"]
                  : ["Understanding", "Designing", "Sourcing", "Rendering"]
                ).map((label, i) => {
                  const done = i < loadingIndex;
                  const active = i === loadingIndex;
                  return (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                          done
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : active
                            ? "bg-orange-700 text-white"
                            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                      </div>
                      <span
                        className={`text-[11px] ${
                          active
                            ? "text-zinc-900 dark:text-zinc-100 font-medium"
                            : "text-zinc-400"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {statusMessage && (
                <p className="text-sm text-zinc-500 text-center mt-6 italic">
                  {statusMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── PRODUCT SELECTION ─── */}
        {step === "product-selection" && roomAnalysis && (
          <div className="py-10 max-w-2xl mx-auto">
            <div className="mb-7 animate-fade-up">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1.5">
                {mode === "event"
                  ? "Which decorations should we add?"
                  : "What should we add?"}
              </h2>
              <p className="text-sm text-zinc-500">
                We analyzed your {roomAnalysis.dimensions} {roomAnalysis.roomType}.
                {mode === "event"
                  ? " Pick the decorations you'd like for the event."
                  : " Pick the pieces you'd like our designer to source."}
              </p>
            </div>
            <div className="animate-fade-up-delay-1">
              <ProductSelection
                products={roomAnalysis.suggestedProducts || []}
                onComplete={handleProductSelection}
              />
            </div>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {step === "results" && (generatedImage || image) && (
          <div className="py-8">
            <div className="mb-5 animate-fade-up flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium mb-2">
                  <Sparkles size={12} />
                  {mode === "event" ? "Event design" : "Interior design"}
                </span>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {mode === "event" && eventConfig
                    ? `Your ${eventConfig.eventLabel} setup`
                    : "Your redesigned space"}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {generatedImage && image && (
                  <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm">
                    <button
                      onClick={() => setShowBefore(false)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        !showBefore
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "text-zinc-500"
                      }`}
                    >
                      After
                    </button>
                    <button
                      onClick={() => setShowBefore(true)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        showBefore
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "text-zinc-500"
                      }`}
                    >
                      Before
                    </button>
                  </div>
                )}
                {isUnlocked && generatedImage && (
                  <a
                    href={generatedImage}
                    download={`roomglow-${mode}-design.png`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <Download size={15} />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                )}
              </div>
            </div>

            {designNarrative && isUnlocked && (
              <div className="mb-5 border-l-2 border-orange-700 pl-3.5 py-0.5 max-w-2xl animate-fade-up">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {designNarrative}
                </p>
              </div>
            )}

            <div className="animate-fade-up-delay-1 relative">
              <div className={isUnlocked ? "" : "blur-[24px] pointer-events-none select-none"}>
                <ImageWithHotspots
                  imageSrc={showBefore ? image! : generatedImage || image!}
                  hotspots={showBefore || !isUnlocked ? [] : hotspots}
                  products={products}
                />
              </div>

              {!isUnlocked && (
                <PaywallOverlay
                  designId={designId}
                  price={mode === "event" ? 79 : 49}
                  mode={mode}
                  onUnlocked={handleUnlocked}
                />
              )}
            </div>

            <div className="flex items-center justify-center gap-3 mt-8 animate-fade-up-delay-2">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors"
              >
                <RotateCcw size={15} />
                Design another
              </button>
              <button
                onClick={() => (window.location.href = "/profile")}
                className="flex items-center gap-2 px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-sm rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <User size={15} />
                My designs
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <SessionProvider>
      <HomeContent />
    </SessionProvider>
  );
}
