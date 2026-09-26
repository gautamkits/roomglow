/**
 * The noosho mascot — a soft clay bean whose two big eyes are the Twin Rings
 * logo (left rim cream, right rim deep clay), with a small cream bow as a nod to
 * the girl noosho is named after. Curious, playful, creative, dreamy.
 *
 * Deliberately a bean rather than an owl (too close to Duolingo) or a character
 * with round ears on top (the Mickey silhouette).
 *
 * Pure SVG + CSS: identical in every pose, a few KB, no per-use cost, and every
 * colour is a brand token. Motion respects prefers-reduced-motion.
 */

export type MascotPose = "idle" | "peek" | "carry" | "idea" | "celebrate" | "wave" | "sleep";

type Props = {
  pose?: MascotPose;
  /** Rendered height in px. The artwork is 200×260. */
  size?: number;
  /** Freeze all motion (e.g. inside a canvas capture or a static email). */
  still?: boolean;
  /** Eyelid closure 0–1, for frame-by-frame blinking in video renders. */
  blink?: number;
  /** Mouth override, for lip-sync in video renders. */
  mouth?: "smile" | "open" | "wide" | "o";
  /** Waving-arm angle in degrees (wave pose), for frame-by-frame waving. */
  armAngle?: number;
  className?: string;
  title?: string;
};

const CLAY = "#BD6A43";
const CLAY_DEEP = "#9A4F2D"; // right eye rim — the logo's clay ring, darkened to show on a clay body
const LIMB = "#A95A36";
const CREAM = "#FAF6F0";
const INK = "#181410";
const BLUSH = "#F2A7A0";
const BOX = "#D9A47A";
const BOW = "#F27A9E";
const BOW_DEEP = "#C23E6C";

// Eye centres and ring radius, shared by every pose.
const EL = { x: 74, y: 112 };
const ER = { x: 126, y: 112 };
const R = 25;

export default function Mascot({
  pose = "idle",
  size = 160,
  still = false,
  className = "",
  title = "noosho",
  blink = 0,
  mouth,
  armAngle = 0,
}: Props) {
  // Eyelids only appear in video frames (blink > 0). A deterministic id keeps
  // this hook-free so the component still renders in server components.
  const uid = `${pose}${Math.round(blink * 100)}`;
  const happy = pose === "celebrate" || pose === "wave";
  const asleep = pose === "sleep";
  const width = (size * 200) / 260;

  return (
    <svg
      viewBox="0 0 200 260"
      width={width}
      height={size}
      role="img"
      aria-label={title}
      className={`nm ${still ? "nm-still" : ""} nm-${pose} ${className}`}
    >
      <style>{CSS}</style>

      {/* ground shadow — stays put while the body moves */}
      <ellipse className="nm-shadow" cx="100" cy="246" rx="50" ry="7" fill={INK} opacity="0.08" />

      <g className="nm-body">
        {/* feet */}
        <ellipse cx="78" cy="232" rx="15" ry="9" fill={LIMB} />
        <ellipse cx="122" cy="232" rx="15" ry="9" fill={LIMB} />

        {/* back arm layer (behind body) */}
        <ArmsBack pose={pose} />

        {/* bean */}
        <path
          d="M100 46 C152 46 170 98 168 150 C166 204 138 230 100 230 C62 230 34 204 32 150 C30 98 48 46 100 46 Z"
          fill={CLAY}
        />

        {/* bow — the little nod to her. Pink with a deeper outline: the old cream
            bow disappeared against the clay and the linen background. The tilt
            lives on the outer group so the CSS wiggle can't override it. */}
        <g transform="rotate(-18 70 70)">
          <g className="nm-bow">
            <path d="M70 70 L42 54 Q34 70 42 88 Z" fill={BOW} stroke={BOW_DEEP} strokeWidth="3" strokeLinejoin="round" />
            <path d="M70 70 L98 54 Q106 70 98 88 Z" fill={BOW} stroke={BOW_DEEP} strokeWidth="3" strokeLinejoin="round" />
            <path d="M46 62 Q52 60 56 64 M94 62 Q88 60 84 64" stroke="#FFD3DF" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="70" cy="70" r="9" fill={BOW_DEEP} />
            <circle cx="67" cy="67" r="2.5" fill="#FFD3DF" />
          </g>
        </g>

        {/* ring eyes = the Twin Rings */}
        <Eye c={EL} rim={CREAM} asleep={asleep} happy={happy} blink={blink} id={`${uid}l`} />
        <Eye c={ER} rim={CLAY_DEEP} asleep={asleep} happy={happy} blink={blink} id={`${uid}r`} />

        {/* cheeks */}
        <ellipse cx="58" cy="148" rx="11" ry="7" fill={BLUSH} opacity="0.9" />
        <ellipse cx="142" cy="148" rx="11" ry="7" fill={BLUSH} opacity="0.9" />

        {/* mouth */}
        {mouth === "open" ? (
          <g>
            <ellipse cx="100" cy="154" rx="10" ry="8" fill={INK} />
            <ellipse cx="100" cy="158" rx="6" ry="3" fill="#F2A7A0" />
          </g>
        ) : mouth === "wide" ? (
          <g>
            <path d="M86 148 Q100 172 114 148 Z" fill={INK} />
            <ellipse cx="100" cy="160" rx="7" ry="3.5" fill="#F2A7A0" />
          </g>
        ) : mouth === "o" ? (
          <ellipse cx="100" cy="155" rx="6" ry="8" fill={INK} />
        ) : mouth === "smile" ? (
          <path d="M91 150 Q100 159 109 150" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ) : happy ? (
          <path d="M88 150 Q100 166 112 150 Z" fill={INK} />
        ) : asleep ? (
          <circle cx="100" cy="154" r="3" fill={INK} />
        ) : pose === "peek" ? (
          <ellipse cx="100" cy="154" rx="4" ry="5" fill={INK} />
        ) : (
          <path d="M91 150 Q100 159 109 150" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        )}

        {/* front arms + props */}
        <ArmsFront pose={pose} armAngle={armAngle} />
      </g>

      {(pose === "celebrate" || pose === "idea") && <Sparkles pose={pose} />}
      {asleep && (
        <g className="nm-zzz" fill={CLAY} fontFamily="system-ui, sans-serif" fontWeight="700">
          <text x="150" y="52" fontSize="20">z</text>
          <text x="166" y="32" fontSize="15">z</text>
        </g>
      )}
    </svg>
  );
}

