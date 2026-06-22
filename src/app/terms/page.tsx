import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Terms & Conditions — RoomGlow" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated="June 2026">
      <p>
        These terms govern your use of RoomGlow. By using the service you agree
        to them.
      </p>
      <h2>The service</h2>
      <p>
        RoomGlow generates AI design suggestions and matches them to products
        available on Amazon. Generated images are illustrative previews, not
        guarantees of exact real-world results.
      </p>
      <h2>Products & pricing</h2>
      <p>
        Product details, prices, and availability are controlled by Amazon and
        may change at any time. We are an Amazon Associate and earn commissions
        from qualifying purchases made through our links, at no extra cost to
        you.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Upload only images you have the right to use. Don&apos;t use the service
        for unlawful purposes or attempt to disrupt it.
      </p>
      <h2>Limitation of liability</h2>
      <p>
        The service is provided &quot;as is.&quot; We are not liable for design
        decisions, purchases, or any indirect damages arising from use of the
        service.
      </p>
      <h2>Contact</h2>
      <p>
        Questions? <a href="mailto:hello@roomglow.app">hello@roomglow.app</a>
      </p>
    </LegalLayout>
  );
}
