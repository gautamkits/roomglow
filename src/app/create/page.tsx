"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import {
  Wand2,
  RotateCcw,
  User,
  Sparkles,
  Download,
  Share2,
  RefreshCw,
  Camera,
} from "lucide-react";
import { useRoomFlow } from "@/hooks/useRoomFlow";
import { clearFlowSnapshot } from "@/lib/flowPersistence";
import { useUserLibrary } from "@/lib/useUserLibrary";
import { useLocale } from "@/lib/useLocale";
import SetupPanel from "@/components/SetupPanel";
import TidyUpSelection from "@/components/TidyUpSelection";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import PaywallOverlay from "@/components/PaywallOverlay";
import Landing from "@/components/Landing";
import SiteHeader from "@/components/SiteHeader";
import ShareButton from "@/components/ShareButton";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import Footer from "@/components/Footer";
import ProcessingView from "@/components/ProcessingView";
import OccasionProducts from "@/components/OccasionProducts";
import BookDecorCTA from "@/components/BookDecorCTA";
import MakeoverProducts from "@/components/MakeoverProducts";
import InstallPrompt from "@/components/InstallPrompt";
import { RESTYLE_UI_ENABLED } from "@/lib/uiFlags";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import DesignGrid from "@/components/dashboard/DesignGrid";


