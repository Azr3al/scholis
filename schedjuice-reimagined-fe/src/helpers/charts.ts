import moment from "moment";

export const dateCountToRange = (startDate: Date, endDate: Date) => {
  // if there are more than 7 days between the two dates, return the range in months
  if (moment(endDate).diff(moment(startDate), "days") > 7) {
    return "month";
  } else {
    return "day";
  }
};

export const apiDataToAreaChartData = (
  apiData: number[][],
  group_by_mode: "day" | "month",
  startDate: Date,
  endDate: Date
) => {
  const thisYear = new Date().getFullYear();
  const formatFunc = (d: number[]) => {
    if (group_by_mode === "day") {
      return new Date(thisYear, d[0] - 1, d[1]);
    } else {
      return new Date(d[0], d[1] - 1);
    }
  };
  // array of every day or month starting from startDate to endDate
  const dateArray = [];
  let currentDate = startDate;
  while (currentDate <= endDate) {
    dateArray.push(currentDate);
    currentDate = moment(currentDate).add(1, group_by_mode).toDate();
  }
  // merge the two arrays
  const mergedData = dateArray.map((date) => {
    const data = apiData.find((d) =>
      group_by_mode === "day"
        ? formatFunc(d).getTime() === date.getTime()
        : `${formatFunc(d).getFullYear()}${formatFunc(d).getMonth()} ` ===
          `${date.getFullYear()}${date.getMonth()} `
    );
    if (data) {
      return {
        x: formatFunc(data),
        y: data[2],
      };
    } else {
      return {
        x: date,
        y: 0,
      };
    }
  });
  return mergedData.map((d) => {
    return {
      ...d,
      x:
        group_by_mode === "day"
          ? moment(d.x).format("YYYY-MMM-DD")
          : moment(d.x).format("YYYY-MMM"),
    };
  });
};

export const apiDataToPieChartData = (apiData: any[]) => {
  return apiData.map((data) => {
    return {
      category: data[0],
      count: data[1],
    };
  });
};

const fillableColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export const getPieChartConfig = (chartData: any) => {
  const config: any = {
    count: {
      label: "Count",
    },
  };
  chartData.forEach((data: any, index: any) => {
    config[data.category] = {
      label: data.label ?? data.category,
      color: fillableColors[index % fillableColors.length],
    };
  });

  return config;
};
