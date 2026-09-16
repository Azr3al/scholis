
import "../globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      
      <div className="">{children}</div>
    </>
  );
}
