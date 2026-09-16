# ID Cards — Plan 3: Interactive 3D Badge + `/id-card` Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A draggable WebGL lanyard badge (physics rope, like Vercel's) that textures the `IdCardFace` from Plan 2, plus a self-service `/id-card` page with loading/empty/error states and a graceful static fallback when WebGL is unavailable or motion is reduced.

**Architecture:** The card face SVG is serialized to a data URL and used as a `THREE` texture on a card mesh hung from a `meshline` lanyard with `@react-three/rapier` rope joints. The heavy WebGL leaf (`LanyardBadge`) is an isolated `'use client'` component, lazy-loaded via `next/dynamic` (`ssr:false`); `IdCardStage` chooses between it and a static `<IdCardFace/>`. The page fetches the current user + tenant (TanStack Query), builds the view-model, and generates the QR from `window.location.origin` + the signed token. Repo: `schedjuice-reimagined-fe`.

**Tech Stack:** `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `meshline`, `react-dom/server`, TanStack Query, `next/dynamic`.

**Spec:** `docs/superpowers/specs/2026-06-21-id-cards-design.md` (§1, §6 LanyardBadge, §9 states, §10 motion).
**Depends on:** Plan 2 (`IdCardFace`, `buildIdCard`, `generateQrDataUrl`, `buildVerifyUrl`, dimensions).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | 3D dependencies |
| `src/lib/id-card/svg-data-url.ts` (NEW) | `svgStringToDataUrl` (pure) + `renderCardFaceToDataUrl` |
| `src/lib/id-card/svg-data-url.test.ts` (NEW) | Unit tests for the pure encoder |
| `src/components/id-card/lanyard-badge.tsx` (NEW) | WebGL physics lanyard (`'use client'`) |
| `src/components/id-card/id-card-stage.tsx` (NEW) | WebGL-vs-static chooser, lazy loads badge |
| `src/components/id-card/use-id-card.ts` (NEW) | Hook: build vm + qr from current user/tenant |
| `src/app/(internal)/id-card/page.tsx` (NEW) | Self-service page |

**Run a single test:** `npm run test:unit -- src/lib/id-card/svg-data-url.test.ts`
**Run the dev server to verify visually:** `npm run dev` → open `/id-card`

---

## Task 1: Install 3D dependencies

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
npm install three @react-three/fiber @react-three/drei @react-three/rapier meshline --legacy-peer-deps
npm install -D @types/three --legacy-peer-deps
```

- [ ] **Step 2: Verify they resolve**

Run: `npx tsc --noEmit`
Expected: no module-resolution errors for the new packages.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(id-card): add react-three-fiber + rapier deps"
```

---

## Task 2: SVG → data URL helper (TDD)

**Files:**
- Create: `src/lib/id-card/svg-data-url.ts`
- Test: `src/lib/id-card/svg-data-url.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { svgStringToDataUrl } from "./svg-data-url";

