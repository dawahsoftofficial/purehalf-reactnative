/**
 * Resolves which conversation SingleChat shows.
 *
 * Takes the route params ({conversationData|convDetails}, {conversationId} or
 * {userId}), looks the real conversation up when needed and owns the state
 * that depends on it (conversation, partner, block flags, loader, error).
 * Services are injected so the logic runs in plain jest.
 *
 * Invariant: every branch ends with the loader cleared -- either here, or by
 * the caller's message fetch once a conversation id is set -- or with
 * `loadError` set. Results for a stale entry (params changed mid-flight) are
 * ignored.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Conversation } from '../../../services/api/types/message-types';
import {
  type ChatPartner,
  getOtherParticipant,
  hasHeaderFields,
  initialOtherUser,
  isChatPartnerDeleted,
  mergeChatPartner,
  resolveChatEntry,
} from '../SingleChat.routing';

export type ChatResolutionServices = {
  /** GET /conversations/{id}; may be missing on an older backend (rejects). */
  getConversation: (conversationId: number | string) => Promise<Conversation>;
  getConversationWithUser: (
    userId: number | string
  ) => Promise<Conversation | null>;
  getUserDetail: (userId: number | string) => Promise<unknown>;
};

type UseChatResolutionParams = {
  routeParams: unknown;
  currentUserId: string | number | null | undefined;
  services: ChatResolutionServices;
  /** Called when the screen is re-targeted at a different chat. */
  onEntryChange?: () => void;
};

export type LoadError = 'resolve' | 'messages' | null;

type RouteParamsArg = Parameters<typeof resolveChatEntry>[0];

