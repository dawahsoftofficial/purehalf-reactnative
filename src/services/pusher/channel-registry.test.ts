import { ChannelRegistry } from './channel-registry';

type Sub = { id: string };
const make = () => new ChannelRegistry<Sub, string>();

describe('ChannelRegistry', () => {
  it('multiplexes subscribers and reports when the last one leaves', () => {
    const registry = make();
    const a = { id: 'a' };
    const b = { id: 'b' };
    registry.addSubscriber('private-x', a);
    registry.addSubscriber('private-x', b);
    expect(registry.subscribers('private-x')).toEqual([a, b]);
    expect(registry.removeSubscriber('private-x', a)).toBe(false);
    expect(registry.removeSubscriber('private-x', b)).toBe(true);
    expect(registry.isWanted('private-x')).toBe(false);
  });

  it('removes only the exact subscriber, even for identical contents', () => {
    const registry = make();
    const first = { id: 'same' };
    const second = { id: 'same' };
    registry.addSubscriber('c', first);
    registry.addSubscriber('c', second);
    registry.removeSubscriber('c', first);
    expect(registry.subscribers('c')).toEqual([second]);
    expect(registry.subscribers('c')[0]).toBe(second);
  });

  it('retries a wanted channel that has no live subscription', () => {
    const registry = make();
    registry.addSubscriber('c', { id: '1' });
    expect(registry.channelsToRetry()).toEqual(['c']);
    registry.setChannel('c', 'native');
    expect(registry.channelsToRetry()).toEqual([]);
  });

  it('drops a failed channel so it is retried', () => {
    const registry = make();
    registry.addSubscriber('c', { id: '1' });
    registry.setChannel('c', 'native');
    registry.markFailed('c');
    expect(registry.hasChannel('c')).toBe(false);
    expect(registry.channelsToRetry()).toEqual(['c']);
  });

  it('does not store a channel that failed while its subscribe was in flight', () => {
    const registry = make();
    registry.addSubscriber('c', { id: '1' });
    const promise = Promise.resolve();
    registry.beginPending('c', promise);
    expect(registry.channelsToRetry()).toEqual([]);
    registry.markFailed('c');
    expect(registry.setChannel('c', 'native')).toBe(false);
    expect(registry.hasChannel('c')).toBe(false);
    registry.endPending('c', promise);
    expect(registry.channelsToRetry()).toEqual(['c']);
  });

  it('a later successful subscribe is stored after an earlier failure was consumed', () => {
    const registry = make();
    registry.addSubscriber('c', { id: '1' });
    const first = Promise.resolve();
    registry.beginPending('c', first);
    registry.markFailed('c');
    registry.endPending('c', first); // clears the failure flag
    const second = Promise.resolve();
    registry.beginPending('c', second);
    expect(registry.setChannel('c', 'native')).toBe(true);
  });

  it('ignores endPending for a superseded promise', () => {
    const registry = make();
    const old = Promise.resolve();
    const current = Promise.resolve();
    registry.beginPending('c', current);
    registry.endPending('c', old);
    expect(registry.getPending('c')).toBe(current);
  });

  it('reset forgets desired channels, live channels and pending work', () => {
    const registry = make();
    registry.addSubscriber('c', { id: '1' });
    registry.setChannel('c', 'native');
    registry.beginPending('d', Promise.resolve());
    registry.reset();
    expect(registry.isWanted('c')).toBe(false);
    expect(registry.channelNames()).toEqual([]);
    expect(registry.getPending('d')).toBeUndefined();
    expect(registry.channelsToRetry()).toEqual([]);
  });
});
