import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif';

const C = {
  text: '#f5f7fb',
  muted: '#9ba6b5',
  dim: '#6f7a89',
  teal: '#19b8c9',
  coral: '#ff7a70',
  green: '#30d158',
  red: '#ff453a',
  yellow: '#ffd60a',
  blue: '#0a84ff',
  line: 'rgba(255,255,255,0.12)',
  panel: 'rgba(20,26,38,0.9)',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const fadeIn = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

const Scene: React.FC<{ from: number; duration: number; children: React.ReactNode }> = ({
  from,
  duration,
  children,
}) => (
  <Sequence from={from} durationInFrames={duration}>
    <SceneFade duration={duration}>{children}</SceneFade>
  </Sequence>
);

const SceneFade: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, duration - 12, duration], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const DarkBackdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: '#0a0e16', overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(900px 650px at 12% 8%, rgba(25,184,201,0.18), transparent 65%), radial-gradient(1000px 700px at 92% 90%, rgba(255,122,112,0.14), transparent 65%)',
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '90px 90px',
        maskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 74%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 74%)',
      }}
    />
    {children}
  </AbsoluteFill>
);

const BrandBackdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(115deg, #087f8c 0%, #1b9da3 30%, #8ab5a9 50%, #e39a92 72%, #ff7a70 100%)',
      overflow: 'hidden',
    }}
  >
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(750px 550px at 50% 38%, rgba(255,255,255,0.22), transparent 70%), radial-gradient(1200px 800px at 50% 120%, rgba(0,0,0,0.32), transparent 65%)',
      }}
    />
    {children}
  </AbsoluteFill>
);

const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img
    src={staticFile('icon.png')}
    style={{
      width: size,
      height: size,
      objectFit: 'contain',
      filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.32))',
      ...style,
    }}
  />
);

const Pill: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 20px',
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.25)',
      background: 'rgba(0,0,0,0.14)',
      color: C.text,
      fontFamily: FONT,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: 0.3,
      ...style,
    }}
  >
    {children}
  </div>
);

const Window: React.FC<{
  width: number;
  height: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ width, height, style, children }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 18,
      background: '#1b1b1e',
      border: '1px solid rgba(255,255,255,0.16)',
      boxShadow: '0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}
  >
    <div style={{ position: 'absolute', top: 11, left: 14, display: 'flex', gap: 8, zIndex: 2 }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
        <span key={dot} style={{ width: 11, height: 11, borderRadius: 6, background: dot }} />
      ))}
    </div>
    <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>{children}</div>
  </div>
);

const Callout: React.FC<{
  index: string;
  title: string;
  body: string;
  delay: number;
  accent: string;
}> = ({ index, title, body, delay, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        opacity: s,
        transform: `translateX(${(1 - s) * 44}px)`,
        marginBottom: 38,
      }}
    >
      <div
        style={{
          flex: '0 0 44px',
          height: 44,
          borderRadius: 12,
          background: `${accent}22`,
          border: `1px solid ${accent}66`,
          color: accent,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 17,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {index}
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 650, color: C.text, letterSpacing: -0.4 }}>
          {title}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 21, color: C.muted, marginTop: 7, lineHeight: 1.4, maxWidth: 520 }}>
          {body}
        </div>
      </div>
    </div>
  );
};

