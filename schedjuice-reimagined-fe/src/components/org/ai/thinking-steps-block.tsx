"use client";

import { formatAiTokens, type AiUsageThinkingStep } from "@/types/ai-usage";

function silentToolStepCount(
  steps: AiUsageThinkingStep[],
  toolIterations?: number,
): number {
  return Math.max(toolIterations ?? 0, steps.length);
}

function totalThinkingTokens(steps: AiUsageThinkingStep[]): number {
  return steps.reduce((sum, step) => sum + step.thinking_tokens, 0);
}

function SilentToolStepsMessage({
  stepCount,
  thinkingTokens,
}: {
  stepCount: number;
  thinkingTokens: number;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      Model used {stepCount.toLocaleString()} tool step
      {stepCount === 1 ? "" : "s"} without returning thought summaries.
      {thinkingTokens > 0
        ? ` (${formatAiTokens(thinkingTokens)} thinking tokens were used.)`
        : null}
    </p>
  );
}

export function ThinkingStepsBlock({
  steps,
  toolIterations,
}: {
  steps: AiUsageThinkingStep[];
  toolIterations?: number;
}) {
  const stepsWithText = steps.filter((step) => step.text.trim());
  const silentSteps = steps.filter((step) => !step.text.trim());
  const silentCount = silentToolStepCount(steps, toolIterations);

  if (!stepsWithText.length) {
    if (silentCount > 0 || totalThinkingTokens(steps) > 0) {
      return (
        <SilentToolStepsMessage
          stepCount={silentCount}
          thinkingTokens={totalThinkingTokens(steps)}
        />
      );
    }
    return (
      <p className="text-sm text-muted-foreground">No reasoning captured.</p>
    );
  }

  return (
    <div className="space-y-2">
      {silentSteps.length > 0 ? (
        <SilentToolStepsMessage
          stepCount={silentCount}
          thinkingTokens={totalThinkingTokens(silentSteps)}
        />
      ) : null}
      {stepsWithText.map((step) => (
        <div
          key={step.iteration}
          className="rounded-md border border-border bg-background p-3"
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Step {step.iteration}
            {step.thinking_tokens > 0
              ? ` · ${formatAiTokens(step.thinking_tokens)} thinking tokens`
              : null}
          </p>
          <p className="whitespace-pre-wrap text-sm">{step.text}</p>
        </div>
      ))}
    </div>
  );
}
