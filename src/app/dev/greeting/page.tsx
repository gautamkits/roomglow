import { notFound } from "next/navigation";
import GreetingCanvas from "./GreetingCanvas";

// Offline render host for scripts/greeting-video.ts. Dev server only — a
// production build 404s, so nothing here ships to users.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GreetingCanvas />;
}
