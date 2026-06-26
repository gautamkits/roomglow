"use client";

import { useState, useCallback } from "react";
import type {
  AppMode,
  EventConfig,
  FlowStep,
  RoomAnalysis,
  SuggestedProduct,
  ProductRecommendation,
  ProductResult,
  Hotspot,
} from "@/lib/types";

// Soft cap on free restyles per design — each restyle is a paid image generation.
const MAX_RESTYLES = 5;

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
  const [image, setImage] = useState<string | null>(null);
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
      selectedMaxBudget?: number
    ) => {
      const activeMode = selectedMode || mode;
      const activeEventConfig = selectedEventConfig !== undefined ? selectedEventConfig : eventConfig;
      if (selectedMode) setMode(activeMode);
      if (selectedEventConfig !== undefined) setEventConfig(activeEventConfig);
      setMaxBudget(selectedMaxBudget);

      setImage(base64);
      setStep("analyzing");
      setError(null);

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
    [mode, eventConfig]
  );

  const handleProductSelection = useCallback(
    async (selected: SuggestedProduct[]) => {
      if (!roomAnalysis || !image) return;
      setSelectedItems(selected);
      setStep("generating");
      setError(null);

      const eventContext = buildEventContext(
        mode === "event" ? eventConfig : null
      );
      const isEvent = mode === "event";
      const eventLabel = eventConfig?.eventLabel || "event";
      const subTheme = eventConfig?.subTheme || "";

      const callStep = async (
        url: string,
        body: unknown,
        failMsg: string
      ) => {
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

      try {
        setStatusMessage(
          isEvent
            ? `Creating a ${subTheme} decoration plan...`
            : "Creating a design vision for your room..."
        );
        const {
          products: recs,
          designVision,
        }: {
          products: ProductRecommendation[];
          designVision: string;
        } = await callStep(
          "/api/recommend-products",
          {
            roomAnalysis,
            userAnswers: {},
            selectedProductTypes: selected.map((p) => p.label),
            eventContext,
          },
          "We couldn't create a design plan. Please try again."
        );

        setStatusMessage(
          isEvent
            ? `Finding the best ${eventLabel} decorations on Amazon...`
            : "Your planner is finding matching products on Amazon..."
        );
        const { categories } = await callStep(
          "/api/search-products",
          { products: recs },
          "We couldn't find products on Amazon. Try selecting different items."
        );

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
              originalImage: image,
              designVision:
                designVision || "Create a cohesive, stylish design",
              categories,
              budgetInstruction: maxBudget
                ? `BUDGET CONSTRAINT: Keep the COMBINED total of all chosen products at or under ₹${maxBudget.toLocaleString("en-IN")}. Prefer cheaper suitable options to stay within budget while keeping the design cohesive. Only exceed the cap for a category if it has no cheaper viable option.`
                : undefined,
            },
            "We couldn't finalize the product selection. Please try again."
          );

        setProducts(curatedProducts);
        setDesignNarrative(narrative || "");

        setStatusMessage(
          isEvent
            ? "Rendering your decorated venue..."
            : "Rendering your redesigned space..."
        );
        const design = await callStep(
          "/api/generate-image",
          {
            originalImage: image,
            eventContext,
            products: curatedProducts.map((p: ProductResult) => ({
              category: p.recommendation.category,
              placement: p.recommendation.placement,
              title: p.amazonProduct?.title || p.recommendation.category,
              colorSuggestion: p.recommendation.colorSuggestion,
              imageUrl: p.amazonProduct?.imageUrl || "",
            })),
          },
          "We couldn't render your room. Please try again."
        );

        const genImg = design.generatedImage
          ? `data:image/png;base64,${design.generatedImage}`
          : image;
        setGeneratedImage(genImg);
        setHotspots(design.hotspots || []);

        // Save to DB. If the user is already signed in, save-design returns
        // isUnlocked=true and the design is linked to their account immediately.
        setStatusMessage("Saving your design...");
        try {
          const saveRes = await callStep(
            "/api/save-design",
            {
              mode,
              eventConfig,
              roomAnalysis,
              products: curatedProducts,
              hotspots: design.hotspots || [],
              designNarrative: narrative || "",
              originalImage: image,
              generatedImage: genImg,
              selectedItems: selected.map((p) => p.label),
            },
            "Failed to save your design."
          );
          setDesignId(saveRes.designId);
          setIsUnlocked(!!saveRes.isUnlocked);
        } catch (saveErr) {
          // Non-fatal — still show the result, just unsaved/locked
          console.error("[save-design] Failed to save design:", saveErr);
          setDesignId(null);
          setIsUnlocked(false);
        }

        setStep("results");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again."
        );
        setStep("product-selection");
      }
    },
    [roomAnalysis, image, mode, eventConfig, maxBudget]
  );

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

      const eventContext = buildEventContext(mode === "event" ? eventConfig : null);

      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalImage: image,
            eventContext,
            styleHint,
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
          e instanceof Error ? e.message : "Regeneration failed. Please try again."
        );
        setStep("results");
      }
    },
    [image, products, mode, eventConfig, generatedImage, restyleCount]
  );

  const handleUnlocked = useCallback(() => {
    setIsUnlocked(true);
  }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setMode("space");
    setEventConfig(null);
    setImage(null);
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
  }, []);

  return {
    step,
    mode,
    eventConfig,
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
    restylesLeft: Math.max(0, MAX_RESTYLES - restyleCount),
    maxRestyles: MAX_RESTYLES,
    handleUnlocked,
    reset,
  };
}
