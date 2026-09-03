import { useState } from "react";

export function useDeleteGameModal(
  gameTitle: string,
  onConfirm: (confirmation: string) => void,
) {
  const [confirmation, setConfirmation] = useState("");
  const confirmed =
    confirmation.trim().toLocaleLowerCase() === gameTitle.trim().toLocaleLowerCase();

  const confirmDeletion = () => {
    if (confirmed) {
      onConfirm(confirmation);
    }
  };

  return {
    confirmation,
    setConfirmation,
    confirmed,
    confirmDeletion,
  };
}
