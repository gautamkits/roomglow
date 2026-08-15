"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AppMode,
  EventConfig,
  MakeoverConfig,
  PersonAnalysis,
  FlowStep,
  RoomAnalysis,
  SuggestedProduct,
  ProductRecommendation,
  ProductResult,
  Hotspot,
} from "@/lib/types";
import { isProtectedLabel } from "@/lib/types";
import { useSession } from "next-auth/react";
import { track, trackFunnel } from "@/lib/analytics";
import { smartBudgetInstruction, type SearchCategory } from "@/lib/budget";
// Shared with the admin regenerate path so both build the same event brief.
import { buildEventContext } from "@/lib/events";
import {
  saveFlowSnapshot,
  loadFlowSnapshot,
  clearFlowSnapshot,
  savePendingUpload,
  loadPendingUpload,
  clearPendingUpload,
} from "@/lib/flowPersistence";

// Soft cap on free restyles per design — each restyle is a paid image generation.
const MAX_RESTYLES = 5;

// Named as KEEPs on every empty-room call. `analyzeRoom` only lists LARGE
// movable pieces, so a mandir shelf or a framed deity picture never appears in
// removableObjects and would reach the empty pass unnamed. Clearing someone's
// shrine to fit a balloon arch is not a recoverable mistake, so it is stated
// rather than left to the prompt's judgement.
const DEVOTIONAL_KEEPS = [
  "temple / mandir / shrine",
  "idol or deity statue",
  "framed god picture or religious artwork",
  "prayer or puja corner",
  "national flag",
  "framed family photographs",
];

// Each retry/clear below is a paid image generation, so cap them to stop a user
// (or tester) from triggering unlimited generations. These are client-side
// guards for UX; the API routes enforce a hard per-user/IP cap server-side.
const MAX_PIPELINE_RETRIES = 3;

