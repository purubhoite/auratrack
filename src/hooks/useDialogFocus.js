import { useEffect, useRef } from 'react';

export const useDialogFocus = (onClose) => {
    const dialogRef = useRef(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        const previous = document.activeElement;
        const getFocusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
        const preferred = dialog.querySelector('[data-initial-focus]') || getFocusable()[0];
        preferred?.focus();
        const handleKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
            if (event.key !== 'Tab') return;
            const focusable = getFocusable();
            if (!focusable.length) { event.preventDefault(); return; }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => { document.removeEventListener('keydown', handleKeyDown); previous?.focus?.(); };
    }, [onClose]);
    return dialogRef;
};
