"use client";

import { Button } from "@/components/primitives";
import { useRouter } from "next/navigation";

const DummyPage = () => {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-between gap-5">
      <p className="text-center text-3xl text-text-primary">
        Documentations are still in progress. <br /> Thank you for your
        understanding.
      </p>
      <Button onClick={() => router.back()}>Back</Button>
    </div>
  );
};

export default DummyPage;
