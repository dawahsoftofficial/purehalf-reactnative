import English from '@/languages/English.json';
import RomanUrdu from '@/languages/RomanUrdu.json';
import Urdu from '@/languages/Urdu.json';

import {
  buildChatHeaderOptions,
  CHAT_HEADER_OPTION_LABELS,
  isDestructiveChatHeaderOption,
} from './chat-header-options';

const base = {
  hideProfileActions: false,
  isPartnerDeleted: false,
  hasConversation: true,
  isBlockedByYou: false,
};

describe('buildChatHeaderOptions', () => {
  it('shows the full menu for an active, unblocked conversation', () => {
    expect(buildChatHeaderOptions(base)).toEqual([
      'viewProfile',
      'block',
      'reportAndBlock',
      'clearChat',
      'deleteConversation',
    ]);
  });

  it('offers unblock (and no report) once you blocked the member', () => {
    expect(buildChatHeaderOptions({ ...base, isBlockedByYou: true })).toEqual([
      'viewProfile',
      'unblock',
      'clearChat',
      'deleteConversation',
    ]);
  });

  it('drops delete when there is no conversation id yet', () => {
    expect(buildChatHeaderOptions({ ...base, hasConversation: false })).toEqual(
      ['viewProfile', 'block', 'reportAndBlock', 'clearChat']
    );
    expect(
      buildChatHeaderOptions({
        ...base,
        hasConversation: false,
        isBlockedByYou: true,
      })
    ).toEqual(['viewProfile', 'unblock', 'clearChat']);
  });

  it('hides view profile when profile actions are hidden', () => {
    expect(
      buildChatHeaderOptions({ ...base, hideProfileActions: true })
    ).not.toContain('viewProfile');
  });

  it('only allows local cleanup for a deleted partner', () => {
    expect(
      buildChatHeaderOptions({
        ...base,
        isPartnerDeleted: true,
        hideProfileActions: true,
      })
    ).toEqual(['clearChat', 'deleteConversation']);
    expect(
      buildChatHeaderOptions({
        ...base,
        isPartnerDeleted: true,
        hideProfileActions: true,
        hasConversation: false,
      })
    ).toEqual(['clearChat']);
  });
});

describe('chat header option labels', () => {
  it('marks only clear and delete as destructive', () => {
    const destructive = Object.keys(CHAT_HEADER_OPTION_LABELS).filter((id) =>
      isDestructiveChatHeaderOption(id as never)
    );
    expect(destructive).toEqual(['clearChat', 'deleteConversation']);
  });

  it('has a translation for every label in all three languages', () => {
    for (const key of Object.values(CHAT_HEADER_OPTION_LABELS)) {
      for (const lang of [English, Urdu, RomanUrdu]) {
        expect((lang.translation as Record<string, string>)[key]).toBeTruthy();
      }
    }
  });
});
