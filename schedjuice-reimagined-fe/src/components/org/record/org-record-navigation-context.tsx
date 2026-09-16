"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_ORG_SECTION,
  type OrgSectionId,
} from "@/config/org-record-sections";

type OrgRecordNavigationContextValue = {
  activeSection: OrgSectionId;
  setActiveSection: (section: OrgSectionId) => void;
  navigateToSection: (section: OrgSectionId) => void;
  registerNavigate: (fn: (section: OrgSectionId) => void) => void;
};

const OrgRecordNavigationContext =
  createContext<OrgRecordNavigationContextValue | null>(null);

export function OrgRecordNavigationProvider({
  children,
  initialSection = DEFAULT_ORG_SECTION,
}: {
  children: ReactNode;
  initialSection?: OrgSectionId;
}) {
  const navigateImpl = useRef<(section: OrgSectionId) => void>(() => {});
  const [activeSection, setActiveSection] =
    useState<OrgSectionId>(initialSection);

  const registerNavigate = useCallback(
    (fn: (section: OrgSectionId) => void) => {
      navigateImpl.current = fn;
    },
    [],
  );

  const navigateToSection = useCallback((section: OrgSectionId) => {
    navigateImpl.current(section);
  }, []);

  const value = useMemo(
    () => ({
      activeSection,
      setActiveSection,
      navigateToSection,
      registerNavigate,
    }),
    [activeSection, navigateToSection, registerNavigate],
  );

  return (
    <OrgRecordNavigationContext.Provider value={value}>
      {children}
    </OrgRecordNavigationContext.Provider>
  );
}

export function useOrgRecordNavigation() {
  return useContext(OrgRecordNavigationContext);
}