function Eye({
  c,
  rim,
  asleep,
  happy,
  blink = 0,
  id,
}: {
  c: { x: number; y: number };
  rim: string;
  asleep: boolean;
  happy: boolean;
  blink?: number;
  id: string;
}) {
  const lid = !asleep && !happy && blink > 0.02;
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={R} fill="#FFFDF9" stroke={rim} strokeWidth="8" />
      {asleep ? (
        <path d={`M${c.x - 11} ${c.y} Q${c.x} ${c.y + 9} ${c.x + 11} ${c.y}`} stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      ) : happy ? (
        <path d={`M${c.x - 11} ${c.y + 3} Q${c.x} ${c.y - 9} ${c.x + 11} ${c.y + 3}`} stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <g className="nm-pupil">
          <circle cx={c.x + 2} cy={c.y + 2} r="10" fill={INK} />
          <circle cx={c.x + 5} cy={c.y - 2} r="3" fill="#fff" />
        </g>
      )}
      {lid && (
        <g>
          <clipPath id={`lid${id}`}>
            <circle cx={c.x} cy={c.y} r={R - 3} />
          </clipPath>
          <rect
            clipPath={`url(#lid${id})`}
            x={c.x - R}
            y={c.y - R}
            width={R * 2}
            height={R * 2 * blink}
            fill={CLAY}
          />
          <path
            d={`M${c.x - R + 5} ${c.y - R + 2 * R * blink} Q${c.x} ${c.y - R + 2 * R * blink + 5} ${c.x + R - 5} ${c.y - R + 2 * R * blink}`}
            stroke={INK}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}

function Arm({ d }: { d: string }) {
  return <path d={d} stroke={LIMB} strokeWidth="16" fill="none" strokeLinecap="round" />;
}

function ArmsBack({ pose }: { pose: MascotPose }) {
  // Arms that hang at the sides sit behind the bean so they read as attached.
  if (pose === "celebrate") return null;
  if (pose === "carry") return null;
  return <Arm d="M40 150 Q24 172 30 196" />;
}

function ArmsFront({ pose, armAngle = 0 }: { pose: MascotPose; armAngle?: number }) {
  switch (pose) {
    case "peek":
      // Right arm lifts a magnifying glass over the right ring eye.
      return (
        <g className="nm-peek">
          <Arm d="M162 158 Q182 150 176 132" />
          <line x1="150" y1="130" x2="176" y2="156" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <circle cx={ER.x + 6} cy={ER.y + 4} r="34" fill="#ffffff40" stroke={INK} strokeWidth="7" />
        </g>
      );
    case "carry":
      return (
        <g className="nm-carry">
          <rect x="62" y="162" width="76" height="52" rx="5" fill={BOX} />
          <path d="M62 176 H138" stroke="#B9835A" strokeWidth="3" />
          <rect x="93" y="162" width="14" height="14" fill={CREAM} />
          <Arm d="M42 158 Q52 184 70 186" />
          <Arm d="M158 158 Q148 184 130 186" />
        </g>
      );
    case "idea":
      return (
        <g className="nm-wave">
          <Arm d="M160 156 Q182 140 176 112" />
          <g transform="rotate(-18 176 100)">
            <rect x="170" y="66" width="12" height="38" rx="2" fill="#E0A15E" />
            <path d="M170 104 L176 116 L182 104 Z" fill={CREAM} />
            <path d="M174.5 112 L176 116 L177.5 112 Z" fill={INK} />
            <rect x="170" y="62" width="12" height="7" rx="2" fill={BLUSH} />
          </g>
        </g>
      );
    case "celebrate":
      return (
        <g>
          <Arm d="M42 148 Q18 124 22 98" />
          <Arm d="M158 148 Q182 124 178 98" />
        </g>
      );
    case "wave":
      return (
        <g transform={`rotate(${armAngle} 158 150)`}>
          <g className="nm-wave">
            <Arm d="M160 150 Q184 132 178 104" />
          </g>
        </g>
      );
    default: // idle, sleep
      return <Arm d="M160 150 Q176 172 170 196" />;
  }
}

function Sparkles({ pose }: { pose: MascotPose }) {
  const star = (x: number, y: number, s: number, fill: string, delay: number) => (
    <path
      key={`${x}-${y}`}
      className="nm-spark"
      style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`}
      fill={fill}
    />
  );
  return pose === "idea" ? (
    <g>{[star(150, 40, 10, CLAY, 0), star(188, 36, 6, INK, 0.4), star(132, 24, 5, BLUSH, 0.8)]}</g>
  ) : (
    <g>
      {[
        star(16, 70, 9, INK, 0),
        star(184, 64, 10, CLAY, 0.3),
        star(20, 190, 6, BLUSH, 0.6),
        star(182, 196, 6, INK, 0.9),
        star(100, 18, 8, CLAY, 0.45),
      ]}
    </g>
  );
}

const CSS = `
.nm .nm-body { transform-box: fill-box; transform-origin: 50% 100%; }
.nm-idle .nm-body, .nm-peek .nm-body, .nm-wave .nm-body { animation: nm-bob 3.2s ease-in-out infinite; }
.nm-idea .nm-body { animation: nm-bob 2.4s ease-in-out infinite; }
.nm-sleep .nm-body { animation: nm-breathe 4s ease-in-out infinite; }
.nm-celebrate .nm-body { animation: nm-jump 1.1s cubic-bezier(.3,.7,.4,1) infinite; }
.nm-celebrate .nm-shadow { transform-box: fill-box; transform-origin: 50% 50%; animation: nm-shadow 1.1s cubic-bezier(.3,.7,.4,1) infinite; }
.nm-carry .nm-body { animation: nm-waddle .7s ease-in-out infinite; }
.nm .nm-pupil { transform-box: fill-box; transform-origin: 50% 50%; animation: nm-blink 4.6s infinite; }
.nm .nm-bow { transform-box: fill-box; transform-origin: 50% 80%; animation: nm-bow 3.2s ease-in-out infinite; }
.nm .nm-wave { transform-box: fill-box; transform-origin: 0% 100%; animation: nm-wave 1.4s ease-in-out infinite; }
.nm .nm-peek { transform-box: fill-box; transform-origin: 80% 100%; animation: nm-peek 2.6s ease-in-out infinite; }
.nm .nm-spark { animation: nm-twinkle 1.6s ease-in-out infinite; }
.nm .nm-zzz { animation: nm-float 3s ease-in-out infinite; }
@keyframes nm-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes nm-breathe { 0%,100% { transform: scale(1,1) } 50% { transform: scale(1.02,.98) } }
@keyframes nm-jump { 0%,100% { transform: translateY(0) scale(1.04,.94) } 45% { transform: translateY(-20px) scale(.97,1.04) } 70% { transform: translateY(-4px) scale(1,1) } }
@keyframes nm-shadow { 0%,100% { transform: scale(1) } 45% { transform: scale(.7) } }
@keyframes nm-waddle { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) } }
@keyframes nm-blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes nm-bow { 0%,100% { transform: rotate(0) } 50% { transform: rotate(-6deg) } }
@keyframes nm-wave { 0%,100% { transform: rotate(0) } 50% { transform: rotate(-16deg) } }
@keyframes nm-peek { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-4px,3px) } }
@keyframes nm-twinkle { 0%,100% { opacity: .25; transform: scale(.6) } 50% { opacity: 1; transform: scale(1.1) } }
@keyframes nm-float { 0%,100% { transform: translateY(0); opacity: .6 } 50% { transform: translateY(-6px); opacity: 1 } }
.nm-still *, .nm-still { animation: none !important; }
@media (prefers-reduced-motion: reduce) { .nm *, .nm { animation: none !important; } }
`;
