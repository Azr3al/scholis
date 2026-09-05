import trainingCenterColumns from "./columns/training-center";
import { ColumnStrategyType } from "./columns/types";
import { ArtifactType } from "./types";

export type StrategyType = ColumnStrategyType;

const strategies: { name: string; strategy: StrategyType }[] = [
  {
    name: "training-center",
    strategy: trainingCenterColumns,
  },
];

export default function getStrategy(
  artifact: ArtifactType,
  strategyName: string
) {
  const strategy = strategies.find(
    (s) => s.name === strategyName && s.strategy.artifact === artifact
  );
  if (!strategy) {
    throw new Error(`Strategy ${strategyName} not found`);
  }
  return strategy.strategy;
}

