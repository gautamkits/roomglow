"use client";

import { useState, useRef, useCallback } from "react";
import { ImagePlus, X } from "lucide-react";

interface ImageUploadProps {
  onImageSelected: (base64: string) => void;
}

export default function ImageUpload({ onImageSelected }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
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
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL("image/jpeg", 0.85);
          setPreview(base64);
          onImageSelected(base64);
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
          className={`w-full rounded-xl p-10 text-center transition-colors border border-dashed ${
            dragActive
              ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30"
              : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600"
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center border ${
                dragActive
                  ? "border-orange-700 text-orange-700"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500"
              }`}
            >
              <ImagePlus size={22} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Drop a room photo, or click to upload
              </p>
              <p className="text-xs text-zinc-500 mt-1">JPG or PNG, up to ~10MB</p>
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
    </div>
  );
}
