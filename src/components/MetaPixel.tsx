"use client";

import Script from "next/script";

/**
 * Meta Pixel base code. Fires PageView on load and defines the global `fbq`
 * used by `trackMeta()` for client-side events (DesignCreated, InitiateCheckout).
 * The pixel also sets the _fbp/_fbc cookies that server-side CAPI reads and that
 * website Custom Audiences (retargeting) are built from — so it must load even
 * though the highest-value events are sent server-side.
 *
 * Renders nothing unless NEXT_PUBLIC_META_PIXEL_ID is set.
 */
export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