describe("svgStringToDataUrl", () => {
  it("encodes an SVG string into a utf8 data URL", () => {
    const url = svgStringToDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).toContain("%3Csvg");
  });

  it("escapes characters that break data URLs", () => {
    const url = svgStringToDataUrl('<svg>#&"</svg>');
    expect(url).not.toContain("#");
    expect(url).not.toContain('"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/id-card/svg-data-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { IdCardFace } from "@/components/id-card/id-card-face";
import type { CardViewModel } from "./types";

/** Encode raw SVG markup as a texture-safe data URL (no btoa → unicode safe). */
export function svgStringToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Fetch a remote image and return it as a data URL. Browsers block external
 * resources when an SVG is rendered as an image (for textures/raster export),
 * so the photo + logo must be inlined first. Requires the image host (e.g. the
 * presigned S3 bucket) to allow CORS GET from this origin; on failure we return
 * null so the face degrades to the monogram / no-logo branch.
 */
export async function inlineImageToDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Render the single-source-of-truth card face to a data URL (used for the WebGL
 * texture and PNG/PDF export). Photo + logo are inlined so the rasterized SVG
 * is self-contained.
 */
export async function renderCardFaceToDataUrl(
  vm: CardViewModel,
  qrDataUrl: string,
): Promise<string> {
  const [photoUrl, orgLogoUrl] = await Promise.all([
    inlineImageToDataUrl(vm.photoUrl),
    inlineImageToDataUrl(vm.orgLogoUrl),
  ]);
  const inlineVm: CardViewModel = { ...vm, photoUrl, orgLogoUrl };
  const svg = renderToStaticMarkup(
    createElement(IdCardFace, { vm: inlineVm, qrDataUrl, width: 540 }),
  );
  return svgStringToDataUrl(svg);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/id-card/svg-data-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-card/svg-data-url.ts src/lib/id-card/svg-data-url.test.ts
git commit -m "feat(id-card): add svg-to-data-url texture helper"
```

---

## Task 3: `useIdCard` hook

**Files:**
- Create: `src/components/id-card/use-id-card.ts`

Builds the view-model + QR from the current user and tenant. QR uses `window.location.origin` + the signed token.

- [ ] **Step 1: Implement**

```typescript
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { fetchEntity } from "@/app/client-api/utils";
import { buildIdCard } from "@/lib/id-card/build-id-card";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import type { CardViewModel } from "@/lib/id-card/types";
import type { accountType } from "@/types/user";

type UseIdCardResult = {
  vm: CardViewModel | null;
  qrDataUrl: string;
  isLoading: boolean;
  isError: boolean;
};

/** `userId` defaults to the current viewer (self-service). */
export function useIdCard(userId?: number): UseIdCardResult {
  const { user: viewer } = useUser();
  const { tenant } = useTenant();
  const targetId = userId ?? viewer?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["id-card-user", targetId],
    enabled: Boolean(targetId),
    queryFn: () => fetchEntity("users", targetId as number),
  });

  const account = (data?.data?.data ?? null) as accountType | null;
  const vm = account && tenant ? buildIdCard(account, tenant) : null;

  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!vm?.verifyToken) {
      setQrDataUrl("");
      return;
    }
    const url = buildVerifyUrl(window.location.origin, vm.verifyToken);
    let active = true;
    generateQrDataUrl(url).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [vm?.verifyToken]);

  return { vm, qrDataUrl, isLoading, isError };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `useTenant` exposes the org under a different property than `tenant`, adjust the destructure to match `src/hooks/useTenant.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/id-card/use-id-card.ts
git commit -m "feat(id-card): add useIdCard hook"
```

---

## Task 4: `LanyardBadge` WebGL component

**Files:**
- Create: `src/components/id-card/lanyard-badge.tsx`

Adapts the Vercel lanyard (rope joints + meshline + draggable kinematic card), texturing a card mesh with the rendered face. Isolated `'use client'` leaf.

- [ ] **Step 1: Implement**

```tsx
"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
} from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { Environment, Lightformer } from "@react-three/drei";
import { renderCardFaceToDataUrl } from "@/lib/id-card/svg-data-url";
import type { CardViewModel } from "@/lib/id-card/types";

extend({ MeshLineGeometry, MeshLineMaterial });

type LanyardBadgeProps = {
  vm: CardViewModel;
  qrDataUrl: string;
};

export function LanyardBadge({ vm, qrDataUrl }: LanyardBadgeProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 13], fov: 25 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={Math.PI} />
      <Physics gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band vm={vm} qrDataUrl={qrDataUrl} />
      </Physics>
      <Environment blur={0.75}>
        <Lightformer intensity={2} position={[0, -1, 5]} scale={[10, 0.1, 1]} />
        <Lightformer intensity={3} position={[-1, -1, 1]} scale={[10, 0.1, 1]} />
        <Lightformer intensity={3} position={[1, 1, 1]} scale={[10, 0.1, 1]} />
        <Lightformer intensity={10} position={[-10, 0, 14]} scale={[100, 10, 1]} />
      </Environment>
    </Canvas>
  );
}

function Band({ vm, qrDataUrl }: LanyardBadgeProps) {
  const band = useRef<any>(null);
  const fixed = useRef<any>(null);
  const j1 = useRef<any>(null);
  const j2 = useRef<any>(null);
  const j3 = useRef<any>(null);
  const card = useRef<any>(null);

  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const { width, height } = useThree((s) => s.size);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
  );
  const [dragged, drag] = useState<false | THREE.Vector3>(false);
  const [hovered, hover] = useState(false);

  const cardTexture = useCardTexture(vm, qrDataUrl);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = dragged ? "grabbing" : "grab";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [j1, j2, j3, fixed].forEach((r) => r.current?.wakeUp());
      card.current.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }
    if (fixed.current && band.current) {
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.translation());
      curve.points[2].copy(j1.current.translation());
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  const cardAspect = 860 / 540;
  const cardWidth = 1.6;
  const cardHeight = cardWidth * cardAspect;

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          angularDamping={2}
          linearDamping={2}
          type={dragged ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[cardWidth / 2, cardHeight / 2, 0.01]} />
          <group
            scale={1}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e: any) => {
              e.target.releasePointerCapture(e.pointerId);
              drag(false);
            }}
            onPointerDown={(e: any) => {
              e.target.setPointerCapture(e.pointerId);
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
            }}
          >
            <mesh>
              <planeGeometry args={[cardWidth, cardHeight]} />
              <meshPhysicalMaterial
                map={cardTexture ?? undefined}
                clearcoat={1}
                clearcoatRoughness={0.15}
                roughness={0.4}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        {/* @ts-expect-error meshline elements added via extend() */}
        <meshLineGeometry />
        {/* @ts-expect-error meshline elements added via extend() */}
        <meshLineMaterial
          color={vm.accent}
          depthTest={false}
          resolution={[width, height]}
          lineWidth={1}
        />
      </mesh>
    </>
  );
}

function useCardTexture(vm: CardViewModel, qrDataUrl: string): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    renderCardFaceToDataUrl(vm, qrDataUrl).then((dataUrl) => {
      if (!active) return;
      const loader = new THREE.TextureLoader();
      loader.load(dataUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        if (active) setTexture(tex);
      });
    });
    return () => {
      active = false;
    };
  }, [vm, qrDataUrl]);
  return texture;
}
```

> The two `@ts-expect-error` lines cover `meshLineGeometry`/`meshLineMaterial` JSX intrinsics added at runtime via `extend()`. Physics constants (damping, joint lengths, gravity) match the Vercel reference and may need light tuning during visual review.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the meshline intrinsics are suppressed).

- [ ] **Step 3: Commit**

```bash
git add src/components/id-card/lanyard-badge.tsx
git commit -m "feat(id-card): add WebGL lanyard badge"
```

---

## Task 5: `IdCardStage` — WebGL vs static fallback

**Files:**
- Create: `src/components/id-card/id-card-stage.tsx`

Lazy-loads the WebGL leaf and falls back to the static face when WebGL is unavailable or the user prefers reduced motion.

- [ ] **Step 1: Implement**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { IdCardFace } from "./id-card-face";
import type { CardViewModel } from "@/lib/id-card/types";

const LanyardBadge = dynamic(
  () => import("./lanyard-badge").then((m) => m.LanyardBadge),
  { ssr: false },
);

function canUseWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

type IdCardStageProps = {
  vm: CardViewModel;
  qrDataUrl: string;
};

export function IdCardStage({ vm, qrDataUrl }: IdCardStageProps) {
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setInteractive(canUseWebgl() && !reduced);
  }, []);

  if (!interactive) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <IdCardFace vm={vm} qrDataUrl={qrDataUrl} width={320} />
      </div>
    );
  }

  return (
    <div className="h-full w-full touch-none">
      <LanyardBadge vm={vm} qrDataUrl={qrDataUrl} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/id-card/id-card-stage.tsx
git commit -m "feat(id-card): add IdCardStage with static fallback"
```

---

## Task 6: `/id-card` self-service page

**Files:**
- Create: `src/app/(internal)/id-card/page.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { IdCardStage } from "@/components/id-card/id-card-stage";
import { useIdCard } from "@/components/id-card/use-id-card";

export default function IdCardPage() {
  const { vm, qrDataUrl, isLoading, isError } = useIdCard();

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My ID card</h1>
          <p className="text-sm text-muted-foreground">Drag the badge to give it a swing.</p>
        </div>

        <div className="relative min-h-[70dvh] overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
          <IdCardContent vm={vm} qrDataUrl={qrDataUrl} isLoading={isLoading} isError={isError} />
        </div>
      </div>
    </PageContainer>
  );
}

