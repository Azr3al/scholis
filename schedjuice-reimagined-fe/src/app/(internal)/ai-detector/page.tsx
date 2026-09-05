"use client";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest } from "@/app/client-api/utils";
import { TypographyH1 } from "@/components/typography/h1";
import { Button, Textarea } from "@/components/primitives";
import { AiDetectorResponse } from "@/types/ai-detector";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const AiDetectorPage = () => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AiDetectorResponse | null>(null);
  const wordCount = useMemo(() => {
    const t = text.trim();
    if (t === "") return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [text]);
  const mutation = useMutation({
    mutationKey: ["ai-detector"],
    mutationFn: async () => {
      const res = await makePostRequest("detect-ai", { text });
      return res.data;
    },
    onSuccess: (data) => {
      const res = data as AiDetectorResponse;
      setResult(res);
    },
  });

  const firstDoc = result?.data.documents?.[0];

  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <TypographyH1>Detect AI</TypographyH1>
      <p className="text-text-secondary">Enter text to detect AI</p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[200px]"
      />
      <p className="text-text-secondary">Word count: {wordCount}</p>
      <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
        Submit
      </Button>
      {mutation.isSuccess && (
        <div>
          {firstDoc ? (
            <>
              <p>{firstDoc.result_message}</p>
              <p>
                <span>Predicted as</span>:{" "}
                <span className="font-bold">{firstDoc.predicted_class}</span>
              </p>
              <p>
                <span>Confidence score</span>:{" "}
                <span className="font-bold">
                  {(Number(firstDoc.confidence_score) * 100).toFixed(4)}%
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-text-muted">
              No detection result returned.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
};

export default AiDetectorPage;
