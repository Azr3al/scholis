import { CARD_VIEWBOX } from "@/lib/id-card/dimensions";
import {
  computeIdCardLayout,
  PANEL_TEXT_CENTER_X,
} from "@/lib/id-card/id-card-layout";
import type { CardViewModel } from "@/lib/id-card/types";

type IdCardFaceProps = {
  vm: CardViewModel;
  qrDataUrl: string;
  /** Rendered pixel width; height follows the card aspect ratio. */
  width?: number;
  className?: string;
};

const W = CARD_VIEWBOX.width;
const H = CARD_VIEWBOX.height;

const INK = "#1f2937";
const BODY = "#374151";
// Rounded, friendly stack. Falls back gracefully when rasterised on machines
// that lack the playful faces (used for the WebGL texture + PNG/PDF export).
const FONT = "'Chalkboard SE', 'Comic Sans MS', 'Trebuchet MS', sans-serif";

export function IdCardFace({ vm, qrDataUrl, width = 320, className }: IdCardFaceProps) {
  const height = (width * H) / W;
  const accent = vm.accent;
  const layout = computeIdCardLayout(vm);

  return (
    <svg
      role="img"
      aria-label={`${vm.name} — ${vm.roleLabel} ID card`}
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      fontFamily={FONT}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <clipPath id="cardClip">
          <rect x="0" y="0" width={W} height={H} rx="40" ry="40" />
        </clipPath>
        <clipPath id="photoClip">
          <rect x="185" y="195" width="170" height="210" rx="22" ry="22" />
        </clipPath>
        <clipPath id="logoClip">
          <rect x="40" y="56" width="52" height="52" rx="14" ry="14" />
        </clipPath>
        <linearGradient id="headerShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.07" />
        </linearGradient>
      </defs>

      <g clipPath="url(#cardClip)">
        <rect x="0" y="0" width={W} height={H} fill="url(#bgGrad)" />

        {/* Colourful header */}
        <rect x="0" y="0" width={W} height="210" fill={accent} />
        <rect x="0" y="0" width={W} height="210" fill="url(#headerShine)" />

        {/* Playful confetti */}
        <g fill="#ffffff">
          <circle cx="486" cy="54" r="14" opacity="0.18" />
          <circle cx="446" cy="150" r="8" opacity="0.16" />
          <circle cx="78" cy="176" r="10" opacity="0.16" />
          <circle cx="512" cy="120" r="6" opacity="0.2" />
        </g>

        {/* Lanyard slot */}
        <rect x={W / 2 - 46} y="28" width="92" height="18" rx="9" fill="#ffffff" opacity="0.4" />

        {/* Organisation */}
        {vm.orgLogoUrl ? (
          <>
            <g clipPath="url(#logoClip)">
              <image
                href={vm.orgLogoUrl}
                width="104"
                height="104"
                preserveAspectRatio="xMidYMid meet"
                transform="translate(40, 56) scale(0.5)"
                imageRendering="optimizeQuality"
              />
            </g>
            <text x="104" y="100" fill="#ffffff" fontSize="28" fontWeight="700">
              {vm.orgName}
            </text>
          </>
        ) : (
          <text x="40" y="100" fill="#ffffff" fontSize="30" fontWeight="700">
            {vm.orgName}
          </text>
        )}

        {/* Photo / monogram */}
        <rect
          x="170"
          y="180"
          width="200"
          height="240"
          rx="30"
          fill="#ffffff"
          stroke={accent}
          strokeWidth="5"
        />
        {vm.photoUrl ? (
          <image
            href={vm.photoUrl}
            x="185"
            y="195"
            width="170"
            height="210"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#photoClip)"
          />
        ) : (
          <>
            <rect x="185" y="195" width="170" height="210" rx="22" fill={accent} fillOpacity="0.14" />
            <text x={W / 2} y="338" textAnchor="middle" fill={accent} fontSize="104" fontWeight="700">
              {vm.initials}
            </text>
          </>
        )}

        {/* Name + role */}
        <text x={W / 2} y="472" textAnchor="middle" fill={INK} fontSize="40" fontWeight="700">
          {vm.name}
        </text>
        <rect x={W / 2 - 105} y="494" width="210" height="46" rx="23" fill={accent} />
        <text
          x={W / 2}
          y="524"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="22"
          fontWeight="700"
          letterSpacing="1.5"
        >
          {vm.roleLabel.toUpperCase()}
        </text>

        {/* Contact */}
        {layout.detailRows.map((row, index) => (
          <text
            key={row.label}
            x={W / 2}
            y={layout.detailRowYs[index]}
            textAnchor="middle"
            fill={INK}
            fontSize="18"
            fontWeight="600"
          >
            {`${row.label} · ${row.value}`}
          </text>
        ))}

        <text x={W / 2} y={layout.emailY} textAnchor="middle" fill={INK} fontSize="22">
          {vm.email}
        </text>
        {vm.bloodType ? (
          <text
            x={W / 2}
            y={layout.bloodY ?? layout.emailY + 30}
            textAnchor="middle"
            fill={INK}
            fontSize="18"
            fontWeight="700"
          >
            {`Blood ${vm.bloodType}`}
          </text>
        ) : null}

        {/* Info panel: QR + emergency / verify */}
        <rect
          x="30"
          y={layout.panelTopY}
          width="480"
          height={layout.panelHeight}
          rx="26"
          fill={accent}
          fillOpacity="0.1"
          stroke={accent}
          strokeOpacity="0.22"
          strokeWidth="2"
        />
        <rect x="46" y={layout.qrBoxY} width="176" height="176" rx="18" fill="#ffffff" />
        {qrDataUrl ? (
          <image
            href={qrDataUrl}
            x="54"
            y={layout.qrImageY}
            width="160"
            height="160"
            imageRendering="pixelated"
          />
        ) : null}

        {vm.emergency ? (
          <>
            <text
              x={PANEL_TEXT_CENTER_X}
              y={layout.emergencyHeadingY}
              textAnchor="middle"
              fill={accent}
              fontSize="16"
              fontWeight="700"
              letterSpacing="2"
            >
              EMERGENCY
            </text>
            <text
              x={PANEL_TEXT_CENTER_X}
              y={layout.emergencyPhoneY}
              textAnchor="middle"
              fill={INK}
              fontSize="26"
              fontWeight="700"
            >
              {vm.emergency.phone}
            </text>
            {vm.emergency.name ? (
              <text
                x={PANEL_TEXT_CENTER_X}
                y={layout.emergencyNameY}
                textAnchor="middle"
                fill={BODY}
                fontSize="18"
              >
                {vm.emergency.relationship
                  ? `${vm.emergency.name} (${vm.emergency.relationship})`
                  : vm.emergency.name}
              </text>
            ) : null}
          </>
        ) : (
          <>
            <text
              x={PANEL_TEXT_CENTER_X}
              y={layout.verifyHeadingY}
              textAnchor="middle"
              fill={accent}
              fontSize="16"
              fontWeight="700"
              letterSpacing="2"
            >
              VERIFY
            </text>
            <text
              x={PANEL_TEXT_CENTER_X}
              y={layout.verifyLine1Y}
              textAnchor="middle"
              fill={BODY}
              fontSize="20"
            >
              Scan to confirm
            </text>
            <text
              x={PANEL_TEXT_CENTER_X}
              y={layout.verifyLine2Y}
              textAnchor="middle"
              fill={BODY}
              fontSize="20"
            >
              this ID is genuine
            </text>
          </>
        )}

        <rect x="0" y={H - 16} width={W} height="16" fill={accent} />
      </g>

      {/* Chunky friendly border */}
      <rect
        x="6"
        y="6"
        width={W - 12}
        height={H - 12}
        rx="34"
        fill="none"
        stroke={accent}
        strokeWidth="8"
      />
    </svg>
  );
}
