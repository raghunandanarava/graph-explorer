import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { RisoNode, Vertie } from './character/Vertie';
import { Director, Format, PortalView, SCREEN, backOut, clamp01, coverRadius, easeInOut, easeOut } from './director';
import { Graph, HeldNodes, LoopBadge } from './graph/Graph';
import { FarLayers, NearLayer, Shafts } from './Backdrop';
import { SimPanel } from './SimPanel';
import { colors, fonts, mix, nodeColors } from './theme';
import type { Episode as EpisodeData, SceneData, ShortSegment, Viseme } from './types';

export type { Format };

const SERIES = 'VERTIE TAKES IT APART';

// ---------------------------------------------------------------- subtitles
type Word = { text: string; start: number; end: number };

const wordsFor = (s: SceneData): Word[][] => {
  const spoken = s.mouthCues.filter((c) => c.value !== 'X');
  const a = spoken.length ? spoken[0].start : 0;
  const b = spoken.length ? spoken[spoken.length - 1].end : s.duration;
  const words = s.narration.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 2 + (/[.,!?;:]$/.test(w) ? 4 : 0));
  const total = weights.reduce((x, y) => x + y, 0) || 1;
  let acc = a;
  const timed = words.map((w, k) => {
    const d = (weights[k] / total) * (b - a);
    const out = { text: w, start: acc, end: acc + d };
    acc += d;
    return out;
  });
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  for (const w of timed) {
    cur.push(w);
    if (cur.length >= 6 || /[.!?;:]$/.test(w.text)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

const Subtitles: React.FC<{ scene: SceneData; t: number; fmt: Format }> = ({ scene, t, fmt }) => {
  const chunks = useMemo(() => wordsFor(scene), [scene]);
  const chunk = chunks.find((c) => t >= c[0].start - 0.05 && t <= c[c.length - 1].end + 0.35);
  if (!chunk) return null;
  const size = fmt === 'landscape' ? 46 : 52;
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        bottom: fmt === 'landscape' ? 60 : 250,
        textAlign: 'center',
        fontFamily: fonts.mono,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.35,
      }}
    >
      {chunk.map((w, k) => {
        const state = t >= w.end ? 'done' : t >= w.start ? 'now' : 'next';
        return (
          <span
            key={k}
            style={{
              color: state === 'now' ? colors.amber : colors.chalk,
              opacity: state === 'next' ? 0.45 : 1,
              WebkitTextStroke: `10px ${colors.ink}`,
              paintOrder: 'stroke fill',
              marginRight: size * 0.42,
              display: 'inline-block',
              transform: state === 'now' ? 'translateY(-3px)' : undefined,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- captions
const Caption: React.FC<{ scene: SceneData; index: number; t: number; fmt: Format }> = ({ scene, index, t, fmt }) => {
  if (!scene.caption) return null;
  const k = easeOut((t - 0.3) / 0.5);
  const line = easeInOut((t - 0.5) / 0.6);
  const out = 1 - easeOut((t - (scene.duration - 0.35)) / 0.35);
  const land = fmt === 'landscape';
  return (
    <div
      style={{
        position: 'absolute',
        top: land ? 60 : 150,
        left: land ? 90 : 60,
        right: land ? undefined : 60,
        textAlign: land ? 'left' : 'center',
        opacity: k * out,
        transform: `translateY(${(1 - k) * 18}px)`,
      }}
    >
      <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: land ? 26 : 30, color: colors.amber, letterSpacing: 2 }}>
        §{String(index + 1).padStart(2, '0')}
      </div>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: land ? 72 : 80, color: colors.chalk, lineHeight: 1.05, marginTop: 4 }}>
        {scene.caption}
      </div>
      <div
        style={{
          height: 6,
          marginTop: 12,
          width: `${line * (land ? 260 : 300)}px`,
          background: colors.coral,
          borderRadius: 3,
          marginLeft: land ? 0 : 'auto',
          marginRight: land ? 0 : 'auto',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------- zooming into a node
/** Screen-space porthole: the node's colour fills the frame, with a round hole onto the other board. */
const Portal: React.FC<{ portal: PortalView; fmt: Format; cx: number; cy: number }> = ({ portal, fmt, cx, cy }) => {
  const S = SCREEN[fmt];
  const base = nodeColors[portal.color] ?? colors.chalk;
  const fill = mix(base, colors.chalk, 0.62);
  const R = coverRadius(fmt) * 1.05;
  const r = portal.iris === null ? 0 : portal.iris * R;
  return (
    <g opacity={portal.cover}>
      <defs>
        <mask id="porthole">
          <rect width={S.w} height={S.h} fill="white" />
          {r > 0 ? <circle cx={cx} cy={cy} r={r} fill="black" /> : null}
        </mask>
      </defs>
      <g mask="url(#porthole)">
        <rect width={S.w} height={S.h} fill={fill} />
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke={base} strokeOpacity={0.35} strokeWidth={10} />
        ))}
      </g>
      {r > 0 ? (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.ink} strokeWidth={26} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={base} strokeWidth={12} />
        </>
      ) : null}
    </g>
  );
};

/** "INSIDE  Leaf › Chloroplast" while we're inside a node. */
const Breadcrumb: React.FC<{ path: string[]; fmt: Format }> = ({ path, fmt }) => {
  if (!path.length) return null;
  const land = fmt === 'landscape';
  return (
    <div
      style={{
        position: 'absolute',
        top: land ? 22 : 80,
        right: land ? 90 : 0,
        left: land ? undefined : 0,
        textAlign: land ? 'right' : 'center',
        fontFamily: fonts.mono,
        fontWeight: 600,
        fontSize: land ? 26 : 30,
        letterSpacing: 3,
        color: colors.chalk,
        WebkitTextStroke: `8px ${colors.ink}`,
        paintOrder: 'stroke fill',
      }}
    >
      <span style={{ color: colors.amber }}>INSIDE </span>
      {path.join(' › ').toUpperCase()}
    </div>
  );
};

// ---------------------------------------------------------------- intro / outro
const IntroCard: React.FC<{ title: string; t: number; dur: number; fmt: Format }> = ({ title, t, dur, fmt }) => {
  const land = fmt === 'landscape';
  const fade = 1 - easeInOut((t - (dur - 0.6)) / 0.6);
  const kicker = `${SERIES}`;
  const typed = kicker.slice(0, Math.floor(clamp01((t - 0.15) / 0.8) * kicker.length));
  const words = title.split(' ');
  const S = SCREEN[fmt];
  const nodes = [
    { x: -150, c: colors.amber, d: 1.3 },
    { x: 0, c: colors.mint, d: 1.5 },
    { x: 150, c: colors.coral, d: 1.7 },
  ];
  const edgeK = easeOut((t - 1.9) / 0.4);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.blueprint, opacity: fade, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: land ? 30 : 34, color: colors.amber, letterSpacing: 6, height: 44 }}>
        {typed}
        <span style={{ opacity: Math.sin(t * 12) > 0 ? 1 : 0 }}>▌</span>
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: land ? 130 : 120,
          color: colors.chalk,
          lineHeight: 1.0,
          textAlign: 'center',
          maxWidth: S.w - 160,
          marginTop: 18,
        }}
      >
        {words.map((w, k) => {
          const p = backOut((t - 0.6 - k * 0.12) / 0.45);
          return (
            <span key={k} style={{ display: 'inline-block', transform: `scale(${p})`, marginRight: 30, opacity: p > 0 ? 1 : 0 }}>
              {w}
            </span>
          );
        })}
      </div>
      <svg width={420} height={120} viewBox="-210 -60 420 120" style={{ marginTop: 40 }}>
        <line x1={-150} y1={0} x2={-150 + 300 * edgeK} y2={0} stroke={colors.chalk} strokeWidth={6} strokeLinecap="round" />
        {nodes.map((n, k) => {
          const p = backOut((t - n.d) / 0.4);
          return p > 0 ? (
            <g key={k} transform={`translate(${n.x} 0) scale(${p})`}>
              <RisoNode cx={0} cy={0} r={26} fill={n.c} />
            </g>
          ) : null;
        })}
      </svg>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ title: string; t: number; fmt: Format; sources?: string[] }> = ({ title, t, fmt, sources }) => {
  const land = fmt === 'landscape';
  const k = easeOut(t / 0.6);
  const stamp = backOut((t - 0.7) / 0.35);
  const src = easeOut((t - 1.2) / 0.5);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: land ? 'center' : 'flex-start', paddingTop: land ? 0 : 260 }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${colors.ink}E6 0%, ${colors.ink}99 60%, ${colors.ink}55 100%)`, opacity: k }} />
      <div style={{ position: 'relative', textAlign: 'center', opacity: k }}>
        <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 30, color: colors.amber, letterSpacing: 6 }}>{SERIES}</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: land ? 96 : 88, color: colors.chalk, marginTop: 10, maxWidth: land ? 1400 : 920 }}>{title}</div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 40,
            padding: '14px 34px',
            border: `6px double ${colors.coral}`,
            borderRadius: 10,
            fontFamily: fonts.mono,
            fontWeight: 600,
            fontSize: 44,
            letterSpacing: 4,
            color: colors.coral,
            transform: `rotate(-7deg) scale(${stamp ? 2.2 - 1.2 * stamp : 0})`,
            opacity: stamp > 0 ? 1 : 0,
          }}
        >
          TAKEN APART ✓
        </div>
        {sources && sources.length ? (
          <div
            style={{
              marginTop: 46,
              fontFamily: fonts.mono,
              fontWeight: 600,
              fontSize: land ? 24 : 26,
              letterSpacing: 2,
              color: colors.chalk,
              opacity: 0.8 * src,
              maxWidth: land ? 1300 : 900,
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: colors.amber }}>CHECKED AGAINST WIKIPEDIA · </span>
            {sources.join(' · ')}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- world dressing
const DUST = Array.from({ length: 70 }, (_, k) => {
  const r = (n: number) => {
    const x = Math.sin(k * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1) * 4200 - 750, y: r(2) * 3600 - 650, s: 2 + r(3) * 5, sp: 0.2 + r(4) * 0.6, c: r(5) > 0.7 ? colors.amber : colors.haze };
});

// ---------------------------------------------------------------- episode
// ---------------------------------------------------------------- shorts: playing slices of the episode
/** Where each segment starts in the cut, in seconds. */
const segmentStarts = (segs: ShortSegment[]) => {
  let acc = 0;
  return segs.map((g) => {
    const st = acc;
    acc += g.end - g.start;
    return st;
  });
};

/** Episode time for a moment in the cut, plus how far into its segment it is. */
const cutToEpisode = (segs: ShortSegment[], t: number) => {
  const starts = segmentStarts(segs);
  let k = 0;
  starts.forEach((st, i) => {
    if (t >= st) k = i;
  });
  return { time: segs[k].start + (t - starts[k]), seg: k, into: t - starts[k] };
};

/** Where an episode moment lands in the cut, or null if it was cut out. */
const episodeToCut = (segs: ShortSegment[], time: number): number | null => {
  const starts = segmentStarts(segs);
  for (let k = 0; k < segs.length; k++) if (time >= segs[k].start && time < segs[k].end) return starts[k] + (time - segs[k].start);
  return null;
};

export const cutLength = (segs: ShortSegment[]) => segs.reduce((a, g) => a + (g.end - g.start), 0);

export const Episode: React.FC<{ episode: EpisodeData; format: Format; episodeId: string; segments?: ShortSegment[] }> = ({
  episode,
  format,
  episodeId,
  segments,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const director = useMemo(() => new Director(episode, format), [episode, format]);
  const S = SCREEN[format];
  const local = frame / fps;
  const cut = segments ? cutToEpisode(segments, local) : null;
  const time = cut ? cut.time : local;
  // where things land on this video's own timeline (identity for the full episode)
  const place = (epTime: number): number | null => (segments ? episodeToCut(segments, epTime) : epTime);
  const videoLength = segments ? cutLength(segments) : director.total;
  const scenesEnd = director.total - episode.outro;
  const ft = Math.min(Math.max(time, episode.intro), scenesEnd - 1 / fps);
  const f = director.frame(ft);
  const outroT = time - scenesEnd;

  const cam = { ...f.camera };
  if (outroT > 0) cam.zoom *= 1 - 0.18 * easeInOut(outroT / episode.outro);
  const anchorY = format === 'landscape' ? 0.54 : 0.46;
  const camTransform = `translate(${S.w / 2} ${S.h * anchorY}) scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`;

  const sceneT = time >= episode.intro && time < scenesEnd ? f.t : -1;
  const cue = f.scene.mouthCues.find((c) => sceneT >= c.start && sceneT < c.end);
  const viseme: Viseme = cue ? cue.value : 'X';
  const spoken = f.scene.mouthCues.filter((c) => c.value !== 'X');
  const speaking = spoken.length > 0 && sceneT >= spoken[0].start && sceneT <= spoken[spoken.length - 1].end;
  const blink = (frame + 11) % Math.round(3.7 * fps) < 4;

  const speech = useMemo(() => director.speech(), [director]);
  const musicVolume = (fr: number) => {
    const v = fr / fps;
    const s = segments ? cutToEpisode(segments, v).time : v;
    const talking = speech.some(([a, b]) => s >= a - 0.2 && s <= b + 0.2);
    const fadeIn = clamp01(v / 1.5);
    const fadeOut = clamp01((videoLength - v) / 2);
    return (talking ? 0.07 : 0.16) * fadeIn * fadeOut;
  };
  const sfx = useMemo(() => director.sfx(), [director]);
  const nodeById = useMemo(() => new Map(episode.nodes.map((n) => [n.id, n])), [episode]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.blueprint }}>
      {/* narration */}
      {episode.scenes.map((s, i) => {
        const at = place(director.starts[i]);
        if (at === null) return null;
        return (
          <Sequence key={s.id} from={Math.round((at + (s.audioOffset ?? 0)) * fps)} durationInFrames={Math.round(s.duration * fps) + 5}>
            <Audio src={staticFile(`episodes/${episodeId}/${s.audio}`)} />
          </Sequence>
        );
      })}
      {/* sound effects */}
      {sfx.map(([epAt, name, vol], k) => {
        const at = place(epAt);
        return at === null ? null : (
          <Sequence key={`sfx${k}`} from={Math.round(at * fps)} durationInFrames={Math.round(2 * fps)}>
            <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} />
          </Sequence>
        );
      })}
      {(() => {
        const at = place(director.total - episode.outro + 0.6);
        return at === null ? null : (
          <Sequence from={Math.round(at * fps)} durationInFrames={Math.round(2 * fps)}>
            <Audio src={staticFile('sfx/stamp.wav')} volume={0.6} />
          </Sequence>
        );
      })()}
      <Audio src={staticFile(episode.music ? `episodes/${episodeId}/${episode.music}` : 'sfx/music.wav')} volume={musicVolume} loop />

      <svg width={S.w} height={S.h} viewBox={`0 0 ${S.w} ${S.h}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="grid-minor" width={60} height={60} patternUnits="userSpaceOnUse">
            <path d="M60 0 H0 V60" fill="none" stroke={colors.gridStrong} strokeOpacity={0.35} strokeWidth={2} />
          </pattern>
          <pattern id="grid-major" width={300} height={300} patternUnits="userSpaceOnUse">
            <path d="M300 0 H0 V300" fill="none" stroke={colors.gridStrong} strokeOpacity={0.7} strokeWidth={3} />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor={colors.ink} stopOpacity={0} />
            <stop offset="100%" stopColor={colors.ink} stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <FarLayers cam={cam} time={time} fmt={format} anchorY={anchorY} />
        <Shafts time={time} fmt={format} />
        <g transform={camTransform}>
          <rect x={-4000} y={-4000} width={12000} height={12000} fill="url(#grid-minor)" />
          <rect x={-4000} y={-4000} width={12000} height={12000} fill="url(#grid-major)" />
          {DUST.map((d, k) => (
            <circle key={k} cx={d.x + Math.sin(time * d.sp + k) * 30} cy={d.y - ((time * 12 * d.sp) % 400)} r={d.s} fill={d.c} opacity={0.35} />
          ))}
          <Graph nodes={f.nodes} edges={f.edges} t={time} zoom={cam.zoom} />
          {f.loop ? <LoopBadge loop={f.loop} t={time} zoom={cam.zoom} /> : null}
          {f.vertie.scale > 0 ? <Vertie
            t={time}
            x={f.vertie.pos.x}
            y={f.vertie.pos.y}
            scale={f.vertie.scale}
            hands={f.vertie.hands}
            expression={f.scene.expression}
            viseme={viseme}
            speaking={speaking}
            walkPhase={f.vertie.walkPhase}
            lookX={f.vertie.lookX}
            lookY={f.vertie.lookY}
            blink={blink}
            fx={f.vertie.fx}
          /> : null}
          <HeldNodes nodes={f.nodes} t={time} zoom={cam.zoom} />
        </g>
        <NearLayer cam={cam} time={time} fmt={format} anchorY={anchorY} />
        {f.portal ? <Portal portal={f.portal} fmt={format} cx={S.w / 2} cy={S.h * anchorY} /> : null}
        <rect width={S.w} height={S.h} fill="url(#vignette)" />
      </svg>

      {sceneT >= 0 ? (
        <>
          <Caption scene={f.scene} index={f.sceneIndex} t={f.t} fmt={format} />
          <Breadcrumb path={f.path} fmt={format} />
          <Subtitles scene={f.scene} t={f.t} fmt={format} />
          {f.sim ? <SimPanel sim={f.sim} nodes={nodeById} fmt={format} /> : null}
        </>
      ) : null}
      {time < episode.intro ? <IntroCard title={episode.title} t={time} dur={episode.intro} fmt={format} /> : null}
      {outroT >= 0 ? <OutroCard title={episode.title} t={outroT} fmt={format} sources={episode.sources?.map((s) => s.title)} /> : null}
      {cut && cut.seg > 0 && cut.into < 0.3 ? (
        <AbsoluteFill style={{ backgroundColor: colors.ink, opacity: 0.85 * (1 - cut.into / 0.3) }} />
      ) : null}
    </AbsoluteFill>
  );
};
