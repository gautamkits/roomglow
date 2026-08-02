"use client";

import { useState, useRef, useCallback } from "react";
import { ImagePlus, X, Loader2, AlertCircle } from "lucide-react";

interface ImageUploadProps {
  onImageSelected: (base64: string) => void;
}

// Phone photos are routinely 10-25MB; anything past this is a video or a
// scan and will only stall the decode.
const MAX_BYTES = 30 * 1024 * 1024;

export default function ImageUpload({ onImageSelected }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      // Every one of these used to be a silent no-op: the component had no
      // error state at all, so a rejected file left the user tapping a button
      // that appeared to do nothing.
      if (!file.type.startsWith("image/")) {
        setError("That's not an image. Pick a JPG, PNG or HEIC photo.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("That photo is too large. Try one under 30MB.");
        return;
      }

      setBusy(true);
      const fail = (msg: string) => {
        setBusy(false);
        setError(msg);
      };

      const reader = new FileReader();
      reader.onerror = () => fail("We couldn't read that file. Try another photo.");
      reader.onload = (e) => {
        const img = new Image();
        // Most commonly an iPhone HEIC that this browser can't decode — which
        // previously just did nothing at all.
        img.onerror = () =>
          fail("We couldn't open that photo. Try saving it as a JPG first.");
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const maxSize = 1024;
            let { width, height } = img;
            if (width > maxSize || height > maxSize) {
              if (width > height) {
                height = (height / width) * maxSize;
                width = maxSize;
              } else {
                width = (width / height) * maxSize;
                height = maxSize;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return fail("Your browser couldn't process that photo.");
            ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL("image/jpeg", 0.85);
            setBusy(false);
            setPreview(base64);
            onImageSelected(base64);
          } catch {
            fail("We couldn't process that photo. Try another one.");
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [onImageSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="w-full">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <img src={preview} alt="Selected room" className="w-full" />
          <button
            onClick={() => {
              setPreview(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove photo"
            className="absolute top-3 right-3 bg-zinc-900/70 text-white rounded-md w-8 h-8 flex items-center justify-center hover:bg-zinc-900 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`w-full rounded-xl p-10 text-center transition-colors border-2 border-dashed ${
            dragActive
              ? "border-orange-700 bg-orange-100/60 dark:bg-orange-950/40"
              : "border-orange-300 dark:border-orange-900/60 bg-orange-50/50 dark:bg-orange-950/20 hover:border-orange-500 hover:bg-orange-50 dark:hover:border-orange-700"
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                dragActive
                  ? "bg-orange-700 text-white"
                  : "bg-orange-700/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
              }`}
            >
              {busy ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <ImagePlus size={22} strokeWidth={1.75} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {busy ? "Preparing your photo…" : "Tap to upload your photo"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Take one now or pick from your gallery · JPG or PNG
              </p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            }}
          />
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2.5 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400"
        >
          <AlertCircle size={14} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
