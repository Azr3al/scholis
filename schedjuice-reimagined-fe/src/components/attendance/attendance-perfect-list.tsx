"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/misc/accordion";
import { type PerfectAttendanceStudent } from "@/helpers/attendance-dashboard";
import { staggerItem, staggerList } from "@/lib/sj/motion";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

type AttendancePerfectListProps = {
  students: PerfectAttendanceStudent[];
  /** Collapse when this changes (month anchor). */
  monthKey: string;
  onSelectStudent?: (id: number) => void;
};

const PERFECT_ITEM = "perfect";

export function AttendancePerfectList({
  students,
  monthKey,
  onSelectStudent,
}: AttendancePerfectListProps) {
  const [openValue, setOpenValue] = useState<string[]>([]);

  useEffect(() => {
    setOpenValue([]);
  }, [monthKey]);

  const count = students.length;
  const noun = count === 1 ? "student" : "students";

  return (
    <Accordion
      value={openValue}
      onValueChange={(value) => setOpenValue(value as string[])}
      className="border-b border-border-subtle"
    >
      <AccordionItem value={PERFECT_ITEM} className="border-b-0">
        <AccordionTrigger className="py-3 text-sm font-normal text-text-primary hover:bg-surface-hover hover:no-underline">
          <span>
            Perfect attendance ·{" "}
            <span className="font-mono tabular-nums">{count}</span> {noun}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-0">
          {count === 0 ? (
            <p className="py-3 text-sm text-text-muted">
              No one has perfect attendance yet this month.
            </p>
          ) : (
            <motion.ul
              className="max-h-[32.5rem] overflow-y-auto"
              variants={staggerList}
              initial="hidden"
              animate="show"
              role="list"
            >
              {students.map((student) => (
                <motion.li key={student.id} variants={staggerItem}>
                  <button
                    type="button"
                    className="flex min-h-[52px] w-full items-center border-b border-border-subtle px-1 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                    onClick={() => onSelectStudent?.(student.id)}
                  >
                    {student.name}
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
