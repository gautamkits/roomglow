import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Contact — RoomGlow" };

export default function ContactPage() {
  return (
    <LegalLayout title="Contact us">
      <p>
        We&apos;d love to hear from you — whether it&apos;s a question, a bug, or
        feedback on your designs.
      </p>
      <h2>Email</h2>
      <p>
        General & support:{" "}
        <a href="mailto:hello@roomglow.app">hello@roomglow.app</a>
      </p>
      <h2>Response time</h2>
      <p>
        We typically reply within 1–2 business days. For payment or unlock
        issues, include the email you signed in with so we can find your
        account quickly.
      </p>
    </LegalLayout>
  );
}