const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, mass: 1.05 } });
  const title = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const tag = fadeIn(frame, 26, 46);
  const eyebrow = fadeIn(frame, 8, 28);

  return (
    <BrandBackdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 24 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 20,
            fontWeight: 650,
            letterSpacing: 7,
            color: 'rgba(255,255,255,0.78)',
            textTransform: 'uppercase',
            opacity: eyebrow,
            marginBottom: 22,
          }}
        >
          Native menu bar radiator
        </div>
        <div
          style={{
            transform: `scale(${0.72 + logo * 0.28}) translateY(${(1 - logo) * 30}px)`,
            opacity: logo,
            marginBottom: 8,
          }}
        >
          <Logo size={300} />
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 138,
            fontWeight: 750,
            letterSpacing: -6,
            color: '#fff',
            lineHeight: 1,
            opacity: title,
            transform: `translateY(${(1 - title) * 44}px)`,
            textShadow: '0 20px 50px rgba(0,0,0,0.22)',
          }}
        >
          Barklarm
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 39,
            fontWeight: 450,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 20,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 24}px)`,
          }}
        >
          Every build. Every alert. One glance.
        </div>
      </AbsoluteFill>
    </BrandBackdrop>
  );
};

const HeadlineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });
  const shot = spring({ frame: frame - 14, fps, config: { damping: 200, mass: 0.9 } });
  const chips = fadeIn(frame, 42, 62);

  return (
    <DarkBackdrop>
      <div style={{ position: 'absolute', left: 120, top: 300, width: 660 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 20,
            fontWeight: 650,
            letterSpacing: 6,
            color: C.teal,
            textTransform: 'uppercase',
            opacity: head,
            marginBottom: 20,
          }}
        >
          One glance
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 104,
            lineHeight: 0.98,
            fontWeight: 750,
            letterSpacing: -4,
            color: C.text,
            opacity: head,
            transform: `translateY(${(1 - head) * 50}px)`,
          }}
        >
          Stop
          <br />
          tab-hopping.
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            lineHeight: 1.45,
            color: C.muted,
            marginTop: 28,
            opacity: fadeIn(frame, 16, 36),
          }}
        >
          Builds, monitors and alerts — radiating from your menu bar. No dashboard to babysit.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 34, opacity: chips }}>
          {['GitHub Actions', 'Sentry', 'Datadog'].map((label) => (
            <Pill key={label} style={{ fontSize: 19, padding: '9px 17px', background: 'rgba(255,255,255,0.06)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: C.teal }} />
              {label}
            </Pill>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 830,
          top: 166,
          transform: `translateY(${(1 - shot) * 90}px) scale(${0.94 + shot * 0.06}) rotate(${(1 - shot) * -2}deg)`,
          opacity: shot,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -70,
            background: 'radial-gradient(closest-side, rgba(25,184,201,0.2), transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
        <Window width={980} height={740}>
          <Img src={staticFile('shots/observers.png')} style={{ width: 980, height: 740, objectFit: 'cover' }} />
        </Window>
      </div>
    </DarkBackdrop>
  );
};

const ProductScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });
  const shot = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.9 } });
  const swap = interpolate(frame, [68, 96], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const windowHeight = 627 + swap * 166;
  const drift = interpolate(frame, [0, durationInFrames], [0, -18], clamp);

  return (
    <DarkBackdrop>
      <div style={{ position: 'absolute', left: 110, top: 92 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 68,
            fontWeight: 730,
            letterSpacing: -2.6,
            color: C.text,
            opacity: head,
            transform: `translateY(${(1 - head) * 30}px)`,
          }}
        >
          Your entire stack. One window.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 26, color: C.muted, marginTop: 12, opacity: fadeIn(frame, 14, 34) }}>
          Add a source, set an alias, and Barklarm keeps the tray in sync.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 108,
          top: 270 + drift,
          transform: `translateY(${(1 - shot) * 60}px)`,
          opacity: shot,
        }}
      >
        <Window width={830} height={windowHeight}>
          <Img
            src={staticFile('shots/observers.png')}
            style={{ position: 'absolute', width: 830, height: 627, objectFit: 'cover', opacity: 1 - swap }}
          />
          <Img
            src={staticFile('shots/observers-config.png')}
            style={{ position: 'absolute', width: 830, height: 793, top: 0, objectFit: 'cover', opacity: swap }}
          />
        </Window>
      </div>

      <div style={{ position: 'absolute', left: 1020, top: 310, width: 760 }}>
        <Callout
          index="01"
          title="Every source, one list"
          body="GitHub Actions, Sentry, Datadog, Azure DevOps and six more."
          delay={18}
          accent={C.teal}
        />
        <Callout
          index="02"
          title="Live status at a glance"
          body="Succeeded, failed or checking — readable from across the room."
          delay={36}
          accent={C.green}
        />
        <Callout
          index="03"
          title="Configure in seconds"
          body="Paste a link or pick a source. No YAML, no plugin SDK."
          delay={54}
          accent={C.coral}
        />
      </div>
    </DarkBackdrop>
  );
};

const INTEGRATIONS = [
  { name: 'GitHub Actions', icon: 'icons/githubactions.svg' },
  { name: 'Azure DevOps', icon: 'azure' },
  { name: 'Bitbucket', icon: 'icons/bitbucket.svg' },
  { name: 'Datadog', icon: 'icons/datadog.svg' },
  { name: 'Sentry', icon: 'icons/sentry.svg' },
  { name: 'New Relic', icon: 'icons/newrelic.svg' },
  { name: 'Opsgenie', icon: 'icons/opsgenie.svg' },
  { name: 'Grafana', icon: 'icons/grafana.svg' },
  { name: 'Graylog', icon: 'icons/graylog.svg' },
  { name: 'CCTray', icon: 'cctray' },
];

const IntegrationTile: React.FC<{ name: string; icon: string; delay: number }> = ({ name, icon, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.75 } });

  return (
    <div
      style={{
        width: 248,
        height: 132,
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.13)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: s,
        transform: `translateY(${(1 - s) * 40}px) scale(${0.94 + s * 0.06})`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {icon === 'azure' ? (
        <div
          style={{
            height: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontSize: 64,
            lineHeight: 1,
            color: '#fff',
          }}
        >
          ∞
        </div>
      ) : icon === 'cctray' ? (
        <div
          style={{
            height: 58,
            minWidth: 64,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '3px solid rgba(255,255,255,0.8)',
            borderRadius: 14,
            fontFamily: FONT,
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
          }}
        >
          cc
        </div>
      ) : (
        <Img src={staticFile(icon)} style={{ width: 56, height: 56, objectFit: 'contain' }} />
      )}
      <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 550, color: '#dbe2ea' }}>{name}</span>
    </div>
  );
};

const IntegrationsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });
  return (
    <DarkBackdrop>
      <div style={{ position: 'absolute', width: '100%', top: 150, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 78,
            fontWeight: 740,
            letterSpacing: -3,
            color: C.text,
            opacity: head,
            transform: `translateY(${(1 - head) * 30}px)`,
          }}
        >
          Connects to your stack.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 28, color: C.muted, marginTop: 14, opacity: fadeIn(frame, 16, 38) }}>
          Ten sources. One radiator.
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 296,
          top: 400,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 248px)',
          gap: '22px 22px',
        }}
      >
        {INTEGRATIONS.map((item, i) => (
          <IntegrationTile key={item.name} name={item.name} icon={item.icon} delay={28 + i * 4} />
        ))}
      </div>
    </DarkBackdrop>
  );
};

const TrayScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });
  const menu = spring({ frame: frame - 20, fps, config: { damping: 17, mass: 0.8 } });
  const note = spring({ frame: frame - 58, fps, config: { damping: 18, mass: 0.8 } });

  const row = (icon: string, name: string, state: string, tone: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px' }}>
      <Img src={staticFile(icon)} style={{ width: 24, height: 24 }} />
      <span style={{ fontFamily: FONT, fontSize: 21, color: C.text, flex: 1 }}>{name}</span>
      <span style={{ fontFamily: FONT, fontSize: 18, color: tone }}>{state}</span>
    </div>
  );

  return (
    <DarkBackdrop>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(700px 500px at 70% 30%, rgba(48,209,88,0.08), transparent 70%), radial-gradient(800px 600px at 30% 80%, rgba(10,132,255,0.1), transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 46,
          background: 'rgba(6,10,18,0.7)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 26px',
          gap: 12,
        }}
      >
        <Img src={staticFile('icon.png')} style={{ width: 22, height: 22 }} />
        <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, color: C.text }}>Barklarm</span>
        <span style={{ flex: 1 }} />
        <Img src={staticFile('icons/fail_icon_big.png')} style={{ width: 24, height: 24 }} />
        <span style={{ fontFamily: FONT, fontSize: 17, color: C.muted, marginLeft: 16 }}>Mon 9:41</span>
      </div>

      <div style={{ position: 'absolute', left: 110, top: 330, width: 780 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 92,
            fontWeight: 750,
            lineHeight: 1.02,
            letterSpacing: -4,
            color: C.text,
            opacity: head,
            transform: `translateY(${(1 - head) * 40}px)`,
          }}
        >
          See it before
          <br />
          your users do.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 29, color: C.muted, lineHeight: 1.5, marginTop: 26, width: 650 }}>
          Native notifications and a tray menu that tells you what broke — and opens the issue for you.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 76,
          right: 34,
          width: 600,
          borderRadius: 16,
          background: 'rgba(32,32,36,0.94)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 40px 90px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          transformOrigin: 'top center',
          transform: `scaleY(${0.85 + menu * 0.15}) translateY(${(1 - menu) * -16}px)`,
          opacity: menu,
        }}
      >
        <div
          style={{
            padding: '12px 18px 10px',
            fontFamily: FONT,
            fontSize: 16,
            color: C.dim,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          6 observers · updated just now
        </div>
        {row('icons/fail_icon_big.png', 'Sentry: api — production', 'Failed', C.red)}
        {row('icons/ok_icon_big.png', 'Github: web — main', 'Succeeded', C.green)}
        {row('icons/ok_icon_big.png', 'Datadog: checkout latency', 'Succeeded', C.green)}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 14px' }}>
          <span style={{ fontFamily: FONT, fontSize: 21, color: C.text }}>Configure…</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT, fontSize: 21, color: C.dim }}>Quit Barklarm</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 90,
          bottom: 74,
          width: 640,
          padding: '20px 22px',
          borderRadius: 22,
          background: 'rgba(28,28,32,0.96)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 34px 80px rgba(0,0,0,0.55)',
          display: 'flex',
          gap: 16,
          opacity: note,
          transform: `translateY(${(1 - note) * 60}px) scale(${0.96 + note * 0.04})`,
        }}
      >
        <div
          style={{
            width: 5,
            borderRadius: 3,
            background: C.red,
            position: 'absolute',
            left: 0,
            top: 20,
            bottom: 20,
          }}
        />
        <Img
          src={staticFile('icon.png')}
          style={{ width: 52, height: 52, borderRadius: 12, background: '#0d1117', marginLeft: 6 }}
        />
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 650, color: C.text }}>Barklarm</span>
            <span style={{ fontFamily: FONT, fontSize: 16, color: C.dim }}>now</span>
          </div>
          <div style={{ fontFamily: FONT, fontSize: 20, color: C.text, marginTop: 4 }}>
            Sentry: api — production failed
          </div>
          <div style={{ fontFamily: FONT, fontSize: 17, color: C.muted, marginTop: 3 }}>
            checkout errors spiked 4 minutes ago · Open issue →
          </div>
        </div>
      </div>
    </DarkBackdrop>
  );
};

const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 16 } });
  const head = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const links = fadeIn(frame, 26, 48);

  return (
    <BrandBackdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${0.85 + logo * 0.15})`, opacity: logo, marginBottom: 6 }}>
          <Logo size={190} />
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 116,
            fontWeight: 750,
            letterSpacing: -5,
            lineHeight: 1,
            color: '#fff',
            opacity: head,
            transform: `translateY(${(1 - head) * 34}px)`,
          }}
        >
          Barklarm
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 38,
            color: 'rgba(255,255,255,0.92)',
            marginTop: 18,
            opacity: head,
          }}
        >
          Free & open source. Made for your menu bar.
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 34, opacity: links }}>
          <Pill
            style={{
              background: '#ffffff',
              borderColor: 'transparent',
              color: '#0b1220',
              fontSize: 24,
              fontWeight: 700,
              padding: '12px 24px',
            }}
          >
            barklarm.com
          </Pill>
          <Pill style={{ background: 'rgba(0,0,0,0.2)', fontSize: 24, padding: '12px 24px' }}>
            github.com/alvarolorentedev/barklarm-app
          </Pill>
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 19,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 26,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            opacity: links,
          }}
        >
          macOS · Windows · Linux
        </div>
      </AbsoluteFill>
    </BrandBackdrop>
  );
};

export const Promo: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0e16' }}>
    <Scene from={0} duration={110}>
      <BrandIntro />
    </Scene>
    <Scene from={110} duration={170}>
      <HeadlineScene />
    </Scene>
    <Scene from={280} duration={185}>
      <ProductScene />
    </Scene>
    <Scene from={465} duration={120}>
      <IntegrationsScene />
    </Scene>
    <Scene from={585} duration={112}>
      <TrayScene />
    </Scene>
    <Scene from={697} duration={68}>
      <CTAScene />
    </Scene>
  </AbsoluteFill>
);
