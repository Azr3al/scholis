import { Medal as Award } from "iconoir-react";
import type { PublicCertification } from "@/types/user-certification";

export function PublicProfileCertifications({
  certifications,
}: {
  certifications: PublicCertification[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary mt-6 border-border/60 shadow-sm">
      <div className="flex flex-col gap-1.5 p-6 gap-1 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Award className="size-5" aria-hidden />
          </div>
          <div>
            <h3 className="font-serif text-xl leading-none tracking-tight text-lg">Certifications</h3>
            <p className="text-sm text-text-secondary">Credentials and professional certifications</p>
          </div>
        </div>
      </div>
      <div className="p-6 pt-0 min-w-0 pt-0">
        {certifications.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-text-muted">
            No certifications to show.
          </p>
        ) : (
          <ul className="space-y-3">
            {certifications.map((cert) => (
              <li
                key={`${cert.title}-${cert.issued_on}`}
                className="rounded-lg border border-border/60 p-4"
              >
                <p className="font-medium">{cert.title}</p>
                <p className="text-sm text-text-muted">{cert.issuing_organization}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Issued {cert.issued_on}
                  {cert.expires_on ? ` · Expires ${cert.expires_on}` : ""}
                </p>
                {cert.file_url ? (
                  <a
                    href={cert.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-primary"
                  >
                    {cert.file_filename ?? "View file"}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
