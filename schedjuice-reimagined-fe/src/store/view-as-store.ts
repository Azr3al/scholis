import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ViewAsEnterParams = {
  label: string;
  roles: string[];
  permissions: string[];
};

type ViewAsState = {
  active: boolean;
  label: string;
  roles: string[];
  permissions: string[];
  enter: (params: ViewAsEnterParams) => void;
  exit: () => void;
};

const initialState = {
  active: false,
  label: "",
  roles: [] as string[],
  permissions: [] as string[],
};

export const useViewAsStore = create<ViewAsState>()(
  persist(
    (set) => ({
      ...initialState,
      enter: ({ label, roles, permissions }) =>
        set({
          active: true,
          label,
          roles,
          permissions,
        }),
      exit: () => set(initialState),
    }),
    {
      name: "sj-view-as",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        active: state.active,
        label: state.label,
        roles: state.roles,
        permissions: state.permissions,
      }),
    },
  ),
);