type ContentProps = {
  vm: ReturnType<typeof useIdCard>["vm"];
  qrDataUrl: string;
  isLoading: boolean;
  isError: boolean;
};

function IdCardContent({ vm, qrDataUrl, isLoading, isError }: ContentProps) {
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[70dvh] items-center justify-center" aria-busy>
        <Skeleton className="h-[520px] w-[330px] rounded-2xl" />
      </div>
    );
  }
  if (isError || !vm) {
    return (
      <div className="flex h-full min-h-[70dvh] items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">We couldn&apos;t load your ID card. Try again.</p>
      </div>
    );
  }
  return <IdCardStage vm={vm} qrDataUrl={qrDataUrl} />;
}
```

> Plan 4 adds Download PDF / PNG actions to this page.

- [ ] **Step 2: Verify visually**

Run: `npm run dev` → open `http://localhost:3000/id-card`
Expected: lanyard badge drops in and is draggable; with reduced motion or no WebGL, the static card renders. Loading shows a skeleton.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(internal)/id-card/page.tsx"
git commit -m "feat(id-card): add self-service /id-card page"
```

---

## Self-Review

- **Spec §6 LanyardBadge:** isolated `'use client'`, fiber+rapier+meshline, textured by `IdCardFace`, lazy via `next/dynamic` ssr:false. ✅
- **Spec §6 fallback:** `IdCardStage` falls back to static `IdCardFace` on no-WebGL / reduced motion. ✅
- **Spec §9 states:** loading skeleton (`aria-busy`, per `async-loading-states`), error message, static fallback. ✅
- **Spec §5 single source of truth:** the 3D texture is produced from `IdCardFace` via `renderCardFaceToDataUrl`. ✅
- **Placeholder scan:** all steps have full code. ✅
- **Type consistency:** `useIdCard` returns `{ vm, qrDataUrl, isLoading, isError }`; `IdCardStage`/`LanyardBadge` take `{ vm, qrDataUrl }`; matches Plan 2 types. ✅
- **Risk note:** if `useTenant()` / `useUser()` expose differently shaped objects, adjust destructuring in `use-id-card.ts` (see frontend conventions: `useUser` returns `{ user }`, `useTenant` exposes the org). Physics tuning may need a visual pass.
