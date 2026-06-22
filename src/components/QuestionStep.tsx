"use client";

import type { Question } from "@/lib/types";

interface QuestionStepProps {
  question: Question;
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
}

export default function QuestionStep({
  question,
  selectedValue,
  onSelect,
}: QuestionStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
        {question.question}
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {question.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={`px-5 py-4 rounded-xl text-left font-medium transition-all ${
              selectedValue === option.value
                ? "bg-indigo-500 text-white shadow-lg scale-[1.02]"
                : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
