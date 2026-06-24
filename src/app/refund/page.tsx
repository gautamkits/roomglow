import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Refund Policy — Noosho" };

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" updated="June 2026">
      <p>
        Noosho is currently free to use — you can generate designs and view
        results at no charge. If and when paid design unlocks or credits are
        introduced, the following applies.
      </p>
      <h2>Digital goods</h2>
      <p>
        A design unlock is a digital product delivered instantly. Because the
        result is generated and revealed immediately, unlocks are generally
        non-refundable once viewed.
      </p>
      <h2>When we&apos;ll make it right</h2>
      <p>
        If a generation fails, you were charged in error, or the result did not
        deliver, email{" "}
        <a href="mailto:hello@noosho.com">hello@noosho.com</a> within 7 days
        with your account email and we&apos;ll refund or re-credit you.
      </p>
      <h2>Product purchases</h2>
      <p>
        Products you buy are sold and fulfilled by Amazon. Returns and refunds
        for those purchases follow Amazon&apos;s own policies.
      </p>
    </LegalLayout>
  );
}
