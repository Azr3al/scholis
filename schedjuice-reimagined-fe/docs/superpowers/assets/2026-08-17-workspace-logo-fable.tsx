import * as React from "react";

export type WorkspaceName = "hr" | "finance" | "studio" | "admissions";
const DG="#60A17E", PW="#FCF4E3", TM="#102C24";

const CSS = `
.sj-hr .swing{transform-box:view-box;transform-origin:52px 6px;animation:sj-hr-swing 1.4s cubic-bezier(.3,.7,.3,1) both}
.sj-hr:hover .swing{animation:sj-hr-jiggle .9s ease-in-out}
@keyframes sj-hr-swing{0%{transform:rotate(-14deg)}25%{transform:rotate(9deg)}50%{transform:rotate(-5deg)}72%{transform:rotate(2.5deg)}88%{transform:rotate(-1deg)}100%{transform:rotate(0)}}
@keyframes sj-hr-jiggle{0%{transform:rotate(0)}20%{transform:rotate(-6deg)}45%{transform:rotate(4deg)}70%{transform:rotate(-2deg)}100%{transform:rotate(0)}}
@media(prefers-reduced-motion:reduce){.sj-hr *{animation:none!important;transition:none!important}}
.sj-finance .paper{transform-box:view-box;transform-origin:32px 32px;animation:sj-finance-land .5s cubic-bezier(.2,.8,.2,1) both}
.sj-finance .ln{transform-box:fill-box;transform-origin:left center;animation:sj-finance-print .35s cubic-bezier(.2,.8,.2,1) both}
.sj-finance .l1{animation-delay:.35s}.sj-finance .l2{animation-delay:.55s}.sj-finance .l3{animation-delay:.75s}.sj-finance .k{animation-delay:1s;transition:transform .3s}
.sj-finance:hover .k{transform:translate(2px,0)}
@keyframes sj-finance-land{from{opacity:0;transform:translate(0,-8px)}to{opacity:1;transform:none}}
@keyframes sj-finance-print{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.sj-finance *{animation:none!important;transition:none!important}}
.sj-studio .pen{transform-box:view-box;transform-origin:32px 32px;animation:sj-studio-fall .7s cubic-bezier(.34,1.4,.5,1) both;transition:transform .3s}
.sj-studio .k{transform-box:fill-box;transform-origin:50% 0;animation:sj-studio-drip 1.5s .55s both}
.sj-studio:hover .pen{transform:translate(-1px,2px)}
@keyframes sj-studio-fall{from{opacity:0;transform:translate(6px,-22px) rotate(8deg)}to{opacity:1;transform:none}}
@keyframes sj-studio-drip{0%{transform:scale(.12,.12);animation-timing-function:cubic-bezier(.25,.6,.35,1)}42%{transform:scale(1,1);animation-timing-function:cubic-bezier(.4,0,.6,1)}58%{transform:scale(.96,1.08);animation-timing-function:cubic-bezier(.5,0,.85,.55)}80%{transform:translate(0,4.5px) scale(1,1.02);animation-timing-function:cubic-bezier(.3,0,.5,1)}90%{transform:translate(0,4.5px) scale(1.03,.97);animation-timing-function:cubic-bezier(.3,0,.5,1)}100%{transform:translate(0,4.5px) scale(1,1)}}

.sj-admissions .frame{animation:sj-admissions-fade .3s ease-out both}
.sj-admissions .slab{transform-box:view-box;transform-origin:16.6px 32px;animation:sj-admissions-shut .38s cubic-bezier(.5,0,.8,.4) .55s both}
.sj-admissions .door{transform-box:view-box;transform-origin:16.5px 32px;animation:sj-admissions-open .75s cubic-bezier(.2,.8,.2,1) .9s both;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.sj-admissions:hover .door{transform:scaleX(1.12)}
@keyframes sj-admissions-fade{from{opacity:0}to{opacity:1}}
@keyframes sj-admissions-shut{0%{transform:scaleX(1);opacity:1}99%{transform:scaleX(.04);opacity:1}100%{transform:scaleX(.04);opacity:0}}
@keyframes sj-admissions-open{from{transform:scaleX(.05)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.sj *{animation:none!important;transition:none!important}.sj-admissions .slab{opacity:0!important}}`;

let injected=false;
function useStyles(){ React.useEffect(()=>{ if(injected||typeof document==="undefined") return; const s=document.createElement("style"); s.textContent=CSS; document.head.appendChild(s); injected=true; },[]); }

