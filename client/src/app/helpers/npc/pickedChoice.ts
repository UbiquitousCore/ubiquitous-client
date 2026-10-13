/** Whether a choice result is the answer to the conversation choice the player last picked. */
export function isResultOfPick(
  picked: { networkId: number; menuId: number; choice: { scriptSlot: number } } | null,
  networkId: number,
  menuId: number,
  slot: number,
): boolean {
  return (
    picked?.networkId === networkId && picked.menuId === menuId && picked.choice.scriptSlot === slot
  );
}