export function useRoomFlow() {
  // Deferred sign-in: anonymous users can pick a mode and upload a photo; we
  // only require Google sign-in at the moment of peak intent ("sign in to see
  // your design"), right before the paid generation.
  const { status: authStatus } = useSession();
  const [awaitingSignIn, setAwaitingSignIn] = useState(false);
  const [resumePending, setResumePending] = useState(false);

  const [step, setStep] = useState<FlowStep>("upload");
  const [mode, setMode] = useState<AppMode>("space");
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [makeoverConfig, setMakeoverConfig] = useState<MakeoverConfig | null>(null);
  const [personAnalysis, setPersonAnalysis] = useState<PersonAnalysis | null>(null);
  const [outfitVision, setOutfitVision] = useState<string>("");
  const [image, setImage] = useState<string | null>(null);
  // The canvas the design is generated on. Equals `image` normally, or the
  // emptied photo after a post-unlock "clear the room & redesign". `image`
  // always stays the true upload so the saved "original" / before-after remain
  // the room the user actually photographed.
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [roomAnalysis, setRoomAnalysis] = useState<RoomAnalysis | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [designNarrative, setDesignNarrative] = useState<string>("");
  const [designId, setDesignId] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [maxBudget, setMaxBudget] = useState<number | undefined>(undefined);
  // When true, curation gets no budget constraint — the AI picks whatever best
  // suits the design regardless of price.
  const [noBudget, setNoBudget] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SuggestedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [restyleCount, setRestyleCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  // Items the user chose to remove in the tidy-up step, and the AI-refreshed
  // "what to add" suggestions that account for those removals.
  const [removedLabels, setRemovedLabels] = useState<string[]>([]);
  const [refreshedSuggestions, setRefreshedSuggestions] = useState<
    SuggestedProduct[] | null
  >(null);
  // Space redesigns: whether the AI may rearrange kept furniture for the best
  // layout. Defaults OFF ("Keep mine") — the user opts into "Optimize".
  const [optimizeLayout, setOptimizeLayout] = useState(false);

  // The "what to add" screen is auto-skipped: after a FRESH photo analysis we
  // proceed straight to generation with every suggested item selected. This ref
  // scopes that auto-advance to fresh analyses only — it is deliberately NOT set
  // on the resume-restore path (below) or the pipeline-failure fallback (which
  // both also land on "product-selection"), so we never silently fire a paid
  // generation on resume or loop on failure.
  const autoProceedRef = useRef(false);

  // Per-step wall-clock, as the user actually experiences it (includes upload of
  // the photo and download of the render, which the server-side `step_ms` logs
  // cannot see). Emitted once as `pipeline_timing` when a design completes.
  // A ref, not state: analyze runs in a different callback from the pipeline,
  // and nothing here should trigger a re-render.
  const stepMsRef = useRef<Record<string, number>>({});

  // ─── Level-1 resume: restore an in-progress flow on this device ───
  // Gate persistence until the one-time rehydrate has run, so we never clobber a
  // saved snapshot with the initial empty state on mount.
  const hydratedRef = useRef(false);

  useEffect(() => {
    // On the Google sign-in return (?resume=1) the deferred-resume effect below
    // owns the flow — it replays the stashed upload straight into generation.
    // Skip snapshot restore here so we don't race it: otherwise this async load
    // can resolve AFTER generation has begun writing progress snapshots, restore
    // that half-written snapshot, and hijack the live run (the design finishes
    // server-side but the tab is left stuck on a ghost progress bar).
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("resume") === "1"
    ) {
      hydratedRef.current = true;
      return;
    }
    let cancelled = false;
    loadFlowSnapshot().then((snap) => {
      if (!cancelled && snap) {
        // Only resume states worth returning to: a finished result, or a
        // product-selection/generation stage (which always has an analysis).
        const finished = snap.step === "results" && !!snap.generatedImage;
        const resumable = finished || snap.roomAnalysis || snap.personAnalysis;
        if (resumable) {
          setMode(snap.mode);
          setEventConfig(snap.eventConfig);
          setMakeoverConfig(snap.makeoverConfig);
          setMaxBudget(snap.maxBudget);
          setNoBudget(snap.noBudget);
          setImage(snap.image);
          setBaseImage(snap.baseImage);
          setRoomAnalysis(snap.roomAnalysis);
          setPersonAnalysis(snap.personAnalysis);
          setSelectedItems(snap.selectedItems);
          setProducts(snap.products);
          setHotspots(snap.hotspots);
          setGeneratedImage(snap.generatedImage);
          setDesignNarrative(snap.designNarrative);
          setDesignId(snap.designId);
          setIsUnlocked(snap.isUnlocked);
          setStep(finished ? "results" : "product-selection");
          // A run interrupted mid-generation: the resume effect below checks
          // whether the design already finished server-side (jump to it, free)
          // and only re-runs the paid pipeline when it truly didn't — so we
          // neither strand the user on a ghost progress bar nor double-charge.
          if (!finished) setResumePending(true);
        } else {
          clearFlowSnapshot();
        }
      }
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the flow whenever the resumable state changes.
  useEffect(() => {
    if (!hydratedRef.current || !image) return;
    // Only in-progress steps are snapshotted for resume. A completed design
    // lives at its permanent /design/[id] page (we redirect there), so we don't
    // persist "results" — otherwise /create would restore + redirect in a loop.
    const persistable =
      step === "product-selection" ||
      step === "generating" ||
      step === "curating";
    if (!persistable) return;
    saveFlowSnapshot({
      step,
      mode,
      eventConfig,
      makeoverConfig,
      maxBudget,
      noBudget,
      image,
      baseImage,
      roomAnalysis,
      personAnalysis,
      selectedItems,
      products,
      hotspots,
      generatedImage,
      designNarrative,
      designId,
      isUnlocked,
    });
  }, [
    step,
    mode,
    eventConfig,
    makeoverConfig,
    maxBudget,
    noBudget,
    image,
    baseImage,
    roomAnalysis,
    personAnalysis,
    selectedItems,
    products,
    hotspots,
    generatedImage,
    designNarrative,
    designId,
    isUnlocked,
  ]);

  const selectMode = useCallback((m: AppMode) => {
    setMode(m);
    setError(null);
    setStep(m === "event" ? "event-setup" : "upload");
  }, []);

  const submitEventConfig = useCallback((cfg: EventConfig) => {
    setEventConfig(cfg);
    setStep("upload");
  }, []);

  const handleImageSelected = useCallback(
    async (
      base64: string,
      selectedMode?: AppMode,
      selectedEventConfig?: EventConfig | null,
      selectedMaxBudget?: number,
      selectedMakeoverConfig?: MakeoverConfig | null,
      selectedNoBudget?: boolean
    ) => {
      const activeMode = selectedMode || mode;
      const activeEventConfig = selectedEventConfig !== undefined ? selectedEventConfig : eventConfig;
      const activeMakeoverConfig = selectedMakeoverConfig !== undefined ? selectedMakeoverConfig : makeoverConfig;
      if (selectedMode) setMode(activeMode);
      if (selectedEventConfig !== undefined) setEventConfig(activeEventConfig);
      if (selectedMakeoverConfig !== undefined) setMakeoverConfig(activeMakeoverConfig);
      setMaxBudget(selectedMaxBudget);
      setNoBudget(!!selectedNoBudget);

      setImage(base64);
      setBaseImage(base64);

      // Activation signal — every real photo upload, anon or authed. This is our
      // earliest interest metric (fires well before the paid design pipeline),
      // mirrored to the Meta Pixel as `ImageUploaded` so ad performance can be
      // read against actual uploads, not just landing-page views.
      track(
        "image_uploaded",
        { mode: activeMode, authed: authStatus === "authenticated" },
        { meta: true }
      );

      // Deferred sign-in gate: an anonymous user has now uploaded their photo —
      // the moment of peak intent. Persist the upload + setup (survives the
      // Google OAuth redirect) and show the "sign in to see your design" gate
      // instead of running the paid analysis/generation. The resume effect below
      // replays this once they're authenticated. No backend call happens for
      // anonymous users, so there's no anonymous-compute cost/abuse surface.
      if (authStatus !== "authenticated") {
        await savePendingUpload({
          base64,
          mode: activeMode,
          eventConfig: activeEventConfig,
          makeoverConfig: activeMakeoverConfig,
          maxBudget: selectedMaxBudget,
          noBudget: !!selectedNoBudget,
        });
        setAwaitingSignIn(true);
        // The single biggest drop-off point in the product, and until now it
        // emitted nothing at all — so "abandoned at the sign-in wall" was
        // indistinguishable from "abandoned during generation".
        trackFunnel("signin_gate_shown", { mode: activeMode });
        return;
      }

      setRetryCount(0);
      setStep("analyzing");
      setError(null);

      if (activeMode === "makeover") {
        const styleContext = activeMakeoverConfig
          ? `${activeMakeoverConfig.styleLabel} look`
          : "casual";
        setStatusMessage("Your stylist is analyzing your photo...");
        try {
          const res = await fetch("/api/analyze-person", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, styleContext }),
          });
          if (!res.ok) {
            const { error: msg } = await res.json().catch(() => ({ error: "" }));
            throw new Error(msg || "We couldn't analyze your photo. Try a clearer, well-lit shot.");
          }
          const analysis: PersonAnalysis = await res.json();
          setPersonAnalysis(analysis);
          // Map person's suggestedItems to RoomAnalysis shape so ProductSelection renders unchanged
          setRoomAnalysis({
            roomType: "person",
            currentStyle: analysis.currentStyle,
            dimensions: "medium",
            existingFurniture: [],
            lightingCondition: "bright",
            colorPalette: analysis.colorPalette,
            suggestedProducts: analysis.suggestedItems,
            clutterLevel: "clean",
            removableObjects: [],
            questions: [],
          });
          autoProceedRef.current = true; // fresh analysis → auto-skip selection
          setStep("product-selection");
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Failed to analyze your photo. Please try again."
          );
          setStep("upload");
        }
        return;
      }

      const eventContext = buildEventContext(activeMode === "event" ? activeEventConfig : null);
      const isEvent = activeMode === "event";

      setStatusMessage(
        isEvent
          ? "Your event planner is studying the venue..."
          : "Your designer is studying the space..."
      );

      try {
        stepMsRef.current = {};
        const analyzeT0 = performance.now();
        const res = await fetch("/api/analyze-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, eventContext }),
        });
        stepMsRef.current["analyze_room"] = Math.round(
          performance.now() - analyzeT0
        );
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: "" }));
          throw new Error(
            msg || "We couldn't read your photo. Try a clearer, well-lit shot."
          );
        }
        const analysis: RoomAnalysis = await res.json();
        setRoomAnalysis(analysis);
        // Cluttered room/venue → let the user pick what to remove BEFORE the
        // "what to add" step, since removals change what should be recommended
        // (e.g. remove the sofa → we can then offer a new sofa).
        const cluttered =
          analysis.clutterLevel !== "clean" &&
          (analysis.removableObjects?.length ?? 0) > 0;

        // Admin flag (server-decided, see /api/analyze-room): clear the room
        // for the user instead of asking them what to move.
        //
        // Makeover cannot reach here — it branches to /api/analyze-person
        // earlier in this function and jumps straight to product-selection —
        // which is what keeps emptyRoom away from a photo of a person. The
        // typechecker enforces that: `activeMode` is "space" | "event" here.
        const autoClear = !!analysis.alwaysEmpty;
        if (autoClear) {
          // Populate removedLabels anyway, even though no screen was shown.
          // Everything downstream keys off this list: `remaining` collapses to
          // "cleared / mostly empty", removedBlock and clearedZoneNote fire,
          // and `removedItems` persists real labels so the design page's
          // "Kept from your room" chips don't list furniture we just deleted.
          // Leaving it [] is what makes all of those silently wrong.
          const labels = (analysis.removableObjects ?? [])
            .map((o) => o.label)
            .filter((l) => !isProtectedLabel(l));
          setRemovedLabels(labels);
          // MUST be true. Product selection renders no component of its own —
          // this ref is the only thing that starts generation, so a cluttered
          // room that skips tidy-up without it dead-ends on a blank screen.
          autoProceedRef.current = true;
          setStep("product-selection");
        } else {
          // Non-cluttered → auto-skip selection now. Cluttered → the ref is set
          // after the tidy-up step instead (handleTidyUp).
          autoProceedRef.current = !cluttered;
          setStep(cluttered ? "tidy-up" : "product-selection");
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to analyze your room. Please try again."
        );
        setStep("upload");
      }
    },
    [mode, eventConfig, makeoverConfig, authStatus]
  );

  // Resume the deferred-sign-in flow after the Google OAuth round-trip. We send
  // users back to /create?resume=1; once authenticated, replay the stashed
  // upload straight into the normal (now authorized) analyze→generate pipeline.
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (resumeHandledRef.current) return;
    if (authStatus !== "authenticated") return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "1") return;
    resumeHandledRef.current = true;
    loadPendingUpload().then((p) => {
      // Drop the resume flag so a later refresh can't replay it.
      window.history.replaceState({}, "", "/create");
      if (!p) return;
      clearPendingUpload();
      setAwaitingSignIn(false);
      // Pairs with signin_gate_shown — the ratio between the two is the
      // conversion rate of the wall, a number we have never had.
      trackFunnel("signin_gate_returned", { mode: p.mode });
      handleImageSelected(
        p.base64,
        p.mode,
        p.eventConfig,
        p.maxBudget,
        p.makeoverConfig,
        p.noBudget
      );
    });
  }, [authStatus, handleImageSelected]);

  // Each create-pipeline call is expensive (a paid AI step). We stash each
  // step's output here so that if a later step fails, retrying resumes from the
  // failed step instead of re-running — and re-paying for — the earlier ones
  // (U2). A fresh submission clears this, so the happy path is unchanged.
  const progressRef = useRef<{
    selected?: SuggestedProduct[];
    // Cleared canvas from the upfront tidy-up step. Passed synchronously to
    // runPipeline to avoid a stale-closure race with setBaseImage.
    canvas?: string;
    recs?: ProductRecommendation[];
    categories?: unknown;
    designVision?: string;
    curatedProducts?: ProductResult[];
    narrative?: string;
    generatedImg?: string;
    hotspots?: Hotspot[];
    designId?: string | null;
  }>({});
  const [canRetry, setCanRetry] = useState(false);

  const runPipeline = useCallback(async () => {
    if (!roomAnalysis || !image) return;
    const p = progressRef.current;
    const selected = p.selected ?? [];

    setStep("generating");
    setError(null);
    setCanRetry(false);
    const pipelineT0 = performance.now();

    const eventContext = buildEventContext(mode === "event" ? eventConfig : null);
    const isEvent = mode === "event";
    const eventLabel = eventConfig?.eventLabel || "event";
    const subTheme = eventConfig?.subTheme || "";

    const callStep = async (url: string, body: unknown, failMsg: string) => {
      // Timed even when the step throws — a slow failure is exactly the case
      // worth seeing in the data.
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: "" }));
          throw new Error(msg || failMsg);
        }
        return await res.json();
      } finally {
        const key = url.replace("/api/", "").replace(/-/g, "_");
        stepMsRef.current[key] =
          (stepMsRef.current[key] ?? 0) + Math.round(performance.now() - t0);
      }
    };

    const isMakeover = mode === "makeover";

    try {
      // 0. Empty the items the user chose to remove in tidy-up, before designing.
      // Cached in p.canvas so a retry doesn't re-empty (and re-pay). Non-fatal:
      // on failure we design on the original photo.
      // Skip it entirely on a room the analysis already calls clean with nothing
      // in the way — there is nothing to clear, and this is a billed image call
      // on the pre-paywall path.
      const worthClearing =
        roomAnalysis?.clutterLevel !== "clean" ||
        (roomAnalysis?.removableObjects ?? []).some((o) => o.blocksFocal);

      if (removedLabels.length && image && !p.canvas && worthClearing) {
        setStatusMessage("Tidying up the room...");
        try {
          const objects = roomAnalysis?.removableObjects ?? [];
          const keepLabels = objects
            .map((o) => o.label)
            .filter((l) => !removedLabels.includes(l));
          // A shrine is usually too small to be listed as a removable object at
          // all (analyzeRoom excludes small items), so it would otherwise reach
          // the empty prompt with nothing protecting it but the prompt's own
          // wording. Name them explicitly as keeps.
          const protectedKeeps = DEVOTIONAL_KEEPS.filter(
            (l) => !keepLabels.includes(l)
          );
          // Kept items whose supporting object is being removed → must be
          // re-placed so they don't float.
          const removedIds = new Set(
            objects.filter((o) => removedLabels.includes(o.label)).map((o) => o.id)
          );
          const orphanedLabels = objects
            .filter((o) => !removedLabels.includes(o.label) && o.restsOn && removedIds.has(o.restsOn))
            .map((o) => o.label);
          const emptyT0 = performance.now();
          const emptyRes = await fetch("/api/empty-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image,
              removeLabels: removedLabels,
              keepLabels: [...keepLabels, ...protectedKeeps],
              orphanedLabels,
            }),
          });
          // A whole extra image generation — the single biggest swing between a
          // fast design and a slow one.
          stepMsRef.current["empty_room"] = Math.round(
            performance.now() - emptyT0
          );
          if (emptyRes.ok) {
            const { emptiedImage } = await emptyRes.json();
            const cleared = emptiedImage?.startsWith("data:")
              ? emptiedImage
              : emptiedImage
              ? `data:image/png;base64,${emptiedImage}`
              : null;
            if (cleared) {
              setBaseImage(cleared);
              p.canvas = cleared;
            }
          }
        } catch {
          /* non-fatal: design on the original photo */
        }
      }
      // Generate on the clean canvas (emptied room when decluttered, else the
      // original). `image` stays the true upload for saving and before/after.
      const canvas = p.canvas ?? baseImage ?? image;

      // 1. Design vision + product recommendations
      if (!p.recs || p.designVision === undefined) {
        setStep("generating");
        setStatusMessage(
          isMakeover
            ? "Your stylist is curating your outfit..."
            : isEvent
            ? `Creating a ${subTheme} decoration plan...`
            : "Creating a design vision for your room..."
        );

        if (isMakeover && personAnalysis) {
          const { items, outfitVision: vision }: {
            items: ProductRecommendation[];
            outfitVision: string;
          } = await callStep(
            "/api/recommend-outfit",
            {
              personAnalysis,
              styleType: makeoverConfig?.styleType || "casual",
              styleContext: makeoverConfig?.styleLabel || "casual",
              selectedItems: selected.map((s) => s.label),
              gender: makeoverConfig?.gender,
            },
            "We couldn't create an outfit plan. Please try again."
          );
          p.recs = items;
          p.designVision = vision || "";
          setOutfitVision(vision || "");
        } else {
          const { products: recs, designVision }: {
            products: ProductRecommendation[];
            designVision: string;
          } = await callStep(
            "/api/recommend-products",
            {
              roomAnalysis,
              userAnswers: {},
              // Events: let the decorator design from the analysis instead of
              // being locked to this list.
              //
              // `selected` is every suggestedProducts entry, auto-selected —
              // the "what to add" screen it came from was removed from the UI,
              // so nobody ever picks these, yet recommendProducts is told "You
              // MUST include one product for each of these types" and can add
              // nothing else. A birthday came back with four items and no
              // backdrop because analyzeRoom, looking at the still-furnished
              // photo, saw no clear wall and offered a banner — a decision that
              // survived the room being cleared moments later. Freed, the same
              // room yields a backdrop-anchored set every time.
              //
              // Space keeps the list: its suggestion rules ("do NOT suggest a
              // new sofa if one already exists") are what stop a room redesign
              // recommending replacement furniture.
              selectedProductTypes: eventContext ? [] : selected.map((s) => s.label),
              eventContext,
              removeLabels: removedLabels,
              // The clear was ours, not the user's — keeps space additive
              // instead of recommending replacement furniture.
              autoCleared: !!roomAnalysis?.alwaysEmpty,
            },
            "We couldn't create a design plan. Please try again."
          );
          p.recs = recs;
          p.designVision = designVision || "";
        }
      }

      // 2. Find matching products on Amazon
      if (!p.categories) {
        setStatusMessage(
          isEvent
            ? `Finding the best ${eventLabel} decorations on Amazon...`
            : "Your planner is finding matching products on Amazon..."
        );
        const { categories } = await callStep(
          "/api/search-products",
          { products: p.recs },
          "We couldn't find products on Amazon. Try selecting different items."
        );
        p.categories = categories;
      }

      // 3. Curate the cohesive set
      if (!p.curatedProducts) {
        setStep("curating");
        setStatusMessage(
          isEvent
            ? "Curating a cohesive party look..."
            : "Selecting the perfect combination..."
        );
        const { products: curatedProducts, designNarrative: narrative } =
          await callStep(
            "/api/curate-products",
            {
              originalImage: canvas,
              designVision: p.designVision || "Create a cohesive, stylish design",
              categories: p.categories,
              budgetInstruction: noBudget
                ? undefined
                : smartBudgetInstruction(
                    maxBudget,
                    (p.categories as SearchCategory[]) ?? []
                  ),
            },
            "We couldn't finalize the product selection. Please try again."
          );
        p.curatedProducts = curatedProducts;
        // For makeover, the stylist's outfitVision (stored in designVision) is
        // the note we want to show — not the room-worded curate narrative.
        p.narrative = isMakeover
          ? p.designVision || narrative || ""
          : narrative || "";
      }
      const curated = p.curatedProducts ?? [];
      setProducts(curated);
      setDesignNarrative(p.narrative || "");

      // 4. Render the design image
      if (!p.generatedImg) {
        setStep("generating");
        setStatusMessage(
          isMakeover
            ? "Dressing you in your new look..."
            : isEvent
            ? "Rendering your decorated venue..."
            : "Rendering your redesigned space..."
        );
        const productPayload = curated.map((pr: ProductResult) => ({
          category: pr.recommendation.category,
          placement: pr.recommendation.placement,
          title: pr.amazonProduct?.title || pr.recommendation.category,
          colorSuggestion: pr.recommendation.colorSuggestion,
          imageUrl: pr.amazonProduct?.imageUrl || "",
        }));
        const design = await callStep(
          isMakeover ? "/api/generate-makeover" : "/api/generate-image",
          isMakeover
            ? {
                originalImage: canvas,
                products: productPayload,
                styleHint: makeoverConfig?.styleLabel || "casual",
              }
            : {
                originalImage: canvas,
                eventContext,
                products: productPayload,
                // Estimated room geometry so generation respects real scale.
                geometry: roomAnalysis?.geometry,
                // Space redesigns may rearrange kept furniture (default on).
                optimizeLayout: mode === "space" ? optimizeLayout : false,
                // Stops the prompt describing furniture as present when the
                // empty pass has already removed it.
                canvasCleared: !!p.canvas,
              },
          isMakeover
            ? "We couldn't generate your makeover. Please try again."
            : "We couldn't render your room. Please try again."
        );
        p.generatedImg = design.generatedImage
          ? `data:image/png;base64,${design.generatedImage}`
          : image;
        p.hotspots = design.hotspots || [];
      }
      const genImg = p.generatedImg ?? image;
      setGeneratedImage(genImg);
      setHotspots(p.hotspots || []);

      // 5. Persist. Non-fatal: a save failure still shows the result.
      if (p.designId === undefined) {
        setStatusMessage("Saving your design...");
        try {
          const saveRes = await callStep(
            "/api/save-design",
            {
              mode,
              eventConfig,
              makeoverConfig,
              roomAnalysis,
              products: curated,
              hotspots: p.hotspots || [],
              designNarrative: p.narrative || "",
              originalImage: image,
              generatedImage: genImg,
              // For events the design is whatever the decorator chose, not the
              // phantom checklist — otherwise the "Added to your design" chips
              // name items that are not in the picture.
              selectedItems: eventContext
                ? (p.recs ?? []).map((r) => r.category)
                : selected.map((s) => s.label),
              removedItems: removedLabels,
              // So a later restyle re-renders on the cleared room, not the
              // furnished photo — otherwise the furniture silently returns.
              clearedImage: p.canvas ?? null,
            },
            "Failed to save your design."
          );
          p.designId = saveRes.designId;
          setDesignId(saveRes.designId);
          setIsUnlocked(!!saveRes.isUnlocked);
          setPromoApplied(!!saveRes.promoApplied);
        } catch (saveErr) {
          console.error("[save-design] Failed to save design:", saveErr);
          p.designId = null;
          setDesignId(null);
          setIsUnlocked(false);
          setPromoApplied(false);
        }
      }

      progressRef.current = {}; // success — clear the resume buffer
      // How long the user actually waited, and where it went. `pipeline_ms` is
      // from "generate" to "results"; `analyze_room` happened earlier, at
      // upload, so total perceived wait = analyze_room + pipeline_ms.
      trackFunnel("pipeline_timing", {
        mode,
        pipeline_ms: Math.round(performance.now() - pipelineT0),
        retried: retryCount > 0,
        ...stepMsRef.current,
      });
      trackFunnel("design_completed", { mode, designId: p.designId ?? null });
      setStep("results");
    } catch (e) {
      const retriesLeft = retryCount < MAX_PIPELINE_RETRIES;
      setError(
        retriesLeft
          ? e instanceof Error
            ? e.message
            : "Something went wrong. Please try again."
          : "We couldn't complete your design after several tries. Please start over with a new photo."
      );
      // Record which step actually failed — the old logging couldn't tell a
      // dead Amazon search from a failed render.
      trackFunnel("pipeline_failed", {
        mode,
        attempt: retryCount + 1,
        message: e instanceof Error ? e.message.slice(0, 120) : "unknown",
      });
      // Keep progressRef so the next attempt resumes from the failed step — but
      // only offer a retry while attempts remain (each retry is a paid gen).
      setCanRetry(retriesLeft);
      setStep("product-selection");
    }
  }, [roomAnalysis, image, baseImage, mode, eventConfig, makeoverConfig, personAnalysis, maxBudget, noBudget, removedLabels, optimizeLayout, retryCount]);

  const handleProductSelection = useCallback(
    async (selected: SuggestedProduct[]) => {
      setSelectedItems(selected);
      // Fresh submission → start a clean run (don't reuse stale partial work).
      // removedLabels lives in state and is read by runPipeline.
      progressRef.current = { selected };
      await runPipeline();
    },
    [runPipeline]
  );

  // Resume an interrupted run (a manual mid-generation refresh, or a sign-in
  // round-trip that got hijacked). Option 1: if the design already completed
  // server-side just before the interruption, jump straight to it — no new
  // (paid) generation. Only when nothing finished do we re-run the pipeline once.
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (!resumePending || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    setResumePending(false);
    (async () => {
      try {
        const res = await fetch("/api/user/designs");
        if (res.ok) {
          const { designs } = await res.json();
          const latest = designs?.[0];
          const ageMs = latest?.created_at
            ? Date.now() - new Date(latest.created_at).getTime()
            : Infinity;
          // A design created in the last few minutes is this interrupted run's
          // finished output — go to it instead of paying to regenerate.
          if (latest?.id && ageMs < 3 * 60 * 1000) {
            clearFlowSnapshot();
            setDesignId(latest.id);
            setStep("results"); // create page redirects to /design/[id]
            return;
          }
        }
      } catch {
        /* couldn't check — fall through and re-run */
      }
      const all = selectedItems.length
        ? selectedItems
        : refreshedSuggestions ?? roomAnalysis?.suggestedProducts ?? [];
      if (all.length) {
        handleProductSelection(all);
      } else {
        setStep("upload");
      }
    })();
  }, [
    resumePending,
    selectedItems,
    refreshedSuggestions,
    roomAnalysis,
    handleProductSelection,
  ]);

  // "Use a different photo" on the sign-in gate: drop the stashed upload and
  // return to the uploader.
  const changePhoto = useCallback(() => {
    setAwaitingSignIn(false);
    clearPendingUpload();
    setImage(null);
    setBaseImage(null);
    setStep("upload");
  }, []);

  // Auto-skip the "what to add" screen: on a fresh analysis (autoProceedRef set
  // by handleImageSelected / handleTidyUp), immediately proceed to generation
  // with EVERY suggested item selected. Guarded so it fires exactly once per
  // fresh entry and never on resume (ref unset) or after a pipeline failure
  // (`error` set) — both of which also land on "product-selection".
  useEffect(() => {
    if (
      step === "product-selection" &&
      autoProceedRef.current &&
      roomAnalysis &&
      !error
    ) {
      autoProceedRef.current = false;
      const all = refreshedSuggestions ?? roomAnalysis.suggestedProducts ?? [];
      handleProductSelection(all);
    }
  }, [step, roomAnalysis, refreshedSuggestions, error, handleProductSelection]);

  // Tidy-up step (runs BEFORE product selection). Record what to remove, and if
  // anything was removed, AI-refresh the "what to add" list so removals surface
  // replacements/fillers. The actual empty-room render is deferred to
  // runPipeline (only when the user commits by picking products).
  const handleTidyUp = useCallback(
    async (removeLabels: string[]) => {
      setRemovedLabels(removeLabels);
      setRefreshedSuggestions(null);
      if (removeLabels.length && image && roomAnalysis) {
        setStep("analyzing");
        setStatusMessage("Updating suggestions for your cleared room...");
        try {
          const res = await fetch("/api/refresh-suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Without this the refreshed checklist offers replacements for
            // whatever was cleared — a new TV for the TV removed to free the
            // wall for a mandap.
            body: JSON.stringify({
              image,
              roomAnalysis,
              removeLabels,
              eventContext: buildEventContext(
                mode === "event" ? eventConfig : null
              ),
            }),
          });
          if (res.ok) {
            const { suggestedProducts } = await res.json();
            if (Array.isArray(suggestedProducts) && suggestedProducts.length) {
              setRefreshedSuggestions(suggestedProducts);
            }
          }
          // Non-fatal: fall back to the original suggestion list on failure.
        } catch {
          /* ignore — keep original suggestions */
        }
      }
      autoProceedRef.current = true; // declutter done → auto-skip selection
      setStep("product-selection");
    },
    [image, roomAnalysis]
  );

  // Resume a failed run from the first incomplete step (U2). Capped so a
  // repeatedly-failing run can't trigger unlimited paid generations.
  const retryGeneration = useCallback(async () => {
    if (retryCount >= MAX_PIPELINE_RETRIES) {
      setCanRetry(false);
      setError(
        "We couldn't complete your design after several tries. Please start over with a new photo."
      );
      return;
    }
    setRetryCount((c) => c + 1);
    await runPipeline();
  }, [runPipeline, retryCount]);

  const handleRegenerate = useCallback(
    async (styleHint: string) => {
      if (!image || !products.length) return;
      if (restyleCount >= MAX_RESTYLES) {
        setError(
          `You've used all ${MAX_RESTYLES} restyles for this design. Start a new design to keep exploring.`
        );
        return;
      }
      setStep("generating");
      setError(null);
      setStatusMessage(`Applying ${styleHint} style...`);

      const isMakeover = mode === "makeover";
      const eventContext = buildEventContext(mode === "event" ? eventConfig : null);
      const productPayload = products.map((p: ProductResult) => ({
        category: p.recommendation.category,
        placement: p.recommendation.placement,
        title: p.amazonProduct?.title || p.recommendation.category,
        colorSuggestion: p.recommendation.colorSuggestion,
        imageUrl: p.amazonProduct?.imageUrl || "",
      }));

      try {
        const res = await fetch(isMakeover ? "/api/generate-makeover" : "/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isMakeover
              ? { originalImage: baseImage ?? image, products: productPayload, styleHint }
              : { originalImage: baseImage ?? image, eventContext, styleHint, products: productPayload }
          ),
        });
        if (!res.ok) throw new Error("Generation failed");
        const design = await res.json();
        const genImg = design.generatedImage
          ? `data:image/png;base64,${design.generatedImage}`
          : generatedImage;
        setGeneratedImage(genImg);
        setHotspots(design.hotspots || []);
        setRestyleCount((c) => c + 1);
        setStep("results");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Regeneration failed. Please try again."
        );
        setStep("results");
      }
    },
    [image, baseImage, products, mode, eventConfig, makeoverConfig, generatedImage, restyleCount]
  );

  // Post-unlock premium action: clear the room, then re-render the same products
  // on the emptied canvas. Gated to entitled users (called only when isUnlocked)
  // and shares the restyle cap so the extra paid gens stay bounded. Each run is
  // two image generations (empty-room + design), counted as one restyle.
  const clearAndRedesign = useCallback(async () => {
    if (!image || !products.length || !isUnlocked) return;
    if (restyleCount >= MAX_RESTYLES) {
      setError(
        `You've used all ${MAX_RESTYLES} restyles for this design. Start a new design to keep exploring.`
      );
      return;
    }
    setStep("generating");
    setError(null);
    setStatusMessage("Clearing the room...");

    const eventContext = buildEventContext(mode === "event" ? eventConfig : null);

    try {
      // 1. Empty the original room.
      const emptyRes = await fetch("/api/empty-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          removeLabels: (roomAnalysis?.removableObjects ?? []).map((o) => o.label),
          keepLabels: [],
        }),
      });
      if (!emptyRes.ok) {
        const { error: msg } = await emptyRes.json().catch(() => ({ error: "" }));
        throw new Error(msg || "We couldn't clear the room. Please try again.");
      }
      const { emptiedImage: emptied } = await emptyRes.json();
      const clearedCanvas = emptied.startsWith("data:")
        ? emptied
        : `data:image/png;base64,${emptied}`;
      setBaseImage(clearedCanvas);

      // 2. Re-render the current products on the cleared canvas.
      setStatusMessage("Redesigning your cleared room...");
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalImage: clearedCanvas,
          eventContext,
          geometry: roomAnalysis?.geometry,
          optimizeLayout: mode === "space" ? optimizeLayout : false,
          products: products.map((p: ProductResult) => ({
            category: p.recommendation.category,
            placement: p.recommendation.placement,
            title: p.amazonProduct?.title || p.recommendation.category,
            colorSuggestion: p.recommendation.colorSuggestion,
            imageUrl: p.amazonProduct?.imageUrl || "",
          })),
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const design = await res.json();
      const genImg = design.generatedImage
        ? `data:image/png;base64,${design.generatedImage}`
        : generatedImage;
      setGeneratedImage(genImg);
      setHotspots(design.hotspots || []);
      setRestyleCount((c) => c + 1);
      setStep("results");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn't clear & redesign. Please try again."
      );
      setStep("results");
    }
  }, [image, products, isUnlocked, restyleCount, mode, eventConfig, roomAnalysis, generatedImage, optimizeLayout]);

  const handleUnlocked = useCallback(() => {
    setIsUnlocked(true);
  }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setMode("space");
    setEventConfig(null);
    setMakeoverConfig(null);
    setPersonAnalysis(null);
    setOutfitVision("");
    setImage(null);
    setBaseImage(null);
    setGeneratedImage(null);
    setRoomAnalysis(null);
    setProducts([]);
    setHotspots([]);
    setDesignNarrative("");
    setDesignId(null);
    setIsUnlocked(false);
    setPromoApplied(false);
    setMaxBudget(undefined);
    setNoBudget(false);
    setRemovedLabels([]);
    setRefreshedSuggestions(null);
    setOptimizeLayout(false);
    setSelectedItems([]);
    setError(null);
    setStatusMessage("");
    setRestyleCount(0);
    setRetryCount(0);
    setCanRetry(false);
    setAwaitingSignIn(false);
    progressRef.current = {};
    clearFlowSnapshot();
    clearPendingUpload();
  }, []);

  return {
    step,
    awaitingSignIn,
    changePhoto,
    mode,
    eventConfig,
    makeoverConfig,
    personAnalysis,
    outfitVision,
    maxBudget,
    selectedItems,
    image,
    generatedImage,
    roomAnalysis,
    products,
    hotspots,
    designNarrative,
    designId,
    isUnlocked,
    promoApplied,
    error,
    statusMessage,
    selectMode,
    submitEventConfig,
    refreshedSuggestions,
    optimizeLayout,
    setOptimizeLayout,
    handleImageSelected,
    handleProductSelection,
    handleTidyUp,
    handleRegenerate,
    retryGeneration,
    canRetry,
    clearAndRedesign,
    canClearRoom:
      isUnlocked &&
      mode === "space" &&
      !!roomAnalysis &&
      roomAnalysis.clutterLevel !== "clean",
    restylesLeft: Math.max(0, MAX_RESTYLES - restyleCount),
    maxRestyles: MAX_RESTYLES,
    handleUnlocked,
    reset,
  };
}
