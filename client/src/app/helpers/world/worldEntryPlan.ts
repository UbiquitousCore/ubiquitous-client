/** World entry is the same handshake at login and every map crossing; a crossing keeps the team and facing, a login does not. */
export function worldEntryPlan(inGame: boolean): {
  resetParty: boolean;
  arriveByTeleport: boolean;
  finishSignIn: boolean;
} {
  return { resetParty: !inGame, arriveByTeleport: inGame, finishSignIn: !inGame };
}