function HomeContent() {
  const {
    step,
    awaitingSignIn,
    changePhoto,
    mode,
    eventConfig,
    makeoverConfig,
    image,
    generatedImage,
    roomAnalysis,
    products,
    hotspots,
    designNarrative,
    designId,
    isUnlocked,
    promoApplied,
    maxBudget,
    selectedItems,
    error,
    statusMessage,
    handleImageSelected,
    handleTidyUp,
    refreshedSuggestions,
    handleRegenerate,
    retryGeneration,
    canRetry,
    clearAndRedesign,
    canClearRoom,
    restylesLeft,
    maxRestyles,
    handleUnlocked,
    reset,
  } = useRoomFlow();
  const { data: session, status: sessionStatus } = useSession();
  const { designs, eventDates, loading: libraryLoading } = useUserLibrary(
    sessionStatus === "authenticated" && step === "upload"
  );

  const router = useRouter();
  const { formatBudget } = useLocale();
  const [showBefore, setShowBefore] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sending" | "done">("idle");
  // Anonymous visitors first see the marketing Landing; clicking a CTA reveals
  // the uploader inline (sign-in is deferred to after they upload — see the
  // awaitingSignIn gate below).
  const [showAnonUploader, setShowAnonUploader] = useState(false);
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const isLoading =
    step === "analyzing" || step === "generating" || step === "curating";
  // The "what to add" screen is auto-skipped: on a fresh analysis the flow
  // lands on "product-selection" and immediately advances to generation. Show
  // the processing view (not a blank grid) during that moment. On a pipeline
  // failure the step also returns here, but with `error` set — then we fall
  // through to the error banner + retry instead of a spinner.
  const isAutoAdvancing = step === "product-selection" && !error;
  // Auto-selected items to ticker through while the design is built.
  const tickerItems = (
    selectedItems.length
      ? selectedItems
      : refreshedSuggestions ?? roomAnalysis?.suggestedProducts ?? []
  ).map((s) => ({ label: s.label, icon: s.icon }));

  const isEvent = mode === "event";

  // Once a design is saved, redirect to its permanent /design/[id] page so the
  // URL is shareable AND the content is the single canonical design page (no
  // more "same URL, different content" between the create-results view and the
  // real page). Clear the resume snapshot so /create starts fresh next time.
  useEffect(() => {
    if (step === "results" && designId) {
      clearFlowSnapshot();
      router.replace(`/design/${designId}`);
    }
  }, [step, designId, router]);

  // The full-bleed marketing Landing only shows to anonymous visitors before
  // they start (not once they reveal the uploader or hit the sign-in gate).
  const onLandingView =
    sessionStatus === "unauthenticated" &&
    step === "upload" &&
    !showAnonUploader &&
    !awaitingSignIn;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <SiteHeader
        user={session?.user}
        isAdmin={session?.user?.isAdmin}
        showDesignCta={false}
        rightExtra={
          step !== "mode-select" && step !== "upload" ? (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <RotateCcw size={14} />
              Start over
            </button>
          ) : undefined
        }
      />

      <main className={onLandingView ? "" : "max-w-5xl mx-auto px-5"}>
        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            {canRetry && (
              <button
                onClick={retryGeneration}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium transition-colors"
              >
                <RefreshCw size={13} />
                Try again
              </button>
            )}
          </div>
        )}

        {sessionStatus === "loading" && step === "upload" && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ─── ANONYMOUS — upload first, sign in later ─── */}
        {/* Marketing landing → CTA reveals the uploader inline. No sign-in wall
            up front; sign-in is deferred to the gate below (after upload). */}
        {step === "upload" &&
          sessionStatus === "unauthenticated" &&
          !awaitingSignIn &&
          (showAnonUploader ? (
            <div className="max-w-xl mx-auto py-8 animate-fade-up">
              <div className="relative overflow-hidden -mx-5 sm:mx-0 rounded-none sm:rounded-2xl border border-orange-200/70 dark:border-orange-900/40 border-x-0 sm:border-x bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900 p-4 sm:p-6 sm:shadow-lg sm:shadow-orange-900/5">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-10 h-10 rounded-xl bg-orange-700 flex items-center justify-center shadow-sm shadow-orange-900/30 shrink-0">
                    <Wand2 size={18} className="text-white" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                      Start your design
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Upload a photo — no sign-in needed to start.
                    </p>
                  </div>
                </div>
                <SetupPanel onImageSelected={handleImageSelected} />
              </div>
            </div>
          ) : (
            <Landing onStart={() => setShowAnonUploader(true)} />
          ))}

        {/* ─── SIGN-IN GATE (deferred; fires right after upload) ─── */}
        {awaitingSignIn && (
          <div className="max-w-md mx-auto py-12 text-center animate-fade-up">
            {image && (
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-lg aspect-[4/3] mb-6">
                <img
                  src={image}
                  alt="Your uploaded photo"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-zinc-900/40 flex items-center justify-center">
                  <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-lg text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <Sparkles size={15} className="text-orange-700" />
                    Ready to transform
                  </span>
                </div>
              </div>
            )}
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              Sign in to see your design
            </h2>
            <p className="text-sm text-zinc-500 mb-6">
              Your photo&apos;s ready. Sign in with Google and we&apos;ll design it
              in seconds — your first design is on us.
            </p>
            <button
              onClick={() =>
                signIn("google", { callbackUrl: "/create?resume=1" })
              }
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors shadow-lg shadow-orange-700/20 w-full sm:w-auto"
            >
              <Camera size={17} />
              Continue with Google
            </button>
            <div className="mt-4">
              <button
                onClick={changePhoto}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
              >
                Use a different photo
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-4">
              Free to start · we never post or sell your data
            </p>
          </div>
        )}

        {/* ─── DASHBOARD (authenticated home) ─── */}
        {step === "upload" && sessionStatus === "authenticated" && (
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

            {libraryLoading || designs.length > 0 ? (
              /* ─── Has designs (or still loading): two-column layout ─── */
              /* Render the grid during load too so the create card holds its
                 final position — avoids the centered→two-column layout shift. */
              <div className="grid lg:grid-cols-[1.55fr_1fr] gap-6 items-start animate-fade-up-delay-1">
                {/* Left: prominent create card.
                    -mx-5 cancels <main>'s px-5 so the card runs edge-to-edge on
                    phones (side borders/corners/shadow dropped there); from sm up
                    it returns to a normal inset card. */}
                <div className="relative overflow-hidden -mx-5 sm:mx-0 rounded-none sm:rounded-2xl border border-orange-200/70 dark:border-orange-900/40 border-x-0 sm:border-x bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900 p-4 sm:p-6 sm:shadow-lg sm:shadow-orange-900/5">
                  <div className="flex items-start gap-3 mb-5">
                    <span className="w-10 h-10 rounded-xl bg-orange-700 flex items-center justify-center shadow-sm shadow-orange-900/30 shrink-0">
                      <Wand2 size={19} className="text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Start a new design
                      </h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Turn any photo into a shoppable AI design in seconds.
                      </p>
                    </div>
                  </div>
                  <SetupPanel onImageSelected={handleImageSelected} />
                </div>

                {/* Right: live activity sidebar */}
                <div className="space-y-6 lg:sticky lg:top-6">
                  {libraryLoading ? (
                    /* Skeleton keeps the sidebar's footprint while data loads */
                    <>
                      <div>
                        <div className="h-3.5 w-28 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
                        <div className="space-y-2">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-[58px] rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
                        <div className="grid grid-cols-2 gap-3">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="aspect-[4/3] rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {eventDates.length > 0 && (
                        <UpcomingEvents eventDates={eventDates} variant="list" />
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">
                            Recent designs
                          </h2>
                          {designs.length > 4 && (
                            <button
                              onClick={() => router.push("/profile")}
                              className="text-sm text-orange-700 hover:text-orange-800 font-medium transition-colors"
                            >
                              View all
                            </button>
                          )}
                        </div>
                        <DesignGrid designs={designs} limit={4} cols={2} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* ─── No designs: centered single column ─── */
              <div className="max-w-xl mx-auto animate-fade-up-delay-1">
                {/* Edge-to-edge on phones — see the create card above. */}
                <div className="relative overflow-hidden -mx-5 sm:mx-0 rounded-none sm:rounded-2xl border border-orange-200/70 dark:border-orange-900/40 border-x-0 sm:border-x bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900 p-4 sm:p-6 sm:shadow-lg sm:shadow-orange-900/5">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="w-10 h-10 rounded-xl bg-orange-700 flex items-center justify-center shadow-sm shadow-orange-900/30 shrink-0">
                      <Wand2 size={18} className="text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Create your first design
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Turn any photo into a shoppable AI design in seconds.
                      </p>
                    </div>
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

        {/* ─── LOADING (incl. the auto-skipped selection moment) ─── */}
        {(isLoading || isAutoAdvancing) && (
          <ProcessingView
            image={image}
            step={
              isLoading
                ? (step as "analyzing" | "generating" | "curating")
                : "generating"
            }
            isEvent={isEvent}
            mode={mode}
            statusMessage={statusMessage}
            items={tickerItems}
          />
        )}

        {/* The "what to add" selection screen is intentionally removed — the
            flow auto-selects every suggested item and advances straight to
            generation (see useRoomFlow auto-advance + the ItemTicker above). */}

        {/* ─── TIDY UP (pick items to remove) ─── */}
        {step === "tidy-up" && roomAnalysis && image && (
          <div className="py-10 max-w-3xl mx-auto animate-fade-up">
            <TidyUpSelection
              photoUrl={image}
              items={roomAnalysis.removableObjects || []}
              onComplete={handleTidyUp}
            />
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
                    {mode === "event"
                      ? "Event design"
                      : mode === "makeover"
                      ? "Personal makeover"
                      : "Interior design"}
                  </span>
                  {maxBudget && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium">
                      Budget: up to {formatBudget(maxBudget)}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {mode === "event" && eventConfig
                    ? `Your ${eventConfig.eventLabel} setup`
                    : mode === "makeover"
                    ? "Your new look"
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
                    download={`noosho-${mode}-design.png`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <Download size={15} />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                )}
                {isUnlocked && designId && <ShareButton designId={designId} />}
              </div>
            </div>

            {promoApplied && (
              <div className="mb-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-orange-200/70 dark:border-orange-900/40 bg-orange-50/70 dark:bg-orange-950/20 text-sm text-zinc-800 dark:text-zinc-200 animate-fade-up">
                🎁 Your first design is on us — enjoy! Future designs use normal pricing.
              </div>
            )}

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
                      Budget: up to {formatBudget(maxBudget)}
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
                <div className={isUnlocked ? "" : "blur-[24px] pointer-events-none select-none sm:max-h-[540px] overflow-hidden"}>
                  <ImageWithHotspots
                    imageSrc={
                      !isUnlocked && designId
                        ? `/api/image/${designId}/after`
                        : generatedImage || image!
                    }
                    hotspots={isUnlocked ? hotspots : []}
                    products={products}
                  />
                </div>
              )}

              {!isUnlocked && (
                <PaywallOverlay
                  designId={designId}
                  mode={mode}
                  itemCount={products.length}
                  narrative={designNarrative}
                  items={selectedItems.map((s) => s.label)}
                  imageUrl={generatedImage || image || undefined}
                  onUnlocked={handleUnlocked}
                />
              )}
            </div>

            {RESTYLE_UI_ENABLED && isUnlocked && mode === "space" && (
              <div className="mt-8 animate-fade-up-delay-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 text-center mb-2">
                  Try a different style
                  {restylesLeft < maxRestyles && (
                    <span className="ml-1 normal-case tracking-normal text-zinc-400">
                      · {restylesLeft} of {maxRestyles} left
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Modern", "Bohemian", "Minimalist", "Industrial", "Scandinavian"].map(
                    (style) => (
                      <button
                        key={style}
                        onClick={() => handleRegenerate(style)}
                        disabled={restylesLeft === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm hover:border-orange-700 hover:text-orange-700 dark:hover:border-orange-600 dark:hover:text-orange-400 transition-colors disabled:opacity-40 disabled:hover:border-zinc-200 disabled:hover:text-zinc-700 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={12} />
                        {style}
                      </button>
                    )
                  )}
                </div>
                {restylesLeft === 0 && (
                  <p className="text-center text-xs text-zinc-400 mt-2">
                    You&apos;ve used all {maxRestyles} restyles for this design.
                  </p>
                )}

                {canClearRoom && (
                  <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
                      Room looks cluttered?
                    </p>
                    <button
                      onClick={clearAndRedesign}
                      disabled={restylesLeft === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={13} />
                      Clear the room &amp; redesign
                    </button>
                    <p className="text-center text-xs text-zinc-400 mt-2">
                      Empties the existing furniture, then redesigns on a clean space · uses 1 restyle
                    </p>
                  </div>
                )}
              </div>
            )}

            {isUnlocked && mode === "event" && eventConfig && (
              <OccasionProducts
                eventId={eventConfig.eventType}
                subTheme={eventConfig.subTheme}
                eventLabel={eventConfig.eventLabel}
              />
            )}

            {isUnlocked && mode === "event" && eventConfig && (
              <BookDecorCTA designId={designId} eventLabel={eventConfig.eventLabel} />
            )}

            {isUnlocked && mode === "makeover" && makeoverConfig && (
              <MakeoverProducts styleId={makeoverConfig.styleType} gender={makeoverConfig.gender} />
            )}

            <div className="flex items-center justify-center gap-3 mt-6 animate-fade-up-delay-2">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors"
              >
                <RotateCcw size={15} />
                Design another
              </button>
              <button
                onClick={() => router.push("/profile")}
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

            {isUnlocked && <InstallPrompt />}
          </div>
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
