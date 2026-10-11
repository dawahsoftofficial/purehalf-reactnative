/**
 * Bookkeeping for Pusher channel subscriptions, kept free of native imports so
 * it runs in plain jest.
 *
 * - `desired`: everyone who asked for a channel, whether or not a native
 *   subscription exists yet. This is what gets (re)subscribed on init, on
 *   CONNECTED, and after a failure.
 * - `channels`: channels with a live native subscription.
 * - `pending`: native subscribes currently in flight.
 */
export class ChannelRegistry<Subscriber, Channel> {
  private desired = new Map<string, Set<Subscriber>>();
  private channels = new Map<string, Channel>();
  private pending = new Map<string, Promise<void>>();
  /** Failed while their subscribe was still in flight. */
  private failedWhilePending = new Set<string>();
  /**
   * Bumped by `reset()`. A subscribe that started in an earlier epoch (before a
   * disconnect / logout) must not store its channel afterwards: the registry
   * was wiped, so it would be a phantom "live" channel that blocks a later
   * re-subscribe.
   */
  private epochCounter = 0;

  /** Current epoch; capture it before starting a native subscribe. */
  get epoch(): number {
    return this.epochCounter;
  }

  addSubscriber(name: string, subscriber: Subscriber): void {
    let set = this.desired.get(name);
    if (!set) {
      set = new Set();
      this.desired.set(name, set);
    }
    set.add(subscriber);
  }

  /** Removes exactly this subscriber. True when nobody wants the channel now. */
  removeSubscriber(name: string, subscriber: Subscriber): boolean {
    const set = this.desired.get(name);
    if (!set) return false;
    set.delete(subscriber);
    if (set.size > 0) return false;
    this.desired.delete(name);
    return true;
  }

  subscribers(name: string): Subscriber[] {
    return Array.from(this.desired.get(name) ?? []);
  }

  isWanted(name: string): boolean {
    return this.desired.has(name);
  }

  hasChannel(name: string): boolean {
    return this.channels.has(name);
  }

  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  channelNames(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Stores a live channel. Returns false (and stores nothing) if the
   * subscription already failed while it was being created, or - when the
   * `epoch` captured at subscribe start is passed - if the registry was reset
   * since (the caller should then unsubscribe the native channel itself).
   */
  setChannel(name: string, channel: Channel, epoch?: number): boolean {
    if (epoch !== undefined && epoch !== this.epochCounter) return false;
    if (this.failedWhilePending.delete(name)) return false;
    this.channels.set(name, channel);
    return true;
  }

  deleteChannel(name: string): void {
    this.channels.delete(name);
  }

  /**
   * A subscription failed (auth error etc.): forget the dead channel so the
   * next subscriber, or the next CONNECTED, subscribes afresh. If its subscribe
   * is still in flight, remember that so the channel is not stored afterwards.
   */
  markFailed(name: string): void {
    this.channels.delete(name);
    if (this.pending.has(name)) this.failedWhilePending.add(name);
  }

  getPending(name: string): Promise<void> | undefined {
    return this.pending.get(name);
  }

  beginPending(name: string, promise: Promise<void>): void {
    this.pending.set(name, promise);
  }

  endPending(name: string, promise: Promise<void>): void {
    if (this.pending.get(name) !== promise) return;
    this.pending.delete(name);
    this.failedWhilePending.delete(name);
  }

  /** Wanted channels that have no live subscription and none in flight. */
  channelsToRetry(): string[] {
    return Array.from(this.desired.keys()).filter(
      (name) => !this.channels.has(name) && !this.pending.has(name)
    );
  }

  /** Forget everything (logout / disconnect). */
  reset(): void {
    this.epochCounter += 1;
    this.desired.clear();
    this.channels.clear();
    this.pending.clear();
    this.failedWhilePending.clear();
  }
}
