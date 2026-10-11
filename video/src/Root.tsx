import React from 'react';
import { CalculateMetadataFunction, Composition, Still, staticFile } from 'remotion';
import { Episode, Format, cutLength } from './Episode';
import { Cover, Thumbnail } from './Thumbnail';
import type { Episode as EpisodeData } from './types';

type Props = { episodeId: string; format: Format; episode?: EpisodeData };

const load = async (episodeId: string) => {
  const res = await fetch(staticFile(`episodes/${episodeId}/episode.json`));
  return (await res.json()) as EpisodeData;
};

const fullLength = (ep: EpisodeData) => ep.intro + ep.scenes.reduce((a, sc) => a + sc.duration, 0) + ep.outro;

// Reads public/episodes/<episodeId>/episode.json and sizes the video to it.
const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const episode = await load(props.episodeId);
  return {
    durationInFrames: Math.max(1, Math.round(fullLength(episode) * episode.fps)),
    fps: episode.fps,
    props: { ...props, episode },
  };
};

// The Shorts cut: only the slices listed in episode.short (picked by pipeline/publish.py).
const calculateShort: CalculateMetadataFunction<Props> = async ({ props }) => {
  const episode = await load(props.episodeId);
  const segs = episode.short ?? [{ start: 0, end: fullLength(episode), scene: null }];
  return {
    durationInFrames: Math.max(1, Math.round(cutLength(segs) * episode.fps)),
    fps: episode.fps,
    props: { ...props, episode },
  };
};

const calculateStill: CalculateMetadataFunction<Props> = async ({ props }) => ({ props: { ...props, episode: await load(props.episodeId) } });

const Wrapped: React.FC<Props> = ({ episode, format, episodeId }) =>
  episode ? <Episode episode={episode} format={format} episodeId={episodeId} /> : null;

const ShortCut: React.FC<Props> = ({ episode, episodeId }) =>
  episode ? <Episode episode={episode} format="vertical" episodeId={episodeId} segments={episode.short} /> : null;

const ThumbWrapped: React.FC<Props> = ({ episode }) => (episode ? <Thumbnail episode={episode} /> : null);
const CoverWrapped: React.FC<Props> = ({ episode }) => (episode ? <Cover episode={episode} /> : null);

export const Root: React.FC = () => (
  <>
    <Composition
      id="Landscape"
      component={Wrapped}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
      defaultProps={{ episodeId: 'sample', format: 'landscape' as Format }}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="Vertical"
      component={Wrapped}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={300}
      defaultProps={{ episodeId: 'sample', format: 'vertical' as Format }}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="Short"
      component={ShortCut}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={300}
      defaultProps={{ episodeId: 'sample', format: 'vertical' as Format }}
      calculateMetadata={calculateShort}
    />
    <Still
      id="Thumbnail"
      component={ThumbWrapped}
      width={1280}
      height={720}
      defaultProps={{ episodeId: 'sample', format: 'landscape' as Format }}
      calculateMetadata={calculateStill}
    />
    <Still
      id="Cover"
      component={CoverWrapped}
      width={1080}
      height={1920}
      defaultProps={{ episodeId: 'sample', format: 'vertical' as Format }}
      calculateMetadata={calculateStill}
    />
  </>
);
