export interface RoomAnalysis {
  roomType: string;
  currentStyle: string;
  dimensions: string;
  existingFurniture: string[];
  lightingCondition: string;
  colorPalette: string[];
  suggestedProducts: SuggestedProduct[];
  clutterLevel: ClutterLevel;
  removableObjects: RemovableObject[];
  questions: Question[]; // kept for backwards compatibility
}

export type ClutterLevel = "clean" | "moderate" | "cluttered";

export interface RemovableObject {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  question: string;
  options: QuestionOption[];
}

export interface QuestionOption {
  label: string;
  value: string;
}

export interface ProductRecommendation {
  category: string;
  searchQuery: string;
  placement: string;
  reason: string;
  colorSuggestion: string;
}

export interface AmazonProduct {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export interface ProductResult {
  recommendation: ProductRecommendation;
  amazonProduct: AmazonProduct | null;
}

// A complementary, occasion-specific buyable shown in the "Complete the occasion"
// grid for event designs. Not placed in the image — purely shoppable.
export interface OccasionProduct {
  category: string;
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export interface Hotspot {
  productIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SuggestedProduct {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export type AppMode = "space" | "event";

export interface EventConfig {
  eventType: string;
  eventLabel: string;
  subTheme: string;
  colorScheme: string;
  honoree?: string;
  eventDate?: string;
  gender?: string;
}

export type FlowStep =
  | "mode-select"
  | "event-setup"
  | "upload"
  | "analyzing"
  | "product-selection"
  | "generating"
  | "curating"
  | "results";
