declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(
      type: string,
      data: ArrayBufferLike | ArrayLike<number> | BigInt64Array | Float32Array | Int32Array,
      dims: readonly number[],
    );
    readonly data: ArrayLike<number> | BigInt64Array | Float32Array | Int32Array;
    readonly dims: readonly number[];
    readonly type: string;
  }

  export interface InferenceSession {
    readonly inputNames: string[];
    readonly outputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }

  export const InferenceSession: {
    create(path: string | ArrayBufferLike, options?: Record<string, unknown>): Promise<InferenceSession>;
  };
}
