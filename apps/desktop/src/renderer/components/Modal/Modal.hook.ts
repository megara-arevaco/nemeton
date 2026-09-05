import { useEffect, useId, useRef, type MouseEvent, type SyntheticEvent } from "react";

export function useModal(busy: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;

    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const cancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (!busy) {
      onClose();
    }
  };

  const dismissBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (busy || event.target !== event.currentTarget) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (outside) {
      onClose();
    }
  };

  return { dialogRef, titleId, cancel, dismissBackdrop };
}
