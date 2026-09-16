"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { ArrowRight, Check, CheckCircle, NavArrowRight as ChevronRight } from "iconoir-react";
import { RandomPatternImage } from "../course/random-pattern-image";
import Image from "next/image";
import Link from "next/link";
import { seededRandom } from "@/helpers/generate-pattern";

interface BookCardProps {
  id: string;
  animationDelay: number;
}

const BookCard: React.FC<BookCardProps> = ({ id, animationDelay }) => {
  const baseHue = seededRandom(parseInt(id))();
  return (
    <div className="flex gap-3 max-sm:flex-col">
      {/* <Image
        className=" object-cover w-[150px] h-[200px]"
        src={"/images/doggo.jpg"}
        width={300}
        height={400}
        alt="doggo"
      ></Image> */}
      <div
        className="h-[200px]  min-w-[150px] w-[150px] p-3"
        style={{
          background: `linear-gradient(180deg, hsl(${
            baseHue * 360
          }, 90%, 60%) 30%, hsl(${
            baseHue * 360 + baseHue * (baseHue * 360)
          }, 76%, 80%) )`,
        }}
      >
        <div className="p-2 flex flex-col justify-between pb-8 pt-4 h-full border border-white">
          <p className="text-sm text-center text-white bg-gray-100 p-1 rounded-md bg-opacity-40 ">
            History of Burma
          </p>
          <p className="text-xs text-center bg-slate-500 p-1 rounded-md bg-opacity-50">
            Maung Htin Aung
          </p>
        </div>
      </div>

      <div
        className="p-3 flex flex-col justify-between animate-fade-in"
        style={{
          // @ts-ignore
          "--delay": animationDelay,
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-2xl font-bold">fgjasfglad aflkas fasdfaakf</p>
            <p className="text-muted text-sm ">J. R. R. Tolkein</p>
            <p className="text-muted text-sm flex items-center  gap-1">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>Physical copies available</span>
            </p>
          </div>
          <p className=" line-clamp-3">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Expedita
            vitae at quam. Voluptas rem, laboriosam et nobis repellendus tempore
            minus quaerat officia quibusdam obcaecati, labore recusandae fuga
            quod! Ducimus, error?
          </p>
        </div>
        <Link className="underline mt-3" href={"#"}>
          Get book
        </Link>
      </div>
    </div>
  );
};

export default BookCard;
