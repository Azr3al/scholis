import React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface globalAlertState {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
  message: React.ReactNode;
  setMessage: (message: React.ReactNode) => void;
}

export const useGlobalAlertStore = create(
  persist<globalAlertState>(
    (set, get) => ({
      isVisible: false,
      setIsVisible: (isVisible: boolean) => set({ isVisible }),
      message: <></>,
      setMessage: (message: React.ReactNode) => set({ message }),
    }),

    {
      name: "global-alert-storage",
    }
  )
);

export default useGlobalAlertStore;
