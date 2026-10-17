import { noticeText } from './i18n';
import { useEffect, useState, useId, useRef } from 'react';
import { SleepCountdown, SleepTimerControl } from './sleep-timer';
import { Expand, PictureInPicture2, Clock, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, ListMusic, PanelsTopLeft, LoaderCircle, AlertCircle, X, Mic2 } from 'lucide-react';
import { usePlayer } from './store';
import { useShallow } from 'zustand/react/shallow';
import { seek } from './player';
import { t } from './i18n';
import { formatTime } from '../../../packages/domain/index';
import { LikeButton } from './library-controls';
import { Button, Cover } from './ui-controls';
import { WaveSlider } from './wave-slider';
import { PlayerTrackInfo } from './player-track-info';
import { AnimatedCover } from './animated-cover';
import { RadioButton } from './radio-ui';
import { StoryShareButton } from './story-sharing';
export function PlayerBar({ onImmersive, queueOpen, onShowQueue, nowOpen, onShowNow, lyricsOpen, onToggleLyrics, onSearch }: {
    onImmersive: () => void;
    queueOpen: boolean;
    onShowQueue: () => void;
    nowOpen: boolean;
    onShowNow: () => void;
    lyricsOpen: boolean;
    onToggleLyrics: () => void;
    onSearch: (query: string) => void;
}) {
    const timerId = useId(), timerRef = useRef<HTMLDivElement>(null);
    const [timerOpen, setTimerOpen] = useState(false);
    const player = usePlayer(useShallow(state => ({ current: state.queue[state.index], playing: state.playing, loading: state.loading, volume: state.volume, muted: state.muted, shuffle: state.shuffle, repeat: state.repeat, error: state.error, sleepTimer: state.sleepTimer, setShuffle: state.setShuffle, previous: state.previous, toggle: state.toggle, next: state.next })));
    const current = player.current;
    const moving = player.playing && !player.loading && player.volume > 0;
    const volumeText = t(player.muted ? 'wave.mutedPercent' : 'wave.percent', { percent: Math.round(player.volume * 100) });
    return <>    <footer className="playerbar" aria-label={t("App.controlli.di.riproduzione")}><span className="sr-only" role="status" aria-atomic="true">{current ? t("a11y.currentTrack", { title: current.title, artist: current.artist }) : ""}</span><div className="player-track"><AnimatedCover track={current} slot="player-cover"/><PlayerTrackInfo track={current} onSearch={onSearch}/>{current && <LikeButton track={current}/>}<Button id="lyrics-reader-trigger" controls="lyrics-reader" expanded={lyricsOpen} label={t(lyricsOpen ? 'lyrics.hide' : 'lyrics.show')} active={lyricsOpen} disabled={!current} onClick={onToggleLyrics}><Mic2 size={19}/></Button><StoryShareButton track={current}/></div><div className="playback-center"><div className="transport"><Button label={t('shuffle')} active={player.shuffle} onClick={() => player.setShuffle(!player.shuffle)}><Shuffle size={17}/></Button><Button label={t('previous')} disabled={!current} onClick={player.previous}><SkipBack size={20} fill="currentColor"/></Button><Button label={player.playing ? t('pause') : t('play')} disabled={!current} className="play-button" onClick={player.toggle}>{player.loading ? <LoaderCircle size={22} className="spin"/> : player.playing ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</Button><Button label={t('next')} disabled={!current} onClick={() => player.next()}><SkipForward size={20} fill="currentColor"/></Button><Button label={`${t('repeat')}: ${player.repeat === 'off' ? t("App.disattivata") : player.repeat === 'playlist' ? t("App.coda") : t("App.brano")}`} active={player.repeat !== 'off'} onClick={() => usePlayer.setState({ repeat: player.repeat === 'off' ? 'playlist' : player.repeat === 'playlist' ? 'track' : 'off' })}>{player.repeat === 'track' ? <Repeat1 size={18}/> : <Repeat size={18}/>}</Button></div><PlayerTimeline /></div><div className="player-extras"><Button label={t("quality.immersive")} onClick={onImmersive}><Expand size={19}/></Button>{window.ritvio?.openMini && <Button label={t("quality.mini")} onClick={() => void window.ritvio?.openMini()}><PictureInPicture2 size={19}/></Button>}{current && <RadioButton track={current} compact/>}<Button label={t('sleep.title')} active={!!player.sleepTimer} id={`${timerId}-trigger`} controls={timerId} expanded={timerOpen} onClick={() => {
            timerRef.current?.togglePopover();
            if (!timerOpen)
                timerRef.current?.querySelector<HTMLElement>("summary")?.focus();
        }}><Clock size={19}/></Button>{player.sleepTimer && <span className="sleep-player-status"><SleepCountdown /></span>}<Button id="now-panel-trigger" controls="listening-panel" expanded={nowOpen} label={t("design.panel.showNow")} active={nowOpen} onClick={onShowNow}><PanelsTopLeft size={20}/></Button><Button id="queue-panel-trigger" controls="listening-panel" expanded={queueOpen} label={t("ui.mostra.coda.di.riproduzione")} active={queueOpen} onClick={onShowQueue}><ListMusic size={20}/></Button><span className="vertical-divider"/><Button label={player.muted ? t('unmute') : t('mute')} onClick={() => usePlayer.setState({ muted: !player.muted })}>{player.muted || player.volume === 0 ? <VolumeX size={19}/> : <Volume2 size={19}/>}</Button><WaveSlider variant="volume" label={t('volume')} max={1} step={.01} value={player.volume} onChange={volume => usePlayer.setState({ volume })} animated={moving} muted={player.muted} valueText={volumeText}/></div></footer><div ref={timerRef} id={timerId} popover="auto" className="timer-popover" onKeyDown={e => {
            if (e.key === "Escape") {
                e.preventDefault();
                timerRef.current?.hidePopover();
                document.getElementById(`${timerId}-trigger`)?.focus();
            }
        }} onToggle={e => setTimerOpen((e.nativeEvent as ToggleEvent).newState === 'open')}><SleepTimerControl expanded/></div>
    {player.error && <div className="player-error" role="alert"><AlertCircle size={18}/><span>{noticeText(player.error)}</span><button onClick={() => usePlayer.setState(s => ({ error: null, playing: true, activation: s.activation + 1 }))}>{t("App.riprova")}</button><button aria-label={t("App.chiudi.errore.player")} onClick={() => usePlayer.setState({ error: null })}><X size={16}/></button></div>}
    </>;
}
function PlayerTimeline() {
    const player = usePlayer(useShallow(state => ({ current: state.queue[state.index], position: state.position, duration: state.duration, activation: state.activation, playing: state.playing, loading: state.loading, volume: state.volume, muted: state.muted })));
    const current = player.current;
    const [previewPosition, setPreviewPosition] = useState<number | null>(null);
    const seekKey = `${current?.queueId ?? 'empty'}:${player.activation}`;
    useEffect(() => setPreviewPosition(null), [seekKey]);
    const moving = player.playing && !player.loading && player.volume > 0;
    const duration = player.duration || current?.duration || 0;
    return <div className="timeline"><span>{formatTime(previewPosition ?? player.position)}</span><WaveSlider variant="timeline" label={t('seek')} max={duration || 1} step={1} value={Math.min(player.position, duration || 1)} disabled={!current || player.loading || duration <= 0} commitOnRelease resetKey={seekKey} onPreviewChange={setPreviewPosition} formatPreview={formatTime} formatValueText={position => t('wave.position', { position: formatTime(position), duration: formatTime(duration) })} animated={moving} muted={player.muted} onChange={seek} valueText={t('wave.position', { position: formatTime(previewPosition ?? player.position), duration: formatTime(duration) })}/><span>{formatTime(player.duration || current?.duration || 0)}</span></div>;
}
