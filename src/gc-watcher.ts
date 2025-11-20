export interface GCMarker {
  ref: WeakRef<object>;
  token: object;
}

export class GCWatcher {
  #registry = new FinalizationRegistry(() => {});

  start(): GCMarker {
    const token = {};
    const ref = new WeakRef(token);
    this.#registry.register(token, null, token);
    return { ref, token };
  }

  seen(marker: GCMarker): boolean {
    const collected = marker.ref.deref() === undefined;
    if (!collected) {
      this.#registry.unregister(marker.token);
    }
    return collected;
  }
}
