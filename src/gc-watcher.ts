export interface GCMarker {
  ref: WeakRef<object>;
}

export class GCWatcher {
  #registry = new FinalizationRegistry(() => {});

  start(): GCMarker {
    const target = {};
    const ref = new WeakRef(target);
    this.#registry.register(target, null, ref);
    return { ref };
  }

  seen(marker: GCMarker): boolean {
    const collected = marker.ref.deref() === undefined;
    if (!collected) {
      this.#registry.unregister(marker.ref);
    }
    return collected;
  }
}
