import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "About — RoomGlow" };

export default function AboutPage() {
  return (
    <LegalLayout title="About RoomGlow">
      <p>
        RoomGlow turns a single room photo into a designer-quality space — and
        shows you the exact products to recreate it. We believe great interior
        and event design shouldn&apos;t require a professional budget or hours of
        scrolling through catalogues.
      </p>
      <h2>What we do</h2>
      <p>
        Upload a photo of your room or event venue. Our AI analyses the space,
        proposes a cohesive design, generates a photorealistic preview, and
        matches every item to real, shoppable products. One photo in — a styled,
        buyable room out.
      </p>
      <h2>Who it&apos;s for</h2>
      <p>
        Homeowners, renters, and anyone planning a celebration — birthdays,
        anniversaries, annaprasan, baby showers — who wants a beautiful result
        without hiring a designer.
      </p>
      <h2>Get in touch</h2>
      <p>
        Questions or feedback? Reach us any time at{" "}
        <a href="mailto:hello@roomglow.app">hello@roomglow.app</a>.
      </p>
    </LegalLayout>
  );
}
