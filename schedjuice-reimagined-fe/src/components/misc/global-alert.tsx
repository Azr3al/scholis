"use client";
import { Button, buttonVariants } from "@/components/primitives";
// need to rework this 22.6.2024
import { useState } from "react";
import { Xmark as Cross, Xmark as X } from "iconoir-react";
import useGlobalAlertStore from "@/store/global-alert";

interface IGlobalAlertProps {

}
const GlobalAlert: React.FC<IGlobalAlertProps> = () => {
  const { isVisible, setIsVisible, message } = useGlobalAlertStore();

  return (
    <>
      {isVisible && (
        <div className="sticky top-2 z-banner rounded-md bg-destructive-400 text-white p-2 px-4 flex justify-between items-center border border-destructive">
          {message}
          <Button
            variant={"ghost"}
            className=""
            size="sm"
            onClick={() => setIsVisible(false)}
          >
            <X></X>
          </Button>
        </div>
      )}
    </>
  );
};

export default GlobalAlert;
