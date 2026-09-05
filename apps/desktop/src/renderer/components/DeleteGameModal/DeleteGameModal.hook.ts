import { useState, type FormEvent } from "react";

export function useDeleteGameModal(
  gameTitle: string,
  onConfirm: (confirmation: string) => void,
  deleting: boolean,
) {
  const [confirmation, setConfirmation] = useState("");
  const confirmed =
    confirmation.trim().toLocaleLowerCase() === gameTitle.trim().toLocaleLowerCase();

  const confirmDeletion = () => {
    if (confirmed && !deleting) {
      onConfirm(confirmation);
    }
  };

  const submitDeletion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirmDeletion();
  };

  return {
    confirmation,
    setConfirmation,
    confirmed,
    confirmDeletion,
    submitDeletion,
  };
}
