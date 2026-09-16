
// UNUSED
// "use client";

// import { format } from "date-fns";
// import Selector from "./selector";

// interface TimezoneAwareTimeSelectProps {
//   value?: string;
//   setValue: (value: string) => void;
//   label: string;
// }
// const timeSlots = Array.from({ length: 24 * 60 }, (_, i) => {
//   const totalMinutes = i;
//   const hour = Math.floor(totalMinutes / 60);
//   const minute = totalMinutes % 60;
//   return `${hour.toString().padStart(2, "0")}:${minute
//     .toString()
//     .padStart(2, "0")}`;
// });

// const TimezoneAwareTimeSelect: React.FC<TimezoneAwareTimeSelectProps> = ({
//   value,
//   setValue,
//   label,
// }) => {
//   // accept both ISO and HH:mm formats
//   const displayValue = (() => {
//     if (!value) return undefined;
//     const d = new Date(value);
//     return isNaN(d.getTime()) ? value : format(d, "HH:mm");
//   })();

//   return (
//     <div>
//       <Selector
//         label={label}
//         options={timeSlots.map((v) => ({
//           value: v,
//           label: v,
//         }))}
//         value={displayValue}
//         onChange={setValue}
//         showOnlyInlineLable={true}
//       ></Selector>
//     </div>
//   );
// };

// export default TimezoneAwareTimeSelect;
