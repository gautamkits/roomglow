"use client";

import { SessionProvider, signIn } from "next-auth/react";
import { Lock } from "lucide-react";

function Gate({ viewerEmail }: { viewerEmail?: string | null }) {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8">
        <div className="mx-auto w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mb-4">
          <Lock size={20} className="text-orange-700" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          This design is private
        </h1>
        {viewerEmail ? (
          <>
            <p className="text-sm text-zinc-500 mb-1">
              You&apos;re signed in as{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {viewerEmail}
              </span>
              , but this design hasn&apos;t been shared with that email.
            </p>
            <p className="text-sm text-zinc-500">
              Ask the person who sent you the link to share it with your email,
              or sign in with the email it was shared to.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-500 mb-5">
              If someone shared this design with you, sign in with Google using
              the email address they shared it to.
            </p>
            <button
              onClick={() => signIn("google")}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
            >
              Sign in with Google
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function AccessGate(props: { viewerEmail?: string | null }) {
  return (
    <SessionProvider>
      <Gate {...props} />
    </SessionProvider>
  );
}
