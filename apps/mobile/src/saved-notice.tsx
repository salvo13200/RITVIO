import {msg} from './messages';
import { useEffect, useRef } from 'react';
import { CircleCheck, X } from 'lucide-react';
/** A success confirmation above the composer, without moving scroll or focus. */
export function SavedNotice({ id, text, dismiss }: {
    id: number;
    text: string;
    dismiss: (id: number) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const onDismiss = useRef(dismiss);
    onDismiss.current = dismiss;
    useEffect(() => {
        const element = ref.current;
        try {
            element?.showPopover();
        }
        catch {
            element?.removeAttribute('popover');
        }
        const timer = setTimeout(() => onDismiss.current(id), 5000);
        return () => { clearTimeout(timer); try {
            element?.hidePopover();
        }
        catch { } };
    }, [id]);
    return <div ref={ref} popover="manual" className="saved-notice" role="status" aria-live="polite" aria-atomic="true"><CircleCheck size={25} aria-hidden="true"/><span>{text}</span><button aria-label={msg("Chiudi conferma di salvataggio")} onClick={() => onDismiss.current(id)}><X size={22}/></button></div>;
}
