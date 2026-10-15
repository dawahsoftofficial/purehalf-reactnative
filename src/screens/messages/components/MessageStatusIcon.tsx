import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { wp } from '../../../global';
import { Colors } from '../../../res';

/**
 * `pending` = optimistic bubble still going out (clock), `failed` = not
 * delivered. `sending` / `sent` describe a message the server already has.
 */
export type MessageDisplayStatus = 'pending' | 'failed' | 'sending' | 'sent';

type Props = {
  status: MessageDisplayStatus | string;
  isSeen: boolean;
  isBlocked: boolean;
  wasSentWhileBlocked: boolean;
};

const ICON_STYLE = { marginLeft: wp(0.5) };

// Ticks always sit on the outgoing (violet) bubble, so the resting colour is a
// translucent white; a "read" receipt pops in a bright legible green.
const SENT_COLOR = Colors.whiteRGBA90;
const READ_COLOR = '#4ade80';
// A failed send is flagged on the (violet) bubble in plain white; the red
// explanation sits under the bubble.
const FAILED_COLOR = Colors.color2;

const MessageStatusIcon = ({
  status,
  isSeen,
  isBlocked,
  wasSentWhileBlocked,
}: Props) => {
  // Not delivered: the member can tap the bubble to retry.
  if (status === 'failed') {
    return (
      <Ionicons
        name="alert-circle"
        color={FAILED_COLOR}
        size={wp(4)}
        style={ICON_STYLE}
      />
    );
  }

  // Still going out: a clock, not a tick (a tick would claim it was sent).
  if (status === 'pending') {
    return (
      <Ionicons
        name="time-outline"
        color={SENT_COLOR}
        size={wp(4)}
        style={ICON_STYLE}
      />
    );
  }

  // Read → green double tick (preserved even if later blocked)
  if (isSeen) {
    return (
      <Ionicons
        name="checkmark-done"
        color={READ_COLOR}
        size={wp(4)}
        style={ICON_STYLE}
      />
    );
  }

  // Sent while blocked, or currently blocked, and not seen → single tick
  if (wasSentWhileBlocked || isBlocked) {
    return (
      <Ionicons
        name="checkmark"
        color={SENT_COLOR}
        size={wp(4)}
        style={ICON_STYLE}
      />
    );
  }

  // Delivered but not seen → double tick
  if (status === 'sent') {
    return (
      <Ionicons
        name="checkmark-done"
        color={SENT_COLOR}
        size={wp(4)}
        style={ICON_STYLE}
      />
    );
  }

  // Sending / unknown → single tick
  return (
    <Ionicons
      name="checkmark"
      color={SENT_COLOR}
      size={wp(4)}
      style={ICON_STYLE}
    />
  );
};

export default MessageStatusIcon;
