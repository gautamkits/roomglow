"use client";

import { useState, useCallback, useRef } from "react";
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

// Soft cap on free restyles per design — each restyle is a paid image generation.
const MAX_RESTYLES = 5;

// Each retry/clear below is a paid image generation, so cap them to stop a user
// (or tester) from triggering unlimited generations. These are client-side
// guards for UX; the API routes enforce a hard per-user/IP cap server-side.
const MAX_PIPELINE_RETRIES = 3;

function buildEventContext(cfg: EventConfig | null): string | undefined {
  if (!cfg) return undefined;
  const honoree = cfg.honoree ? ` It is for ${cfg.honoree}.` : "";
  const gender =
    cfg.gender && cfg.gender !== "Either / neutral"
      ? ` The celebration is for a ${cfg.gender.toLowerCase()}, so lean the palette and themed props accordingly (e.g. blue tones for a boy, pink tones for a girl) while still honoring the chosen "${cfg.colorScheme}" colors.`
      : "";
  return `This space will host a ${cfg.eventLabel} with a "${cfg.subTheme}" theme using a ${cfg.colorScheme} color scheme.${gender}${honoree} All signage and décor must match a ${cfg.eventLabel} — never a different occasion.`;
}

export function useRoomFlow() {
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
  const [maxBudget, setMaxBudget] = useState<number | undefined>(undefined);
  const [selectedItems, setSelectedItems] = useState<SuggestedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [restyleCount, setRestyleCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

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
      selectedMakeoverConfig?: MakeoverConfig | null
    ) => {
      const activeMode = selectedMode || mode;
      const activeEventConfig = selectedEventConfig !== undefined ? selectedEventConfig : eventConfig;
      const activeMakeoverConfig = selectedMakeoverConfig !== undefined ? selectedMakeoverConfig : makeoverConfig;
      if (selectedMode) setMode(activeMode);
      if (selectedEventConfig !== undefined) setEventConfig(activeEventConfig);
      if (selectedMakeoverConfig !== undefined) setMakeoverConfig(activeMakeoverConfig);
      setMaxBudget(selectedMaxBudget);

      setImage(base64);
      setBaseImage(base64);
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
        const res = await fetch("/api/analyze-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, eventContext }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: "" }));
          throw new Error(
            msg || "We couldn't read your photo. Try a clearer, well-lit shot."
          );
        }
        const analysis: RoomAnalysis = await res.json();
        setRoomAnalysis(analysis);
        setStep("product-selection");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to analyze your room. Please try again."
        );
        setStep("upload");
      }
    },
    [mode, eventConfig, makeoverConfig]
  );

  // Each create-pipeline call is expensive (a paid AI step). We stash each
  // step's output here so that if a later step fails, retrying resumes from the
  // failed step instead of re-running — and re-paying for — the earlier ones
  // (U2). A fresh submission clears this, so the happy path is unchanged.
  const progressRef = useRef<{
    selected?: SuggestedProduct[];
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
    // Generate on the clean canvas (emptied room when decluttered, else the
    // original). `image` stays the true upload for saving and before/after.
    const canvas = baseImage ?? image;

    setStep("generating");
    setError(null);
    setCanRetry(false);

    const eventContext = buildEventContext(mode === "event" ? eventConfig : null);
    const isEvent = mode === "event";
    const eventLabel = eventConfig?.eventLabel || "event";
    const subTheme = eventConfig?.subTheme || "";

    const callStep = async (url: string, body: unknown, failMsg: string) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "" }));
        throw new Error(msg || failMsg);
      }
      return res.json();
    };

    const isMakeover = mode === "makeover";

    try {
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
              selectedProductTypes: selected.map((s) => s.label),
              eventContext,
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
              budgetInstruction: maxBudget
                ? `BUDGET CONSTRAINT: Keep the COMBINED total of all chosen products at or under ₹${maxBudget.toLocaleString("en-IN")}. Prefer cheaper suitable options to stay within budget while keeping the design cohesive. Only exceed the cap for a category if it has no cheaper viable option.`
                : undefined,
            },
            "We couldn't finalize the product selection. Please try again."
          );
        p.curatedProducts = curatedProducts;
        p.narrative = narrative || "";
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
              selectedItems: selected.map((s) => s.label),
            },
            "Failed to save your design."
          );
          p.designId = saveRes.designId;
          setDesignId(saveRes.designId);
          setIsUnlocked(!!saveRes.isUnlocked);
        } catch (saveErr) {
          console.error("[save-design] Failed to save design:", saveErr);
          p.designId = null;
          setDesignId(null);
          setIsUnlocked(false);
        }
      }

      progressRef.current = {}; // success — clear the resume buffer
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
      // Keep progressRef so the next attempt resumes from the failed step — but
      // only offer a retry while attempts remain (each retry is a paid gen).
      setCanRetry(retriesLeft);
      setStep("product-selection");
    }
  }, [roomAnalysis, image, baseImage, mode, eventConfig, makeoverConfig, personAnalysis, maxBudget, retryCount]);

  const handleProductSelection = useCallback(
    async (selected: SuggestedProduct[]) => {
      setSelectedItems(selected);
      // Fresh submission → start a clean run (don't reuse stale partial work).
      progressRef.current = { selected };
      await runPipeline();
    },
    [runPipeline]
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
  }, [image, products, isUnlocked, restyleCount, mode, eventConfig, roomAnalysis, generatedImage]);

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
    setMaxBudget(undefined);
    setSelectedItems([]);
    setError(null);
    setStatusMessage("");
    setRestyleCount(0);
    setRetryCount(0);
    setCanRetry(false);
    progressRef.current = {};
  }, []);

  return {
    step,
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
    error,
    statusMessage,
    selectMode,
    submitEventConfig,
    handleImageSelected,
    handleProductSelection,
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
