import LegalLayout from "@/components/LegalLayout";
import ContactForm from "@/components/ContactForm";

export const metadata = { title: "Contact — Noosho" };

export default function ContactPage() {
  return (
    <LegalLayout title="Contact us">
      <p>
        We&apos;d love to hear from you — whether it&apos;s a question, a bug, or
        feedback on your designs. Send us a message below.
      </p>
      <h2>Send a message</h2>
      <p>
        For payment or unlock issues, include the email you signed in with so we
        can find your account quickly.
      </p>
      <ContactForm />
      <h2>Response time</h2>
      <p>We typically reply within 1–2 business days.</p>
    </LegalLayout>
  );
}
