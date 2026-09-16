"use client";

import { makeGetRequest } from "@/app/client-api/utils";
import { useQuery } from "@tanstack/react-query";

const BirthdayAlert = () => {
  const { data } = useQuery({
    enabled: true,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryKey: ["getBirthday"],
    queryFn: () => {
      return makeGetRequest("birthdays");
    },
  });
  return (
    data?.data?.data.length > 0 ? (
      <div className="p-4 bg-primary text-white">
        <>
          <p>Happy Birthday! 🎉</p>
          {data?.data &&
            data?.data.data?.map((item: any, index: any) => {
              return (
                <p key={item.id}>
                  {item.name}
                  {data.data.data.length > 1 &&
                  data.data.data.length - 2 > index
                    ? ", "
                    : ""}
                  {data.data.data.length !== 1 &&
                  data.data.data.length - 2 === index
                    ? " and "
                    : ""}
                </p>
              );
            })}
          <p>May your birthday be filled with love, joy, and happiness. 🎂</p>
        </>
      </div>
    ) : <></>
  );
};

export default BirthdayAlert;
