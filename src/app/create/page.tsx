"use client";

import { useState } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import {
  Wand2,
  RotateCcw,
  User,
  Sparkles,
  Download,
  Share2,
} from "lucide-react";
import { useRoomFlow } from "@/hooks/useRoomFlow";
import { useUserLibrary } from "@/lib/useUserLibrary";
import SetupPanel from "@/components/SetupPanel";
import ProductSelection from "@/components/ProductSelection";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import PaywallOverlay from "@/components/PaywallOverlay";
import Landing from "@/components/Landing";
import ShareButton from "@/components/ShareButton";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import Footer from "@/components/Footer";
import ProcessingView from "@/components/ProcessingView";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import DesignGrid from "@/components/dashboard/DesignGrid";


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
    maxBudget,
    selectedItems,
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
  const [shareState, setShareState] = useState<"idle" | "sending" | "done">("idle");
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const isLoading =
    step === "analyzing" || step === "generating" || step === "curating";

  const isEvent = mode === "event";

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
            <a
              href="/"
              className="hidden sm:inline text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              Gallery
            </a>
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

      <main
        className={
          sessionStatus === "unauthenticated" ? "" : "max-w-5xl mx-auto px-5"
        }
      >
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

        {sessionStatus === "unauthenticated" && <Landing />}

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
          <ProcessingView
            image={image}
            step={step as "analyzing" | "generating" | "curating"}
            isEvent={isEvent}
            statusMessage={statusMessage}
          />
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
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium">
                    <Sparkles size={12} />
                    {mode === "event" ? "Event design" : "Interior design"}
                  </span>
                  {maxBudget && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium">
                      Budget: up to ₹{maxBudget.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {mode === "event" && eventConfig
                    ? `Your ${eventConfig.eventLabel} setup`
                    : "Your redesigned space"}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {generatedImage && image && isUnlocked && (
                  <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm">
                    <button
                      onClick={() => setShowBefore(false)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        !showBefore
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "text-zinc-500"
                      }`}
                    >
                      Design
                    </button>
                    <button
                      onClick={() => setShowBefore(true)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        showBefore
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "text-zinc-500"
                      }`}
                    >
                      Compare
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
                {isUnlocked && designId && <ShareButton designId={designId} />}
              </div>
            </div>

            {designNarrative && isUnlocked && (
              <div className="mb-4 border-l-2 border-orange-700 pl-3.5 py-0.5 max-w-2xl animate-fade-up">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {designNarrative}
                </p>
              </div>
            )}

            {isUnlocked && (selectedItems.length > 0 || maxBudget) && (
              <div className="mb-5 animate-fade-up">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
                  Based on your choices
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {maxBudget && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium">
                      Budget: up to ₹{maxBudget.toLocaleString("en-IN")}
                    </span>
                  )}
                  {eventConfig?.subTheme && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs">
                      {eventConfig.subTheme}
                    </span>
                  )}
                  {selectedItems.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs"
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="animate-fade-up-delay-1 relative">
              {isUnlocked && showBefore && generatedImage && image ? (
                <div className="max-w-3xl mx-auto">
                  <BeforeAfterSlider
                    beforeSrc={image}
                    afterSrc={generatedImage}
                  />
                  <p className="text-center text-xs text-zinc-400 mt-3">
                    Drag the handle to compare your original room with the new design
                  </p>
                </div>
              ) : (
                <div className={isUnlocked ? "" : "blur-[24px] pointer-events-none select-none"}>
                  <ImageWithHotspots
                    imageSrc={generatedImage || image!}
                    hotspots={isUnlocked ? hotspots : []}
                    products={products}
                  />
                </div>
              )}

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

            {isUnlocked && designId && (
              <div className="flex flex-col items-center mt-4">
                {shareState === "done" ? (
                  <p className="text-sm text-zinc-500">
                    ✓ Submitted — we&apos;ll review it for the public gallery.
                  </p>
                ) : (
                  <button
                    onClick={async () => {
                      setShareState("sending");
                      try {
                        const res = await fetch("/api/gallery/submit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ designId }),
                        });
                        setShareState(res.ok ? "done" : "idle");
                      } catch {
                        setShareState("idle");
                      }
                    }}
                    disabled={shareState === "sending"}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-orange-700 transition-colors disabled:opacity-50"
                  >
                    <Share2 size={15} />
                    {shareState === "sending"
                      ? "Submitting..."
                      : "Share to public gallery"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>
      {sessionStatus === "authenticated" && <Footer />}
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
