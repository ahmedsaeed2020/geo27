/** Owner notes C-07 type icon tile of an activity (task, meeting, call, note, email, WhatsApp) in its type colour; shared by
 *  the activities list, the calendar and today's timeline. */
import { ACT_HUE, ACT_ICON, ACT_LABEL, type ActKind } from "./activityDesk";

export const KindTile = ({ k, ar }: { k: ActKind; ar: boolean }) => <span className="ek-av shrink-0" data-size="28" data-hue={ACT_HUE[k]} title={ACT_LABEL[k][ar ? 1 : 0]} aria-label={ACT_LABEL[k][ar ? 1 : 0]} data-act-kind={k}>{ACT_ICON[k]}</span>;
