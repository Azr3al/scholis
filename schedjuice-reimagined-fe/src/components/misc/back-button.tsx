"use client";
import { Button, buttonVariants } from "@/components/primitives";
import { useRouter, useSearchParams } from "next/navigation";
import { NavArrowLeft as ArrowLeft, NavArrowLeft as ChevronLeft } from "iconoir-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import BackBtnSuspence from "./back-btn-suspence";

interface BackButtonProps {
  href?: string;
  sendBack?: boolean;
  label?: string;
  className?: string;
}

const BackButton: React.FC<BackButtonProps> = (props) => {
  return (
    <Suspense>
      <BackBtnSuspence {...props}></BackBtnSuspence>
    </Suspense>
  );
};

export default BackButton;
