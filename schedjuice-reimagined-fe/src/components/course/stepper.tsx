import { ArrowLeft, ArrowRight, Check, Circle } from "iconoir-react";
import { Separator } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

interface IStepperProps {
  title?: string;
  steps: string[];
  step: number;
  setStep: (step: number) => void;
  canSkipStep?: boolean;
  completedStepIndexes: number[];
  allOtherStepsDisabled?: boolean
}

const Stepper: React.FC<IStepperProps> = ({
  title="Steps",
  steps,
  step,
  setStep,
  canSkipStep = false,
  completedStepIndexes,
  allOtherStepsDisabled=false
}) => {
  const isDisabled = (index: number) => {
    if(allOtherStepsDisabled){
      return(index!==step)
    }
    if (canSkipStep || index === step || completedStepIndexes.includes(index) || completedStepIndexes.includes(index-1)) {
      return false;
    }
    return true;
  };
  return (
    <>
      <div className="space-y-3">
        <p className="text-center">{title}</p>
        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => setStep(step + -1)}
            disabled={step === 0 || allOtherStepsDisabled}
            variant={"ghost"}
            size={"sm"}
            className="size-8 p-0"
          >
            <ArrowLeft></ArrowLeft>
          </Button>
          {steps.map((s, i) => (
            <>
              <Button
              key={i}
                variant={"secondary"}
                disabled={isDisabled(i)}
                onClick={() => setStep(i)}
                className={cn({
                  "border-success": completedStepIndexes.includes(i),
                  "border-status-blue": i === step,
                })}
              >
                {i+1}
              </Button>
            </>
          ))}
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === steps.length ||
              !(canSkipStep
                ? canSkipStep
                : (completedStepIndexes.includes(step))))
            }
            variant={"ghost"}
            size={"sm"}
            className="size-8 p-0"
          >
            <ArrowRight></ArrowRight>
          </Button>
        </div>
        <h3 className=" text-xl text-center">{steps[step]}</h3>
      </div>
    </>
  );
};

export default Stepper;
