"use client";

import { useState } from "react";
import type { Question } from "@/lib/types";
import QuestionStep from "./QuestionStep";

interface QuestionnaireProps {
  questions: Question[];
  onComplete: (answers: Record<string, string>) => void;
}

export default function Questionnaire({
  questions,
  onComplete,
}: QuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleSelect = (questionId: string, value: string) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);

    if (currentStep < questions.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300);
    } else {
      setTimeout(() => onComplete(newAnswers), 300);
    }
  };

  const question = questions[currentStep];

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex gap-1.5 mb-8">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentStep ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          />
        ))}
      </div>

      <QuestionStep
        key={question.id}
        question={question}
        selectedValue={answers[question.id]}
        onSelect={(value) => handleSelect(question.id, value)}
      />
    </div>
  );
}
