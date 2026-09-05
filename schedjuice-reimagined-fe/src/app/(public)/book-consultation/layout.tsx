import { BookConsultationChrome } from "@/components/consultation/public/book-consultation-chrome";

export default function BookConsultationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sj-root min-h-screen bg-surface text-text-primary antialiased">
      <BookConsultationChrome>{children}</BookConsultationChrome>
    </div>
  );
}
