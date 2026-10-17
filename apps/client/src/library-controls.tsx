import { noticeText } from './i18n';
import { t } from './i18n';
import { useEffect, useRef, useState, useId, useContext, type ReactNode } from 'react';
import { ArtworkContext } from './artwork-context';
import { Heart, ListPlus, X, Plus, Music2, Disc3, Check } from 'lucide-react';
import { useLibrary } from './library';
import { usePlayer } from './store';
import type { Track, PlaylistSummary } from '../../../packages/domain/index';
import { ListeningOptions } from './listening-preferences';
import { ShareTrackButton } from './sharing-ui';
import { ShareStoryAction } from './story-sharing';
import { animateUI } from './ui-motion';
export function Icon({ label, children, onClick, disabled = false, active, visibleLabel = false, className = '' }: {
    label: string;
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    visibleLabel?: boolean;
    className?: string;
}) { return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} aria-label={label} title={label} onClick={event => { animateUI(event.currentTarget, "press"); onClick(); }} disabled={disabled} aria-pressed={active}>{children}{visibleLabel && <span>{label}</span>}</button>; }
export function Modal({ title, close, children }: {
    title: string;
    close: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = ref.current;
        dialog?.showModal();
        return () => {
            dialog?.close();
            requestAnimationFrame(() => {
                if (document.querySelector('dialog[open]'))
                    return;
                if (opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]'))
                    opener.focus({ preventScroll: true });
                else
                    document.getElementById('main-content')?.focus({ preventScroll: true });
            });
        };
    }, []);
    return <dialog className="library-dialog" aria-labelledby={titleId} ref={ref} onKeyDown={event => {
            if (event.key !== 'Tab')
                return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(control => control.getClientRects().length && !control.closest('[inert]'));
            const target = event.shiftKey ? controls.at(-1) : controls[0];
            if (!controls.length) {
                event.preventDefault();
                event.currentTarget.focus();
            }
            else if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1)) || document.activeElement === event.currentTarget) {
                event.preventDefault();
                target?.focus();
            }
        }} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
            if (e.target === ref.current)
                close();
        }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><Icon label={t("ui.chiudi.finestra")} onClick={close}><X size={20}/></Icon></div>{children}</dialog>;
}
export function PlaylistCover({ playlist, slot }: {
    playlist: PlaylistSummary;
    slot?: string;
}) { const artwork = useContext(ArtworkContext); const cover = (slot && artwork[slot]) || playlist.cover; return <div className={`playlist-cover ${cover ? 'custom' : playlist.artwork.length > 1 ? 'collage' : ''}`}>{cover ? <img src={cover} alt=""/> : playlist.artwork.length ? playlist.artwork.map((url, index) => <img key={`${url}-${index}`} src={url} alt=""/>) : <Music2 size={38}/>}</div>; }
export function LikeButton({ track, text = false }: {
    track: Track;
    text?: boolean;
}) { const liked = useLibrary(s => s.data?.likes.some(t => t.id === track.id) ?? false); const busy = useLibrary(s => s.busy); return <Icon className={text ? 'like-with-label' : ''} label={t("library-ui.brani.piaciuti", { p0: liked ? t("ui.rimuovi.dai") : t("ui.aggiungi.ai"), p1: track.title })} active={liked} disabled={busy} onClick={() => void useLibrary.getState().toggleLike(track)}><Heart size={17} fill={liked ? 'currentColor' : 'none'}/>{text && <span>{t(liked ? 'ui3.saved' : 'ui3.save')}</span>}</Icon>; }
export function TrackLibraryActions({ track, children, prominent = false }: {
    track: Track;
    children?: ReactNode;
    prominent?: boolean;
}) {
    const [picker, setPicker] = useState(false);
    return <><LikeButton track={track} text={prominent}/><ListeningOptions track={track}><Icon label={t("library-ui.salva.in.playlist", { p0: track.title })} onClick={() => setPicker(true)}><ListPlus size={18}/><span>{t('ui3.savePlaylist')}</span></Icon><ShareStoryAction track={track}/><ShareTrackButton track={track} visibleLabel/>{children}</ListeningOptions>{picker && <PlaylistPicker track={track} close={() => setPicker(false)}/>}</>;
}
function PlaylistPicker({ track, close }: {
    track: Track;
    close: () => void;
}) {
    const { data, busy, error } = useLibrary();
    const [name, setName] = useState('');
    const [done, setDone] = useState(false);
    const choose = async (playlist: PlaylistSummary) => {
        if (await useLibrary.getState().add(playlist, track)) {
            setDone(true);
            setTimeout(close, 650);
        }
    };
    return <Modal title={t("library-ui.aggiungi.a.una.playlist")} close={close}><p className="dialog-copy">{track.title}</p>{error && <p className="form-error" role="alert">{noticeText(error)}</p>}{done ? <div className="save-success"><Check />{t("library-ui.brano.aggiunto")}</div> : <><div className="playlist-picker">{data?.playlists.map(playlist => <button className="picker-row" key={playlist.id} disabled={busy} onClick={() => void choose(playlist)}><PlaylistCover playlist={playlist}/><span><strong>{playlist.name}</strong><small>{playlist.count} {t("library-ui.brani")}</small></span><Plus size={18}/></button>)}{!data?.playlists.length && <p>{t("library-ui.crea.la.tua.prima.playlist.per.salvare.questo.brano")}</p>}</div><form className="inline-form" onSubmit={async (e) => {
                e.preventDefault();
                const playlist = await useLibrary.getState().create(name.trim());
                if (playlist)
                    await choose(playlist);
            }}><input aria-label={t("library-ui.nome.nuova.playlist")} placeholder={t("library-ui.nome.nuova.playlist")} required maxLength={100} value={name} onChange={e => setName(e.target.value)}/><button className="secondary-button" disabled={busy || !name.trim()} type="submit">{t("library-ui.crea.e.aggiungi")}</button></form></>}</Modal>;
}
async function imageFromFile(file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)
        throw Error(t("library-ui.scegli.un.immagine.png.jpeg.o.webp.fino.a.8.mb"));
    const bitmap = await createImageBitmap(file);
    try {
        if (bitmap.width > 12000 || bitmap.height > 12000)
            throw Error(t("library-ui.l.immagine.e.troppo.grande"));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 384;
        const context = canvas.getContext('2d')!;
        const size = Math.min(bitmap.width, bitmap.height);
        context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 384, 384);
        let data = canvas.toDataURL('image/jpeg', 0.8);
        if (data.length > 196608)
            data = canvas.toDataURL('image/jpeg', 0.55);
        if (data.length > 196608)
            throw Error(t("library-ui.l.immagine.e.troppo.complessa.scegline.una.piu.piccola"));
        return data;
    }
    finally {
        bitmap.close();
    }
}
export function ImageInput({ value, change, label }: {
    value: string | null;
    change: (data: string | null) => void;
    label: string;
}) {
    const [error, setError] = useState('');
    return <div className="image-input">{value ? <img src={value} alt={label}/> : <div><Disc3 size={28}/></div>}<label className="secondary-button">{label}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={label} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file)
                return;
            try {
                change(await imageFromFile(file));
                setError('');
            }
            catch (error) {
                setError((error as Error).message);
            }
            e.target.value = '';
        }}/></label>{value && <button className="text-button" type="button" onClick={() => change(null)}>{t("library-ui.rimuovi.immagine")}</button>}{error && <p className="form-error" role="alert">{noticeText(error)}</p>}</div>;
}
export function ProfileButton() {
    const { data, busy, error } = useLibrary();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    return <><button className="avatar profile-button" aria-label={t("library-ui.il.tuo.profilo")} title={data?.profile.displayName ?? t("library-ui.il.tuo.profilo")} onClick={() => { setName(data?.profile.displayName ?? t("library-ui.il.mio.spazio")); setAvatar(data?.profile.avatar ?? null); setOpen(true); }}>{data?.profile.avatar ? <img src={data.profile.avatar} alt=""/> : (data?.profile.displayName[0] ?? 'S').toUpperCase()}</button>{open && <Modal title={t("library-ui.il.tuo.profilo")} close={() => setOpen(false)}><p className="dialog-copy">{t("library-ui.profilo.locale.dati.salvati.su.questo.pc")}</p>{error && <p className="form-error" role="alert">{noticeText(error)}</p>}<form className="library-form" onSubmit={async (e) => {
                e.preventDefault();
                if (await useLibrary.getState().profile(name.trim(), avatar))
                    setOpen(false);
            }}><label>{t("library-ui.nome.visualizzato")}<input autoFocus required maxLength={100} aria-label={t("library-ui.nome.visualizzato")} value={name} onChange={e => setName(e.target.value)}/></label><ImageInput value={avatar} change={setAvatar} label={t("ui.scegli.foto.profilo")}/><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{t("library-ui.salva.profilo")}</button><p className="local-note">{t("library-ui.accesso.email.google.e.sincronizzazione.saranno.aggiunti.quando.c")}</p></form></Modal>}</>;
}
export function FollowTrack({ track }: {
    track: Track;
}) { const { data, busy } = useLibrary(); const resources = [...(track.artists ?? []).map(a => ({ ...a, kind: 'artist' as const })), ...(track.album ? [{ ...track.album, kind: 'album' as const }] : [])]; return <div className="follow-track">{resources.map(resource => { const followed = data?.follows.some(f => f.id === resource.id && f.kind === resource.kind); return <button className={`follow-button ${followed ? 'active' : ''}`} key={`${resource.kind}-${resource.id}`} disabled={busy} onClick={() => void useLibrary.getState().follow(track, resource.kind, resource.id)}>{followed ? <Check size={13}/> : <Plus size={13}/>} {followed ? t("library-ui.segui.gia") : t("library-ui.segui")} {resource.kind === 'artist' ? t("library-ui.artista") : 'album'}: {resource.name}</button>; })}</div>; }