export function useChatResolution({
  routeParams,
  currentUserId,
  services,
  onEntryChange,
}: UseChatResolutionParams) {
  const params = routeParams as RouteParamsArg;
  const chatEntry = useMemo(() => resolveChatEntry(params), [params]);
  const chatEntryRef = useRef(chatEntry);
  const paramsRef = useRef(params);
  const servicesRef = useRef(services);
  const onEntryChangeRef = useRef(onEntryChange);
  const currentUserIdRef = useRef(currentUserId);

  const entryKey =
    chatEntry.kind === 'conversation'
      ? `c:${chatEntry.conversation.id}`
      : chatEntry.kind === 'conversationId'
        ? `c:${chatEntry.conversationId}`
        : chatEntry.kind === 'user'
          ? `u:${chatEntry.userId}`
          : 'empty';
  const entryKeyRef = useRef(entryKey);

  // Keep the refs current. Declared before the effects that read them so
  // they run first on every commit.
  useEffect(() => {
    chatEntryRef.current = chatEntry;
    paramsRef.current = params;
    servicesRef.current = services;
    onEntryChangeRef.current = onEntryChange;
    currentUserIdRef.current = currentUserId;
    entryKeyRef.current = entryKey;
  });

  const [otherUserData, setOtherUserData] = useState<ChatPartner | undefined>(
    () => initialOtherUser(params)
  );
  const [conversationData, setConversationData] = useState<
    Partial<Conversation>
  >({});
  const [conversationId, setConversationId] = useState('');
  const [isBlockedByYou, setIsBlockedByYou] = useState(false);
  const [isBlockedYou, setIsBlockedYou] = useState(false);
  const [loader, setLoader] = useState(true);
  // False until the real conversation (or its absence) is known; sending is
  // held until then so a first message can't race the lookup.
  const [resolved, setResolved] = useState(false);
  // False when a participant lookup failed, so we don't know whether the
  // partner is deleted.
  const [partnerStateKnown, setPartnerStateKnown] = useState(true);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const lastEntryKeyRef = useRef<string | null>(null);
  const detailFetchedForRef = useRef<number | string | null>(null);

  const applyConversation = useCallback((conversation: Conversation) => {
    const me = currentUserIdRef.current;
    const meKey = me != null ? String(me) : null;
    const participants = conversation.participants ?? [];
    const myParticipant = participants.find((p) => String(p.id) === meKey);
    const otherParticipant = getOtherParticipant(conversation, me);

    setConversationData(conversation);
    setConversationId(String(conversation.id));

    // The pivot `is_blocked` flag lives on the row of the participant who is
    // blocked (i.e. cannot send). So:
    //   - my own row blocked      => the other user blocked me => isBlockedYou
    //   - the other's row blocked => I blocked the other user  => isBlockedByYou
    setIsBlockedYou(!!myParticipant?.is_blocked);
    setIsBlockedByYou(!!otherParticipant?.is_blocked);

    if (otherParticipant) {
      setOtherUserData((previous) =>
        mergeChatPartner(previous, otherParticipant)
      );
    }
  }, []);

  // Resolution is a sync-with-external-lookup effect: when the target chat
  // changes, its state must be reset before the lookup starts, which is why
  // state is set synchronously here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;

    if (
      lastEntryKeyRef.current !== null &&
      lastEntryKeyRef.current !== entryKey
    ) {
      // Same screen instance re-targeted at another chat (params replaced).
      onEntryChangeRef.current?.();
      setConversationData({});
      setConversationId('');
      setIsBlockedYou(false);
      setIsBlockedByYou(false);
      setOtherUserData(initialOtherUser(paramsRef.current));
    }
    lastEntryKeyRef.current = entryKey;

    setLoadError(null);
    setResolved(false);
    setPartnerStateKnown(true);
    setLoader(true);

    const entry = chatEntryRef.current;
    const { getConversation, getConversationWithUser } = servicesRef.current;

    const resolveByUser = async (userId: number) => {
      try {
        const conversation = await getConversationWithUser(userId);
        if (cancelled) return;
        if (conversation) {
          // The caller fetches messages for the id and clears the loader.
          applyConversation(conversation);
        } else {
          // Brand-new chat: the first send creates it.
          setConversationData({});
          setConversationId('');
          setLoader(false);
        }
        setResolved(true);
      } catch (error: unknown) {
        if (cancelled) return;
        console.error('[useChatResolution] Failed to resolve:', error);
        setLoadError('resolve');
        setLoader(false);
      }
    };

    const resolveById = async (id: string, userId: number | null) => {
      // Messages load right away, and sends take the existing-conversation
      // path (id seeded); the lookups only enrich the participants (block
      // flags, deleted partner) and are best-effort.
      setConversationData({ id: Number(id) });
      setConversationId(id);
      let enriched = false;

      // Preferred: fetch the conversation by id. It works for an id-only
      // entry (a push) and returns the partner, block and deleted state.
      try {
        const conversation = await getConversation(id);
        if (cancelled) return;
        if (conversation && String(conversation.id) === id) {
          applyConversation(conversation);
          enriched = true;
        }
      } catch (error: unknown) {
        if (cancelled) return;
        // An older backend answers 404; fall back to what the entry carried.
        console.error('[useChatResolution] Conversation lookup failed:', error);
      }

      if (!enriched && userId !== null) {
        try {
          const conversation = await getConversationWithUser(userId);
          if (cancelled) return;
          if (conversation && String(conversation.id) === id) {
            applyConversation(conversation);
            enriched = true;
          }
        } catch (error: unknown) {
          if (cancelled) return;
          console.error(
            '[useChatResolution] Participant lookup failed:',
            error
          );
        }
      }
      if (cancelled) return;
      // Without a user id there is no partner to look at, so nothing is
      // "unknown"; with one, a failed/mismatched lookup leaves it unknown.
      if (userId !== null && !enriched) setPartnerStateKnown(false);
      setResolved(true);
    };

    switch (entry.kind) {
      case 'conversation':
        applyConversation(entry.conversation);
        setResolved(true);
        break;
      case 'conversationId':
        void resolveById(entry.conversationId, entry.userId);
        break;
      case 'user':
        void resolveByUser(entry.userId);
        break;
      default:
        setLoadError('resolve');
        setLoader(false);
    }

    return () => {
      cancelled = true;
    };
  }, [entryKey, resolveAttempt, applyConversation]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isPartnerDeleted = isChatPartnerDeleted(
    otherUserData,
    conversationData as Conversation,
    currentUserId
  );

  // getUserDetail records a profile "visit" server-side, so only call it for
  // a live, known member and only when the header lacks name/image.
  useEffect(() => {
    const partnerId = otherUserData?.id as number | string | undefined;
    if (!resolved || !partnerId || isPartnerDeleted || !partnerStateKnown) {
      return;
    }
    if (otherUserData?.type && otherUserData.type !== 'User') return;
    if (hasHeaderFields(otherUserData)) return;
    if (detailFetchedForRef.current === partnerId) return;
    detailFetchedForRef.current = partnerId;

    const requestedFor = entryKeyRef.current;
    servicesRef.current
      .getUserDetail(partnerId)
      .then((res) => {
        if (entryKeyRef.current !== requestedFor) return;
        const detail = (res ?? {}) as Record<string, unknown>;
        setOtherUserData((previous) => ({
          ...previous,
          ...detail,
          name: detail.name ?? detail.full_name ?? previous?.name,
          image:
            detail.image ?? detail.primary_image_to_show ?? previous?.image,
        }));
      })
      .catch((error: unknown) => {
        console.error('[useChatResolution] Failed to load details:', error);
      });
  }, [resolved, otherUserData, isPartnerDeleted, partnerStateKnown]);

  const retryResolution = useCallback(
    () => setResolveAttempt((attempt) => attempt + 1),
    []
  );

  return {
    entryKey,
    // Callers treat the partner as an untyped profile bag (route data, profile
    // fields and payload fields merged), and conversationData is sparse
    // ({id} only) until the lookup returns; both are read with optional
    // chaining.
    otherUserData: otherUserData as any,
    setOtherUserData,
    conversationData: conversationData as Conversation,
    setConversationData,
    conversationId,
    setConversationId,
    isBlockedByYou,
    setIsBlockedByYou,
    isBlockedYou,
    setIsBlockedYou,
    loader,
    setLoader,
    resolved,
    loadError,
    setLoadError,
    isPartnerDeleted,
    retryResolution,
  };
}