const glyphs: Record<WorkspaceName, React.ReactNode> = {
  hr: (<><g className="swing"> <path fillRule="evenodd" d="M18 18 H46 A9 9 0 0 1 55 27 V51 A9 9 0 0 1 46 60 H18 A9 9 0 0 1 9 51 V27 A9 9 0 0 1 18 18 Z M20.0 21.2 H45.8 A5.8 5.8 0 0 1 51.599999999999994 27.0 V49.2 A5.8 5.8 0 0 1 45.8 55.0 H20.0 A5.8 5.8 0 0 1 14.2 49.2 V27.0 A5.8 5.8 0 0 1 20.0 21.2 Z" fill="currentColor"/> <path d="M40.40 36.00 L40.22 37.64 L39.73 39.20 L38.94 40.64 L37.89 41.89 L36.61 42.91 L35.17 43.66 L33.61 44.11 L32.00 44.25 L30.39 44.07 L28.86 43.59 L27.45 42.81 L26.22 41.78 L25.22 40.53 L24.48 39.11 L24.04 37.58 L23.90 36.00 L24.07 34.42 L24.55 32.91 L25.31 31.53 L26.33 30.33 L27.55 29.34 L28.94 28.62 L30.45 28.18 L32.00 28.05 L33.55 28.22 L35.03 28.69 L36.39 29.44 L37.57 30.43 L38.53 31.64 L39.24 33.00 L39.67 34.47 L39.80 36.00 L37.20 36.00 L37.08 34.99 L36.77 34.02 L36.28 33.14 L35.62 32.38 L34.84 31.75 L33.95 31.30 L32.99 31.03 L32.00 30.95 L31.02 31.07 L30.08 31.37 L29.23 31.85 L28.48 32.48 L27.88 33.25 L27.44 34.11 L27.18 35.04 L27.10 36.00 L27.21 36.95 L27.51 37.86 L27.97 38.69 L28.59 39.41 L29.33 40.00 L30.17 40.42 L31.07 40.68 L32.00 40.75 L32.92 40.64 L33.80 40.35 L34.61 39.90 L35.31 39.31 L35.87 38.59 L36.28 37.77 L36.53 36.90 L36.60 36.00 Z" fill="currentColor"/> <path d="M19.40 52.13 L19.87 51.26 L20.39 50.42 L20.97 49.63 L21.61 48.88 L22.29 48.18 L23.02 47.54 L23.80 46.94 L24.61 46.40 L25.46 45.93 L26.34 45.51 L27.25 45.16 L28.17 44.87 L29.12 44.65 L30.07 44.50 L31.04 44.42 L32.00 44.40 L32.96 44.45 L33.92 44.57 L34.86 44.76 L35.78 45.02 L36.69 45.33 L37.57 45.71 L38.41 46.16 L39.23 46.66 L40.00 47.21 L40.73 47.82 L41.42 48.48 L42.06 49.18 L42.64 49.93 L43.17 50.71 L43.64 51.53 L44.05 52.38 L41.70 53.48 L41.34 52.81 L40.93 52.17 L40.48 51.57 L39.99 50.99 L39.46 50.46 L38.89 49.96 L38.30 49.51 L37.67 49.10 L37.01 48.74 L36.34 48.42 L35.64 48.16 L34.93 47.94 L34.21 47.78 L33.48 47.67 L32.74 47.61 L32.00 47.60 L31.26 47.64 L30.54 47.74 L29.82 47.89 L29.11 48.09 L28.42 48.33 L27.75 48.63 L27.11 48.97 L26.49 49.36 L25.91 49.78 L25.35 50.25 L24.83 50.75 L24.35 51.29 L23.91 51.86 L23.51 52.46 L23.16 53.08 L22.85 53.73 Z" fill="currentColor"/> <path d="M34.24 14.80 L34.14 13.66 L34.14 12.60 L34.23 11.61 L34.41 10.70 L34.67 9.86 L35.00 9.08 L35.41 8.37 L35.89 7.71 L36.44 7.11 L37.06 6.57 L37.76 6.09 L38.52 5.67 L39.35 5.32 L40.25 5.04 L41.20 4.83 L42.20 4.70 L43.25 4.66 L44.35 4.71 L45.48 4.84 L46.63 5.06 L47.81 5.39 L49.01 5.80 L50.22 6.32 L51.43 6.94 L52.57 5.06 L51.27 4.28 L49.96 3.61 L48.64 3.04 L47.32 2.57 L46.00 2.21 L44.68 1.95 L43.38 1.79 L42.09 1.74 L40.83 1.79 L39.59 1.95 L38.39 2.21 L37.23 2.58 L36.11 3.06 L35.05 3.65 L34.06 4.36 L33.15 5.18 L32.32 6.10 L31.59 7.13 L30.97 8.27 L30.47 9.49 L30.09 10.81 L29.85 12.20 L29.73 13.67 L29.76 15.20 Z" fill="currentColor"/>  <path className="k" d="M29 12 H35 A3 3 0 0 1 38 15 V17 A3 3 0 0 1 35 20 H29 A3 3 0 0 1 26 17 V15 A3 3 0 0 1 29 12 Z" fill="var(--sj-k)"/> </g></>),
  finance: (<><g transform="rotate(-5 32 32)"> <path className="ln l1" d="M20.00 21.60 L40.00 21.00 L40.00 19.00 L20.00 18.40 Z" fill="currentColor"/> <path className="ln l2" d="M20.00 29.40 L35.00 28.90 L35.00 27.10 L20.00 26.60 Z" fill="currentColor"/> <path className="ln l3" d="M20.00 37.30 L38.00 36.90 L38.00 35.10 L20.00 34.70 Z" fill="currentColor"/> <g className="paper"><path fillRule="evenodd" d="M18 8 H46 A7 7 0 0 1 53 15 V56 A5.25 3.2 0 0 1 42.50 56 A5.25 3.2 0 0 1 32.00 56 A5.25 3.2 0 0 1 21.50 56 A5.25 3.2 0 0 1 11.00 56 V15 A7 7 0 0 1 18 8 Z M20 11.4 H45.8 A4 4 0 0 1 49.8 15.4 V51.0 A4.225 2.4 0 0 1 41.35 51.0 A4.225 2.4 0 0 1 32.90 51.0 A4.225 2.4 0 0 1 24.45 51.0 A4.225 2.4 0 0 1 16.00 51.0 V15.4 A4 4 0 0 1 20 11.4 Z" fill="currentColor"/></g> <path className="ln k" d="M20.00 47.30 L45.20 46.70 L42.80 43.30 L20.00 42.70 Z" fill="var(--sj-k)"/> </g></>),
  studio: (<><g transform="translate(0 -5)"> <g className="pen"> <path d="M51.50 4.26 L50.66 4.90 L49.79 5.60 L48.91 6.33 L48.01 7.12 L47.09 7.94 L46.15 8.80 L45.19 9.69 L44.22 10.61 L43.23 11.56 L42.24 12.54 L41.23 13.54 L40.22 14.55 L39.21 15.58 L38.20 16.62 L37.19 17.66 L36.18 18.71 L35.19 19.75 L34.20 20.79 L33.23 21.82 L32.28 22.84 L31.35 23.84 L30.44 24.82 L29.56 25.77 L28.70 26.70 L33.30 31.30 L34.22 30.45 L35.18 29.57 L36.16 28.67 L37.15 27.75 L38.17 26.81 L39.20 25.87 L40.25 24.92 L41.30 23.96 L42.36 23.01 L43.41 22.06 L44.47 21.12 L45.53 20.20 L46.58 19.29 L47.61 18.41 L48.63 17.55 L49.64 16.72 L50.62 15.93 L51.57 15.17 L52.50 14.46 L53.39 13.80 L54.24 13.19 L55.05 12.64 L55.80 12.16 L56.50 11.74 Z" fill="currentColor"/> <path d="M58.0 8.5 A4.5 4.5 0 1 1 49.0 8.5 A4.5 4.5 0 1 1 58.0 8.5 Z" fill="currentColor"/> <path d="M27.96 25.96 L22.99 31.99 L29.01 38.01 L35.04 33.04 Z" fill="currentColor"/> <path d="M30.5 32.5 C24 37 19 44 14.5 52.5 C13.5 55 16 56.5 18 54.5 C22 48 26 42 27 37 Z" fill="currentColor"/> </g>  <path className="k" d="M11.5 53 C9 57 7 60 7 61.5 A4.6 4.6 0 0 0 16.2 61.5 C16.2 60 14 57 11.5 53 Z" fill="var(--sj-k)"/> </g></>),
  admissions: (<><g className="frame">  <path fillRule="evenodd" d="M11 58 V27.0 A21.0 21.0 0 0 1 53 27.0 V58 Z M16.6 54.6 V26.0 A16.4 16.4 0 0 1 49.4 26.0 V54.6 Z" fill="currentColor"/></g> <g className="slab"><path d="M16.6 54.6 V26 A16.4 16.4 0 0 1 49.4 26 V54.6 Z" fill="currentColor"/><path d="M41.1 33 A2.6 2.6 0 1 1 35.9 33 A2.6 2.6 0 1 1 41.1 33 Z" fill="var(--sj-k)"/></g> <g className="door">  <path d="M16.5 56 V27 C16.5 16 22 11 33 15 V47 Z" fill="currentColor"/> <path className="k" d="M34.1 33 A2.6 2.6 0 1 1 28.9 33 A2.6 2.6 0 1 1 34.1 33 Z" fill="var(--sj-k)"/></g></>),
};

/** Entry animation runs on mount; remount (change key) to replay. */
export function WorkspaceLogo({ name, size=64, onDark=false, mono=false, ...rest }: { name:WorkspaceName; size?:number; onDark?:boolean; mono?:boolean } & React.SVGProps<SVGSVGElement>) {
  useStyles();
  const ink = onDark ? PW : TM;
  return (<svg viewBox="0 0 64 64" width={size} height={size} fill="none" className={`sj sj-${name}`} data-name={name} role="img" aria-label={name}
    style={{ color: ink, ["--sj-k" as any]: mono ? ink : DG }} {...rest}>{glyphs[name]}</svg>);
}
