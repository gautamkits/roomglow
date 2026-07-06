import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Privacy Policy — Noosho" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="June 2026">
      <p>
        This policy explains what we collect, why, and your choices. By using
        Noosho you agree to the practices described here.
      </p>
      <h2>What we collect</h2>
      <p>
        <strong>Account:</strong> when you sign in with Google we receive your
        name, email, and profile photo. <strong>Photos:</strong> room/venue
        images you upload. <strong>Designs:</strong> the generated images and
        product selections we save to your profile.
      </p>
      <h2>How we use it</h2>
      <p>
        To analyse your space, generate designs, match products, and save your
        results so you can revisit them. Uploaded photos are processed by our AI
        providers solely to create your design.
      </p>
      <h2>Sharing</h2>
      <p>
        We don&apos;t sell your data. We share photos with our AI processing
        providers (e.g. Google Gemini) and query Amazon for product matches.
        Affiliate links may attribute purchases to us.
      </p>
      <h2>Your choices</h2>
      <p>
        You can delete a saved design at any time, or use our{" "}
        <a href="/contact">contact page</a> to request deletion of your account
        and data.
      </p>
      <h2>Security</h2>
      <p>
        Data is stored with reputable cloud providers and transmitted over
        encrypted connections. No method is 100% secure, but we take reasonable
        measures to protect your information.
      </p>
    </LegalLayout>
  );
}
