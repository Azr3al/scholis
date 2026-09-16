"use client";
import getStrategy, { StrategyType } from "@/app/artifacts";
import { ArtifactType } from "@/app/artifacts/types";
import { useTenant } from "./useTenant";
import { useEffect, useState } from "react";

const useStrategy = <T extends StrategyType>(
  artifact: ArtifactType,
  strategyName: string
) => {
  const [strategy, setStrategy] = useState<T | null>(null);
  const { tenant } = useTenant();

  useEffect(() => {
    if (tenant) {
      const strategy = getStrategy(artifact, strategyName);
      setStrategy(strategy as T);
    }
  }, [tenant, artifact, strategyName]);

  return strategy;
};

export default useStrategy;

