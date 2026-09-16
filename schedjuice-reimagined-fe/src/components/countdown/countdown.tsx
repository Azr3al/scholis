"use client";
import { useEffect, useState } from "react";

interface CountdownProps {
  date: Date;
  title: string;
}

const Countdown: React.FC<CountdownProps> = ({
  date,
  title,
}) => {
  const [timeLeft, setTimeLeft] = useState<number | undefined>(undefined);
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = date.getTime() - now;
      setTimeLeft(distance);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <>
      <div>
        <h1 className="text-3xl">{title}</h1>
        <div className="flex justify-center items-center gap-10">
          <div className="">
            <p className="text-8xl">
              {timeLeft && Math.floor(timeLeft / (1000 * 60 * 60 * 24))}
            </p>
            <p>Days</p>
          </div>

          <div>
            <p className=" text-8xl">
              {timeLeft &&
                Math.floor(
                  (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
                )}
            </p>
            <p>Hours</p>
          </div>

          <div>
            <p className=" text-8xl">
              {timeLeft &&
                Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))}
            </p>
            <p>Minutes</p>
          </div>

          <div>
            <p className=" text-8xl">
              {timeLeft && Math.floor((timeLeft % (1000 * 60)) / 1000)}
            </p>
            <p>Seconds</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Countdown;
