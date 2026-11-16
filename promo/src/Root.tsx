import React from 'react';
import { Composition } from 'remotion';
import { Promo } from './Promo';

export const RemotionRoot: React.FC = () => (
  <Composition id="BarklarmPromo" component={Promo} durationInFrames={765} fps={30} width={1920} height={1080} />
);

export default RemotionRoot;
